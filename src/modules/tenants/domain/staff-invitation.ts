import type { DoctorProfile } from "./doctor-profile";
import type { NormalizedEmail } from "./normalized-values";
import { mergeRoles, type StaffRoles } from "./staff-roles";

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

export const INVITATION_VALIDITY_DAYS = 7;

// Estado guardado en la base. «Vencida» no se guarda: se deduce de `expiresAt` al leer, así no hace falta un
// proceso que las venza.
export type StoredInvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED";
export type InvitationState = "pending" | "expired" | "accepted" | "revoked";

export interface StaffInvitation {
  id: string;
  tenantId: string;
  email: NormalizedEmail;
  roles: StaffRoles;
  // Obligatorio si `roles.isDoctor` y ausente si no, igual que en la membresía.
  doctor: DoctorProfile | null;
  status: StoredInvitationStatus;
  expiresAt: Date;
  createdAt: Date;
}

export function invitationExpiresAt(now: Date): Date {
  return new Date(now.getTime() + INVITATION_VALIDITY_DAYS * MILLISECONDS_PER_DAY);
}

export function deriveInvitationState(
  invitation: Pick<StaffInvitation, "status" | "expiresAt">,
  now: Date,
): InvitationState {
  if (invitation.status === "ACCEPTED") {
    return "accepted";
  }

  if (invitation.status === "REVOKED") {
    return "revoked";
  }

  return invitation.expiresAt.getTime() > now.getTime() ? "pending" : "expired";
}

export interface ExistingMembership {
  membershipId: string;
  roles: StaffRoles;
  status: "ACTIVE" | "DEACTIVATED";
}

export type AcceptanceDecision =
  | { kind: "reject" }
  | { kind: "create"; roles: StaffRoles; doctor: DoctorProfile | null }
  // `doctor` solo viene cuando la invitación le suma el rol de médico a quien aún no lo era: quien ya es médico
  // conserva su especialidad y su matrícula.
  | { kind: "merge"; membershipId: string; roles: StaffRoles; doctor: DoctorProfile | null };

export interface AcceptanceInput {
  invitation: Pick<StaffInvitation, "status" | "expiresAt" | "email" | "roles" | "doctor">;
  tenantStatus: "ACTIVE" | "SUSPENDED";
  membership: ExistingMembership | null;
  userEmail: NormalizedEmail;
  now: Date;
}

// Decide si una persona puede aceptar una invitación y qué cambia. Todo motivo de rechazo da el mismo resultado:
// la persona no debe poder distinguir una invitación inexistente de una vencida, usada, revocada o dirigida a
// otro correo. Quien ya es miembro activo suma los roles de la invitación a su misma membresía; un miembro
// desactivado no vuelve por esta vía, porque reactivar es una decisión explícita del administrador.
export function decideAcceptance({
  invitation,
  tenantStatus,
  membership,
  userEmail,
  now,
}: AcceptanceInput): AcceptanceDecision {
  if (deriveInvitationState(invitation, now) !== "pending") {
    return { kind: "reject" };
  }

  if (tenantStatus !== "ACTIVE" || invitation.email !== userEmail) {
    return { kind: "reject" };
  }

  if (membership === null) {
    return { kind: "create", roles: invitation.roles, doctor: invitation.doctor };
  }

  if (membership.status === "DEACTIVATED") {
    return { kind: "reject" };
  }

  const becomesDoctor = invitation.roles.isDoctor && !membership.roles.isDoctor;

  return {
    kind: "merge",
    membershipId: membership.membershipId,
    roles: mergeRoles(membership.roles, invitation.roles),
    doctor: becomesDoctor ? invitation.doctor : null,
  };
}
