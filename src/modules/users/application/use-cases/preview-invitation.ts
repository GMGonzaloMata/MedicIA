import { INVITATION_MAX_FAILED_ATTEMPTS, effectiveStatus, type InvitationKind } from "../../domain/invitation";
import { hashInvitationToken, isWellFormedInvitationToken } from "../../domain/invitation-token";
import type { InvitationContext, InvitationRepository } from "../ports/out/invitation-repository";

export type InvitationPreview = { status: "VALID"; kind: InvitationKind; tenantName: string } | { status: "INVALID" };

interface Dependencies {
  invitations: InvitationRepository;
  now: () => Date;
}

// Si el link todavía sirve para esa cuenta: existe, está pendiente y vigente, le quedan intentos, la clínica está
// activa, quien lo generó sigue vigente y el correo de la cuenta es el del link. Lo comparten la vista previa y la
// aceptación, para que las dos decidan lo mismo.
export function isInvitationUsable(context: InvitationContext, accountEmail: string, now: Date): boolean {
  const { invitation, isTenantActive, creator } = context;

  return (
    effectiveStatus(invitation, now) === "PENDING" &&
    invitation.failedAttempts < INVITATION_MAX_FAILED_ATTEMPTS &&
    isTenantActive &&
    creator.isMembershipActive &&
    invitation.email === accountEmail.trim().toLowerCase()
  );
}

// Busca el link por el hash de su token. Devuelve `null` ante cualquier cosa que no sea un link vigente, sin dar la causa.
export async function findUsableInvitation(
  invitations: InvitationRepository,
  token: string,
  accountEmail: string,
  now: Date,
): Promise<InvitationContext | null> {
  if (!isWellFormedInvitationToken(token)) {
    return null;
  }

  const context = await invitations.findByTokenHash(hashInvitationToken(token));

  return context && isInvitationUsable(context, accountEmail, now) ? context : null;
}

export function createPreviewInvitation({ invitations, now }: Dependencies) {
  // No modifica nada. `INVALID` no distingue la causa (FR-024).
  return async function previewInvitation(input: {
    token: string;
    account: { id: string; email: string };
  }): Promise<InvitationPreview> {
    const context = await findUsableInvitation(invitations, input.token, input.account.email, now());

    return context
      ? { status: "VALID", kind: context.invitation.kind, tenantName: context.tenantName }
      : { status: "INVALID" };
  };
}
