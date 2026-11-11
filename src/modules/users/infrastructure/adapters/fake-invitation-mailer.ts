import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { InvitationEmail, InvitationMailer } from "../../application/ports/out/invitation-mailer";
import { renderInvitationEmail } from "../../application/use-cases/render-invitation-email";
import { MailDeliveryError } from "../../domain/invitation-errors";

// Destinatario que siempre falla, para probar el envío fallido sin tocar ningún servicio.
export const FAKE_FAILING_RECIPIENT = "fail@invitations.test";

interface FakeInvitationMailerOptions {
  // Archivo donde se agrega una línea JSON por correo. Lo leen las pruebas y quien desarrolla para abrir el link.
  outboxFile: string;
  now?: () => Date;
}

// Correo simulado para desarrollo y pruebas: no envía nada, escribe cada mensaje en un archivo local fuera de git.
export function createFakeInvitationMailer({
  outboxFile,
  now = () => new Date(),
}: FakeInvitationMailerOptions): InvitationMailer {
  return {
    async send(email: InvitationEmail): Promise<void> {
      if (email.to === FAKE_FAILING_RECIPIENT) {
        throw new MailDeliveryError("UNAVAILABLE");
      }

      const { subject, text, html } = renderInvitationEmail(email);
      const line = JSON.stringify({ to: email.to, subject, text, html, link: email.link, sentAt: now().toISOString() });

      await mkdir(dirname(outboxFile), { recursive: true });
      await appendFile(outboxFile, `${line}\n`, "utf8");
    },
  };
}
