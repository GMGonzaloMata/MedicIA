import type { DoctorProfile } from "../../../domain/doctor-profile";
import type { NormalizedEmail } from "../../../domain/normalized-values";
import type { StaffInvitation } from "../../../domain/staff-invitation";
import type { StaffRoles } from "../../../domain/staff-roles";

export interface CreateInvitationInput {
  tenantId: string;
  email: NormalizedEmail;
  roles: StaffRoles;
  // Obligatorio si `roles.isDoctor` y null si no.
  doctor: DoctorProfile | null;
  tokenHash: string;
  expiresAt: Date;
  createdByUserId: string;
  now: Date;
}

export interface AcceptInvitationInput {
  tokenHash: string;
  user: { id: string; email: NormalizedEmail };
  now: Date;
}

export type AcceptInvitationResult =
  | { kind: "accepted"; tenantId: string; membershipId: string }
  | { kind: "rejected" };

// Invitaciones del personal. Todo salvo `accept` recibe el `tenantId` del actor y trata una invitación de otra
// clínica como inexistente. `accept` es la excepción: quien acepta todavía no pertenece a ninguna clínica, así que
// busca por el hash del token y la clínica sale de la invitación encontrada.
export interface InvitationRepository {
  // Crea una invitación pendiente. Si ya había una pendiente para ese correo en la clínica, la revoca en la misma
  // transacción: así reenviar nunca deja dos pendientes (hay un índice único que lo garantiza).
  createReplacingPending(input: CreateInvitationInput): Promise<StaffInvitation>;

  // Invitaciones aún pendientes (incluye las vencidas que nadie revocó), de la más nueva a la más vieja.
  listPending(tenantId: string): Promise<StaffInvitation[]>;

  findById(input: { tenantId: string; invitationId: string }): Promise<StaffInvitation | null>;

  // Revoca una invitación pendiente. Devuelve false si no existe, es de otra clínica o ya no está pendiente.
  revoke(input: { tenantId: string; invitationId: string; revokedByUserId: string; now: Date }): Promise<boolean>;

  // Acepta en una sola transacción: marca la invitación, y crea la membresía o suma los roles a la existente.
  // Cualquier motivo de rechazo devuelve el mismo resultado.
  accept(input: AcceptInvitationInput): Promise<AcceptInvitationResult>;
}
