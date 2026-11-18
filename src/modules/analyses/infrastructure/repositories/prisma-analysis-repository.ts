import "server-only";

import { prismaClient } from "@/infrastructure/database/prisma-client";

import { Prisma } from "../../../../../generated/prisma/client";
import type { AnalysisRepository, IntegratedAnalysisEntry, IntegratedAnalysisMutation, IntegratedAnalysisRepository } from "../../application/ports/out/analysis-repository";
import { ANALYSIS_MODEL_TIMEOUT_MS, ANALYSIS_STALE_AFTER_MS, type AnalysisEntry } from "../../domain/analysis";
import { AnalysisInProgressError } from "../../domain/analysis-errors";
import { parseProbabilities } from "../../domain/findings";
import { InvalidUnifiedReportError, parseUnifiedReport, publishUnifiedReport, type UnifiedReport } from "../../domain/unified-report";

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
  const { requestedBy, study, probabilities } = row;

  // Proyección explícita: las columnas aditivas nunca cambian el DTO histórico.
  return {
    id: row.id,
    tenantId: row.tenantId,
    studyId: row.studyId,
    requestedByUserId: row.requestedByUserId,
    status: row.status,
    failureCode: row.failureCode,
    modelName: row.modelName,
    modelVersion: row.modelVersion,
    requestedAt: row.requestedAt,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
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
const LEGACY_KIND = "LEGACY_ECHONEXT";

function toIntegratedEntry(row: AnalysisRow): IntegratedAnalysisEntry {
  const report = parseUnifiedReport(row.integratedResult);
  if (row.kind !== "ECG_UNIFIED_V1" || report.analysisId !== row.id || report.studyId !== row.studyId
    || report.requestedByUserId !== row.requestedByUserId || Date.parse(report.requestedAt) !== row.requestedAt.getTime()
    || !Number.isInteger(row.revision) || row.revision < 0
    || row.modelName !== null || row.modelVersion !== null || row.probabilities !== null) {
    throw new InvalidUnifiedReportError();
  }
  return {
    ...toEntry(row), kind: "ECG_UNIFIED_V1", modelName: null, modelVersion: null, probabilities: null,
    integratedResult: report, revision: row.revision,
  };
}

const INTEGRATED_KIND = "ECG_UNIFIED_V1";
const COMPONENTS = ["echonext", "e022"] as const;

function clockTime(now: Date): number {
  const time = now.getTime();
  if (!Number.isFinite(time)) throw new InvalidUnifiedReportError();
  return time;
}

function overallExpired(entry: IntegratedAnalysisEntry, now: Date): boolean {
  return clockTime(now) - entry.requestedAt.getTime() >= ANALYSIS_STALE_AFTER_MS;
}

function componentExpired(execution: NonNullable<UnifiedReport["components"]["e022"]>, now: Date): boolean {
  return execution.status === "PROCESSING"
    && clockTime(now) - Date.parse(execution.startedAt) >= ANALYSIS_MODEL_TIMEOUT_MS;
}

async function readIntegratedMutation(input: IntegratedAnalysisMutation): Promise<IntegratedAnalysisEntry | null> {
  if (!Number.isInteger(input.expectedRevision) || input.expectedRevision < 0) throw new InvalidUnifiedReportError();
  const row = await prismaClient.analysis.findFirst({
    where: { tenantId: input.tenantId, studyId: input.studyId, id: input.analysisId, kind: INTEGRATED_KIND, revision: input.expectedRevision, status: { in: [...IN_PROGRESS] } },
    include: WITH_REQUESTER,
  });
  return row ? toIntegratedEntry(row) : null;
}

// Un UPDATE contiene documento entero, revisión y agregado: no hay ventana entre resultado y finalización.
// El CAS evita perder la contribución de otro proceso que leyó la misma revisión.
async function writeIntegrated(input: {
  entry: IntegratedAnalysisEntry;
  report: UnifiedReport;
  now: Date;
  startedAt: Date | null;
}): Promise<boolean> {
  const { entry, report, now, startedAt } = input;
  const publication = publishUnifiedReport(report);
  const waiting = publication.coverage === "WAITING";
  const failed = publication.coverage === "NONE";
  const failures = Object.values(report.components).filter((execution) => execution.status === "FAILED");
  const firstCode = failures[0]?.failureCode ?? "INTERNAL";
  const failureCode = failed ? (failures.every((execution) => execution.failureCode === firstCode) ? firstCode : "INTERNAL") : null;
  const result = await prismaClient.analysis.updateMany({
    where: { tenantId: entry.tenantId, studyId: entry.studyId, id: entry.id, kind: INTEGRATED_KIND, revision: entry.revision, status: entry.status },
    data: {
      integratedResult: report, revision: { increment: 1 },
      status: waiting ? "PROCESSING" : failed ? "FAILED" : "COMPLETED",
      startedAt, finishedAt: waiting ? null : now, failureCode,
    },
  });
  return result.count === 1;
}

// Un único camino de inserción y traducción del arbitraje ya existente; no hay lock/contador paralelo.
async function insertPendingRow(data: Prisma.AnalysisUncheckedCreateInput): Promise<AnalysisRow> {
  try {
    return await prismaClient.analysis.create({ data, include: WITH_REQUESTER });
  } catch (error) {
    if (isUniqueViolation(error)) throw new AnalysisInProgressError();
    throw error;
  }
}

// Toda consulta incluye `tenantId`. No hay ninguna que busque un análisis por `id` solo.
export const prismaAnalysisRepository: AnalysisRepository & IntegratedAnalysisRepository = {
  async insertPending({ tenantId, studyId, requestedByUserId }) {
    return toEntry(await insertPendingRow({ tenantId, studyId, requestedByUserId }));
  },

  async insertIntegratedPending({ tenantId, studyId, requestedByUserId, integratedResult }) {
    const report = parseUnifiedReport(integratedResult);
    if (report.studyId !== studyId || report.requestedByUserId !== requestedByUserId
      || Object.values(report.components).some((component) => component.status !== "PENDING")) {
      throw new InvalidUnifiedReportError();
    }
    const row = await insertPendingRow({
      id: report.analysisId, tenantId, studyId, requestedByUserId, kind: "ECG_UNIFIED_V1",
      status: "PENDING", requestedAt: new Date(report.requestedAt), integratedResult: report, revision: 0,
    });
    return toIntegratedEntry(row);
  },

  async findIntegratedById({ tenantId, studyId, analysisId }) {
    const row = await prismaClient.analysis.findFirst({
      where: { tenantId, studyId, id: analysisId, kind: "ECG_UNIFIED_V1" },
      include: WITH_REQUESTER,
    });
    return row ? toIntegratedEntry(row) : null;
  },

  async claimIntegrated(input) {
    const entry = await readIntegratedMutation(input);
    if (!entry || entry.status !== "PENDING" || overallExpired(entry, input.startedAt)) return false;
    if (clockTime(input.startedAt) < entry.requestedAt.getTime()) throw new InvalidUnifiedReportError();
    return writeIntegrated({ entry, report: entry.integratedResult, now: input.startedAt, startedAt: input.startedAt });
  },

  async startIntegratedComponent(input) {
    const entry = await readIntegratedMutation(input);
    if (!entry || entry.status !== "PROCESSING" || overallExpired(entry, input.startedAt)) return false;
    const execution = entry.integratedResult.components[input.component];
    if (!execution || execution.status !== "PENDING") return false;
    if (!entry.startedAt || clockTime(input.startedAt) < entry.startedAt.getTime()) throw new InvalidUnifiedReportError();
    const report = parseUnifiedReport({ ...entry.integratedResult, components: {
      ...entry.integratedResult.components,
      [input.component]: { ...execution, status: "PROCESSING", startedAt: input.startedAt.toISOString(), preprocessingReference: input.preprocessingReference },
    } });
    return writeIntegrated({ entry, report, now: input.startedAt, startedAt: entry.startedAt });
  },

  async finishIntegratedComponent(input) {
    const entry = await readIntegratedMutation(input);
    if (!entry || entry.status !== "PROCESSING" || overallExpired(entry, input.now)) return false;
    const previous = entry.integratedResult.components[input.component];
    if (!previous || previous.status === "COMPLETED" || previous.status === "FAILED" || componentExpired(previous, input.now)) return false;
    const report = parseUnifiedReport({ ...entry.integratedResult, components: { ...entry.integratedResult.components, [input.component]: input.execution } });
    const execution = report.components[input.component];
    if (!execution || (execution.status !== "COMPLETED" && execution.status !== "FAILED")
      || execution.startedAt !== previous.startedAt || execution.preprocessingReference !== previous.preprocessingReference
      || (execution.status === "COMPLETED" && previous.status !== "PROCESSING")
      || Date.parse(execution.finishedAt) !== clockTime(input.now)
      || !entry.startedAt || clockTime(input.now) < entry.startedAt.getTime()) {
      throw new InvalidUnifiedReportError();
    }
    return writeIntegrated({ entry, report, now: input.now, startedAt: entry.startedAt });
  },

  async expireIntegrated(input) {
    const entry = await readIntegratedMutation(input);
    if (!entry) return false;
    const allExpired = overallExpired(entry, input.now);
    const components = { ...entry.integratedResult.components };
    let changed = false;
    for (const component of COMPONENTS) {
      const execution = components[component];
      if (!execution || execution.status === "COMPLETED" || execution.status === "FAILED"
        || (!allExpired && !componentExpired(execution, input.now))) continue;
      components[component] = {
        ...execution, status: "FAILED", finishedAt: input.now.toISOString(), failureCode: "TIMEOUT", result: null,
      };
      changed = true;
    }
    if (!changed) return false;
    const report = parseUnifiedReport({ ...entry.integratedResult, components });
    return writeIntegrated({ entry, report, now: input.now, startedAt: entry.startedAt });
  },

  async expireIntegratedStale({ tenantId, studyId, now }) {
    clockTime(now);
    const rows = await prismaClient.analysis.findMany({
      where: { tenantId, studyId, kind: INTEGRATED_KIND, status: { in: [...IN_PROGRESS] } },
      include: WITH_REQUESTER,
    });
    let expired = 0;
    for (const row of rows) {
      let entry = toIntegratedEntry(row);
      while (entry.status === "PENDING" || entry.status === "PROCESSING") {
        if (await prismaAnalysisRepository.expireIntegrated({ tenantId, studyId, analysisId: entry.id, expectedRevision: entry.revision, now })) {
          expired += 1;
          break;
        }
        // Un outcome puede ganar el CAS durante el barrido. Releer sin perderlo; si no cambió,
        // no había nada vencido. Las transiciones son monotónicas y finitas por pedido.
        const current = await prismaAnalysisRepository.findIntegratedById({ tenantId, studyId, analysisId: entry.id });
        if (!current || current.revision === entry.revision) break;
        entry = current;
      }
    }
    return expired;
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
      where: { tenantId, studyId, id: analysisId, kind: LEGACY_KIND, status: "PENDING" },
      data: { status: "PROCESSING", startedAt },
    });

    return result.count > 0;
  },

  async complete({ tenantId, studyId, analysisId, modelName, modelVersion, probabilities, finishedAt }) {
    const result = await prismaClient.analysis.updateMany({
      where: { tenantId, studyId, id: analysisId, kind: LEGACY_KIND, status: "PROCESSING" },
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
        kind: LEGACY_KIND,
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
        kind: LEGACY_KIND,
        status: { in: [...IN_PROGRESS] },
        requestedAt: { lt: olderThan },
      },
      data: { status: "FAILED", failureCode: "TIMEOUT", finishedAt },
    });

    return result.count;
  },

  async findById({ tenantId, studyId, analysisId }) {
    const row = await prismaClient.analysis.findFirst({
      where: { tenantId, studyId, id: analysisId, kind: LEGACY_KIND },
      include: WITH_REQUESTER,
    });

    return row ? toEntry(row) : null;
  },

  async listByStudy({ tenantId, studyId }) {
    const rows = await prismaClient.analysis.findMany({
      where: { tenantId, studyId, kind: LEGACY_KIND },
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
