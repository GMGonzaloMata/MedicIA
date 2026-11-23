import "server-only";

import type { InvitationMailer } from "../../application/ports/out/invitation-mailer";
import { createFakeInvitationMailer } from "./fake-invitation-mailer";
import { createSmtpInvitationMailer, createSmtpTransport, readSmtpConfig } from "./smtp-invitation-mailer";

// Elige el correo según INVITATION_MAILER. No hay valor por defecto: si falta o es desconocido, invitar falla
// (se arma recién al invitar), para que un entorno mal configurado no use el simulado por error.
export function createInvitationMailer(env: Record<string, string | undefined>): InvitationMailer {
  switch (env.INVITATION_MAILER) {
    case "fake": {
      const outboxFile = env.FAKE_MAIL_OUTBOX_FILE;

      if (!outboxFile) {
        throw new Error("FAKE_MAIL_OUTBOX_FILE es obligatoria cuando INVITATION_MAILER es fake.");
      }

      return createFakeInvitationMailer(outboxFile);
    }
    case "smtp": {
      const config = readSmtpConfig(env);

      return createSmtpInvitationMailer(createSmtpTransport(config), config.fromAddress);
    }
    default:
      throw new Error('INVITATION_MAILER debe ser "smtp" o "fake".');
  }
}
