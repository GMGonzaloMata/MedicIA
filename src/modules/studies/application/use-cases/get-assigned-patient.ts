import type { PatientSummary } from "../../domain/study";
import type { StudyActor } from "../../domain/study-access";
import { StudyForbiddenError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";

// El paciente de un médico, para mostrar su nombre y documento. Sin asignación vigente (o en otra clínica) no
// se devuelve nada: se responde igual que ante un paciente que no existe.
export function createGetAssignedPatient({ directory }: { directory: PatientDirectory }) {
  return async ({ actor, patientId }: { actor: StudyActor; patientId: string }): Promise<PatientSummary> => {
    if (actor.kind !== "DOCTOR") {
      throw new StudyForbiddenError();
    }

    const patient = await directory.findAssignedPatient({
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      patientId,
    });

    if (!patient) {
      throw new StudyForbiddenError();
    }

    return patient;
  };
}
