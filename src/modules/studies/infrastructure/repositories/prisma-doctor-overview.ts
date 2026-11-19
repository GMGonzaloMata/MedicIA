import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { DoctorOverviewReader } from "../../application/ports/out/doctor-overview";

export const prismaDoctorOverview: DoctorOverviewReader = {
  async read({ tenantId, membershipId, recentLimit }) {
    const assignedPatient = {
      tenantId,
      status: "LINKED" as const,
      assignments: { some: { tenantId, membershipId, endedAt: null } },
    };
    const assignedStudy = { tenantId, patient: assignedPatient };

    // Los totales y la lista leen la misma instantánea, incluso si termina una asignación durante la consulta.
    const [assignedPatientCount, studyCount, studies] = await prismaClient.$transaction([
      prismaClient.patient.count({ where: assignedPatient }),
      prismaClient.study.count({ where: assignedStudy }),
      prismaClient.study.findMany({
        where: assignedStudy,
        orderBy: [{ uploadedAt: "desc" }, { id: "desc" }],
        take: recentLimit,
        select: { id: true, number: true, uploadedAt: true, patient: { select: { fullName: true } } },
      }),
    ], { isolationLevel: "RepeatableRead" });

    return {
      assignedPatientCount,
      studyCount,
      recentStudies: studies.map(({ id, number, uploadedAt, patient }) => ({
        id, number, uploadedAt, patientName: patient.fullName,
      })),
    };
  },
};
