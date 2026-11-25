import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { StaffMember, StaffRepository } from "../../application/ports/out/staff-repository";
import { decideDeactivation } from "../../domain/member-lifecycle";

const MEMBER_SELECT = {
  id: true,
  isClinicAdmin: true,
  isDoctor: true,
  specialty: true,
  licenseNumber: true,
  status: true,
  user: { select: { id: true, fullName: true, email: true } },
} as const;

interface MemberRow {
  id: string;
  isClinicAdmin: boolean;
  isDoctor: boolean;
  specialty: string | null;
  licenseNumber: string | null;
  status: "ACTIVE" | "DEACTIVATED";
  user: { id: string; fullName: string; email: string };
}

function toStaffMember(row: MemberRow): StaffMember {
  return {
    membershipId: row.id,
    userId: row.user.id,
    fullName: row.user.fullName,
    email: row.user.email,
    roles: { isClinicAdmin: row.isClinicAdmin, isDoctor: row.isDoctor },
    // La base garantiza que un médico tiene las dos y quien no lo es, ninguna.
    doctor: row.specialty !== null && row.licenseNumber !== null ? { specialty: row.specialty, licenseNumber: row.licenseNumber } : null,
    status: row.status,
  };
}

// Toda consulta de membresías lleva `tenantId`: nunca devuelve personal de otra clínica.
export const prismaStaffRepository: StaffRepository = {
  async findTenant(tenantId) {
    return prismaClient.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, status: true },
    });
  },

  async findMemberByEmail({ tenantId, email }) {
    const row = await prismaClient.staffMembership.findFirst({
      where: { tenantId, user: { email } },
      select: MEMBER_SELECT,
    });

    return row ? toStaffMember(row) : null;
  },

  async listMembers(tenantId) {
    const rows = await prismaClient.staffMembership.findMany({
      where: { tenantId },
      select: MEMBER_SELECT,
      orderBy: { createdAt: "asc" },
    });

    return rows.map(toStaffMember);
  },

  async isLicenseTaken({ tenantId, licenseNumber, exceptEmail }) {
    const [membership, invitation] = await Promise.all([
      // Con `exceptEmail` (reenviar o sumar un rol), la matrícula de ese mismo miembro no cuenta como ocupada.
      prismaClient.staffMembership.findFirst({
        where: { tenantId, licenseNumber, ...(exceptEmail ? { user: { email: { not: exceptEmail } } } : {}) },
        select: { id: true },
      }),
      prismaClient.staffInvitation.findFirst({
        where: {
          tenantId,
          licenseNumber,
          status: "PENDING",
          ...(exceptEmail ? { email: { not: exceptEmail } } : {}),
        },
        select: { id: true },
      }),
    ]);

    return membership !== null || invitation !== null;
  },

  async deactivate({ tenantId, membershipId, deactivatedByUserId, now }) {
    return prismaClient.$transaction(async (transaction) => {
      // Se bloquea la fila de la clínica antes de contar administradores: dos desactivaciones simultáneas se
      // serializan y la segunda ya ve que queda uno solo.
      await transaction.$queryRaw`SELECT id FROM tenants WHERE id = ${tenantId}::uuid FOR UPDATE`;

      const member = await transaction.staffMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { isClinicAdmin: true, isDoctor: true, status: true },
      });

      if (member === null) {
        return { kind: "not-found" as const };
      }

      const activeAdminCount = await transaction.staffMembership.count({
        where: { tenantId, isClinicAdmin: true, status: "ACTIVE" },
      });
      const decision = decideDeactivation({
        member: { roles: { isClinicAdmin: member.isClinicAdmin, isDoctor: member.isDoctor }, status: member.status },
        activeAdminCount,
      });

      if (decision !== "ok") {
        return { kind: decision } as const;
      }

      await transaction.staffMembership.update({
        where: { id: membershipId },
        data: { status: "DEACTIVATED", deactivatedAt: now, deactivatedByUserId },
      });

      return { kind: "deactivated" as const };
    });
  },

  async reactivate({ tenantId, membershipId }) {
    const member = await prismaClient.staffMembership.findFirst({
      where: { id: membershipId, tenantId },
      select: { status: true },
    });

    if (member === null) {
      return { kind: "not-found" };
    }

    if (member.status === "ACTIVE") {
      return { kind: "already-active" };
    }

    // La condición del estado evita pisar una reactivación simultánea.
    await prismaClient.staffMembership.updateMany({
      where: { id: membershipId, tenantId, status: "DEACTIVATED" },
      data: { status: "ACTIVE", deactivatedAt: null, deactivatedByUserId: null },
    });

    return { kind: "reactivated" };
  },
};
