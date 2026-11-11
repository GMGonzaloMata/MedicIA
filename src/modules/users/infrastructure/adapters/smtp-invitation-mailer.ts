import "server-only";

import type {
  AccessNoticeEmail,
  InvitationEmail,
  InvitationMailer,
} from "../../application/ports/out/invitation-mailer";
import { renderAccessNotice } from "../../application/use-cases/render-access-notice";
import { renderInvitationEmail } from "../../application/use-cases/render-invitation-email";
import { MailDeliveryError, type MailDeliveryErrorCode } from "../../domain/invitation-errors";

// Lo único que se usa del transporte de `nodemailer`. Se recibe por argumento para probar sin red.
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
}

interface SmtpInvitationMailerOptions {
  transport: MailTransport;
  from: string;
}

const AUTHENTICATION_ERROR_CODE = "EAUTH";
const REJECTED_RECIPIENT_ERROR_CODE = "EENVELOPE";
const FIRST_PERMANENT_FAILURE_CODE = 500;
const LAST_PERMANENT_FAILURE_CODE = 599;

function readProperty(error: unknown, property: "code" | "responseCode"): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, property) : undefined;
}

// Traduce cualquier falla de `nodemailer` a un código genérico. Nunca se propaga el mensaje original: puede incluir
// el destinatario, datos de la conexión o la respuesta del servidor.
export function toMailDeliveryErrorCode(error: unknown): MailDeliveryErrorCode {
  const code = readProperty(error, "code");
  const responseCode = readProperty(error, "responseCode");

  if (code === AUTHENTICATION_ERROR_CODE) {
    return "NOT_CONFIGURED";
  }

  const isPermanentFailure =
    typeof responseCode === "number" &&
    responseCode >= FIRST_PERMANENT_FAILURE_CODE &&
    responseCode <= LAST_PERMANENT_FAILURE_CODE;

  if (code === REJECTED_RECIPIENT_ERROR_CODE || isPermanentFailure) {
    return "REJECTED";
  }

  return "UNAVAILABLE";
}

// Correo real por SMTP. No sabe nada del proveedor: Gmail es solo el servidor que se configura. No registra el
// destinatario, el asunto, el cuerpo, el link ni la contraseña.
export function createSmtpInvitationMailer({ transport, from }: SmtpInvitationMailerOptions): InvitationMailer {
  return {
    async send(email: InvitationEmail): Promise<void> {
      const { subject, text, html } = renderInvitationEmail(email);

      try {
        await transport.sendMail({ from, to: email.to, subject, text, html });
      } catch (error) {
        throw new MailDeliveryError(toMailDeliveryErrorCode(error));
      }
    },

    async sendAccessNotice(notice: AccessNoticeEmail): Promise<void> {
      const { subject, text, html } = renderAccessNotice(notice);

      try {
        await transport.sendMail({ from, to: notice.to, subject, text, html });
      } catch (error) {
        throw new MailDeliveryError(toMailDeliveryErrorCode(error));
      }
    },
  };
}
