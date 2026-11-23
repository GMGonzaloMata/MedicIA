export interface AssignmentTarget {
  // El paciente existe en la clínica del actor.
  patientExists: boolean;
  // Null si no hay una membresía con ese identificador en la clínica del actor.
  doctor: { isDoctor: boolean; status: "ACTIVE" | "DEACTIVATED" } | null;
}

export type CreateAssignmentResult = { kind: "created"; assignmentId: string } | { kind: "already-assigned" };

export type EndAssignmentResult = { kind: "ended" } | { kind: "not-found" } | { kind: "already-ended" };

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

  // Termina una asignación vigente y guarda cuándo y quién. La fila se conserva como historial.
  end(input: { tenantId: string; assignmentId: string; endedByUserId: string; now: Date }): Promise<EndAssignmentResult>;

  // Estado del médico de cada asignación vigente del paciente, sin nombres ni datos del médico.
  listActiveDoctorStatuses(input: { tenantId: string; patientId: string }): Promise<("ACTIVE" | "DEACTIVATED")[]>;
}
