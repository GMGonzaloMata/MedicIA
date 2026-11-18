import { validateEcgContent } from "../../domain/ecg-study";
import { encodeStoredStudy } from "../../domain/stored-study-format";
import { STUDY_TYPES, type StudyType } from "../../domain/study";
import { canActOnPatient, type StudyActor } from "../../domain/study-access";
import {
  StudyForbiddenError,
  StudyRejectedError,
  StudyUnavailableError,
} from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";
import type { StudyFileReader } from "../ports/out/study-file-reader";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";

interface UploadStudyDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  reader: StudyFileReader;
  directory: PatientDirectory;
  generateId: () => string;
}

export interface UploadStudyInput {
  actor: StudyActor;
  patientId: string;
  type: string;
  bytes: Uint8Array;
}

type StudyStorageFormat = "ecg1" | "pdfecg1";

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function studyStorageKey(tenantId: string, studyId: string, format: StudyStorageFormat = "ecg1"): string {
  return `studies/${tenantId}/${studyId}.${format}`;
}

// Misma autorización para ambas cargas; siempre antes de leer o procesar el archivo.
export async function authorizeStudyUpload({ actor, patientId, type, directory }: {
  actor: StudyActor;
  patientId: string;
  type: string;
  directory: PatientDirectory;
}): Promise<StudyType> {
  if (!(STUDY_TYPES as readonly string[]).includes(type)) {
    throw new StudyRejectedError("TYPE_UNSUPPORTED");
  }

  const hasActiveAssignment =
    actor.kind === "DOCTOR"
      ? await directory.hasActiveAssignment({
          tenantId: actor.tenantId,
          membershipId: actor.membershipId,
          patientId,
        })
      : false;

  if (!canActOnPatient(actor, { patientId, hasActiveAssignment })) {
    throw new StudyForbiddenError();
  }

  // El catálogo anterior es la validación de esta unión; no se admite un tipo arbitrario.
  return type as StudyType;
}

// Un único objeto y la transacción existente para numeración; ambos formatos comparten compensación.
export async function persistStudyUpload({ studies, storage, generateId, actor, patientId, type, stored, format }: {
  studies: StudyRepository;
  storage: StudyFileStorage;
  generateId: () => string;
  actor: StudyActor;
  patientId: string;
  type: StudyType;
  stored: Uint8Array;
  format: StudyStorageFormat;
}): Promise<{ studyId: string; number: number }> {
  const studyId = generateId();
  const storageKey = studyStorageKey(actor.tenantId, studyId, format);

  try {
    await storage.put(storageKey, stored);
  } catch (error) {
    console.error(`[estudios] no se guardó el archivo (${errorName(error)}) estudio=${studyId}`);
    throw new StudyUnavailableError();
  }

  try {
    const record = await studies.insertWithNextNumber({
      id: studyId,
      tenantId: actor.tenantId,
      patientId,
      uploadedByUserId: actor.userId,
      type,
      storageKey,
    });

    return { studyId: record.id, number: record.number };
  } catch (error) {
    console.error(`[estudios] no se registró el estudio (${errorName(error)}) estudio=${studyId}`);

    // Si tampoco se puede borrar, queda para la conciliación (`npm run studies:reconcile`),
    // identificable por la clave opaca; nunca se registra contenido del archivo.
    try {
      await storage.delete(storageKey);
    } catch (cleanupError) {
      console.error(
        `[estudios] archivo huérfano pendiente de conciliar (${errorName(cleanupError)}) clave=${storageKey}`,
      );
    }

    throw new StudyUnavailableError();
  }
}

// Conserva la entrada y el formato NPZ/ecg1 previos; PDF tiene un caso de uso separado.
export function createUploadStudy({ studies, storage, reader, directory, generateId }: UploadStudyDependencies) {
  return async ({ actor, patientId, type, bytes }: UploadStudyInput): Promise<{ studyId: string; number: number }> => {
    const studyType = await authorizeStudyUpload({ actor, patientId, type, directory });

    // Si el archivo no cumple, no se guarda nada ni se consume un número.
    const data = reader.read(bytes);
    validateEcgContent(data);
    const stored = encodeStoredStudy(data);

    return persistStudyUpload({ studies, storage, generateId, actor, patientId, type: studyType, stored, format: "ecg1" });
  };
}
