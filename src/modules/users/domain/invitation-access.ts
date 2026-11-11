import type { InvitationKind } from "./invitation";

// Quién puede invitar, ver y revocar invitaciones (specs/009-link-vinculacion/contracts/permissions.md). Son
// funciones puras: la capa `app/` arma el actor desde el contexto de acceso y los casos de uso consultan estas reglas.

export interface InvitationActor {
  tenantId: string;
  userId: string;
  membershipId: string;
  isClinicAdmin: boolean;
  isDoctor: boolean;
}

// Lo mínimo que se necesita del vínculo con la clínica activa.
export interface InvitationActorInput {
  tenantId: string;
  userId: string;
  relationship:
    | { kind: "PATIENT" }
    | { kind: "STAFF"; membershipId: string; isClinicAdmin: boolean; isDoctor: boolean };
}

// Invitan solo el administrador de la clínica y el médico. Un paciente, o personal sin ninguno de los dos roles,
// no tiene actor. La membresía debe estar activa: el contexto de acceso ya descarta las desactivadas.
export function resolveInvitationActor({ tenantId, userId, relationship }: InvitationActorInput): InvitationActor | null {
  if (relationship.kind === "PATIENT") {
    return null;
  }

  if (!relationship.isClinicAdmin && !relationship.isDoctor) {
    return null;
  }

  return {
    tenantId,
    userId,
    membershipId: relationship.membershipId,
    isClinicAdmin: relationship.isClinicAdmin,
    isDoctor: relationship.isDoctor,
  };
}

// El administrador invita médicos y pacientes; quien solo es médico, solo pacientes.
export function canInvite(actor: InvitationActor, kind: InvitationKind): boolean {
  return kind === "PATIENT" ? actor.isClinicAdmin || actor.isDoctor : actor.isClinicAdmin;
}

// Un link de paciente generado por un médico asigna al paciente a ese médico al aceptarse.
export function assignsCreator(actor: InvitationActor, kind: InvitationKind): boolean {
  return kind === "PATIENT" && actor.isDoctor;
}

// Revoca quien generó el link, o un administrador de la clínica (que puede verlos todos).
export function canRevoke(actor: InvitationActor, invitation: { createdByMembershipId: string }): boolean {
  return actor.isClinicAdmin || invitation.createdByMembershipId === actor.membershipId;
}

// El administrador ve los links de toda la clínica; quien solo es médico, los que generó.
export function canSeeAllInvitations(actor: InvitationActor): boolean {
  return actor.isClinicAdmin;
}
