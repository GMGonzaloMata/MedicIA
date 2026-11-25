import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import type { InviteStaffResult, createInviteStaff } from "./invite-staff";

export interface ResendInvitationInput {
  actor: ClinicAdminActor;
  invitationId: string;
}

export type ResendInvitationResult = InviteStaffResult;

interface ResendInvitationDependencies {
  invitations: InvitationRepository;
  inviteStaff: ReturnType<typeof createInviteStaff>;
}

// Reenviar es revocar la invitación pendiente y crear otra con el mismo correo y los mismos roles. Reutiliza
// `inviteStaff`, que ya reemplaza a la pendiente en una sola transacción. Una invitación de otra clínica, ya usada
// o ya revocada se trata como inexistente.
export function createResendInvitation({ invitations, inviteStaff }: ResendInvitationDependencies) {
  return async ({ actor, invitationId }: ResendInvitationInput): Promise<ResendInvitationResult> => {
    const invitation = await invitations.findById({ tenantId: actor.tenantId, invitationId });

    if (invitation === null || invitation.status !== "PENDING") {
      return { ok: false, code: "NOT_FOUND" };
    }

    return inviteStaff({ actor, email: invitation.email, roles: invitation.roles, doctor: invitation.doctor });
  };
}
