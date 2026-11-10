import { canActOnPatient, canDeleteStudy as mayDeleteStudy, type StudyActor } from "../../domain/study-access";
import { StudyForbiddenError, StudyInUseError, StudyNotFoundError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";

// Punto de extensión para la 008: con un análisis en curso el estudio no se puede eliminar. Es una función
// inyectada, no un puerto: por defecto siempre permite.
export type CanDeleteStudy = (input: { tenantId: string; studyId: string }) => Promise<boolean>;

interface DeleteStudyDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  directory: PatientDirectory;
  canDeleteStudy?: CanDeleteStudy;
}

export interface DeleteStudyResult {
  // El estudio se eliminó pero su archivo quedó pendiente de limpieza (se registra la clave opaca).
  fileLeftBehind: boolean;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

// Elimina un estudio de verdad: primero la fila (en la base) y después el archivo. Solo lo elimina quien lo
// cargó y mientras conserve el acceso al paciente. La clave del archivo sale de la base, nunca del cliente.
export function createDeleteStudy({
  studies,
  storage,
  directory,
  canDeleteStudy = async () => true,
}: DeleteStudyDependencies) {
  return async ({ actor, studyId }: { actor: StudyActor; studyId: string }): Promise<DeleteStudyResult> => {
    const study = await studies.findById({ tenantId: actor.tenantId, studyId });

    if (!study) {
      throw new StudyNotFoundError();
    }

    const hasActiveAssignment =
      actor.kind === "DOCTOR"
        ? await directory.hasActiveAssignment({
            tenantId: actor.tenantId,
            membershipId: actor.membershipId,
            patientId: study.patientId,
          })
        : false;
    const hasAccessToPatient = canActOnPatient(actor, { patientId: study.patientId, hasActiveAssignment });

    if (!mayDeleteStudy(actor, { uploadedByUserId: study.uploadedByUserId, hasAccessToPatient })) {
      throw new StudyForbiddenError();
    }

    if (!(await canDeleteStudy({ tenantId: actor.tenantId, studyId }))) {
      throw new StudyInUseError();
    }

    if (!(await studies.deleteById({ tenantId: actor.tenantId, studyId }))) {
      throw new StudyNotFoundError();
    }

    try {
      await storage.delete(study.storageKey);
    } catch (error) {
      console.error(`[estudios] archivo pendiente de limpieza (${errorName(error)}) clave=${study.storageKey}`);

      return { fileLeftBehind: true };
    }

    return { fileLeftBehind: false };
  };
}
