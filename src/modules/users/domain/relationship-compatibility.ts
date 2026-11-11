import type { InvitationKind } from "./invitation";

// Regla del vínculo único por clínica (specs/009-link-vinculacion/research.md, R6): en una misma clínica una persona
// es personal o paciente, nunca las dos cosas. La base de datos no puede expresarla porque cruza dos tablas, así que
// la aplica el caso de uso con los datos que lee dentro de la transacción. Es una función pura.

export interface StaffFact {
  status: "ACTIVE" | "DEACTIVATED";
  isClinicAdmin: boolean;
  isDoctor: boolean;
}

export interface PatientFact {
  status: "PENDING" | "LINKED" | "REVOKED";
}

export type ConflictReason = "OTHER_RELATIONSHIP" | "MEMBERSHIP_DEACTIVATED" | "ROLE_CHANGE_NOT_SUPPORTED";

export type CompatibilityResult =
  | { result: "CAN_CREATE" }
  | { result: "ALREADY_MEMBER" }
  | { result: "CONFLICT"; reason: ConflictReason };

interface CompatibilityInput {
  kind: InvitationKind;
  // Lo que la persona ya tiene en esa clínica.
  staff: StaffFact | null;
  patient: PatientFact | null;
}

function checkDoctorLink({ staff, patient }: Omit<CompatibilityInput, "kind">): CompatibilityResult {
  // Un registro de paciente de esa clínica, en cualquier estado, impide ser personal en ella.
  if (patient) {
    return { result: "CONFLICT", reason: "OTHER_RELATIONSHIP" };
  }

  if (!staff) {
    return { result: "CAN_CREATE" };
  }

  if (staff.status === "DEACTIVATED") {
    return { result: "CONFLICT", reason: "MEMBERSHIP_DEACTIVATED" };
  }

  if (staff.isDoctor) {
    return { result: "ALREADY_MEMBER" };
  }

  // Un administrador sin rol de médico: sumarle el rol es gestión de usuarios, no de esta funcionalidad.
  return { result: "CONFLICT", reason: "ROLE_CHANGE_NOT_SUPPORTED" };
}

function checkPatientLink({ staff, patient }: Omit<CompatibilityInput, "kind">): CompatibilityResult {
  // Una membresía de personal en esa clínica, activa o desactivada, impide ser paciente en ella.
  if (staff) {
    return { result: "CONFLICT", reason: "OTHER_RELATIONSHIP" };
  }

  if (patient?.status === "LINKED") {
    return { result: "ALREADY_MEMBER" };
  }

  // Sin registro, o con uno revocado (se reutiliza), o pendiente: se puede vincular.
  return { result: "CAN_CREATE" };
}

export function checkRelationshipCompatibility({ kind, staff, patient }: CompatibilityInput): CompatibilityResult {
  return kind === "DOCTOR" ? checkDoctorLink({ staff, patient }) : checkPatientLink({ staff, patient });
}
