// Invitación a unirse a una clínica (specs/009-link-vinculacion/data-model.md). Tipos, estados y reglas de
// vigencia. Nada de este archivo guarda ni muestra el token: el registro solo lleva su hash.

export const INVITATION_KINDS = ["DOCTOR", "PATIENT"] as const;
export type InvitationKind = (typeof INVITATION_KINDS)[number];

export const INVITATION_STATUSES = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
export type InvitationStatus = (typeof INVITATION_STATUSES)[number];

export const INVITATION_END_REASONS = ["BY_SENDER", "REPLACED", "ATTEMPTS_EXCEEDED"] as const;
export type InvitationEndReason = (typeof INVITATION_END_REASONS)[number];

export const DOCUMENT_TYPES = ["DNI", "PASSPORT", "OTHER"] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000;

// Vigencia de una invitación: 7 días desde que se genera, sin posibilidad de extenderla (FR-006).
export const INVITATION_TTL_MS = 7 * MILLISECONDS_PER_DAY;
// Intentos incorrectos del documento o la matrícula antes de invalidar el link (FR-038).
export const INVITATION_MAX_FAILED_ATTEMPTS = 5;
// Cuántas invitaciones pendientes devuelve el listado.
export const INVITATION_LIST_LIMIT = 100;

// Lo que se guarda de una invitación. `tokenHash` es el SHA-256 del token; el token no se guarda.
export interface InvitationRecord {
  id: string;
  tenantId: string;
  kind: InvitationKind;
  email: string;
  tokenHash: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  licenseNumber: string | null;
  createdByMembershipId: string;
  createdByUserId: string;
  assignToCreator: boolean;
  status: InvitationStatus;
  endReason: InvitationEndReason | null;
  failedAttempts: number;
  expiresAt: Date;
  sentAt: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
  acceptedAt: Date | null;
  acceptedByUserId: string | null;
}

// Una invitación con el nombre de quien la generó, para listarla.
export interface InvitationEntry extends InvitationRecord {
  createdByName: string;
}

// Lo único que ve la pantalla de la lista. Nunca incluye el token, su hash, el documento ni la matrícula.
export interface InvitationSummary {
  id: string;
  kind: InvitationKind;
  email: string;
  expiresAt: Date;
  createdAt: Date;
  // Vacío cuando el servicio de correo no aceptó el mensaje (envío fallido).
  sentAt: Date | null;
  createdByName: string;
}

// Un `PENDING` vencido se trata como vencido aunque nadie lo haya marcado todavía (vencimiento perezoso).
export function effectiveStatus(
  invitation: Pick<InvitationRecord, "status" | "expiresAt">,
  now: Date,
): InvitationStatus {
  if (invitation.status === "PENDING" && invitation.expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }

  return invitation.status;
}

export function toInvitationSummary(entry: InvitationEntry): InvitationSummary {
  return {
    id: entry.id,
    kind: entry.kind,
    email: entry.email,
    expiresAt: entry.expiresAt,
    createdAt: entry.createdAt,
    sentAt: entry.sentAt,
    createdByName: entry.createdByName,
  };
}
