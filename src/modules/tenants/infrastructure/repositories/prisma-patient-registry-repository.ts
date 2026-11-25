import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { PatientRegistryRepository } from "../../application/ports/out/patient-registry-repository";

// Aborta la transacción de vinculación cuando el paciente ya no está pendiente.
class RejectedLinkError extends Error {}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

// Toda consulta lleva `tenantId` del actor: un paciente de otra clínica no aparece ni se puede tocar.
export const prismaPatientRegistryRepository: PatientRegistryRepository = {
  async register(input) {
    try {
      return await prismaClient.$transaction(async (transaction) => {
        const patient = await transaction.patient.create({
          data: {
            tenantId: input.tenantId,
            documentType: input.documentType,
            documentNumber: input.documentNumber,
          },
          select: { id: true },
        });

        await transaction.patientLinkCode.create({
          data: {
            tenantId: input.tenantId,
            patientId: patient.id,
            codeHash: input.codeHash,
            expiresAt: input.expiresAt,
            createdByUserId: input.createdByUserId,
            createdAt: input.now,
          },
        });

        return { kind: "created" as const, patientId: patient.id };
      });
    } catch (error) {
      // Otro paciente de la clínica ya tiene ese documento: la transacción se deshizo entera.
      if (isUniqueViolation(error)) {
        return { kind: "duplicate" as const };
      }

      throw error;
    }
  },

  async list(tenantId) {
    const rows = await prismaClient.patient.findMany({
      where: { tenantId },
      orderBy: [{ fullName: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        fullName: true,
        documentType: true,
        documentNumber: true,
        status: true,
        linkCodes: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { status: true, expiresAt: true },
        },
        assignments: {
          where: { endedAt: null },
          select: {
            id: true,
            membershipId: true,
            membership: { select: { status: true, user: { select: { fullName: true } } } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      documentType: row.documentType,
      documentNumber: row.documentNumber,
      status: row.status,
      latestCode: row.linkCodes[0] ?? null,
      assignments: row.assignments.map((assignment) => ({
        assignmentId: assignment.id,
        membershipId: assignment.membershipId,
        doctorName: assignment.membership.user.fullName,
        doctorStatus: assignment.membership.status,
      })),
    }));
  },

  async reserveCodeAttempts({ documentType, documentNumber, now, maxAttempts }) {
    // Única lectura sin `tenantId` del padrón (ver el puerto): busca por documento en todas las clínicas. Una sola
    // sentencia suma el intento y devuelve los códigos evaluables: la fila se bloquea al actualizarla, así que dos
    // pedidos simultáneos no pueden reservar el mismo cupo. Una clínica suspendida no incorpora personas.
    const rows = await prismaClient.$queryRaw<{ id: string; tenantId: string; patientId: string; codeHash: string }[]>`
      UPDATE patient_link_codes AS c
      SET failed_attempts = c.failed_attempts + 1
      FROM patients AS p, tenants AS t
      WHERE p.id = c.patient_id
        AND p.tenant_id = c.tenant_id
        AND t.id = p.tenant_id
        AND c.status = 'ACTIVE'
        AND c.expires_at > ${now}::timestamptz
        AND c.failed_attempts < ${maxAttempts}::int
        AND p.document_type = ${documentType}::document_type
        AND p.document_number = ${documentNumber}
        AND p.status = 'PENDING'
        AND p.user_id IS NULL
        AND t.status = 'ACTIVE'
      RETURNING c.id, c.tenant_id AS "tenantId", c.patient_id AS "patientId", c.code_hash AS "codeHash"
    `;

    return rows.map((row) => ({
      patientId: row.patientId,
      tenantId: row.tenantId,
      codeId: row.id,
      codeHash: row.codeHash,
    }));
  },

  async linkAccount({ candidate, user, now }) {
    try {
      return await prismaClient.$transaction(async (transaction) => {
        // Se reclaman primero el código y el paciente: si otra vinculación ganó o el código ya no sirve, no se
        // escribe nada más.
        const code = await transaction.patientLinkCode.updateMany({
          where: { id: candidate.codeId, status: "ACTIVE", expiresAt: { gt: now } },
          data: { status: "USED", closedAt: now },
        });

        if (code.count !== 1) {
          return { kind: "rejected" as const };
        }

        const patient = await transaction.patient.updateMany({
          where: {
            id: candidate.patientId,
            tenantId: candidate.tenantId,
            status: "PENDING",
            userId: null,
            tenant: { status: "ACTIVE" },
          },
          data: { status: "LINKED", userId: user.id, fullName: user.fullName, linkedAt: now },
        });

        if (patient.count !== 1) {
          // Deshace también el código: la transacción entera falla.
          throw new RejectedLinkError();
        }

        await transaction.patientLinkAttempt.deleteMany({ where: { userId: user.id } });

        return { kind: "linked" as const };
      });
    } catch (error) {
      // La cuenta ya es paciente de esa clínica (clave única por clínica y cuenta) o la vinculación se perdió.
      if (error instanceof RejectedLinkError || isUniqueViolation(error)) {
        return { kind: "rejected" as const };
      }

      throw error;
    }
  },

  async lockExhaustedCodes({ codeIds, maxAttempts, now }) {
    await prismaClient.patientLinkCode.updateMany({
      where: { id: { in: codeIds }, status: "ACTIVE", failedAttempts: { gte: maxAttempts } },
      data: { status: "LOCKED", closedAt: now },
    });
  },

  async releaseCodeAttempts({ codeIds }) {
    await prismaClient.patientLinkCode.updateMany({
      where: { id: { in: codeIds }, status: "ACTIVE", failedAttempts: { gt: 0 } },
      data: { failedAttempts: { decrement: 1 } },
    });
  },

  async replaceLinkCode(input) {
    return prismaClient.$transaction(async (transaction) => {
      const patient = await transaction.patient.findFirst({
        where: { id: input.patientId, tenantId: input.tenantId },
        select: { status: true },
      });

      if (patient === null || patient.status === "REVOKED") {
        return { kind: "not-found" as const };
      }

      if (patient.status === "LINKED") {
        return { kind: "already-linked" as const };
      }

      await transaction.patientLinkCode.updateMany({
        where: { patientId: input.patientId, tenantId: input.tenantId, status: "ACTIVE" },
        data: { status: "REPLACED", closedAt: input.now },
      });

      await transaction.patientLinkCode.create({
        data: {
          tenantId: input.tenantId,
          patientId: input.patientId,
          codeHash: input.codeHash,
          expiresAt: input.expiresAt,
          createdByUserId: input.createdByUserId,
          createdAt: input.now,
        },
      });

      return { kind: "replaced" as const };
    });
  },
};
