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

  const html = [
    `<p>Te invitaron a sumarte a <strong>${escapeHtml(clinicName)}</strong> en MedicIA como ${escapeHtml(role)}.</p>`,
    `<p>Para aceptar la invitación, abrí este enlace:<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></p>`,
    `<p>${validity}</p>`,
    `<p>${noAccount}</p>`,
    `<p>${ignore}</p>`,
  ].join("\n");

  return { subject, text, html };
}
