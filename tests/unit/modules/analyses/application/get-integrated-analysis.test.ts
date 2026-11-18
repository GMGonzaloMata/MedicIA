// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { IntegratedAnalysisEntry, IntegratedAnalysisRepository } from "@/modules/analyses/application/ports/out/analysis-repository";
import type { IntegratedStudySource } from "@/modules/analyses/application/ports/out/study-source";
import { createGetIntegratedAnalysis } from "@/modules/analyses/application/use-cases/get-integrated-analysis";
import { createUnifiedReport, parseUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
import { patient, sampleProbabilities } from "../../../../support/analysis-fixtures";

const now = new Date("2026-11-16T12:00:00.000Z");
const scope = { tenantId: patient.tenantId, studyId: "study-a", analysisId: "analysis-a" };
function entry(): IntegratedAnalysisEntry {
  const integratedResult = createUnifiedReport({ analysisId: scope.analysisId, studyId: scope.studyId, requestedByUserId: "requester-private", requestedAt: now.toISOString(), capabilities: { e022: { status: "AVAILABLE" }, echonext: { status: "NOT_AVAILABLE", reason: "Mini no habilitado" } } });
  return { id: scope.analysisId, ...scope, requestedByUserId: "requester-private", requestedBy: { kind: "PATIENT" }, requestedAt: now, startedAt: null, finishedAt: null, status: "PENDING", failureCode: null, kind: "ECG_UNIFIED_V1", revision: 0, modelName: null, modelVersion: null, probabilities: null, integratedResult };
}
function setup() {
  let current = entry();
  const authorize = vi.fn<IntegratedStudySource["authorize"]>(async () => ({ status: "ALLOWED", studyId: scope.studyId, patientId: "private-patient" }));
  const events: string[] = [];
  const analyses: Pick<IntegratedAnalysisRepository, "expireIntegratedStale" | "findIntegratedById"> = {
    expireIntegratedStale: vi.fn(async () => { events.push("expire"); return 0; }),
    findIntegratedById: vi.fn(async () => { events.push("read"); return current; }),
  };
  const clock = vi.fn(() => now);
  const get = createGetIntegratedAnalysis({ analyses, studySource: { authorize }, now: clock });
  return { get, analyses, authorize, clock, events, set(value: IntegratedAnalysisEntry) { current = value; } };
}
const input = { actor: patient, studyId: scope.studyId, analysisId: scope.analysisId };
describe("consulta pública de informe integrado", () => {
  it("autoriza antes de vencer y leer, liga toda operación y publica la disponibilidad almacenada", async () => {
    const w = setup();
    expect(await w.get(input)).toEqual(publishUnifiedReport(entry().integratedResult));
    expect(w.authorize).toHaveBeenCalledExactlyOnceWith({ actor: patient, studyId: scope.studyId });
    expect(w.analyses.expireIntegratedStale).toHaveBeenCalledExactlyOnceWith({ tenantId: patient.tenantId, studyId: scope.studyId, now });
    expect(w.analyses.findIntegratedById).toHaveBeenCalledExactlyOnceWith(scope);
    expect(w.events).toEqual(["expire", "read"]);
    expect(JSON.stringify(await w.get(input))).not.toMatch(/requester-private|private-patient|tenantId|revision|integratedResult/);
  });
  it.each(["COMPLETE", "PARTIAL"] as const)("%s solo publica la etiqueta del solicitante del pedido autorizado", async (coverage) => {
    const w = setup();
    const row = entry();
    const time = now.toISOString();
    const execution = { analysisId: row.id, status: "COMPLETED", failureCode: null, startedAt: time, finishedAt: time, modelName: "model-test", modelVersion: "v-test", preprocessingReference: "prep-test" };
    const complete = coverage === "COMPLETE";
    const requestedBy = complete ? { kind: "DOCTOR", fullName: "Dra. Solicitante Sintética" } as const : { kind: "PATIENT" } as const;
    w.set({ ...row, status: "COMPLETED", requestedBy, integratedResult: parseUnifiedReport({
      ...row.integratedResult,
      capabilities: complete ? { ...row.integratedResult.capabilities, echonext: { status: "AVAILABLE" } } : row.integratedResult.capabilities,
      components: { e022: { ...execution, result: { target: "lvef_lte_45", score: 0.7234 } }, ...(complete ? { echonext: { ...execution, result: sampleProbabilities() } } : {}) },
    }) });
    const report = await w.get(input);
    expect(report).toMatchObject({ coverage, requestedBy });
    expect(JSON.stringify(report)).not.toMatch(/requester-private|private-patient|requestedByUserId|tenantId|revision|integratedResult/);
  });
  it.each(["otra clínica", "sin asignación", "inexistente"])("%s no vence ni lee ni consulta el reloj", async () => {
    const w = setup();
    w.authorize.mockResolvedValueOnce({ status: "NO_ACCESS" });
    await expect(w.get(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError", message: "No encontramos el análisis." });
    expect(w.clock).not.toHaveBeenCalled(); expect(w.events).toEqual([]);
    expect(w.analyses.expireIntegratedStale).not.toHaveBeenCalled(); expect(w.analyses.findIntegratedById).not.toHaveBeenCalled();
  });
  it("publica el estado ya vencido, no el resultado previo al barrido", async () => {
    const w = setup(); const old = entry();
    const integratedResult = parseUnifiedReport({ ...old.integratedResult, components: { e022: { ...old.integratedResult.components.e022, status: "FAILED", failureCode: "TIMEOUT", finishedAt: now.toISOString() } } });
    vi.mocked(w.analyses.expireIntegratedStale).mockImplementationOnce(async () => { w.events.push("expire"); w.set({ ...old, status: "FAILED", integratedResult }); return 1; });
    const report = await w.get(input);
    expect(report).toMatchObject({ coverage: "NONE", components: { e022: { status: "FAILED", failureCode: "TIMEOUT" } } });
    expect(report).not.toHaveProperty("requestedBy");
    expect(w.events).toEqual(["expire", "read"]);
  });
  it("un id ausente devuelve el mismo error sin datos clínicos", async () => {
    const w = setup(); vi.mocked(w.analyses.findIntegratedById).mockResolvedValueOnce(null);
    await expect(w.get(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError" });
  });
  it.each(["tenantId", "studyId", "id"] as const)("rechaza una respuesta del puerto ligada a otro %s", async (field) => {
    const w = setup(); w.set({ ...entry(), [field]: "foreign" });
    await expect(w.get(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError" });
  });
  it("rechaza un documento cuyo solicitante no coincide con la fila autorizada", async () => {
    const w = setup(); const row = entry();
    w.set({ ...row, integratedResult: createUnifiedReport({ analysisId: row.id, studyId: row.studyId, requestedByUserId: "other-requester", requestedAt: now.toISOString(), capabilities: row.integratedResult.capabilities }) });
    await expect(w.get(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError", message: "No encontramos el análisis." });
  });
  it("rechaza un documento con identidad de otro pedido aunque la fila coincida", async () => {
    const w = setup(); const row = entry();
    w.set({ ...row, integratedResult: createUnifiedReport({ analysisId: "foreign", studyId: scope.studyId, requestedByUserId: row.requestedByUserId, requestedAt: now.toISOString(), capabilities: row.integratedResult.capabilities }) });
    await expect(w.get(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError" });
  });
});
