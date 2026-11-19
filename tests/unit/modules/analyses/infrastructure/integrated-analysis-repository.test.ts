// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../../../../../generated/prisma/client";
import type { AnalysisEntry } from "@/modules/analyses/domain/analysis";
import { AnalysisInProgressError } from "@/modules/analyses/domain/analysis-errors";
import { InvalidUnifiedReportError, createUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
import { prismaAnalysisRepository as repository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";
import { sampleProbabilities } from "../../../../support/analysis-fixtures";

const boundary = vi.hoisted(() => ({
  create: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(),
}));
vi.mock("@/infrastructure/database/prisma-client", () => ({ prismaClient: { analysis: boundary } }));

const scope = { tenantId: "tenant-a", studyId: "study-a" };
const requester = { requestedByUserId: "user-a" };
const requestedAt = new Date("2026-11-16T10:00:00.000Z");
const later = new Date("2026-11-16T10:01:00.000Z");
type Row = Omit<AnalysisEntry, "requestedBy" | "probabilities"> & {
  probabilities: unknown; kind: "LEGACY_ECHONEXT" | "ECG_UNIFIED_V1";
  integratedResult: unknown; revision: number;
  requestedBy: { fullName: string }; study: { patient: { userId: string } };
};
type Where = {
  tenantId?: string; studyId?: string; id?: string; kind?: string; revision?: number;
  status?: string | { in: readonly string[] }; requestedAt?: { lt?: Date; gte?: Date };
};
let rows: Row[];
function matches(row: Row, where: Where) {
  for (const key of ["tenantId", "studyId", "id", "kind", "revision"] as const) {
    if (where[key] !== undefined && row[key] !== where[key]) return false;
  }
  if (typeof where.status === "string" && row.status !== where.status) return false;
  if (typeof where.status === "object" && !where.status.in.includes(row.status)) return false;
  if (where.requestedAt?.lt && row.requestedAt >= where.requestedAt.lt) return false;
  if (where.requestedAt?.gte && row.requestedAt < where.requestedAt.gte) return false;
  return true;
}
function row(data: Partial<Row> = {}): Row {
  return {
    id: "analysis-a", ...scope, ...requester, status: "PENDING", failureCode: null,
    modelName: null, modelVersion: null, probabilities: null, requestedAt,
    startedAt: null, finishedAt: null, kind: "LEGACY_ECHONEXT", integratedResult: null, revision: 0,
    requestedBy: { fullName: "Médica sintética" }, study: { patient: { userId: requester.requestedByUserId } }, ...data,
  };
}
function report() {
  return createUnifiedReport({
    analysisId: "integrated-a", studyId: scope.studyId, ...requester,
    requestedAt: requestedAt.toISOString(),
    capabilities: { echonext: { status: "NOT_AVAILABLE", reason: "Preparación no habilitada." }, e022: { status: "AVAILABLE" } },
  });
}
function insert(integratedResult: unknown = report()) {
  return repository.insertIntegratedPending({ ...scope, ...requester, integratedResult });
}
function lookup(analysisId = "integrated-a", tenantId = scope.tenantId) {
  return repository.findIntegratedById({ ...scope, tenantId, analysisId });
}

beforeEach(() => {
  rows = [];
  vi.resetAllMocks();
  boundary.create.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
    if (rows.some((entry) => entry.studyId === data.studyId && ["PENDING", "PROCESSING"].includes(entry.status))
      && (!data.status || ["PENDING", "PROCESSING"].includes(data.status))) {
      throw new Prisma.PrismaClientKnownRequestError("Conflicto sintético", { code: "P2002", clientVersion: "test" });
    }
    const created = row(data); rows.push(created); return structuredClone(created);
  });
  boundary.findFirst.mockImplementation(async ({ where }: { where: Where }) => structuredClone(rows.find((entry) => matches(entry, where)) ?? null));
  boundary.findMany.mockImplementation(async ({ where }: { where: Where }) => structuredClone(rows.filter((entry) => matches(entry, where)).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())));
  boundary.count.mockImplementation(async ({ where }: { where: Where }) => rows.filter((entry) => matches(entry, where)).length);
  boundary.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Omit<Row, "revision">> & { revision?: number | { increment: number } } }) => {
    const selected = rows.filter((entry) => matches(entry, where));
    selected.forEach((entry) => {
      const revision = typeof data.revision === "object" ? entry.revision + data.revision.increment : data.revision ?? entry.revision;
      Object.assign(entry, data, { revision });
    });
    return { count: selected.length };
  });
});

describe("persistencia integrada por el repositorio público (DB simulada)", () => {
  it("guarda el documento entero PENDING y lo relee sin inventar ejecución Mini", async () => {
    const input = report();
    const pending = await insert(input);
    expect(pending).toEqual({
      id: input.analysisId, ...scope, ...requester, kind: "ECG_UNIFIED_V1", status: "PENDING",
      failureCode: null, modelName: null, modelVersion: null, probabilities: null,
      requestedAt, startedAt: null, finishedAt: null, revision: 0, integratedResult: input,
      requestedBy: { kind: "PATIENT" },
    });
    expect(await lookup()).toEqual(pending);
    expect(publishUnifiedReport(pending.integratedResult)).toMatchObject({ coverage: "WAITING" });
    expect(pending.integratedResult.components).not.toHaveProperty("echonext");
    expect(boundary.create).toHaveBeenCalledTimes(1);
  });

  it("congela ambas capacidades disponibles sin fusionarlas ni duplicar el pedido", async () => {
    const input = createUnifiedReport({
      analysisId: "integrated-a", studyId: scope.studyId, ...requester, requestedAt: requestedAt.toISOString(),
      capabilities: { echonext: { status: "AVAILABLE" }, e022: { status: "AVAILABLE" } },
    });
    expect((await insert(input)).integratedResult).toEqual(input);
    expect((await lookup())?.integratedResult.components).toEqual(input.components);
    expect(boundary.create).toHaveBeenCalledTimes(1);
  });

  it("conserva el timestamp ISO del documento aunque omita milisegundos equivalentes", async () => {
    const input = { ...report(), requestedAt: "2026-11-16T10:00:00Z" };
    expect((await insert(input)).integratedResult).toEqual(input);
    expect((await lookup())?.integratedResult).toEqual(input);
  });

  it.each([
    ["versión ajena", { ...report(), schemaVersion: "wrong" }],
    ["estudio ajeno", { ...report(), studyId: "other-study" }],
    ["solicitante ajeno", { ...report(), requestedByUserId: "other-user" }],
    ["sin ejecuciones", { ...report(), components: {} }],
    ["FEVI numérica", { ...report(), fevi: 72 }],
    ["capacidad extra", { ...report(), capabilities: { ...report().capabilities, extra: { status: "AVAILABLE" } } }],
    ["ejecución ajena", { ...report(), components: { e022: { ...report().components.e022, analysisId: "other-analysis" } } }],
    ["no pendiente", { ...report(), components: { e022: { ...report().components.e022, status: "PROCESSING", startedAt: later.toISOString() } } }],
  ])("rechaza %s con error fijo, sin escritura ni consumo del pedido", async (scenario, invalid) => {
    const before = structuredClone(invalid);
    await expect(insert(invalid)).rejects.toThrow(new InvalidUnifiedReportError());
    expect(invalid).toEqual(before);
    expect(boundary.create).not.toHaveBeenCalled();
    expect(await repository.listByStudy(scope)).toEqual([]);
    expect(await lookup()).toBeNull();
    expect(await repository.hasInProgress({ ...scope, since: new Date(0) })).toBe(false);
    await expect(insert()).resolves.toMatchObject({ id: "integrated-a", revision: 0 });
  });

  it("dos pedidos comparten el arbitraje único, incluido legacy", async () => {
    await insert();
    await expect(insert()).rejects.toThrow(AnalysisInProgressError);
    await expect(repository.insertPending({ ...scope, ...requester })).rejects.toThrow(AnalysisInProgressError);
    expect(await lookup()).toMatchObject({ status: "PENDING", revision: 0 });
    expect(await repository.hasInProgress({ ...scope, since: new Date(0) })).toBe(true);
  });

  it("también traduce el conflicto cuando legacy ganó primero; propaga otros errores", async () => {
    await repository.insertPending({ ...scope, ...requester });
    await expect(insert()).rejects.toThrow(AnalysisInProgressError);
    boundary.create.mockRejectedValueOnce(new Error("DB sintética"));
    await expect(insert()).rejects.toThrow("DB sintética");
  });

  it("otra clínica/estudio no puede leer ni mutar el documento mediante APIs legacy", async () => {
    await insert();
    expect(await lookup("integrated-a", "tenant-b")).toBeNull();
    expect(await repository.findIntegratedById({ ...scope, studyId: "study-b", analysisId: "integrated-a" })).toBeNull();
    for (const tenantId of [scope.tenantId, "tenant-b"]) {
      const target = { ...scope, tenantId, analysisId: "integrated-a" };
      expect(await repository.findById(target)).toBeNull();
      expect(await repository.listByStudy({ ...scope, tenantId })).toEqual([]);
      expect(await repository.claim({ ...target, startedAt: later })).toBe(false);
      expect(await repository.complete({ ...target, modelName: "m", modelVersion: "1", probabilities: sampleProbabilities(), finishedAt: later })).toBe(false);
      expect(await repository.fail({ ...target, failureCode: "INTERNAL", finishedAt: later })).toBe(false);
      expect(await repository.failStale({ ...scope, tenantId, olderThan: later, finishedAt: later })).toBe(0);
    }
    expect(await repository.hasInProgress({ ...scope, tenantId: "tenant-b", since: new Date(0) })).toBe(false);
    expect(await lookup()).toMatchObject({ status: "PENDING", revision: 0, integratedResult: report() });
  });

  it.each(["schema", "id", "study", "requester", "date", "revision", "legacy-fields"])("rechaza corrupción %s al leer, sin escribir", async (field) => {
    await insert();
    // Simula corrupción de la frontera DB; las aserciones observan solo el puerto público.
    const corrupt = row({ kind: "ECG_UNIFIED_V1", id: "integrated-a", integratedResult: report() });
    if (field === "schema") corrupt.integratedResult = { ...report(), schemaVersion: "wrong" };
    if (field === "id") corrupt.integratedResult = { ...report(), analysisId: "other" };
    if (field === "study") corrupt.integratedResult = { ...report(), studyId: "other" };
    if (field === "requester") corrupt.integratedResult = { ...report(), requestedByUserId: "other" };
    if (field === "date") corrupt.requestedAt = later;
    if (field === "revision") corrupt.revision = -1;
    if (field === "legacy-fields") corrupt.probabilities = sampleProbabilities();
    boundary.findFirst.mockResolvedValueOnce(corrupt);
    await expect(lookup()).rejects.toThrow(new InvalidUnifiedReportError());
    expect(boundary.updateMany).not.toHaveBeenCalled();
    expect(await lookup()).toMatchObject({ revision: 0, integratedResult: report() });
  });

  it("la lectura integrada no reinterpreta legacy y devuelve null si no existe", async () => {
    const legacy = await repository.insertPending({ ...scope, ...requester });
    expect(await lookup(legacy.id)).toBeNull();
    expect(await lookup("missing")).toBeNull();
  });
});

// Se prueba el puerto público; el doble solo aplica filtros/CAS, no las reglas del informe.
const start = new Date(requestedAt.getTime() + 1_000);
const finish = new Date(start.getTime() + 1_000);
const target = { ...scope, analysisId: "integrated-a" };
async function prepare(both = true) {
  const input = both ? createUnifiedReport({
    analysisId: target.analysisId, studyId: scope.studyId, ...requester, requestedAt: requestedAt.toISOString(),
    capabilities: { echonext: { status: "AVAILABLE" }, e022: { status: "AVAILABLE" } },
  }) : report();
  await insert(input);
  expect(await repository.claimIntegrated({ ...target, expectedRevision: 0, startedAt: start })).toBe(true);
  let revision = 1;
  for (const component of ["echonext", "e022"] as const) {
    if (!input.components[component]) continue;
    expect(await repository.startIntegratedComponent({ ...target, expectedRevision: revision++, component, startedAt: start, preprocessingReference: "synthetic-prep-v1" })).toBe(true);
  }
  return revision;
}
function outcome(component: "echonext" | "e022", status: "COMPLETED" | "FAILED" = "COMPLETED") {
  return {
    analysisId: target.analysisId, status, startedAt: start.toISOString(), finishedAt: finish.toISOString(),
    failureCode: status === "FAILED" ? "INTERNAL" : null,
    modelName: status === "COMPLETED" ? component : null,
    modelVersion: status === "COMPLETED" ? "synthetic-v1" : null,
    preprocessingReference: "synthetic-prep-v1",
    result: status === "FAILED" ? null : component === "e022" ? { target: "lvef_lte_45", score: 0.72 } : sampleProbabilities(),
  };
}
async function finishComponent(component: "echonext" | "e022", expectedRevision: number, status: "COMPLETED" | "FAILED" = "COMPLETED") {
  return repository.finishIntegratedComponent({ ...target, expectedRevision, component, execution: outcome(component, status), now: finish });
}

describe("ciclo integrado/CAS público, no prueba de transacción SQL", () => {
  it.each(["echonext", "e022"] as const)("espera ambos y finaliza atómicamente cuando %s termina primero", async (first) => {
    const revision = await prepare();
    const second = first === "echonext" ? "e022" : "echonext";
    expect(await finishComponent(first, revision)).toBe(true);
    const waiting = await lookup();
    expect(waiting).toMatchObject({ status: "PROCESSING", revision: revision + 1, finishedAt: null, failureCode: null });
    expect(publishUnifiedReport(waiting?.integratedResult)).not.toHaveProperty("contributions");
    expect(await finishComponent(second, revision + 1)).toBe(true);
    const completed = await lookup();
    expect(completed).toMatchObject({ status: "COMPLETED", revision: revision + 2, finishedAt: finish, failureCode: null });
    expect(publishUnifiedReport(completed?.integratedResult)).toMatchObject({ coverage: "COMPLETE", contributions: [
      { component: "echonext", execution: outcome("echonext") }, { component: "e022", execution: outcome("e022") },
    ] });
    expect(await repository.hasInProgress({ ...scope, since: new Date(0) })).toBe(false);
  });

  it("arbitra dos writes concurrentes: uno pierde CAS, relee y conserva ambas contribuciones", async () => {
    const revision = await prepare();
    const results = await Promise.all([finishComponent("echonext", revision), finishComponent("e022", revision)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const stored = await lookup();
    expect(stored?.revision).toBe(revision + 1);
    const loser = results[0] ? "e022" : "echonext";
    expect(await finishComponent(loser, revision)).toBe(false);
    expect(await lookup()).toEqual(stored);
    expect(await finishComponent(loser, revision + 1)).toBe(true);
    expect(publishUnifiedReport((await lookup())?.integratedResult).coverage).toBe("COMPLETE");
  });

  it.each([false, true])("preserva éxito si el otro falla; ambos fallidos=%s", async (allFailed) => {
    const revision = await prepare();
    await finishComponent("e022", revision, allFailed ? "FAILED" : "COMPLETED");
    await finishComponent("echonext", revision + 1, "FAILED");
    const terminal = await lookup();
    expect(terminal).toMatchObject({ status: allFailed ? "FAILED" : "COMPLETED", failureCode: allFailed ? "INTERNAL" : null, finishedAt: finish, revision: revision + 2 });
    const publication = publishUnifiedReport(terminal?.integratedResult);
    expect(publication.coverage).toBe(allFailed ? "NONE" : "PARTIAL");
    if (allFailed) expect(publication).not.toHaveProperty("contributions");
    else expect(publication).toMatchObject({ contributions: [{ component: "e022", execution: outcome("e022") }] });
    expect(await finishComponent("echonext", revision + 2)).toBe(false);
    expect(await repository.claimIntegrated({ ...target, expectedRevision: revision + 2, startedAt: finish })).toBe(false);
    expect(await lookup()).toEqual(terminal);
  });

  it("Mini omitida no se inicia ni finaliza; E022 publica parcial sin esperar", async () => {
    const revision = await prepare(false);
    const before = await lookup();
    expect(await repository.startIntegratedComponent({ ...target, expectedRevision: revision, component: "echonext", startedAt: start, preprocessingReference: null })).toBe(false);
    expect(await finishComponent("echonext", revision)).toBe(false);
    expect(await lookup()).toEqual(before);
    expect(await finishComponent("e022", revision)).toBe(true);
    expect(publishUnifiedReport((await lookup())?.integratedResult)).toMatchObject({ coverage: "PARTIAL", contributions: [{ component: "e022" }] });
    expect((await lookup())?.integratedResult.components).not.toHaveProperty("echonext");
  });

  it("rechaza tenant, estudio, id y revisión ajenos sin cambiar estado público", async () => {
    const revision = await prepare(false);
    const before = await lookup();
    for (const wrong of [{ tenantId: "tenant-b" }, { studyId: "other" }, { analysisId: "other" }, { expectedRevision: revision - 1 }]) {
      const input = { ...target, expectedRevision: revision, ...wrong };
      expect(await repository.claimIntegrated({ ...input, startedAt: start })).toBe(false);
      expect(await repository.startIntegratedComponent({ ...input, component: "e022", startedAt: start, preprocessingReference: null })).toBe(false);
      expect(await repository.finishIntegratedComponent({ ...input, component: "e022", execution: outcome("e022"), now: finish })).toBe(false);
      expect(await repository.expireIntegrated({ ...input, now: later })).toBe(false);
      expect(await lookup()).toEqual(before);
    }
  });

  it.each(["shape", "binding", "date", "reference", "score", "extra"])("rechaza outcome inválido %s sin escribir ni alterar el documento", async (field) => {
    const revision = await prepare(false);
    const before = await lookup();
    const execution = { ...outcome("e022"), ...(field === "shape" ? { status: "PROCESSING" } : {}),
      ...(field === "binding" ? { analysisId: "other" } : {}), ...(field === "date" ? { startedAt: requestedAt.toISOString() } : {}),
      ...(field === "reference" ? { preprocessingReference: "other" } : {}), ...(field === "score" ? { result: { target: "lvef_lte_45", score: 2 } } : {}),
      ...(field === "extra" ? { clinicalData: "forbidden" } : {}),
    };
    await expect(repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "e022", execution, now: finish })).rejects.toThrow(new InvalidUnifiedReportError());
    expect(await lookup()).toEqual(before);
  });

  it("30 s exactos vencen solo el componente activo; una respuesta tardía no escribe", async () => {
    const revision = await prepare();
    await finishComponent("e022", revision);
    const now = new Date(start.getTime() + 30_000);
    const before = await lookup();
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + 1, component: "echonext", execution: { ...outcome("echonext"), finishedAt: now.toISOString() }, now })).toBe(false);
    expect(await lookup()).toEqual(before);
    expect(await repository.expireIntegrated({ ...target, expectedRevision: revision + 1, now: new Date(now.getTime() - 1) })).toBe(false);
    expect(await repository.expireIntegrated({ ...target, expectedRevision: revision + 1, now })).toBe(true);
    const terminal = await lookup();
    expect(terminal).toMatchObject({ status: "COMPLETED", finishedAt: now, revision: revision + 2, failureCode: null });
    expect(publishUnifiedReport(terminal?.integratedResult)).toMatchObject({ coverage: "PARTIAL", contributions: [{ component: "e022", execution: outcome("e022") }] });
    expect(terminal?.integratedResult.components.echonext).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT", finishedAt: now.toISOString(), result: null });
    expect(await finishComponent("echonext", revision + 2)).toBe(false);
    expect(await lookup()).toEqual(terminal);
  });

  it("el barrido relee un CAS perdido ante un outcome concurrente y no deja ocupado el pedido vencido", async () => {
    const revision = await prepare();
    const now = new Date(start.getTime() + 30_000);
    const [completed, expired] = await Promise.all([
      finishComponent("e022", revision), repository.expireIntegratedStale({ ...scope, now }),
    ]);
    expect(completed).toBe(true);
    expect(expired).toBe(1);
    const terminal = await lookup();
    expect(terminal).toMatchObject({ status: "COMPLETED", finishedAt: now, revision: revision + 2 });
    expect(publishUnifiedReport(terminal?.integratedResult)).toMatchObject({ coverage: "PARTIAL", contributions: [{ component: "e022", execution: outcome("e022") }] });
    expect(await repository.hasInProgress({ ...scope, since: new Date(0) })).toBe(false);
  });

  it("claim tenant-scoped no revive ni repite; fallo previo a invocación no fabrica inicio/modelo", async () => {
    await insert();
    const pending = await lookup();
    expect(await repository.claimIntegrated({ ...target, tenantId: "tenant-b", expectedRevision: 0, startedAt: start })).toBe(false);
    expect(await lookup()).toEqual(pending);
    expect(await repository.claimIntegrated({ ...target, expectedRevision: 0, startedAt: start })).toBe(true);
    const claimed = await lookup();
    expect(await repository.claimIntegrated({ ...target, expectedRevision: 1, startedAt: finish })).toBe(false);
    expect(await lookup()).toEqual(claimed);
    const execution = { ...outcome("e022", "FAILED"), startedAt: null, failureCode: "MODEL_UNAVAILABLE", preprocessingReference: null };
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: 1, component: "e022", execution, now: finish })).toBe(true);
    expect(await lookup()).toMatchObject({ status: "FAILED", failureCode: "MODEL_UNAVAILABLE", revision: 2, integratedResult: { components: { e022: execution } } });
    expect(publishUnifiedReport((await lookup())?.integratedResult)).not.toHaveProperty("contributions");
  });

  it("un componente TIMEOUT no revive aunque el pedido siga esperando otro PENDING", async () => {
    const input = createUnifiedReport({ analysisId: target.analysisId, studyId: scope.studyId, ...requester, requestedAt: requestedAt.toISOString(), capabilities: { echonext: { status: "AVAILABLE" }, e022: { status: "AVAILABLE" } } });
    await insert(input);
    await repository.claimIntegrated({ ...target, expectedRevision: 0, startedAt: start });
    await repository.startIntegratedComponent({ ...target, expectedRevision: 1, component: "echonext", startedAt: start, preprocessingReference: "synthetic-prep-v1" });
    const now = new Date(start.getTime() + 30_000);
    expect(await repository.expireIntegrated({ ...target, expectedRevision: 2, now })).toBe(true);
    const waiting = await lookup();
    expect(waiting).toMatchObject({ status: "PROCESSING", revision: 3, finishedAt: null, failureCode: null });
    expect(publishUnifiedReport(waiting?.integratedResult)).not.toHaveProperty("contributions");
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: 3, component: "echonext", execution: { ...outcome("echonext"), finishedAt: now.toISOString() }, now })).toBe(false);
    expect(await repository.startIntegratedComponent({ ...target, expectedRevision: 3, component: "echonext", startedAt: now, preprocessingReference: null })).toBe(false);
    expect(await lookup()).toEqual(waiting);
    const overall = new Date(requestedAt.getTime() + 120_000);
    expect(await repository.expireIntegrated({ ...target, expectedRevision: 3, now: overall })).toBe(true);
    expect(await lookup()).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT", revision: 4, finishedAt: overall,
      integratedResult: { components: { echonext: waiting?.integratedResult.components.echonext, e022: { status: "FAILED", startedAt: null, failureCode: "TIMEOUT", result: null } } } });
  });

  it("acepta el outcome a 29.999 s, rechaza reloj inválido y corrupción de documento completo sin escribir", async () => {
    const revision = await prepare(false);
    const before = await lookup();
    await expect(repository.expireIntegrated({ ...target, expectedRevision: revision, now: new Date(Number.NaN) })).rejects.toThrow(new InvalidUnifiedReportError());
    await expect(repository.expireIntegrated({ ...target, expectedRevision: -1, now: finish })).rejects.toThrow(new InvalidUnifiedReportError());
    boundary.findFirst.mockResolvedValueOnce(row({ id: target.analysisId, kind: "ECG_UNIFIED_V1", integratedResult: { ...report(), requestedByUserId: "other" } }));
    await expect(finishComponent("e022", revision)).rejects.toThrow(new InvalidUnifiedReportError());
    expect(await lookup()).toEqual(before);
    const now = new Date(start.getTime() + 29_999);
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "e022", execution: { ...outcome("e022"), finishedAt: now.toISOString() }, now })).toBe(true);
    expect(await lookup()).toMatchObject({ status: "COMPLETED", revision: revision + 1, finishedAt: now });
  });

  it("120 s vencen PENDING integrado y liberan el arbitraje sin tocar legacy ni otra clínica", async () => {
    await insert();
    const now = new Date(requestedAt.getTime() + 120_000);
    const before = await lookup();
    expect(await repository.expireIntegratedStale({ ...scope, tenantId: "tenant-b", now })).toBe(0);
    expect(await repository.expireIntegratedStale({ ...scope, now: new Date(now.getTime() - 1) })).toBe(0);
    expect(await lookup()).toEqual(before);
    expect(await repository.claimIntegrated({ ...target, expectedRevision: 0, startedAt: now })).toBe(false);
    expect(await repository.expireIntegratedStale({ ...scope, now })).toBe(1);
    const expired = await lookup();
    expect(expired).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT", revision: 1, finishedAt: now });
    expect(publishUnifiedReport(expired?.integratedResult)).toMatchObject({ coverage: "NONE" });
    expect(await repository.expireIntegratedStale({ ...scope, now })).toBe(0);
    expect(await finishComponent("e022", 1)).toBe(false);
    expect(await lookup()).toEqual(expired);
    await expect(repository.insertPending({ ...scope, ...requester })).resolves.toMatchObject({ status: "PENDING" });
    expect(await repository.expireIntegratedStale({ ...scope, now })).toBe(0);
  });
});

describe("PRESERVE del contrato legacy compartido", () => {
  it("inserción, claim y complete mantienen DTO exacto y estados previos", async () => {
    const pending = await repository.insertPending({ ...scope, ...requester });
    const oldRecord = Object.fromEntries(Object.entries(row()).filter(([key]) =>
      !["kind", "integratedResult", "revision", "requestedBy", "study"].includes(key)));
    expect(pending).toEqual({ ...oldRecord, requestedBy: { kind: "PATIENT" } });
    expect(await repository.claim({ ...scope, analysisId: pending.id, startedAt: later })).toBe(true);
    expect(await repository.claim({ ...scope, analysisId: pending.id, startedAt: later })).toBe(false);
    expect(await repository.complete({ ...scope, analysisId: pending.id, modelName: "legacy", modelVersion: "1", probabilities: sampleProbabilities(), finishedAt: later })).toBe(true);
    expect(await repository.findById({ ...scope, analysisId: pending.id })).toMatchObject({ status: "COMPLETED", probabilities: sampleProbabilities() });
    expect(await repository.fail({ ...scope, analysisId: pending.id, failureCode: "INTERNAL", finishedAt: later })).toBe(false);
  });

  it("insertFailed/list/find conservan solicitante médico, orden y error", async () => {
    await repository.insertFailed({ ...scope, ...requester, failureCode: "TIMEOUT", finishedAt: later });
    boundary.create.mockImplementationOnce(async ({ data }: { data: Partial<Row> }) => {
      const created = row({ ...data, id: "analysis-b", requestedAt: later });
      rows.push(created); return structuredClone(created);
    });
    await repository.insertPending({ ...scope, requestedByUserId: "doctor-a" });
    const list = await repository.listByStudy(scope);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ requestedBy: { kind: "DOCTOR", fullName: "Médica sintética" } });
    expect(list[1]).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT", requestedBy: { kind: "PATIENT" } });
    expect(await repository.findById({ ...scope, analysisId: "missing" })).toBeNull();
  });

  it("fail/failStale/hasInProgress conservan filtros tenant, fecha y terminales", async () => {
    const pending = await repository.insertPending({ ...scope, ...requester });
    expect(await repository.hasInProgress({ ...scope, since: later })).toBe(false);
    expect(await repository.failStale({ ...scope, olderThan: requestedAt, finishedAt: later })).toBe(0);
    expect(await repository.fail({ ...scope, tenantId: "tenant-b", analysisId: pending.id, failureCode: "INTERNAL", finishedAt: later })).toBe(false);
    expect(await repository.failStale({ ...scope, olderThan: later, finishedAt: later })).toBe(1);
    expect(await repository.findById({ ...scope, analysisId: pending.id })).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT" });
    expect(await repository.hasInProgress({ ...scope, since: new Date(0) })).toBe(false);
  });

  it("propaga errores DB que no son unicidad en insertPending", async () => {
    boundary.create.mockRejectedValueOnce(new Error("DB sintética"));
    await expect(repository.insertPending({ ...scope, ...requester })).rejects.toThrow("DB sintética");
  });
});
