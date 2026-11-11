import type { InvitationConflictReason } from "@/modules/users/domain/invitation-errors";

// Textos de la pantalla de invitaciones. Ninguno revela datos de terceros ni la causa por la que un link no sirve
// (specs/009-link-vinculacion, FR-024).

export const INVITATION_MESSAGES = {
  // Un solo mensaje para un link inexistente, vencido, revocado, usado o dirigido a otro correo.
  invalidLink: "Esta invitación no es válida o venció.",
  otherEmailHint: "Si te invitaron a otro correo, cerrá sesión e ingresá con ese correo.",
  proofReason: "Lo pedimos para confirmar que la invitación es para vos.",
  attemptsExhausted: "La invitación se invalidó por demasiados intentos. Pedí una nueva a la clínica.",
  sendFailed: "No pudimos enviar el correo.",
  unexpected: "No pudimos completar la vinculación. Probá de nuevo.",
  unexpectedInvite: "No pudimos crear la invitación. Probá de nuevo.",
  forbidden: "No tenés permiso para invitar.",
  contactClinic: "Comunicate con la clínica.",
  revokeNotFound: "No encontramos la invitación. Puede que ya no esté pendiente.",
  unexpectedRevoke: "No pudimos revocar la invitación. Probá de nuevo.",
  noPending: "No hay invitaciones pendientes.",
  statusSent: "Enviada",
  statusSendFailed: "Envío fallido",
} as const;

export function attemptsLeftMessage(attemptsLeft: number): string {
  return attemptsLeft === 1
    ? "Los datos no coinciden. Te queda 1 intento."
    : `Los datos no coinciden. Te quedan ${attemptsLeft} intentos.`;
}

export function invitedAsMessage(tenantName: string, kind: "DOCTOR" | "PATIENT"): string {
  return `${tenantName} te invitó como ${kind === "DOCTOR" ? "médico" : "paciente"}`;
}

export function alreadyMemberMessage(tenantName: string): string {
  return `Ya pertenecés a ${tenantName}.`;
}

export function sentMessage(email: string): string {
  return `Enviamos la invitación a ${email}.`;
}

// Motivos por los que no se puede vincular a la persona que acepta. Hablan de "tu" situación, nunca de otra persona.
const ACCEPT_CONFLICT_MESSAGES: Record<InvitationConflictReason, string> = {
  OTHER_RELATIONSHIP: "Ya tenés otro tipo de vínculo con esta clínica, así que no podemos completar la invitación.",
  MEMBERSHIP_DEACTIVATED: "Tu acceso a esta clínica está desactivado.",
  ROLE_CHANGE_NOT_SUPPORTED:
    "Sumar el rol de médico lo gestiona la clínica: pedíselo a un administrador.",
  DOCUMENT_IN_USE: "No pudimos vincular ese documento con tu cuenta.",
  LICENSE_IN_USE: "No pudimos vincular esa matrícula con tu cuenta.",
};

export function acceptConflictMessage(reason: InvitationConflictReason): string {
  // `ROLE_CHANGE_NOT_SUPPORTED` ya indica a quién pedirlo; el resto remite a la clínica.
  return reason === "ROLE_CHANGE_NOT_SUPPORTED"
    ? ACCEPT_CONFLICT_MESSAGES[reason]
    : `${ACCEPT_CONFLICT_MESSAGES[reason]} ${INVITATION_MESSAGES.contactClinic}`;
}

// Motivos por los que no se puede invitar a ese correo: los ve quien invita, sobre datos de su propia clínica.
const CREATE_CONFLICT_MESSAGES = {
  ALREADY_STAFF: "Ese correo ya es personal de la clínica.",
  ALREADY_PATIENT: "Ese correo ya es paciente de la clínica.",
  DOCUMENT_IN_USE: "Ese documento ya está registrado con otra cuenta.",
  LICENSE_IN_USE: "Esa matrícula ya está registrada con otra cuenta.",
} as const;

export function createConflictMessage(reason: keyof typeof CREATE_CONFLICT_MESSAGES): string {
  return CREATE_CONFLICT_MESSAGES[reason];
}
