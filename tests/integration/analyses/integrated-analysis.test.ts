// Solo ejecutar tras migrate deploy + generate humanos sobre PostgreSQL local aislado de pruebas.
// No prueba modelos/lector ni autoriza datos reales; usa las guardas de integración existentes.
import { beforeEach, describe, expect, it } from "vitest";

import { AnalysisInProgressError } from "@/modules/analyses/domain/analysis-errors";
import { InvalidUnifiedReportError, createUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
import { prismaAnalysisRepository as repository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";
import { createAnalysisWorld } from "../../support/analysis-world";
import { sampleProbabilities } from "../../support/analysis-fixtures";
import { prismaClient, resetDatabase } from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

async function setup(both = false) {
  const world = await createAnalysisWorld();
  const scope = { tenantId: world.tenantA.id, studyId: world.study.id };
  const requestedByUserId = world.actors.p1.userId;
  const integratedResult = createUnifiedReport({
    analysisId: "10000000-0000-4000-8000-000000000010", studyId: scope.studyId,
    requestedByUserId, requestedAt: "2026-11-16T10:00:00.000Z",
    capabilities: { echonext: both ? { status: "AVAILABLE" } : { status: "NOT_AVAILABLE", reason: "No configurado en prueba." }, e022: { status: "AVAILABLE" } },
  });
  return { world, scope, input: { ...scope, requestedByUserId, integratedResult } };
}

const startedAt = new Date("2026-11-16T10:00:01.000Z");
const finishedAt = new Date("2026-11-16T10:00:02.000Z");
async function processing(both = true) {
  const context = await setup(both);
  const pending = await repository.insertIntegratedPending(context.input);
  const target = { ...context.scope, analysisId: pending.id };
  expect(await repository.claimIntegrated({ ...target, expectedRevision: 0, startedAt })).toBe(true);
  let revision = 1;
  for (const component of ["echonext", "e022"] as const) {
    if (!pending.integratedResult.components[component]) continue;
    expect(await repository.startIntegratedComponent({ ...target, expectedRevision: revision++, component, startedAt, preprocessingReference: "synthetic-prep" })).toBe(true);
  }
  return { ...context, target, revision };
}
function execution(analysisId: string, component: "echonext" | "e022", failed = false) {
  return {
    analysisId, status: failed ? "FAILED" : "COMPLETED", startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(),
    failureCode: failed ? "INTERNAL" : null, modelName: failed ? null : component, modelVersion: failed ? null : "synthetic-v1",
    preprocessingReference: "synthetic-prep",
    result: failed ? null : component === "e022" ? { target: "lvef_lte_45", score: 0.72 } : sampleProbabilities(),
  };
}

describe("transiciones integradas reales (NO ejecutadas; DB desechable exclusiva requerida)", () => {
  it.each(["echonext", "e022"] as const)("publica completo en el segundo outcome, primero %s", async (first) => {
    const { target, revision } = await processing();
    const second = first === "echonext" ? "e022" : "echonext";
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: first, execution: execution(target.analysisId, first), now: finishedAt })).toBe(true);
    const waiting = await repository.findIntegratedById(target);
    expect(waiting).toMatchObject({ status: "PROCESSING", revision: revision + 1, finishedAt: null });
    expect(publishUnifiedReport(waiting?.integratedResult)).not.toHaveProperty("contributions");
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + 1, component: second, execution: execution(target.analysisId, second), now: finishedAt })).toBe(true);
    const completed = await repository.findIntegratedById(target);
    expect(completed).toMatchObject({ status: "COMPLETED", revision: revision + 2, finishedAt, failureCode: null });
    expect(publishUnifiedReport(completed?.integratedResult).coverage).toBe("COMPLETE");
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + 2, component: first, execution: execution(target.analysisId, first), now: finishedAt })).toBe(false);
    expect(await repository.findIntegratedById(target)).toEqual(completed);
  });

  it("dos conexiones/escrituras concurrentes CAS no pierden contribuciones al reintentar", async () => {
    const { target, revision } = await processing();
    const results = await Promise.all((["echonext", "e022"] as const).map(component => repository.finishIntegratedComponent({
      ...target, expectedRevision: revision, component, execution: execution(target.analysisId, component), now: finishedAt,
    })));
    expect(results.filter(Boolean)).toHaveLength(1);
    const component = results[0] ? "e022" : "echonext";
    const waiting = await repository.findIntegratedById(target);
    expect(waiting).toMatchObject({ status: "PROCESSING", revision: revision + 1 });
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component, execution: execution(target.analysisId, component), now: finishedAt })).toBe(false);
    expect(await repository.findIntegratedById(target)).toEqual(waiting);
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + 1, component, execution: execution(target.analysisId, component), now: finishedAt })).toBe(true);
    expect(publishUnifiedReport((await repository.findIntegratedById(target))?.integratedResult)).toMatchObject({ coverage: "COMPLETE" });
  });

  it.each([false, true])("termina parcial o sin informe: ambos fallidos=%s", async (allFailed) => {
    const { target, revision } = await processing();
    for (const [offset, component] of (["e022", "echonext"] as const).entries()) {
      expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + offset, component,
        execution: execution(target.analysisId, component, allFailed || component === "echonext"), now: finishedAt })).toBe(true);
    }
    const terminal = await repository.findIntegratedById(target);
    expect(terminal).toMatchObject({ status: allFailed ? "FAILED" : "COMPLETED", failureCode: allFailed ? "INTERNAL" : null, revision: revision + 2 });
    const publication = publishUnifiedReport(terminal?.integratedResult);
    expect(publication.coverage).toBe(allFailed ? "NONE" : "PARTIAL");
    if (allFailed) expect(publication).not.toHaveProperty("contributions");
    else expect(publication).toMatchObject({ contributions: [{ component: "e022", execution: execution(target.analysisId, "e022") }] });
  });

  it("rechaza otra clínica, documento inválido y capacidad omitida sin cambiar revisión/datos", async () => {
    const { target, revision, world } = await processing(false);
    const before = await repository.findIntegratedById(target);
    const other = { ...target, tenantId: world.tenantB.id, expectedRevision: revision };
    expect(await repository.claimIntegrated({ ...other, startedAt })).toBe(false);
    expect(await repository.startIntegratedComponent({ ...other, component: "e022", startedAt, preprocessingReference: null })).toBe(false);
    expect(await repository.finishIntegratedComponent({ ...other, component: "e022", execution: execution(target.analysisId, "e022"), now: finishedAt })).toBe(false);
    expect(await repository.expireIntegrated({ ...other, now: new Date(startedAt.getTime() + 120_000) })).toBe(false);
    expect(await repository.expireIntegratedStale({ ...other, now: new Date(startedAt.getTime() + 120_000) })).toBe(0);
    expect(await repository.startIntegratedComponent({ ...target, expectedRevision: revision, component: "echonext", startedAt, preprocessingReference: null })).toBe(false);
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "echonext", execution: execution(target.analysisId, "echonext"), now: finishedAt })).toBe(false);
    await expect(repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "e022", execution: { ...execution(target.analysisId, "e022"), analysisId: "other" }, now: finishedAt })).rejects.toThrow(new InvalidUnifiedReportError());
    expect(await repository.findIntegratedById(target)).toEqual(before);
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "e022", execution: execution(target.analysisId, "e022"), now: finishedAt })).toBe(true);
    expect(publishUnifiedReport((await repository.findIntegratedById(target))?.integratedResult).coverage).toBe("PARTIAL");
  });

  it("30 s conserva un éxito y rechaza late outcome; 120 s libera pedido pendiente", async () => {
    const { target, revision, input, scope } = await processing();
    await repository.finishIntegratedComponent({ ...target, expectedRevision: revision, component: "e022", execution: execution(target.analysisId, "e022"), now: finishedAt });
    const now = new Date(startedAt.getTime() + 30_000);
    const before = await repository.findIntegratedById(target);
    expect(await repository.finishIntegratedComponent({ ...target, expectedRevision: revision + 1, component: "echonext", execution: { ...execution(target.analysisId, "echonext"), finishedAt: now.toISOString() }, now })).toBe(false);
    expect(await repository.findIntegratedById(target)).toEqual(before);
    expect(await repository.expireIntegratedStale({ ...scope, now: new Date(now.getTime() - 1) })).toBe(0);
    expect(await repository.expireIntegratedStale({ ...scope, now })).toBe(1);
    const terminal = await repository.findIntegratedById(target);
    expect(terminal).toMatchObject({ status: "COMPLETED", revision: revision + 2 });
    expect(publishUnifiedReport(terminal?.integratedResult)).toMatchObject({ coverage: "PARTIAL", contributions: [{ component: "e022", execution: execution(target.analysisId, "e022") }] });
    const integratedResult = createUnifiedReport({ analysisId: "10000000-0000-4000-8000-000000000011", studyId: scope.studyId, requestedByUserId: input.requestedByUserId, requestedAt: input.integratedResult.requestedAt, capabilities: input.integratedResult.capabilities });
    await repository.insertIntegratedPending({ ...input, integratedResult });
    expect(await repository.expireIntegratedStale({ ...scope, now: new Date("2026-11-16T10:01:59.999Z") })).toBe(0);
    expect(await repository.expireIntegratedStale({ ...scope, now: new Date("2026-11-16T10:02:00.000Z") })).toBe(1);
    const expiredTarget = { ...scope, analysisId: integratedResult.analysisId };
    const expired = await repository.findIntegratedById(expiredTarget);
    expect(expired).toMatchObject({ status: "FAILED", revision: 1, failureCode: "TIMEOUT" });
    expect(await repository.claimIntegrated({ ...expiredTarget, expectedRevision: 1, startedAt: now })).toBe(false);
    expect(await repository.findIntegratedById(expiredTarget)).toEqual(expired);
    await expect(repository.insertPending({ ...scope, requestedByUserId: input.requestedByUserId })).resolves.toMatchObject({ status: "PENDING" });
  });
});

describe("pedido integrado sobre el esquema migrado (ejecución humana pendiente)", () => {
  it("persiste la instantánea completa y aísla lectura/transiciones por tenant", async () => {
    const { world, scope, input } = await setup();
    const pending = await repository.insertIntegratedPending(input);
    expect(pending).toMatchObject({ kind: "ECG_UNIFIED_V1", revision: 0, status: "PENDING", integratedResult: input.integratedResult });
    expect(await repository.findIntegratedById({ ...scope, analysisId: pending.id })).toEqual(pending);
    const other = { ...scope, tenantId: world.tenantB.id, analysisId: pending.id };
    expect(await repository.findIntegratedById(other)).toBeNull();
    expect(await repository.claim({ ...other, startedAt: new Date() })).toBe(false);
    expect(await repository.fail({ ...other, failureCode: "INTERNAL", finishedAt: new Date() })).toBe(false);
    expect(await repository.listByStudy(scope)).toEqual([]);
    expect(await repository.findIntegratedById({ ...scope, analysisId: pending.id })).toEqual(pending);
  });

  it("la FK compuesta rechaza tenant distinto sin insertar ni consumir el pedido", async () => {
    const { world, input } = await setup();
    await expectRejectedBy(repository.insertIntegratedPending({ ...input, tenantId: world.tenantB.id }), "analyses_tenant_id_study_id_fkey");
    expect(await prismaClient.analysis.count()).toBe(0);
    await expect(repository.insertIntegratedPending(input)).resolves.toMatchObject({ revision: 0 });
  });

  it("el índice existente arbitra pedidos legacy e integrados simultáneos", async () => {
    const { scope, input } = await setup();
    const results = await Promise.allSettled([
      repository.insertPending({ ...scope, requestedByUserId: input.requestedByUserId }),
      repository.insertIntegratedPending(input),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find((result) => result.status === "rejected");
    expect(rejected?.status === "rejected" && rejected.reason instanceof AnalysisInProgressError).toBe(true);
    expect(await prismaClient.analysis.count()).toBe(1);
  });

  it("el default legacy y su DTO siguen sin documento integrado", async () => {
    const { scope, input } = await setup();
    const legacy = await repository.insertPending({ ...scope, requestedByUserId: input.requestedByUserId });
    expect(legacy).not.toHaveProperty("integratedResult");
    expect(legacy).not.toHaveProperty("kind");
    expect(await prismaClient.analysis.findFirstOrThrow()).toMatchObject({ kind: "LEGACY_ECHONEXT", integratedResult: null, revision: 0 });
  });

  it.each([null, "null", "{}", '{"schemaVersion":"ecg-unified.v1"}'])("el CHECK rechaza SQL/JSON null o claves ausentes: %s", async (document) => {
    const { scope, input } = await setup();
    await expectRejectedBy(prismaClient.$executeRaw`
      INSERT INTO analyses (id, tenant_id, study_id, requested_by_user_id, kind, integrated_result)
      VALUES (${input.integratedResult.analysisId}::uuid, ${scope.tenantId}::uuid, ${scope.studyId}::uuid,
        ${input.requestedByUserId}::uuid, 'ECG_UNIFIED_V1', ${document}::jsonb)
    `, "analyses_kind_document_check");
    expect(await prismaClient.analysis.count()).toBe(0);
  });

  it("la revisión negativa se rechaza y el documento legacy no acepta JSON", async () => {
    const { scope, input } = await setup();
    const pending = await repository.insertIntegratedPending(input);
    await expectRejectedBy(prismaClient.$executeRaw`
      UPDATE analyses SET revision = -1 WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${pending.id}::uuid
    `, "analyses_revision_check");
    expect(await repository.findIntegratedById({ ...scope, analysisId: pending.id })).toMatchObject({ revision: 0 });
    await expectRejectedBy(prismaClient.$executeRaw`
      UPDATE analyses SET kind = 'LEGACY_ECHONEXT' WHERE tenant_id = ${scope.tenantId}::uuid AND id = ${pending.id}::uuid
    `, "analyses_kind_document_check");
  });
});
