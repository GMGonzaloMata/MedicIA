import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import type { Prisma } from "../../../../../generated/prisma/client";

import type { PatientDirectory } from "../../application/ports/out/patient-directory";
import type { AssignedPatientSummary, PatientListFilter, PatientSearch } from "../../domain/patient-list";

// Pacientes vinculados con una asignación vigente (`endedAt` nulo) del médico. Toda consulta incluye la clínica.
function assignedTo(tenantId: string, membershipId: string): Prisma.PatientWhereInput {
  return {
    tenantId,
    status: "LINKED",
    assignments: { some: { tenantId, membershipId, endedAt: null } },
  };
}

function matching(search: PatientSearch | null | undefined): Prisma.PatientWhereInput[] {
  if (!search) {
    return [];
  }

  const options: Prisma.PatientWhereInput[] = [{ fullName: { contains: search.name, mode: "insensitive" } }];
  if (search.document.length > 0) {
    options.push({ documentNumber: { contains: search.document, mode: "insensitive" } });
  }

  return [{ OR: options }];
}

function filtered(filter: PatientListFilter | undefined, recentSince: Date): Prisma.PatientWhereInput[] {
  if (filter === "recent") {
    return [{ studies: { some: { uploadedAt: { gte: recentSince } } } }];
  }

  return filter === "without-studies" ? [{ studies: { none: {} } }] : [];
}

const LIST_SELECT = {
  id: true,
  fullName: true,
  documentType: true,
  documentNumber: true,
  _count: { select: { studies: true } },
  // El último estudio cargado; el número desempata dos cargas en el mismo instante.
  studies: {
    orderBy: [{ uploadedAt: "desc" }, { number: "desc" }],
    take: 1,
    select: { number: true, uploadedAt: true },
  },
} satisfies Prisma.PatientSelect;

type ListRow = Prisma.PatientGetPayload<{ select: typeof LIST_SELECT }>;

function toSummary(row: ListRow): AssignedPatientSummary {
  const last = row.studies[0];

  return {
    id: row.id,
    fullName: row.fullName,
    documentType: row.documentType,
    documentNumber: row.documentNumber,
    studyCount: row._count.studies,
    lastStudy: last ? { number: last.number, uploadedAt: last.uploadedAt } : null,
  };
}

const BY_NAME = [{ fullName: "asc" }, { id: "asc" }] satisfies Prisma.PatientOrderByWithRelationInput[];

export const prismaPatientDirectory: PatientDirectory = {
  async listAssignedPatients({ tenantId, membershipId, page, pageSize, search, filter, sort, recentSince }) {
    // Cada consulta repite la clínica a la vista, además de la que ya trae `assignedTo`.
    const conditions = [assignedTo(tenantId, membershipId), ...matching(search), ...filtered(filter, recentSince)];

    if (sort === "name") {
      const [totalItems, rows] = await Promise.all([
        prismaClient.patient.count({ where: { tenantId, AND: conditions } }),
        prismaClient.patient.findMany({
          where: { tenantId, AND: conditions },
          orderBy: BY_NAME,
          skip: (page - 1) * pageSize,
          take: pageSize,
          select: LIST_SELECT,
        }),
      ]);

      return { totalItems, items: rows.map(toSummary) };
    }

    // El orden por último estudio no se expresa en una sola consulta: se ordenan los identificadores con la fecha
    // más reciente de cada paciente y se lee solo la página pedida.
    const [candidates, latest] = await Promise.all([
      prismaClient.patient.findMany({ where: { tenantId, AND: conditions }, orderBy: BY_NAME, select: { id: true } }),
      prismaClient.study.groupBy({
        by: ["patientId"],
        where: { tenantId, patient: { is: { tenantId, AND: conditions } } },
        _max: { uploadedAt: true },
      }),
    ]);
    const lastUploadedAt = new Map(latest.map((group) => [group.patientId, group._max.uploadedAt?.getTime() ?? null]));
    // `sort` es estable: los empates y los pacientes sin estudios conservan el orden por nombre.
    const ordered = candidates
      .map((candidate) => candidate.id)
      .sort((first, second) => (lastUploadedAt.get(second) ?? -Infinity) - (lastUploadedAt.get(first) ?? -Infinity));
    const pageIds = ordered.slice((page - 1) * pageSize, page * pageSize);
    const rows = pageIds.length
      ? await prismaClient.patient.findMany({
          where: { tenantId, AND: [...conditions, { id: { in: pageIds } }] },
          select: LIST_SELECT,
        })
      : [];
    const byId = new Map(rows.map((row) => [row.id, row]));

    return {
      totalItems: ordered.length,
      items: pageIds.flatMap((id) => {
        const row = byId.get(id);
        return row ? [toSummary(row)] : [];
      }),
    };
  },

  async countAssignedPatients({ tenantId, membershipId, recentSince }) {
    const base = assignedTo(tenantId, membershipId);
    const [total, recent, withoutStudies] = await Promise.all([
      prismaClient.patient.count({ where: { tenantId, AND: [base] } }),
      prismaClient.patient.count({ where: { tenantId, AND: [base, ...filtered("recent", recentSince)] } }),
      prismaClient.patient.count({ where: { tenantId, AND: [base, ...filtered("without-studies", recentSince)] } }),
    ]);

    return { total, recent, withoutStudies };
  },

  async findAssignedPatient({ tenantId, membershipId, patientId }) {
    const row = await prismaClient.patient.findFirst({
      where: {
        id: patientId,
        tenantId,
        status: "LINKED",
        assignments: { some: { tenantId, membershipId, endedAt: null } },
      },
      select: {
        id: true,
        fullName: true,
        documentType: true,
        documentNumber: true,
        _count: { select: { studies: true } },
      },
    });

    return row
      ? {
          id: row.id,
          fullName: row.fullName,
          documentType: row.documentType,
          documentNumber: row.documentNumber,
          studyCount: row._count.studies,
        }
      : null;
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
