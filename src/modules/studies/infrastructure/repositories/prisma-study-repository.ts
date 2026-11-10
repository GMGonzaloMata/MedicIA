import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { StudyRepository } from "../../application/ports/out/study-repository";

// Toda consulta incluye `tenantId`. No hay ninguna que busque un estudio por `id` solo.
export const prismaStudyRepository: StudyRepository = {
  // El número se asigna con un solo SQL atómico (`INSERT … ON CONFLICT … RETURNING`): dos cargas simultáneas
  // al mismo paciente reciben números distintos y consecutivos. Va en la misma transacción que el estudio,
  // así que si la inserción falla el contador vuelve atrás y el número no se consume.
  async insertWithNextNumber(study) {
    return prismaClient.$transaction(async (transaction) => {
      const rows = await transaction.$queryRaw<{ lastNumber: number }[]>`
        INSERT INTO study_counters (patient_id, tenant_id, last_number)
        VALUES (${study.patientId}::uuid, ${study.tenantId}::uuid, 1)
        ON CONFLICT (patient_id) DO UPDATE SET last_number = study_counters.last_number + 1
        RETURNING last_number AS "lastNumber"
      `;
      const number = rows[0]?.lastNumber;

      if (number === undefined) {
        throw new Error("No se pudo asignar el número del estudio.");
      }

      return transaction.study.create({
        data: {
          id: study.id,
          tenantId: study.tenantId,
          patientId: study.patientId,
          uploadedByUserId: study.uploadedByUserId,
          type: study.type,
          storageKey: study.storageKey,
          number,
        },
      });
    });
  },

  async findById({ tenantId, studyId }) {
    return prismaClient.study.findUnique({ where: { tenantId_id: { tenantId, id: studyId } } });
  },

  async listByPatient({ tenantId, patientId, page, pageSize }) {
    const where = { tenantId, patientId };
    const [totalItems, rows] = await Promise.all([
      prismaClient.study.count({ where }),
      prismaClient.study.findMany({
        where,
        orderBy: { number: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          number: true,
          type: true,
          status: true,
          uploadedAt: true,
          uploadedByUserId: true,
          uploadedBy: { select: { fullName: true } },
          patient: { select: { userId: true } },
        },
      }),
    ]);

    return {
      totalItems,
      items: rows.map((row) => ({
        id: row.id,
        number: row.number,
        type: row.type,
        status: row.status,
        uploadedAt: row.uploadedAt,
        uploadedByUserId: row.uploadedByUserId,
        uploaderName: row.uploadedBy.fullName,
        uploadedByPatient: row.patient.userId === row.uploadedByUserId,
      })),
    };
  },

  async deleteById({ tenantId, studyId }) {
    const result = await prismaClient.study.deleteMany({ where: { tenantId, id: studyId } });

    return result.count > 0;
  },

  async findExistingStorageKeys(storageKeys) {
    if (storageKeys.length === 0) {
      return new Set();
    }

    const rows = await prismaClient.study.findMany({
      where: { storageKey: { in: storageKeys } },
      select: { storageKey: true },
    });

    return new Set(rows.map((row) => row.storageKey));
  },
};
