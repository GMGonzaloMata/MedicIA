import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { Prisma } from "../../../../../generated/prisma/client";
import type {
  AssignDoctorResult,
  ClinicMemberRepository,
  DeactivateStaffResult,
  EndAssignmentResult,
  PatientListItem,
  StaffListItem,
  StatusChangeResult,
} from "../../application/ports/out/clinic-member-repository";
import type { NewClinicUserEvent } from "../../domain/clinic-user-events";
import { canAssignTo } from "../../domain/clinic-user-rules";
import { EnrollmentTenantInactiveError } from "../../domain/enrollment-errors";
import { createRelationshipTransaction } from "./relationship-transaction";

// Toda consulta y toda escritura lleva el `tenantId` del actor. Los identificadores que llegan del cliente se buscan
// siempre junto con él: uno de otra clínica no se distingue de uno inexistente.

function insertEvent(tx: Prisma.TransactionClient, event: NewClinicUserEvent) {
  return tx.clinicUserEvent.create({
    data: {
      tenantId: event.tenantId,
      action: event.action,
      actorUserId: event.actorUserId,
      actorMembershipId: event.actorMembershipId,
      targetMembershipId: event.targetMembershipId ?? null,
      targetPatientId: event.targetPatientId ?? null,
      createdAt: event.now,
    },
  });
}

// Cuáles de estas cuentas ya iniciaron sesión alguna vez.
async function accountsThatSignedIn(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) {
    return new Set();
  }

  const sessions = await prismaClient.session.findMany({
    where: { userId: { in: userIds } },
    distinct: ["userId"],
    select: { userId: true },
  });

  return new Set(sessions.map((session) => session.userId));
}

async function hasSignedIn(userId: string): Promise<boolean> {
  return (await prismaClient.session.count({ where: { userId } })) > 0;
}

function lockTenant(tx: Prisma.TransactionClient, tenantId: string) {
  return tx.$queryRaw`SELECT "id" FROM "tenants" WHERE "id" = ${tenantId}::uuid FOR UPDATE`;
}

export const prismaClinicMemberRepository: ClinicMemberRepository = {
  async listStaff({ tenantId, page, pageSize }) {
    const [rows, total] = await Promise.all([
      prismaClient.staffMembership.findMany({
        where: { tenantId },
        orderBy: [{ user: { fullName: "asc" } }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          isClinicAdmin: true,
          isDoctor: true,
          specialty: true,
          licenseNumber: true,
          status: true,
          user: { select: { id: true, email: true, fullName: true } },
        },
      }),
      prismaClient.staffMembership.count({ where: { tenantId } }),
    ]);
    const signedIn = await accountsThatSignedIn(rows.map((row) => row.user.id));
    const items: StaffListItem[] = rows.map((row) => ({
      membershipId: row.id,
      fullName: row.user.fullName,
      email: row.user.email,
      isClinicAdmin: row.isClinicAdmin,
      isDoctor: row.isDoctor,
      specialty: row.specialty,
      licenseNumber: row.licenseNumber,
      status: row.status,
      hasSignedIn: signedIn.has(row.user.id),
    }));

    return { items, total };
  },

  async listPatients({ tenantId, page, pageSize }) {
    const [rows, total] = await Promise.all([
      prismaClient.patient.findMany({
        where: { tenantId },
        orderBy: [{ fullName: { sort: "asc", nulls: "last" } }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: { id: true, userId: true, fullName: true, documentType: true, documentNumber: true, status: true },
      }),
      prismaClient.patient.count({ where: { tenantId } }),
    ]);
    // Las asignaciones vigentes de toda la página, en una sola consulta.
    const assignments = await prismaClient.doctorPatientAssignment.findMany({
      where: { tenantId, patientId: { in: rows.map((row) => row.id) }, endedAt: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        patientId: true,
        membershipId: true,
        membership: { select: { status: true, user: { select: { fullName: true } } } },
      },
    });
    const signedIn = await accountsThatSignedIn(rows.flatMap((row) => (row.userId ? [row.userId] : [])));
    const items: PatientListItem[] = rows.map((row) => ({
      patientId: row.id,
      fullName: row.fullName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      status: row.status,
      doctors: assignments
        .filter((assignment) => assignment.patientId === row.id)
        .map((assignment) => ({
          assignmentId: assignment.id,
          membershipId: assignment.membershipId,
          fullName: assignment.membership.user.fullName,
          isActive: assignment.membership.status === "ACTIVE",
        })),
      hasAccount: row.userId !== null,
      hasSignedIn: row.userId !== null && signedIn.has(row.userId),
    }));

    return { items, total };
  },

  async listActiveDoctors({ tenantId }) {
    const rows = await prismaClient.staffMembership.findMany({
      where: { tenantId, status: "ACTIVE", isDoctor: true },
      orderBy: [{ user: { fullName: "asc" } }, { id: "asc" }],
      select: { id: true, specialty: true, user: { select: { fullName: true } } },
    });

    return rows.map((row) => ({ membershipId: row.id, fullName: row.user.fullName, specialty: row.specialty }));
  },

  async findTenantName({ tenantId }) {
    const tenant = await prismaClient.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });

    return tenant?.name ?? null;
  },

  async findResendTarget({ tenantId, target }) {
    if (target.kind === "STAFF") {
      const membership = await prismaClient.staffMembership.findFirst({
        where: { id: target.membershipId, tenantId },
        select: { id: true, isDoctor: true, tenant: { select: { name: true } }, user: { select: { id: true, email: true } } },
      });

      // El aviso es el de un médico: personal que no lo es (un administrador) no tiene reenvío.
      if (!membership || !membership.isDoctor) {
        return null;
      }

      return {
        tenantName: membership.tenant.name,
        userId: membership.user.id,
        email: membership.user.email,
        kind: "DOCTOR",
        hasSignedIn: await hasSignedIn(membership.user.id),
        assignedMembershipIds: [],
        membershipId: membership.id,
        patientId: null,
      };
    }

    const patient = await prismaClient.patient.findFirst({
      where: { id: target.patientId, tenantId, userId: { not: null } },
      select: {
        id: true,
        tenant: { select: { name: true } },
        user: { select: { id: true, email: true } },
        assignments: { where: { endedAt: null }, select: { membershipId: true } },
      },
    });

    if (!patient || !patient.user) {
      return null;
    }

    return {
      tenantName: patient.tenant.name,
      userId: patient.user.id,
      email: patient.user.email,
      kind: "PATIENT",
      hasSignedIn: await hasSignedIn(patient.user.id),
      assignedMembershipIds: patient.assignments.map((assignment) => assignment.membershipId),
      membershipId: null,
      patientId: patient.id,
    };
  },

  runEnrollment({ tenantId, account: candidate, now }, work) {
    return prismaClient.$transaction(async (tx) => {
      // El bloqueo de la clínica ordena también dos altas con correos diferentes y el mismo documento.
      await lockTenant(tx, tenantId);
      const tenant = await tx.tenant.findUnique({ where: { id: tenantId }, select: { status: true } });
      if (tenant?.status !== "ACTIVE") {
        throw new EnrollmentTenantInactiveError();
      }

      // La cuenta y el vínculo se crean juntos. El upsert preserva el nombre y demás datos de una cuenta existente.
      const account = "userId" in candidate
        ? await tx.user.findUniqueOrThrow({
            where: { id: candidate.userId },
            select: { id: true, email: true, fullName: true, isPlatformAdmin: true },
          })
        : await tx.user.upsert({
            where: { cognitoSub: candidate.subject },
            create: {
              cognitoSub: candidate.subject,
              email: candidate.email,
              fullName: candidate.fullName,
              sessionsValidFrom: now,
              createdAt: now,
            },
            update: {},
            select: { id: true, email: true, fullName: true, isPlatformAdmin: true },
          });
      await tx.$queryRaw`SELECT "id" FROM "users" WHERE "id" = ${account.id}::uuid FOR UPDATE`;

      return work({
        ...createRelationshipTransaction(tx),
        async recordEvent(event) {
          await insertEvent(tx, event);
        },
      }, account);
    });
  },

  async recordEvent(event) {
    await prismaClient.$transaction((tx) => insertEvent(tx, event));
  },

  deactivateStaff({ tenantId, membershipId, actor, now, check }): Promise<DeactivateStaffResult> {
    return prismaClient.$transaction(async (tx): Promise<DeactivateStaffResult> => {
      // Bloquea la clínica: cualquier cambio de administradores de esta clínica se ordena con este.
      await lockTenant(tx, tenantId);

      const target = await tx.staffMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { status: true, isClinicAdmin: true },
      });

      if (!target) {
        return { status: "NOT_FOUND" };
      }

      if (target.status === "DEACTIVATED") {
        return { status: "ALREADY_IN_STATE" };
      }

      const otherActiveAdmins = await tx.staffMembership.count({
        where: { tenantId, status: "ACTIVE", isClinicAdmin: true, id: { not: membershipId } },
      });
      const verdict = check({ targetIsClinicAdmin: target.isClinicAdmin, otherActiveAdmins });

      if (verdict !== "OK") {
        return { status: "REJECTED", reason: verdict };
      }

      const result = await tx.staffMembership.updateMany({
        where: { id: membershipId, tenantId, status: "ACTIVE" },
        data: { status: "DEACTIVATED" },
      });

      if (result.count === 0) {
        return { status: "ALREADY_IN_STATE" };
      }

      await insertEvent(tx, {
        tenantId,
        action: "STAFF_DEACTIVATED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: membershipId,
        now,
      });

      return { status: "CHANGED" };
    });
  },

  reactivateStaff({ tenantId, membershipId, actor, now }): Promise<StatusChangeResult> {
    return prismaClient.$transaction(async (tx): Promise<StatusChangeResult> => {
      const result = await tx.staffMembership.updateMany({
        where: { id: membershipId, tenantId, status: "DEACTIVATED" },
        data: { status: "ACTIVE" },
      });

      if (result.count === 0) {
        const exists = await tx.staffMembership.count({ where: { id: membershipId, tenantId } });

        return { status: exists > 0 ? "ALREADY_IN_STATE" : "NOT_FOUND" };
      }

      await insertEvent(tx, {
        tenantId,
        action: "STAFF_REACTIVATED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: membershipId,
        now,
      });

      return { status: "CHANGED" };
    });
  },

  revokePatient({ tenantId, patientId, actor, now }): Promise<StatusChangeResult> {
    return prismaClient.$transaction(async (tx): Promise<StatusChangeResult> => {
      const result = await tx.patient.updateMany({
        where: { id: patientId, tenantId, status: "LINKED" },
        data: { status: "REVOKED", revokedAt: now },
      });

      if (result.count === 0) {
        // Un paciente pendiente o ya revocado no tiene un vínculo que revocar.
        const exists = await tx.patient.count({ where: { id: patientId, tenantId } });

        return { status: exists > 0 ? "ALREADY_IN_STATE" : "NOT_FOUND" };
      }

      await insertEvent(tx, {
        tenantId,
        action: "PATIENT_REVOKED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetPatientId: patientId,
        now,
      });

      return { status: "CHANGED" };
    });
  },

  reactivatePatient({ tenantId, patientId, actor, now }): Promise<StatusChangeResult> {
    return prismaClient.$transaction(async (tx): Promise<StatusChangeResult> => {
      // Reutiliza el mismo registro: `linked_at` se conserva y `revoked_at` vuelve a estar vacío.
      const result = await tx.patient.updateMany({
        where: { id: patientId, tenantId, status: "REVOKED" },
        data: { status: "LINKED", revokedAt: null },
      });

      if (result.count === 0) {
        const patient = await tx.patient.findFirst({ where: { id: patientId, tenantId }, select: { status: true } });

        // Un paciente pendiente no se reactiva por esta vía.
        return { status: patient?.status === "LINKED" ? "ALREADY_IN_STATE" : "NOT_FOUND" };
      }

      await insertEvent(tx, {
        tenantId,
        action: "PATIENT_REACTIVATED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetPatientId: patientId,
        now,
      });

      return { status: "CHANGED" };
    });
  },

  assignDoctor({ tenantId, patientId, membershipId, actor, now }): Promise<AssignDoctorResult> {
    return prismaClient.$transaction(async (tx): Promise<AssignDoctorResult> => {
      // Bloquea al paciente: dos asignaciones simultáneas de la misma pareja se ordenan, y una violación del índice
      // único dentro de la transacción no la deja inutilizable. El índice parcial de la 001 es la defensa final.
      await tx.$queryRaw`SELECT "id" FROM "patients" WHERE "id" = ${patientId}::uuid AND "tenant_id" = ${tenantId}::uuid FOR UPDATE`;

      // En secuencia: dentro de una transacción todas las consultas comparten una sola conexión.
      const patient = await tx.patient.findFirst({ where: { id: patientId, tenantId }, select: { status: true } });
      const membership = await tx.staffMembership.findFirst({
        where: { id: membershipId, tenantId },
        select: { status: true, isDoctor: true },
      });

      if (!patient || !membership) {
        return { status: "NOT_FOUND" };
      }

      if (patient.status !== "LINKED") {
        return { status: "PATIENT_NOT_LINKED" };
      }

      if (!canAssignTo({ patientStatus: patient.status, membershipStatus: membership.status, isDoctor: membership.isDoctor })) {
        return { status: "NOT_AN_ACTIVE_DOCTOR" };
      }

      const active = await tx.doctorPatientAssignment.findFirst({
        where: { tenantId, membershipId, patientId, endedAt: null },
        select: { id: true },
      });

      if (active) {
        return { status: "ALREADY_ASSIGNED" };
      }

      await tx.doctorPatientAssignment.create({
        data: { tenantId, membershipId, patientId, createdByUserId: actor.userId, createdAt: now },
      });
      await insertEvent(tx, {
        tenantId,
        action: "ASSIGNMENT_CREATED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: membershipId,
        targetPatientId: patientId,
        now,
      });

      return { status: "ASSIGNED" };
    });
  },

  endAssignment({ tenantId, assignmentId, actor, now }): Promise<EndAssignmentResult> {
    return prismaClient.$transaction(async (tx): Promise<EndAssignmentResult> => {
      const assignment = await tx.doctorPatientAssignment.findFirst({
        where: { id: assignmentId, tenantId, endedAt: null },
        select: { membershipId: true, patientId: true },
      });

      if (!assignment) {
        return { status: "NOT_FOUND" };
      }

      const result = await tx.doctorPatientAssignment.updateMany({
        where: { id: assignmentId, tenantId, endedAt: null },
        data: { endedAt: now, endedByUserId: actor.userId },
      });

      if (result.count === 0) {
        return { status: "NOT_FOUND" };
      }

      await insertEvent(tx, {
        tenantId,
        action: "ASSIGNMENT_ENDED",
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: assignment.membershipId,
        targetPatientId: assignment.patientId,
        now,
      });

      return { status: "UNASSIGNED" };
    });
  },
};
