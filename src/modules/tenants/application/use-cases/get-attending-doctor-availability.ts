import { deriveDoctorAvailability, type DoctorAvailability } from "../../domain/member-lifecycle";
import type { AssignmentRepository } from "../ports/out/assignment-repository";

export interface GetAttendingDoctorAvailabilityInput {
  // Los dos salen del contexto autenticado del paciente, nunca del cliente.
  tenantId: string;
  patientId: string;
}

interface GetAttendingDoctorAvailabilityDependencies {
  assignments: AssignmentRepository;
}

// Para el paciente: si su médico sigue disponible. Devuelve solo el estado, sin nombres ni datos del médico.
export function createGetAttendingDoctorAvailability({ assignments }: GetAttendingDoctorAvailabilityDependencies) {
  return async ({ tenantId, patientId }: GetAttendingDoctorAvailabilityInput): Promise<DoctorAvailability> =>
    deriveDoctorAvailability(await assignments.listActiveDoctorStatuses({ tenantId, patientId }));
}
