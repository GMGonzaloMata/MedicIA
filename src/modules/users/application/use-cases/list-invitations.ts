import {
  INVITATION_LIST_LIMIT,
  toInvitationSummary,
  type InvitationSummary,
} from "../../domain/invitation";
import { canInvite, canSeeAllInvitations, type InvitationActor } from "../../domain/invitation-access";
import { InvitationForbiddenError } from "../../domain/invitation-errors";
import type { InvitationRepository } from "../ports/out/invitation-repository";

interface Dependencies {
  invitations: InvitationRepository;
  now: () => Date;
}

export function createListInvitations({ invitations, now }: Dependencies) {
  // Los links pendientes y vigentes de la clínica del actor, del más nuevo al más viejo. El administrador ve los de
  // toda la clínica; quien solo es médico, los que generó (FR-022). Nunca incluye el token, su hash, el documento ni la
  // matrícula.
  return async function listInvitations({ actor }: { actor: InvitationActor }): Promise<InvitationSummary[]> {
    if (!canInvite(actor, "PATIENT") && !canInvite(actor, "DOCTOR")) {
      throw new InvitationForbiddenError();
    }

    const entries = await invitations.listPending({
      tenantId: actor.tenantId,
      ...(canSeeAllInvitations(actor) ? {} : { createdByMembershipId: actor.membershipId }),
      now: now(),
      limit: INVITATION_LIST_LIMIT,
    });

    return entries.map(toInvitationSummary);
  };
}
