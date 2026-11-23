import "server-only";

import { createTransport } from "nodemailer";

import type { InvitationMailer } from "../../application/ports/out/invitation-mailer";
import { MailDeliveryError } from "../../domain/mail-errors";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  fromAddress: string;
}

// Lo mínimo que se usa de nodemailer: permite probar el adaptador sin red.
export interface MailTransport {
  sendMail(message: { from: string; to: string; subject: string; text: string; html: string }): Promise<unknown>;
}

// Lee la configuración del entorno. Falta cualquier valor → error de configuración (no se reintenta ni se muestra).
export function readSmtpConfig(env: Record<string, string | undefined>): SmtpConfig {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASSWORD: password } = env;
  const fromAddress = env.INVITATION_FROM_ADDRESS;
  const portNumber = Number(port);

  if (!host || !user || !password || !fromAddress || !Number.isInteger(portNumber) || portNumber <= 0) {
    throw new Error("Faltan SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD o INVITATION_FROM_ADDRESS.");
  }

  return { host, port: portNumber, user, password, fromAddress };
}

// Conexión segura con verificación del certificado (el puerto 465 usa TLS desde el inicio; los demás exigen STARTTLS).
export function createSmtpTransport(config: SmtpConfig): MailTransport {
  return createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    requireTLS: config.port !== 465,
    auth: { user: config.user, pass: config.password },
    tls: { rejectUnauthorized: true },
  });
}

// Cualquier error del servidor se traduce a `MailDeliveryError` sin su mensaje: puede traer datos de la conexión
// o del destinatario.
export function createSmtpInvitationMailer(transport: MailTransport, fromAddress: string): InvitationMailer {
  return {
    async send(message) {
      try {
        await transport.sendMail({
          from: fromAddress,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html,
        });
      } catch {
        throw new MailDeliveryError();
      }
    },
  };
}
