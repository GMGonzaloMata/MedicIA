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

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

export function studyStorageKey(tenantId: string, studyId: string): string {
  return `studies/${tenantId}/${studyId}.ecg1`;
}

// Sube un estudio a nombre de un paciente. Solo registra identificadores opacos y códigos de error: nunca
// el contenido del estudio ni el nombre del archivo (R13). El nombre del archivo ni siquiera llega acá.
export function createUploadStudy({ studies, storage, reader, directory, generateId }: UploadStudyDependencies) {
  return async ({ actor, patientId, type, bytes }: UploadStudyInput): Promise<{ studyId: string; number: number }> => {
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

    // Si el archivo no cumple, se rechaza acá: no se guarda nada ni se consume un número.
    const data = reader.read(bytes);
    validateEcgContent(data);
    const stored = encodeStoredStudy(data);

    const studyId = generateId();
    const storageKey = studyStorageKey(actor.tenantId, studyId);

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
        type: type as StudyType,
        storageKey,
      });

      return { studyId: record.id, number: record.number };
    } catch (error) {
      console.error(`[estudios] no se registró el estudio (${errorName(error)}) estudio=${studyId}`);

      // Compensación: no queda un archivo sin estudio. Si tampoco se puede borrar, queda para la
      // conciliación (`npm run studies:reconcile`) y se registra la clave opaca.
      try {
        await storage.delete(storageKey);
      } catch (cleanupError) {
        console.error(
          `[estudios] archivo huérfano pendiente de conciliar (${errorName(cleanupError)}) clave=${storageKey}`,
        );
      }

      throw new StudyUnavailableError();
    }
  };
}
