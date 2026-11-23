import "server-only";

import { appendFile, mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import type { InvitationMailer } from "../../application/ports/out/invitation-mailer";
import { MailDeliveryError } from "../../domain/mail-errors";

// Para desarrollo y pruebas E2E: no sale a la red. Agrega cada correo como una línea JSON al archivo indicado,
// que lo lee la prueba para encontrar el enlace de la invitación.
export function createFakeInvitationMailer(outboxFile: string): InvitationMailer {
  return {
    async send(message) {
      try {
        await mkdir(dirname(outboxFile), { recursive: true });
        await appendFile(outboxFile, `${JSON.stringify(message)}\n`, "utf8");
      } catch {
        throw new MailDeliveryError();
      }
    },
  };
}
