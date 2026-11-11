import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { AnalysisRepository } from "../../application/ports/out/analysis-repository";
import type { AnalysisEntry } from "../../domain/analysis";
import { AnalysisInProgressError } from "../../domain/analysis-errors";
import { parseProbabilities } from "../../domain/findings";

const WITH_REQUESTER = {
  requestedBy: { select: { fullName: true } },
  study: { select: { patient: { select: { userId: true } } } },
} satisfies Prisma.AnalysisInclude;

type AnalysisRow = Prisma.AnalysisGetPayload<{
  include: typeof WITH_REQUESTER;
}>;

// El usuario del paciente del estudio es «El propio paciente»; cualquier otro es un médico, con su nombre. Es el
// mismo criterio que la lista de estudios.
function toEntry(row: AnalysisRow): AnalysisEntry {
  const { requestedBy, study, probabilities, ...record } = row;

  return {
    ...record,
    probabilities: probabilities === null ? null : parseProbabilities(probabilities),
    requestedBy:
      study.patient.userId === row.requestedByUserId
        ? { kind: "PATIENT" }
        : { kind: "DOCTOR", fullName: requestedBy.fullName },
  };
}

function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

const IN_PROGRESS = ["PENDING", "PROCESSING"] as const;

// Toda consulta incluye `tenantId`. No hay ninguna que busque un análisis por `id` solo.
export const prismaAnalysisRepository: AnalysisRepository = {
  async insertPending({ tenantId, studyId, requestedByUserId }) {
    try {
      const row = await prismaClient.analysis.create({
        data: { tenantId, studyId, requestedByUserId },
        include: WITH_REQUESTER,
      });

      return toEntry(row);
    } catch (error) {
      // El índice único parcial `analyses_one_in_progress` impide un segundo análisis en curso por estudio.
      if (isUniqueViolation(error)) {
        throw new AnalysisInProgressError();
      }

      throw error;
    }
  },

  async insertFailed({ tenantId, studyId, requestedByUserId, failureCode, finishedAt }) {
    const row = await prismaClient.analysis.create({
      data: {
        tenantId,
        studyId,
        requestedByUserId,
        status: "FAILED",
        failureCode,
        finishedAt,
      },
      include: WITH_REQUESTER,
    });

    return toEntry(row);
  },

  async claim({ tenantId, studyId, analysisId, startedAt }) {
    const result = await prismaClient.analysis.updateMany({
      where: { tenantId, studyId, id: analysisId, status: "PENDING" },
      data: { status: "PROCESSING", startedAt },
    });

    return result.count > 0;
  },

  async complete({ tenantId, studyId, analysisId, modelName, modelVersion, probabilities, finishedAt }) {
    const result = await prismaClient.analysis.updateMany({
      where: { tenantId, studyId, id: analysisId, status: "PROCESSING" },
      data: {
        status: "COMPLETED",
        modelName,
        modelVersion,
        probabilities,
        finishedAt,
      },
    });

    return result.count > 0;
  },

  async fail({ tenantId, studyId, analysisId, failureCode, finishedAt }) {
    const result = await prismaClient.analysis.updateMany({
      where: {
        tenantId,
        studyId,
        id: analysisId,
        status: { in: [...IN_PROGRESS] },
      },
      data: { status: "FAILED", failureCode, finishedAt },
    });

    return result.count > 0;
  },

  async failStale({ tenantId, studyId, olderThan, finishedAt }) {
    const result = await prismaClient.analysis.updateMany({
      where: {
        tenantId,
        studyId,
        status: { in: [...IN_PROGRESS] },
        requestedAt: { lt: olderThan },
      },
      data: { status: "FAILED", failureCode: "TIMEOUT", finishedAt },
    });

    return result.count;
  },

  async findById({ tenantId, studyId, analysisId }) {
    const row = await prismaClient.analysis.findFirst({
      where: { tenantId, studyId, id: analysisId },
      include: WITH_REQUESTER,
    });

    return row ? toEntry(row) : null;
  },

  async listByStudy({ tenantId, studyId }) {
    const rows = await prismaClient.analysis.findMany({
      where: { tenantId, studyId },
      orderBy: { requestedAt: "desc" },
      include: WITH_REQUESTER,
    });

    return rows.map(toEntry);
  },

  async hasInProgress({ tenantId, studyId, since }) {
    const count = await prismaClient.analysis.count({
      where: {
        tenantId,
        studyId,
        status: { in: [...IN_PROGRESS] },
        requestedAt: { gte: since },
      },
    });

    return count > 0;
  },
};
