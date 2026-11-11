import type { InvitationEmail, InvitationMailer } from "@/modules/users/application/ports/out/invitation-mailer";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";

// Cumple el puerto en memoria: guarda los mensajes enviados y puede forzar una falla de entrega.
export class InMemoryInvitationMailer implements InvitationMailer {
  readonly sent: InvitationEmail[] = [];
  failWith: MailDeliveryError | null = null;

  async send(email: InvitationEmail): Promise<void> {
    if (this.failWith) {
      throw this.failWith;
    }

    this.sent.push(email);
  }
}
