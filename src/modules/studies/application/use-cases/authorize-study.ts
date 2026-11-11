import { canActOnPatient, type StudyActor } from "../../domain/study-access";
import type { PatientDirectory } from "../ports/out/patient-directory";
import type { StudyRepository } from "../ports/out/study-repository";

interface AuthorizeStudyDependencies {
  studies: StudyRepository;
  directory: PatientDirectory;
}

export type StudyAuthorization = { status: "ALLOWED"; studyId: string; patientId: string } | { status: "NO_ACCESS" };

// Resuelve si la persona puede actuar sobre un estudio (specs/008-analisis-estudio-ecg/contracts/analysis-use-cases.md).
// Mismas reglas que `getStudyWaveform`, pero devuelve un resultado en lugar de lanzar errores de este módulo, para
// que `analyses` no necesite importarlos. Un estudio ajeno, de otra clínica, sin asignación vigente o inexistente
// da el mismo resultado.
export function createAuthorizeStudy({ studies, directory }: AuthorizeStudyDependencies) {
  return async ({ actor, studyId }: { actor: StudyActor; studyId: string }): Promise<StudyAuthorization> => {
    const study = await studies.findById({ tenantId: actor.tenantId, studyId });

    if (!study) {
      return { status: "NO_ACCESS" };
    }

    const hasActiveAssignment =
      actor.kind === "DOCTOR"
        ? await directory.hasActiveAssignment({
            tenantId: actor.tenantId,
            membershipId: actor.membershipId,
            patientId: study.patientId,
          })
        : false;

    if (
      !canActOnPatient(actor, {
        patientId: study.patientId,
        hasActiveAssignment,
      })
    ) {
      return { status: "NO_ACCESS" };
    }

    return { status: "ALLOWED", studyId: study.id, patientId: study.patientId };
  };
}
