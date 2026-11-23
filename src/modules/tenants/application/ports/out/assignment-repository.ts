export interface AssignmentTarget {
  // El paciente existe en la clínica del actor.
  patientExists: boolean;
  // Null si no hay una membresía con ese identificador en la clínica del actor.
  doctor: { isDoctor: boolean; status: "ACTIVE" | "DEACTIVATED" } | null;
}

export type CreateAssignmentResult = { kind: "created"; assignmentId: string } | { kind: "already-assigned" };

// Asignaciones médico–paciente de una clínica. Toda consulta recibe el `tenantId` del actor.
export interface AssignmentRepository {
  // Una sola consulta con el paciente y el médico, los dos acotados a la clínica.
  findTarget(input: { tenantId: string; patientId: string; membershipId: string }): Promise<AssignmentTarget>;

  // Falla con `already-assigned` si ya hay una vigente para el mismo médico y paciente (índice único parcial).
  create(input: {
    tenantId: string;
    patientId: string;
    membershipId: string;
    createdByUserId: string;
  }): Promise<CreateAssignmentResult>;
}
