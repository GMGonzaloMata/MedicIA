// Errores del dominio de invitaciones. Los mensajes nunca incluyen el correo, el documento, la matrícula, el link ni
// la respuesta del servicio de correo.

export class InvitationForbiddenError extends Error {
  constructor() {
    super("No tenés permiso para invitar.");
    this.name = "InvitationForbiddenError";
  }
}

// Mismo error para una invitación inexistente, de otra clínica, que ya no está pendiente o sobre la que no hay permiso.
export class InvitationNotFoundError extends Error {
  constructor() {
    super("No encontramos la invitación.");
    this.name = "InvitationNotFoundError";
  }
}

export class InvitationInputError extends Error {
  constructor() {
    super("Los datos de la invitación no son válidos.");
    this.name = "InvitationInputError";
  }
}

export type InvitationConflictReason =
  | "OTHER_RELATIONSHIP"
  | "MEMBERSHIP_DEACTIVATED"
  | "ROLE_CHANGE_NOT_SUPPORTED"
  | "DOCUMENT_IN_USE"
  | "LICENSE_IN_USE";

// Lo lanza la transacción de aceptación para revertirse cuando una regla impide vincular. El caso de uso lo
// convierte en un resultado `CONFLICT` sin consumir el link.
export class InvitationConflictError extends Error {
  readonly reason: InvitationConflictReason;

  constructor(reason: InvitationConflictReason) {
    super("No se puede completar la vinculación.");
    this.name = "InvitationConflictError";
    this.reason = reason;
  }
}

export type MailDeliveryErrorCode = "UNAVAILABLE" | "REJECTED" | "NOT_CONFIGURED";

const MAIL_ERROR_MESSAGES: Record<MailDeliveryErrorCode, string> = {
  UNAVAILABLE: "El servicio de correo no está disponible.",
  REJECTED: "El servicio de correo rechazó el mensaje.",
  NOT_CONFIGURED: "El servicio de correo no está configurado.",
};

// Falla del envío. El mensaje es fijo por código: no copia el destinatario, el link, la respuesta del servidor ni la
// contraseña.
export class MailDeliveryError extends Error {
  readonly code: MailDeliveryErrorCode;

  constructor(code: MailDeliveryErrorCode) {
    super(MAIL_ERROR_MESSAGES[code]);
    this.name = "MailDeliveryError";
    this.code = code;
  }
}

// Next puede cargar este módulo más de una vez (una copia por ruta), y entonces `instanceof` falla entre copias: la
// capa de pantalla distingue estos errores por su nombre.
function hasName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

export function isInvitationForbiddenError(error: unknown): boolean {
  return hasName(error, "InvitationForbiddenError");
}

export function isInvitationNotFoundError(error: unknown): boolean {
  return hasName(error, "InvitationNotFoundError");
}

export function isInvitationInputError(error: unknown): boolean {
  return hasName(error, "InvitationInputError");
}
