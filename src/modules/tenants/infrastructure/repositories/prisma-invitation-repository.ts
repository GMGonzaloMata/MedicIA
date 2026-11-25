import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type {
  AcceptInvitationResult,
  InvitationRepository,
} from "../../application/ports/out/invitation-repository";
import type { NormalizedEmail } from "../../domain/normalized-values";
import { decideAcceptance, type StaffInvitation } from "../../domain/staff-invitation";

interface InvitationRow {
  id: string;
  tenantId: string;
  email: string;
  isClinicAdmin: boolean;
  isDoctor: boolean;
  specialty: string | null;
  licenseNumber: string | null;
  status: "PENDING" | "ACCEPTED" | "REVOKED";
  expiresAt: Date;
  createdAt: Date;
}

// Dos aceptaciones simultáneas de la misma persona pueden chocar contra la membresía única de la clínica.
// El segundo intento ya ve la membresía creada y suma los roles, así que se reintenta una vez.
const MAX_ACCEPT_ATTEMPTS = 2;

function toInvitation(row: InvitationRow): StaffInvitation {
  return {
    id: row.id,
    tenantId: row.tenantId,
    // Se guardó normalizado al crearla y la base exige minúsculas.
    email: row.email as NormalizedEmail,
    roles: { isClinicAdmin: row.isClinicAdmin, isDoctor: row.isDoctor },
    // La base garantiza que un médico tiene las dos y quien no lo es, ninguna.
    doctor: row.specialty !== null && row.licenseNumber !== null ? { specialty: row.specialty, licenseNumber: row.licenseNumber } : null,
    status: row.status,
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function acceptOnce(input: {
  tokenHash: string;
  user: { id: string; email: NormalizedEmail };
  now: Date;
}): Promise<AcceptInvitationResult> {
  return prismaClient.$transaction(async (transaction) => {
    // La búsqueda por hash del token es la excepción documentada del puerto: quien acepta todavía no pertenece
    // a ninguna clínica, así que la clínica sale de la invitación encontrada.
    const invitation = await transaction.staffInvitation.findUnique({
      where: { tokenHash: input.tokenHash },
      include: { tenant: { select: { status: true } } },
    });

    if (!invitation) {
      return { kind: "rejected" };
    }

    const membership = await transaction.staffMembership.findUnique({
      where: { tenantId_userId: { tenantId: invitation.tenantId, userId: input.user.id } },
      select: { id: true, isClinicAdmin: true, isDoctor: true, status: true },
    });

    const decision = decideAcceptance({
      invitation: toInvitation(invitation),
      tenantStatus: invitation.tenant.status,
      membership: membership
        ? {
            membershipId: membership.id,
            roles: { isClinicAdmin: membership.isClinicAdmin, isDoctor: membership.isDoctor },
            status: membership.status,
          }
        : null,
      userEmail: input.user.email,
      now: input.now,
    });

    if (decision.kind === "reject") {
      return { kind: "rejected" };
    }

    // Se reclama la invitación antes de tocar la membresía: si otra aceptación ganó, no se escribe nada.
    const claimed = await transaction.staffInvitation.updateMany({
      where: { id: invitation.id, status: "PENDING" },
      data: { status: "ACCEPTED", acceptedAt: input.now, acceptedByUserId: input.user.id },
    });

    if (claimed.count !== 1) {
      return { kind: "rejected" };
    }

    if (decision.kind === "merge") {
      await transaction.staffMembership.update({
        where: { id: decision.membershipId },
        data: {
          isClinicAdmin: decision.roles.isClinicAdmin,
          isDoctor: decision.roles.isDoctor,
          // Solo si la invitación le suma el rol de médico: quien ya lo es conserva sus datos.
          ...(decision.doctor
            ? { specialty: decision.doctor.specialty, licenseNumber: decision.doctor.licenseNumber }
            : {}),
        },
      });

      return { kind: "accepted", tenantId: invitation.tenantId, membershipId: decision.membershipId };
    }

    const created = await transaction.staffMembership.create({
      data: {
        tenantId: invitation.tenantId,
        userId: input.user.id,
        isClinicAdmin: decision.roles.isClinicAdmin,
        isDoctor: decision.roles.isDoctor,
        specialty: decision.doctor?.specialty ?? null,
        licenseNumber: decision.doctor?.licenseNumber ?? null,
      },
      select: { id: true },
    });

    return { kind: "accepted", tenantId: invitation.tenantId, membershipId: created.id };
  });
}

// Toda consulta lleva `tenantId` del actor, salvo la aceptación (ver `acceptOnce`).
export const prismaInvitationRepository: InvitationRepository = {
  async createReplacingPending(input) {
    return prismaClient.$transaction(async (transaction) => {
      await transaction.staffInvitation.updateMany({
        where: { tenantId: input.tenantId, email: input.email, status: "PENDING" },
        data: { status: "REVOKED", revokedAt: input.now, revokedByUserId: input.createdByUserId },
      });

      const row = await transaction.staffInvitation.create({
        data: {
          tenantId: input.tenantId,
          email: input.email,
          isClinicAdmin: input.roles.isClinicAdmin,
          isDoctor: input.roles.isDoctor,
          specialty: input.doctor?.specialty ?? null,
          licenseNumber: input.doctor?.licenseNumber ?? null,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          createdByUserId: input.createdByUserId,
          createdAt: input.now,
        },
      });

      return toInvitation(row);
    });
  },

  async listPending(tenantId) {
    const rows = await prismaClient.staffInvitation.findMany({
      where: { tenantId, status: "PENDING" },
      orderBy: { createdAt: "desc" },
    });

    return rows.map(toInvitation);
  },

  async findById({ tenantId, invitationId }) {
    const row = await prismaClient.staffInvitation.findFirst({ where: { id: invitationId, tenantId } });

    return row ? toInvitation(row) : null;
  },

  async revoke({ tenantId, invitationId, revokedByUserId, now }) {
    const result = await prismaClient.staffInvitation.updateMany({
      where: { id: invitationId, tenantId, status: "PENDING" },
      data: { status: "REVOKED", revokedAt: now, revokedByUserId },
    });

    return result.count === 1;
  },

  async accept(input) {
    for (let attempt = 1; attempt <= MAX_ACCEPT_ATTEMPTS; attempt += 1) {
      try {
        return await acceptOnce(input);
      } catch (error) {
        if (!isUniqueViolation(error) || attempt === MAX_ACCEPT_ATTEMPTS) {
          throw error;
        }
      }
    }

    return { kind: "rejected" };
  },
};
