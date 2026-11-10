import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { PatientDirectory } from "../../application/ports/out/patient-directory";

// Un médico accede a un paciente solo con una asignación vigente (`endedAt` nulo) de su membresía y mientras
// el paciente esté vinculado. Toda consulta incluye la clínica.
export const prismaPatientDirectory: PatientDirectory = {
  async listAssignedPatients({ tenantId, membershipId, page, pageSize }) {
    const where = {
      tenantId,
      status: "LINKED" as const,
      assignments: { some: { tenantId, membershipId, endedAt: null } },
    };
    const [totalItems, rows] = await Promise.all([
      prismaClient.patient.count({ where }),
      prismaClient.patient.findMany({
        where,
        orderBy: [{ fullName: "asc" }, { id: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          fullName: true,
          documentType: true,
          documentNumber: true,
          _count: { select: { studies: true } },
        },
      }),
    ]);

    return {
      totalItems,
      items: rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        studyCount: row._count.studies,
      })),
    };
  },

  async hasActiveAssignment({ tenantId, membershipId, patientId }) {
    const count = await prismaClient.patient.count({
      where: {
        id: patientId,
        tenantId,
        status: "LINKED",
        assignments: { some: { tenantId, membershipId, endedAt: null } },
      },
    });

    return count > 0;
  },
};
