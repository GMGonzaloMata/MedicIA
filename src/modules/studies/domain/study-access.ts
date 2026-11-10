// Quién puede hacer qué con los estudios (specs/006-carga-estudios-ecg/research.md, R7). Son funciones puras:
// el dominio no consulta la base. Si el médico tiene una asignación vigente con el paciente lo resuelve la
// capa de aplicación con una consulta que siempre incluye la clínica, y llega acá como un dato.

export type StudyActor =
  | { kind: "PATIENT"; tenantId: string; userId: string; patientId: string }
  | { kind: "DOCTOR"; tenantId: string; userId: string; membershipId: string };

// Lo mínimo que se necesita del vínculo con la clínica. La capa `app/` lo arma desde el contexto de acceso;
// el dominio de estudios no importa tipos del módulo `users`.
export interface StudyActorInput {
  tenantId: string;
  userId: string;
  relationship:
    | { kind: "PATIENT"; patientId: string }
    | { kind: "STAFF"; membershipId: string; isDoctor: boolean; isClinicAdmin?: boolean };
}

// Solo actúan sobre estudios el paciente y el médico. Un administrador que no es médico no tiene acceso.
export function resolveStudyActor({ tenantId, userId, relationship }: StudyActorInput): StudyActor | null {
  if (relationship.kind === "PATIENT") {
    return { kind: "PATIENT", tenantId, userId, patientId: relationship.patientId };
  }

  if (relationship.isDoctor) {
    return { kind: "DOCTOR", tenantId, userId, membershipId: relationship.membershipId };
  }

  return null;
}

// Ver, listar y cargar estudios de un paciente: el propio paciente, o un médico con asignación vigente.
export function canActOnPatient(
  actor: StudyActor,
  { patientId, hasActiveAssignment }: { patientId: string; hasActiveAssignment: boolean },
): boolean {
  if (actor.kind === "PATIENT") {
    return actor.patientId === patientId;
  }

  return hasActiveAssignment;
}

// Eliminar un estudio: solo quien lo cargó, y mientras conserve el acceso al paciente.
export function canDeleteStudy(
  actor: StudyActor,
  { uploadedByUserId, hasAccessToPatient }: { uploadedByUserId: string; hasAccessToPatient: boolean },
): boolean {
  return hasAccessToPatient && actor.userId === uploadedByUserId;
}

export function canListDoctorPatients(actor: StudyActor): boolean {
  return actor.kind === "DOCTOR";
}
