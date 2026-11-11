import type { AccessNoticeEmail } from "../ports/out/invitation-mailer";
import type { RenderedInvitationEmail } from "./render-invitation-email";

const KIND_LABELS = { DOCTOR: "médico", PATIENT: "paciente" } as const;

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

// Arma el asunto, el texto plano y el HTML del aviso de alta. Función pura. Nunca incluye el documento, la matrícula,
// el nombre de quien dio de alta ni datos clínicos (specs/010-gestion-usuarios-clinica, FR-009).
export function renderAccessNotice({ clinicName, kind, setPasswordUrl }: AccessNoticeEmail): RenderedInvitationEmail {
  const role = KIND_LABELS[kind];
  // El asunto es un encabezado: sin saltos de línea, para que un nombre de clínica no pueda inyectar otros.
  const subject = `Te sumaron a ${clinicName} en MedicIA`.replace(/[\r\n]+/g, " ");
  const intro = `Te dieron de alta en ${clinicName} en MedicIA como ${role}.`;
  const safeClinicName = escapeHtml(clinicName);

  if (setPasswordUrl === null) {
    const text = [
      intro,
      "",
      "Ya tenés cuenta en MedicIA: ingresá con tu contraseña de siempre y elegí esta clínica.",
      "",
      "Si no esperabas este aviso, ignorá este mensaje.",
    ].join("\n");
    const html = [
      `<p>Te dieron de alta en <strong>${safeClinicName}</strong> en MedicIA como ${role}.</p>`,
      "<p>Ya tenés cuenta en MedicIA: ingresá con tu contraseña de siempre y elegí esta clínica.</p>",
      "<p>Si no esperabas este aviso, ignorá este mensaje.</p>",
    ].join("\n");

    return { subject, text, html };
  }

  const text = [
    intro,
    "",
    "Para entrar, primero elegí tu contraseña. El servicio de identidad te envió un correo aparte con un código de verificación.",
    "Abrí este enlace e ingresá tu correo, ese código y la contraseña que quieras usar:",
    setPasswordUrl,
    "",
    "Si no esperabas este aviso, ignorá este mensaje.",
  ].join("\n");
  const safeUrl = escapeHtml(setPasswordUrl);
  const html = [
    `<p>Te dieron de alta en <strong>${safeClinicName}</strong> en MedicIA como ${role}.</p>`,
    "<p>Para entrar, primero elegí tu contraseña. El servicio de identidad te envió un correo aparte con un código de verificación.</p>",
    `<p>Abrí este enlace e ingresá tu correo, ese código y la contraseña que quieras usar: <a href="${safeUrl}">${safeUrl}</a></p>`,
    "<p>Si no esperabas este aviso, ignorá este mensaje.</p>",
  ].join("\n");

  return { subject, text, html };
}
