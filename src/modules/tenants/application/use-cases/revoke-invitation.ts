import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { InvitationRepository } from "../ports/out/invitation-repository";

export interface RevokeInvitationInput {
  actor: ClinicAdminActor;
  invitationId: string;
}

export type RevokeInvitationResult = { ok: true } | { ok: false; code: "NOT_FOUND" };

interface RevokeInvitationDependencies {
  invitations: InvitationRepository;
  now: () => Date;
}

// Anula una invitación pendiente. Una invitación de otra clínica, inexistente o que ya no está pendiente
// devuelve lo mismo: no se revela si existe.
export function createRevokeInvitation({ invitations, now }: RevokeInvitationDependencies) {
  return async ({ actor, invitationId }: RevokeInvitationInput): Promise<RevokeInvitationResult> => {
    const revoked = await invitations.revoke({
      tenantId: actor.tenantId,
      invitationId,
      revokedByUserId: actor.userId,
      now: now(),
    });

    return revoked ? { ok: true } : { ok: false, code: "NOT_FOUND" };
  };
}
