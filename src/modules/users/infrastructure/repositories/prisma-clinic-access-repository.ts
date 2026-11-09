import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { ClinicAccessRepository } from "../../application/ports/out/clinic-access-repository";
import type { AvailableClinic, RelationshipKind } from "../../domain/available-clinic";

const TENANT_NAME_SELECT = { select: { name: true } } as const;

// Solo vínculos vigentes: la membresía activa y el paciente vinculado, ambos en una clínica activa.
function activeMembershipsOf(userId: string) {
  return { userId, status: "ACTIVE", tenant: { status: "ACTIVE" } } as const;
}

function linkedPatientsOf(userId: string) {
  return { userId, status: "LINKED", tenant: { status: "ACTIVE" } } as const;
}

function listMemberships(userId: string, relationshipId?: string): Promise<AvailableClinic[]> {
  return prismaClient.staffMembership
    .findMany({
      where: { ...activeMembershipsOf(userId), ...(relationshipId ? { id: relationshipId } : {}) },
      select: { id: true, isClinicAdmin: true, isDoctor: true, tenant: TENANT_NAME_SELECT },
    })
    .then((rows) =>
      rows.map((row) => ({
        kind: "STAFF" as const,
        relationshipId: row.id,
        tenantName: row.tenant.name,
        isClinicAdmin: row.isClinicAdmin,
        isDoctor: row.isDoctor,
      })),
    );
}

function listPatients(userId: string, relationshipId?: string): Promise<AvailableClinic[]> {
  return prismaClient.patient
    .findMany({
      where: { ...linkedPatientsOf(userId), ...(relationshipId ? { id: relationshipId } : {}) },
      select: { id: true, tenant: TENANT_NAME_SELECT },
    })
    .then((rows) =>
      rows.map((row) => ({
        kind: "PATIENT" as const,
        relationshipId: row.id,
        tenantName: row.tenant.name,
      })),
    );
}

export const prismaClinicAccessRepository: ClinicAccessRepository = {
  async listAvailableClinics(userId) {
    const [memberships, patients] = await Promise.all([listMemberships(userId), listPatients(userId)]);

    return [...memberships, ...patients].sort((first, second) =>
      first.tenantName.localeCompare(second.tenantName),
    );
  },

  async findAvailableClinic({ userId, kind, relationshipId }: {
    userId: string;
    kind: RelationshipKind;
    relationshipId: string;
  }) {
    const matches =
      kind === "STAFF"
        ? await listMemberships(userId, relationshipId)
        : await listPatients(userId, relationshipId);

    return matches[0] ?? null;
  },
};
