// Registro de gestión (specs/010-gestion-usuarios-clinica/data-model.md): quién hizo qué sobre quién y cuándo.
// No lleva correo, documento ni matrícula: la persona se resuelve por sus identificadores.

export const CLINIC_USER_ACTIONS = [
  "STAFF_ENROLLED",
  "PATIENT_ENROLLED",
  "STAFF_DEACTIVATED",
  "STAFF_REACTIVATED",
  "PATIENT_REVOKED",
  "PATIENT_REACTIVATED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_ENDED",
  "ACCESS_RESENT",
] as const;

export type ClinicUserAction = (typeof CLINIC_USER_ACTIONS)[number];

export interface NewClinicUserEvent {
  tenantId: string;
  action: ClinicUserAction;
  actorUserId: string;
  actorMembershipId: string;
  targetMembershipId?: string;
  targetPatientId?: string;
  now: Date;
}
