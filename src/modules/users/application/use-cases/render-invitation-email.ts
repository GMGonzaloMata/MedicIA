import type { InvitationEmail } from "../ports/out/invitation-mailer";

export interface RenderedInvitationEmail {
  subject: string;
  text: string;
  html: string;
}

const KIND_LABELS = { DOCTOR: "médico", PATIENT: "paciente" } as const;
const EXPIRATION_TIME_ZONE = "America/Argentina/Buenos_Aires";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => HTML_ESCAPES[character] ?? character);
}

function formatExpiration(expiresAt: Date): string {
  return new Intl.DateTimeFormat("es-AR", { dateStyle: "long", timeZone: EXPIRATION_TIME_ZONE }).format(expiresAt);
}

// Arma el asunto, el texto plano y el HTML del correo de invitación. Función pura. Nunca incluye el documento, la
// matrícula, el nombre de quien invita ni datos clínicos (specs/009-link-vinculacion, FR-034).
export function renderInvitationEmail({ clinicName, kind, link, expiresAt }: InvitationEmail): RenderedInvitationEmail {
  const role = KIND_LABELS[kind];
  const proof = kind === "PATIENT" ? "tu documento" : "tu matrícula";
  const expiration = formatExpiration(expiresAt);
  // El asunto es un encabezado: sin saltos de línea, para que un nombre de clínica no pueda inyectar otros.
  const subject = `Invitación a ${clinicName} en MedicIA`.replace(/[\r\n]+/g, " ");

  const text = [
    `Te invitaron a unirte a ${clinicName} en MedicIA como ${role}.`,
    "",
    "Para aceptar la invitación, abrí este enlace:",
    link,
    "",
    `Ingresá o creá tu cuenta con este mismo correo. Después te vamos a pedir ${proof} para confirmar que la invitación es para vos.`,
    "",
    `La invitación vence el ${expiration}. Si no la esperabas, ignorá este mensaje.`,
  ].join("\n");

  const safeClinicName = escapeHtml(clinicName);
  const safeLink = escapeHtml(link);
  const html = [
    `<p>Te invitaron a unirte a <strong>${safeClinicName}</strong> en MedicIA como ${role}.</p>`,
    `<p>Para aceptar la invitación, abrí este enlace: <a href="${safeLink}">${safeLink}</a></p>`,
    `<p>Ingresá o creá tu cuenta con este mismo correo. Después te vamos a pedir ${proof} para confirmar que la invitación es para vos.</p>`,
    `<p>La invitación vence el ${escapeHtml(expiration)}. Si no la esperabas, ignorá este mensaje.</p>`,
  ].join("\n");

  return { subject, text, html };
}
