import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { SessionRepository } from "../../application/ports/out/session-repository";
import type { ResolvedSession, StoredRelationship } from "../../domain/active-relationship";

const TENANT_SELECT = { select: { id: true, name: true, status: true } } as const;

const RESOLVED_SESSION_SELECT = {
  id: true,
  createdAt: true,
  lastActivityAt: true,
  expiresAt: true,
  revokedAt: true,
  user: {
    select: { id: true, email: true, fullName: true, isPlatformAdmin: true, sessionsValidFrom: true },
  },
  activeStaffMembership: {
    select: { id: true, isClinicAdmin: true, isDoctor: true, status: true, tenant: TENANT_SELECT },
  },
  activePatient: {
    select: { id: true, status: true, tenant: TENANT_SELECT },
  },
} as const;

export const prismaSessionRepository: SessionRepository = {
  async create({ userId, tokenHash, now, expiresAt }) {
    return prismaClient.session.create({
      data: { userId, tokenHash, createdAt: now, lastActivityAt: now, expiresAt },
      select: { id: true },
    });
  },

  // Una sola consulta con la cuenta, el vínculo activo y el estado de su clínica.
  async findByTokenHash(tokenHash) {
    const row = await prismaClient.session.findUnique({
      where: { tokenHash },
      select: RESOLVED_SESSION_SELECT,
    });

    if (!row) {
      return null;
    }

    let activeRelationship: StoredRelationship | null = null;

    if (row.activeStaffMembership) {
      const membership = row.activeStaffMembership;

      activeRelationship = {
        kind: "STAFF",
        membershipId: membership.id,
        isClinicAdmin: membership.isClinicAdmin,
        isDoctor: membership.isDoctor,
        membershipStatus: membership.status,
        tenantId: membership.tenant.id,
        tenantName: membership.tenant.name,
        tenantStatus: membership.tenant.status,
      };
    } else if (row.activePatient) {
      const patient = row.activePatient;

      activeRelationship = {
        kind: "PATIENT",
        patientId: patient.id,
        patientStatus: patient.status,
        tenantId: patient.tenant.id,
        tenantName: patient.tenant.name,
        tenantStatus: patient.tenant.status,
      };
    }

    const resolved: ResolvedSession = {
      session: {
        id: row.id,
        createdAt: row.createdAt,
        lastActivityAt: row.lastActivityAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      },
      user: {
        id: row.user.id,
        email: row.user.email,
        fullName: row.user.fullName,
        isPlatformAdmin: row.user.isPlatformAdmin,
      },
      sessionsValidFrom: row.user.sessionsValidFrom,
      activeRelationship,
    };

    return resolved;
  },

  async recordActivity({ sessionId, now }) {
    // Nunca se retrocede la última actividad si otra solicitud ya registró una más reciente.
    await prismaClient.session.updateMany({
      where: { id: sessionId, lastActivityAt: { lt: now } },
      data: { lastActivityAt: now },
    });
  },

  async setActiveRelationship({ sessionId, userId, kind, relationshipId }) {
    // Se completa un vínculo y se limpia el otro. La clave foránea compuesta de la base rechaza
    // un vínculo que no sea de la misma cuenta.
    const data =
      kind === "STAFF"
        ? { activeStaffMembershipId: relationshipId, activePatientId: null }
        : { activePatientId: relationshipId, activeStaffMembershipId: null };

    await prismaClient.session.update({ where: { id: sessionId, userId }, data });
  },

  async revokeByTokenHash({ tokenHash, now }) {
    await prismaClient.session.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: now },
    });
  },
};
