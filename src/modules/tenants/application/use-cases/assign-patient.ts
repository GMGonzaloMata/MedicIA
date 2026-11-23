import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { AssignmentRepository } from "../ports/out/assignment-repository";

export interface AssignPatientInput {
  actor: ClinicAdminActor;
  patientId: string;
  membershipId: string;
}

export type AssignPatientResult =
  | { ok: true; assignmentId: string }
  // Un paciente o un médico de otra clínica devuelve NOT_FOUND: no se revela si existe.
  | { ok: false; code: "NOT_FOUND" | "NOT_A_DOCTOR" | "DOCTOR_DEACTIVATED" | "ALREADY_ASSIGNED" };

interface AssignPatientDependencies {
  assignments: AssignmentRepository;
}

// Asigna un paciente a un médico de la misma clínica. Un paciente todavía sin cuenta (pendiente) también se
// puede asignar: mientras tanto nadie accede a él como paciente.
export function createAssignPatient({ assignments }: AssignPatientDependencies) {
  return async ({ actor, patientId, membershipId }: AssignPatientInput): Promise<AssignPatientResult> => {
    const target = await assignments.findTarget({ tenantId: actor.tenantId, patientId, membershipId });

    if (!target.patientExists || target.doctor === null) {
      return { ok: false, code: "NOT_FOUND" };
    }

    if (!target.doctor.isDoctor) {
      return { ok: false, code: "NOT_A_DOCTOR" };
    }

    if (target.doctor.status === "DEACTIVATED") {
      return { ok: false, code: "DOCTOR_DEACTIVATED" };
    }

    const result = await assignments.create({
      tenantId: actor.tenantId,
      patientId,
      membershipId,
      createdByUserId: actor.userId,
    });

    return result.kind === "created"
      ? { ok: true, assignmentId: result.assignmentId }
      : { ok: false, code: "ALREADY_ASSIGNED" };
  };
}
