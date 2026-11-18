import { splitLeads } from "../../domain/ecg-leads";
import type { PdfExtraction } from "../../domain/pdf-extraction";
import { decodePdfStudy } from "../../domain/pdf-study-format";
import type { StudyUploader } from "../../domain/study";
import { canActOnPatient, type StudyActor } from "../../domain/study-access";
import { StudyForbiddenError, StudyNotFoundError, StudyUnavailableError } from "../../domain/study-errors";
import { StoredStudyCorruptError, decodeStoredStudy } from "../../domain/stored-study-format";
import type { PatientDirectory } from "../ports/out/patient-directory";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";

interface GetStudyWaveformDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  directory: PatientDirectory;
}

// Lo que ve quien abre el estudio. No lleva la clave del archivo, la clínica ni las siete variables.
export interface WaveformStudy {
  id: string;
  number: number;
  uploadedAt: Date;
  uploadedBy: StudyUploader;
  patientId: string;
  // Solo para el médico; el paciente no necesita ver su propio nombre.
  patientName: string | null;
}

// Contrato aditivo: las muestras PDF siguen crudas y la máscara nunca se convierte en amplitud.
export interface StudyWaveformV2 {
  status: "PDF_READY";
  version: 2;
  format: "PDF";
  study: WaveformStudy;
  samplingHz: 500;
  unit: "uV";
  leads: readonly Readonly<Pick<PdfExtraction["leads"][number], "name" | "samples" | "observed">>[];
}

export type StudyWaveformResult =
  | { status: "READY"; study: WaveformStudy; leads: Float32Array[] }
  | { status: "UNAVAILABLE"; study: WaveformStudy }
  | StudyWaveformV2
  | { status: "PDF_UNAVAILABLE"; version: 2; format: "PDF"; study: WaveformStudy };

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

// Lee la onda de un estudio para el visor (specs/007-visor-onda-ecg/contracts/get-study-waveform.md). El acceso se
// resuelve antes de tocar el almacenamiento; un archivo ausente o dañado es un resultado, una falla de
// infraestructura es una excepción.
export function createGetStudyWaveform({ studies, storage, directory }: GetStudyWaveformDependencies) {
  return async ({ actor, studyId }: { actor: StudyActor; studyId: string }): Promise<StudyWaveformResult> => {
    const detail = await studies.findDetailById({ tenantId: actor.tenantId, studyId });

    if (!detail) {
      throw new StudyNotFoundError();
    }

    let patientName: string | null = null;

    if (actor.kind === "DOCTOR") {
      const patient = await directory.findAssignedPatient({
        tenantId: actor.tenantId,
        membershipId: actor.membershipId,
        patientId: detail.patientId,
      });

      if (!patient) {
        throw new StudyForbiddenError();
      }

      patientName = patient.fullName;
    } else if (!canActOnPatient(actor, { patientId: detail.patientId, hasActiveAssignment: false })) {
      throw new StudyForbiddenError();
    }

    const study: WaveformStudy = {
      id: detail.id,
      number: detail.number,
      uploadedAt: detail.uploadedAt,
      uploadedBy: detail.uploadedByPatient ? { kind: "PATIENT" } : { kind: "DOCTOR", fullName: detail.uploaderName },
      patientId: detail.patientId,
      patientName,
    };

    let bytes: Uint8Array | null;

    try {
      bytes = await storage.get(detail.storageKey);
    } catch (error) {
      console.error(`[estudios] no se pudo leer el archivo (${errorName(error)}) clave=${detail.storageKey}`);

      throw new StudyUnavailableError();
    }

    // Solo la clave persistida por el servidor elige el codec; no se infiere por bytes del cliente.
    const isPdf = detail.storageKey.endsWith(".pdfecg1");
    const unavailable: StudyWaveformResult = isPdf
      ? { status: "PDF_UNAVAILABLE", version: 2, format: "PDF", study }
      : { status: "UNAVAILABLE", study };

    if (!bytes) {
      return unavailable;
    }

    try {
      if (isPdf) {
        const { samplingHz, unit, leads } = decodePdfStudy(bytes).extraction;
        return {
          status: "PDF_READY", version: 2, format: "PDF", study, samplingHz, unit,
          leads: leads.map(({ name, samples, observed }) => ({ name, samples, observed })),
        };
      }
      return { status: "READY", study, leads: splitLeads(decodeStoredStudy(bytes).waveform) };
    } catch (error) {
      if (error instanceof StoredStudyCorruptError) {
        return unavailable;
      }

      throw error;
    }
  };
}
