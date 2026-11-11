import "server-only";

import nodemailer from "nodemailer";
import { z } from "zod";

import type { InvitationMailer } from "../../application/ports/out/invitation-mailer";
import { createFakeInvitationMailer } from "./fake-invitation-mailer";
import { createSmtpInvitationMailer } from "./smtp-invitation-mailer";

type Environment = Record<string, string | undefined>;

const SMTP_TIMEOUT_MS = 10_000;
const SMTP_IMPLICIT_TLS_PORT = 465;
const SMTP_STARTTLS_PORT = 587;
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Un mensaje de configuración inválida nombra las variables, nunca sus valores: algunas son secretos.
function invalidConfiguration(issues: z.core.$ZodIssue[]): Error {
  const names = [...new Set(issues.map((issue) => String(issue.path[0] ?? "configuración")))];

  return new Error(`Configuración de correo inválida: ${names.join(", ")}.`);
}

function isProduction(env: Environment): boolean {
  return env.NODE_ENV === "production";
}

// Dirección pública de la aplicación, de donde se arma el link del correo. Sale siempre de esta variable y nunca de
// un encabezado de la solicitud: usarlo permitiría hacer enviar links a un sitio ajeno. Exige `https`, salvo en la
// propia máquina (desarrollo y pruebas, incluso con un build de producción).
export function loadAppBaseUrl(env: Environment): string {
  const parsed = z.url().safeParse(env.APP_BASE_URL);

  if (!parsed.success) {
    throw new Error("APP_BASE_URL debe ser una dirección válida.");
  }

  const url = new URL(parsed.data);
  const isLoopback = LOOPBACK_HOSTNAMES.has(url.hostname);

  if (isProduction(env) && url.protocol !== "https:" && !isLoopback) {
    throw new Error("APP_BASE_URL debe usar https en producción.");
  }

  return url.origin;
}

const smtpSchema = z.object({
  SMTP_HOST: z.string().trim().min(1),
  SMTP_PORT: z.enum([String(SMTP_IMPLICIT_TLS_PORT), String(SMTP_STARTTLS_PORT)]).transform(Number),
  SMTP_USER: z.string().trim().min(1),
  SMTP_PASSWORD: z.string().min(1),
  INVITATION_FROM_ADDRESS: z.email(),
});

const fakeSchema = z.object({ FAKE_MAIL_OUTBOX_FILE: z.string().trim().min(1) });

function createSmtpMailer(env: Environment): InvitationMailer {
  const parsed = smtpSchema.safeParse(env);

  if (!parsed.success) {
    throw invalidConfiguration(parsed.error.issues);
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, INVITATION_FROM_ADDRESS } = parsed.data;

  // Conexión siempre cifrada: TLS implícito en el 465, o `STARTTLS` obligatorio en el 587. No hay reintentos.
  const transport = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === SMTP_IMPLICIT_TLS_PORT,
    requireTLS: SMTP_PORT === SMTP_STARTTLS_PORT,
    auth: { user: SMTP_USER, pass: SMTP_PASSWORD },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS,
  });

  return createSmtpInvitationMailer({ transport, from: INVITATION_FROM_ADDRESS });
}

function createFakeMailer(env: Environment): InvitationMailer {
  const parsed = fakeSchema.safeParse(env);

  if (!parsed.success) {
    throw invalidConfiguration(parsed.error.issues);
  }

  // El correo simulado escribe los mensajes en un archivo: con una dirección pública real en producción
  // nadie recibiría nada, así que se rechaza. Con una dirección de la propia máquina se permite, para correr las
  // pruebas de extremo a extremo contra el build de producción.
  const isLocalApp = LOOPBACK_HOSTNAMES.has(new URL(loadAppBaseUrl(env)).hostname);

  if (isProduction(env) && !isLocalApp) {
    throw new Error('INVITATION_MAILER="fake" no se puede usar en producción.');
  }

  return createFakeInvitationMailer({ outboxFile: parsed.data.FAKE_MAIL_OUTBOX_FILE });
}

// Elige el adaptador del correo según `INVITATION_MAILER`. No hay valor por defecto: si falta o es desconocido,
// falla al armarse el módulo (de forma perezosa, para que `next build` no falle si faltan las variables).
export function createInvitationMailer(env: Environment): InvitationMailer {
  switch (env.INVITATION_MAILER) {
    case "smtp":
      return createSmtpMailer(env);
    case "fake":
      return createFakeMailer(env);
    default:
      throw new Error('INVITATION_MAILER debe ser "smtp" o "fake".');
  }
}
