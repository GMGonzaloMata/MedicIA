import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { StaffMember, StaffRepository } from "../../application/ports/out/staff-repository";

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
      prismaClient.staffMembership.findFirst({ where: { tenantId, licenseNumber }, select: { id: true } }),
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
};
