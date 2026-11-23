import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { PatientRegistryRepository } from "../../application/ports/out/patient-registry-repository";

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
