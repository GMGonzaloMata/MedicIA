import { describeRoles, type StaffRoles } from "./staff-roles";
import { INVITATION_VALIDITY_DAYS } from "./staff-invitation";

export interface InvitationEmail {
  subject: string;
  text: string;
  html: string;
}

interface InvitationEmailInput {
  clinicName: string;
  roles: StaffRoles;
  // Enlace completo, con el token. Solo aparece en el cuerpo del correo.
  link: string;
}

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

// Arma el correo de una invitación del personal (specs/012-vinculacion-clinica/contracts/invitation-email.md).
// Sin imágenes remotas ni seguimiento de aperturas, y sin ningún dato clínico.
export function buildInvitationEmail({ clinicName, roles, link }: InvitationEmailInput): InvitationEmail {
  const role = describeRoles(roles);
  const validity = `Este enlace vence en ${INVITATION_VALIDITY_DAYS} días y se puede usar una sola vez.`;
  const noAccount = "Si todavía no tenés cuenta, registrate con este mismo correo y volvé a abrir este enlace.";
  const ignore = "Si no esperabas esta invitación, ignorá este mensaje.";
  const subject = `Te invitaron a ${clinicName} en MedicIA`;

  const text = [
    `Te invitaron a sumarte a ${clinicName} en MedicIA como ${role}.`,
    "",
    "Para aceptar la invitación, abrí este enlace:",
    link,
    "",
    validity,
    noAccount,
    ignore,
  ].join("\n");

  const clinic = escapeHtml(clinicName);
  const safeLink = escapeHtml(link);
  const safeRole = escapeHtml(role);

  // Los correos se arman con tablas y estilos en línea porque muchos clientes ignoran el CSS externo. Los colores son
  // fijos (no tokens de la app) y, a propósito, sin imágenes remotas: el nombre de la marca va como texto.
  const html = [
    "<!doctype html>",
    '<html lang="es">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    `<title>${escapeHtml(subject)}</title>`,
    "</head>",
    '<body style="margin:0;padding:0;background-color:#f1f5f9;">',
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">Aceptá la invitación para sumarte a ${clinic}.</div>`,
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f1f5f9;">',
    '<tr><td align="center" style="padding:32px 16px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">',
    '<tr><td style="padding:0 4px 20px;font-family:Arial,Helvetica,sans-serif;font-size:24px;font-weight:700;letter-spacing:-0.5px;color:#0f172a;">Medic<span style="color:#0f766e;">IA</span></td></tr>',
    '<tr><td style="background-color:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">',
    '<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#0f766e;">Invitación al personal</p>',
    `<h1 style="margin:0 0 16px;font-size:26px;line-height:1.25;font-weight:700;color:#0f172a;">${clinic}</h1>`,
    `<p style="margin:0 0 24px;font-size:16px;line-height:1.6;color:#334155;">Te invitaron a sumarte a esta clínica en MedicIA como <strong style="color:#0f172a;">${safeRole}</strong>.</p>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 24px;"><tr>',
    `<td align="center" bgcolor="#0f766e" style="border-radius:8px;"><a href="${safeLink}" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">Aceptar la invitación</a></td>`,
    "</tr></table>",
    `<p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#475569;">${validity}</p>`,
    '<p style="margin:0 0 6px;font-size:13px;line-height:1.5;color:#64748b;">Si el botón no funciona, copiá y pegá este enlace en el navegador:</p>',
    `<p style="margin:0 0 24px;font-size:13px;line-height:1.5;word-break:break-all;"><a href="${safeLink}" style="color:#0f766e;">${safeLink}</a></p>`,
    '<hr style="border:0;border-top:1px solid #e2e8f0;margin:0 0 20px;">',
    `<p style="margin:0 0 10px;font-size:14px;line-height:1.6;color:#334155;">${noAccount}</p>`,
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#64748b;">${ignore}</p>`,
    "</td></tr>",
    '<tr><td style="padding:20px 4px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;">Este es un mensaje automático de MedicIA. Por favor, no respondas a este correo.</td></tr>',
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");

  return { subject, text, html };
}
