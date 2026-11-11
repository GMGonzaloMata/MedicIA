import { effectiveStatus } from "../../domain/invitation";
import { canInvite, canRevoke, type InvitationActor } from "../../domain/invitation-access";
import { InvitationForbiddenError, InvitationNotFoundError } from "../../domain/invitation-errors";
import type { InvitationRepository } from "../ports/out/invitation-repository";

interface Dependencies {
  invitations: InvitationRepository;
  now: () => Date;
}

export function createRevokeInvitation({ invitations, now }: Dependencies) {
  // Revoca un link pendiente de la clínica del actor: quien lo generó, o un administrador de la clínica. Deja de servir
  // de inmediato. Un link inexistente, de otra clínica, que ya no está pendiente o sobre el que no hay permiso
  // responde con el mismo error, para no revelar cuál fue la causa.
  return async function revokeInvitation({
    actor,
    invitationId,
  }: {
    actor: InvitationActor;
    invitationId: string;
  }): Promise<void> {
    if (!canInvite(actor, "PATIENT") && !canInvite(actor, "DOCTOR")) {
      throw new InvitationForbiddenError();
    }

    const moment = now();
    const invitation = await invitations.findById({ tenantId: actor.tenantId, invitationId });

    if (!invitation || effectiveStatus(invitation, moment) !== "PENDING" || !canRevoke(actor, invitation)) {
      throw new InvitationNotFoundError();
    }

    // Si otra persona la cerró entre la lectura y esta escritura, tampoco hay nada que revocar.
    if (!(await invitations.revoke({ tenantId: actor.tenantId, invitationId, now: moment }))) {
      throw new InvitationNotFoundError();
    }
  };
}
