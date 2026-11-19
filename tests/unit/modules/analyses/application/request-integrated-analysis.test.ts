// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Prisma } from "../../../../../generated/prisma/client";
import type { IntegratedAnalysisEntry } from "@/modules/analyses/application/ports/out/analysis-repository";
import type { RawEcgCapabilities } from "@/modules/analyses/application/ports/out/raw-ecg-inference";
import type { IntegratedStudySource, StudyExtraction } from "@/modules/analyses/application/ports/out/study-source";
import { createRequestIntegratedAnalysis } from "@/modules/analyses/application/use-cases/request-integrated-analysis";
import { ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import { publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
import { prismaAnalysisRepository as repository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { patient, sampleProbabilities } from "../../../../support/analysis-fixtures";

const db = vi.hoisted(() => ({ create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), updateMany: vi.fn(), count: vi.fn() }));
const connections = vi.hoisted(() => ({ authorize: vi.fn(), readExtraction: vi.fn(), legacyModelFactory: vi.fn() }));
vi.mock("@/infrastructure/database/prisma-client", () => ({ prismaClient: { analysis: db } }));
vi.mock("@/modules/studies/composition", () => ({ getStudiesModule: () => ({ authorizeStudy: connections.authorize, readStudyExtraction: connections.readExtraction }) }));
vi.mock("@/modules/analyses/infrastructure/adapters/create-model-inference", () => ({ createModelInference: connections.legacyModelFactory }));
// Doble CRUD/CAS solamente: las transiciones y publicación se ejecutan en el repositorio real.
type Row = Omit<IntegratedAnalysisEntry, "requestedBy" | "kind" | "integratedResult"> & {
  kind: "LEGACY_ECHONEXT" | "ECG_UNIFIED_V1"; integratedResult: unknown;
  requestedBy: { fullName: string }; study: { patient: { userId: string } };
};
type Where = { tenantId?: string; studyId?: string; id?: string; kind?: string; revision?: number; status?: string | { in: string[] }; requestedAt?: { gte: Date } };
let rows: Row[];
function matches(row: Row, where: Where) {
  return (["tenantId", "studyId", "id", "kind", "revision"] as const).every((key) => where[key] === undefined || row[key] === where[key])
    && (where.status === undefined || (typeof where.status === "string" ? row.status === where.status : where.status.in.includes(row.status)))
    && (!where.requestedAt || row.requestedAt >= where.requestedAt.gte);
}
beforeEach(() => {
  rows = [];
  vi.resetAllMocks();
  db.create.mockImplementation(async ({ data }: { data: Partial<Row> }) => {
    if (rows.some((entry) => entry.studyId === data.studyId && ["PENDING", "PROCESSING"].includes(entry.status))) throw new Prisma.PrismaClientKnownRequestError("synthetic-conflict", { code: "P2002", clientVersion: "test" });
    const entry = { id: "legacy-default-id", kind: "LEGACY_ECHONEXT", integratedResult: null, status: "PENDING", requestedAt: new Date("2026-11-16T10:00:00.000Z"), modelName: null, modelVersion: null, probabilities: null, failureCode: null, startedAt: null, finishedAt: null, revision: 0, requestedBy: { fullName: "Synthetic" }, study: { patient: { userId: patient.userId } }, ...data };
    // El create del adaptador suministra el resto de los campos; no se simula lógica de negocio.
    rows.push(entry as Row);
    return structuredClone(entry);
  });
  db.findFirst.mockImplementation(async ({ where }: { where: Where }) => structuredClone(rows.find((entry) => matches(entry, where)) ?? null));
  db.findMany.mockImplementation(async ({ where }: { where: Where }) => structuredClone(rows.filter((entry) => matches(entry, where))));
  db.count.mockImplementation(async ({ where }: { where: Where }) => rows.filter((entry) => matches(entry, where)).length);
  db.updateMany.mockImplementation(async ({ where, data }: { where: Where; data: Partial<Omit<Row, "revision">> & { revision: { increment: number } } }) => {
    const selected = rows.filter((entry) => matches(entry, where));
    for (const entry of selected) Object.assign(entry, data, { revision: entry.revision + data.revision.increment });
    return { count: selected.length };
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const initialTime = new Date("2026-11-16T10:00:00.000Z");
const studyId = "study-integrated";
const scope = { tenantId: patient.tenantId, studyId };
const input = { actor: patient, studyId, capability: "ECG_UNIFIED_V1" as const };
const miniMissing = { status: "NOT_AVAILABLE", reason: "Preparación Mini no habilitada." } as const;
const e022Only: RawEcgCapabilities = { echonext: miniMissing, e022: { status: "AVAILABLE", preprocessingReference: "e022-prep@verified-test" } };
const both: RawEcgCapabilities = { ...e022Only, echonext: { status: "AVAILABLE", preprocessingReference: "mini-prep@verified-test" } };
function prediction(component: "echonext" | "e022") {
  return { component, modelName: component + "-synthetic", modelVersion: "test-1", preprocessingReference: component === "e022" ? "e022-prep@verified-test" : "mini-prep@verified-test", result: component === "e022" ? { target: "lvef_lte_45", score: 0.72 } : sampleProbabilities() };
}
async function setup(capabilities: RawEcgCapabilities = e022Only) {
  let time = initialTime;
  let ids = 0;
  const events: string[] = [];
  const extraction = await createFakePdfExtraction().extract({ bytes: new TextEncoder().encode("%PDF-synthetic"), signal: new AbortController().signal });
  const authorize = vi.fn<IntegratedStudySource["authorize"]>(async () => ({ status: "ALLOWED", studyId, patientId: "private-patient" }));
  const readExtraction = vi.fn(async (): Promise<StudyExtraction> => { events.push("read"); return { status: "READY", extraction }; });
  const getCapabilities = vi.fn(() => capabilities);
  const predict = vi.fn(async ({ component }: { component: "echonext" | "e022"; signal: AbortSignal }) => prediction(component) as unknown);
  const expire = vi.spyOn(repository, "expireIntegratedStale").mockImplementation(async (args) => { events.push("expire"); return originalExpire(args); });
  const generateId = vi.fn(() => `integrated-${++ids}`);
  const request = createRequestIntegratedAnalysis({ analyses: repository, studySource: { authorize, readExtraction }, rawEcgInference: { getCapabilities, predict }, now: () => time, generateId });
  const read = (analysisId = "integrated-1") => repository.findIntegratedById({ ...scope, analysisId });
  return { request, read, predict, authorize, readExtraction, getCapabilities, generateId, expire, extraction, events, advance(ms: number) { time = new Date(time.getTime() + ms); } };
}
const originalExpire = repository.expireIntegratedStale.bind(repository);
async function requiredEntry(w: Awaited<ReturnType<typeof setup>>, id = "integrated-1") {
  const entry = await w.read(id);
  if (!entry) throw new Error("Missing public entry");
  return entry;
}
async function publication(w: Awaited<ReturnType<typeof setup>>, id = "integrated-1") {
  return publishUnifiedReport((await requiredEntry(w, id)).integratedResult);
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Deferred not initialized"); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

// Cada rechazo observa el puerto de lectura y todos los efectos; no inspecciona las filas del doble.
describe("pedido integrado autorizado, capacidades y vinculación", () => {
  it("crea un solo PENDING, ligado a estudio/solicitante/reloj/id y omite Mini sin ejecución", async () => {
    const w = await setup();
    const result = await w.request(input);
    expect(result?.analysis).toEqual({ analysisId: "integrated-1", studyId, requestedAt: initialTime.toISOString(), capabilities: { echonext: miniMissing, e022: { status: "AVAILABLE" } }, components: { e022: { status: "PENDING", startedAt: null, finishedAt: null, failureCode: null } }, coverage: "WAITING" });
    expect(await w.read()).toMatchObject({ id: "integrated-1", ...scope, requestedByUserId: patient.userId, requestedAt: initialTime, status: "PENDING", revision: 0 });
    expect(w.events).toEqual(["read", "expire"]);
    expect(db.create).toHaveBeenCalledTimes(1);
    expect(w.getCapabilities).toHaveBeenCalledTimes(1);
    expect(w.predict).not.toHaveBeenCalled();
    expect(result?.analysis).not.toHaveProperty("contributions");
    expect((await requiredEntry(w)).integratedResult.components).not.toHaveProperty("echonext");
    expect(await repository.hasInProgress({ ...scope, since: initialTime })).toBe(true);
  });
  it.each(["ajeno", "inexistente", "asignación revocada"])("%s no lee, vence, inserta, genera id ni consulta modelos", async () => {
    const w = await setup();
    w.authorize.mockResolvedValueOnce({ status: "NO_ACCESS" });
    await expect(w.request(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError", message: "No encontramos el análisis." });
    expect(w.readExtraction).not.toHaveBeenCalled();
    expect(w.getCapabilities).not.toHaveBeenCalled();
    expect(w.expire).not.toHaveBeenCalled();
    expect(w.generateId).not.toHaveBeenCalled();
    expect(db.create).not.toHaveBeenCalled();
    expect(w.predict).not.toHaveBeenCalled();
    expect(await w.read()).toBeNull();
  });
  it.each(["NO_ACCESS", "UNSUPPORTED_FORMAT"] as const)("%s al leer rechaza antes de cualquier mutación", async (status) => {
    const w = await setup();
    w.readExtraction.mockResolvedValueOnce({ status });
    await expect(w.request(input)).rejects.toMatchObject(status === "NO_ACCESS" ? { name: "AnalysisNotFoundError", message: "No encontramos el análisis." } : { name: "ModelInferenceError", code: "INPUT_REJECTED", message: "El modelo rechazó los datos del estudio." });
    expect(w.expire).not.toHaveBeenCalled(); expect(w.generateId).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled(); expect(w.predict).not.toHaveBeenCalled(); expect(await w.read()).toBeNull();
  });
  it("sin capacidades no acepta un pedido vacío ni lee archivos/cambia datos", async () => {
    const w = await setup({ echonext: miniMissing, e022: miniMissing });
    await expect(w.request(input)).rejects.toThrow(new ModelInferenceError("MODEL_UNAVAILABLE"));
    expect(w.getCapabilities).toHaveBeenCalledTimes(1); expect(w.readExtraction).not.toHaveBeenCalled(); expect(w.expire).not.toHaveBeenCalled(); expect(w.generateId).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled(); expect(await w.read()).toBeNull(); expect(w.predict).not.toHaveBeenCalled();
  });
  it("una capacidad sin referencia no se anuncia disponible ni produce efectos", async () => {
    const w = await setup();
    w.getCapabilities.mockReturnValueOnce({ ...e022Only, e022: { status: "AVAILABLE", preprocessingReference: "" } });
    await expect(w.request(input)).rejects.toThrow(new ModelInferenceError("MODEL_UNAVAILABLE"));
    expect(w.readExtraction).not.toHaveBeenCalled(); expect(w.expire).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled(); expect(w.generateId).not.toHaveBeenCalled(); expect(w.predict).not.toHaveBeenCalled(); expect(await w.read()).toBeNull();
  });
  it("exige elección explícita de análisis, sin inferencia por carga", async () => {
    const w = await setup();
    // Entrada de runtime deliberadamente ajena al tipo público: verifica la validación, no una elección válida.
    await expect(w.request({ ...input, capability: "OTHER" as "ECG_UNIFIED_V1" })).rejects.toThrow(new ModelInferenceError("INPUT_REJECTED"));
    expect(w.readExtraction).not.toHaveBeenCalled(); expect(w.getCapabilities).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled(); expect(await w.read()).toBeNull();
  });
  it("archivo ausente finaliza todos los disponibles sin llamar inferencia ni fabricar procedencia", async () => {
    const w = await setup(both);
    w.readExtraction.mockResolvedValueOnce({ status: "FILE_UNAVAILABLE" });
    const result = await w.request(input);
    await result?.run();
    expect(await publication(w)).toMatchObject({ coverage: "NONE", components: { echonext: { status: "FAILED", failureCode: "STUDY_FILE_UNAVAILABLE" }, e022: { status: "FAILED", failureCode: "STUDY_FILE_UNAVAILABLE" } } });
    for (const execution of Object.values((await requiredEntry(w)).integratedResult.components)) expect(execution).toMatchObject({ startedAt: null, modelName: null, modelVersion: null, result: null });
    expect(w.predict).not.toHaveBeenCalled();
  });
  it("un legacy que ganó primero bloquea integrado sin alterar su historial/protección de borrado", async () => {
    const w = await setup();
    const legacy = await repository.insertPending({ ...scope, requestedByUserId: patient.userId });
    await expect(w.request(input)).rejects.toMatchObject({ name: "AnalysisInProgressError", message: "Ya hay un análisis en curso para este estudio." });
    expect(await w.read()).toBeNull();
    expect(await repository.findById({ ...scope, analysisId: legacy.id })).toEqual(legacy);
    expect(await repository.listByStudy(scope)).toEqual([legacy]);
    expect(await repository.hasInProgress({ ...scope, since: initialTime })).toBe(true);
    expect(w.predict).not.toHaveBeenCalled();
  });
  it("conserva el arbitraje compartido legacy/integrado y la protección de borrado", async () => {
    const w = await setup();
    const first = await w.request(input);
    await expect(w.request(input)).rejects.toMatchObject({ name: "AnalysisInProgressError", message: "Ya hay un análisis en curso para este estudio." });
    await expect(repository.insertPending({ ...scope, requestedByUserId: patient.userId })).rejects.toMatchObject({ name: "AnalysisInProgressError" });
    expect(await repository.hasInProgress({ ...scope, since: initialTime })).toBe(true);
    expect(w.predict).not.toHaveBeenCalled();
    await first?.run();
    expect(await repository.hasInProgress({ ...scope, since: initialTime })).toBe(false);
    const previous = await w.read();
    await w.request(input);
    expect(await w.read()).toEqual(previous);
    expect(await w.read("integrated-3")).not.toBeNull();
  });
});

describe("ejecución y política de publicación por outcomes reales del puerto inyectado", () => {
  it("E022-only publica PARTIAL con procedencia original y snapshot aunque cambie configuración", async () => {
    const w = await setup();
    const result = await w.request(input);
    w.getCapabilities.mockReturnValue(both);
    await result?.run();
    expect(w.getCapabilities).toHaveBeenCalledTimes(1);
    expect(w.predict).toHaveBeenCalledTimes(1);
    expect(w.predict.mock.calls[0]?.[0]).toMatchObject({ component: "e022", extraction: w.extraction, signal: expect.any(AbortSignal) });
    expect(Object.keys(w.predict.mock.calls[0]?.[0] ?? {}).sort()).toEqual(["component", "extraction", "signal"]);
    const saved = await requiredEntry(w);
    expect(saved).toMatchObject({ status: "COMPLETED", failureCode: null, modelName: null, modelVersion: null, probabilities: null });
    expect(saved.integratedResult.components.e022).toEqual({ analysisId: saved.id, status: "COMPLETED", startedAt: initialTime.toISOString(), finishedAt: initialTime.toISOString(), failureCode: null, modelName: "e022-synthetic", modelVersion: "test-1", preprocessingReference: "e022-prep@verified-test", result: { target: "lvef_lte_45", score: 0.72 } });
    expect(await publication(w)).toMatchObject({ coverage: "PARTIAL", capabilities: { echonext: miniMissing }, contributions: [{ component: "e022", execution: saved.integratedResult.components.e022 }] });
    expect(saved.integratedResult.components).not.toHaveProperty("echonext");
    await result?.run();
    expect(w.predict).toHaveBeenCalledTimes(1);
  });
  it.each(["echonext", "e022"] as const)("espera ambos; %s puede terminar primero sin publicar indicadores", async (first) => {
    const w = await setup(both);
    const replies = { echonext: deferred<unknown>(), e022: deferred<unknown>() };
    w.predict.mockImplementation(({ component }) => replies[component].promise);
    const result = await w.request(input);
    const running = result?.run();
    await vi.waitFor(() => expect(w.predict).toHaveBeenCalledTimes(2));
    replies[first].resolve(prediction(first));
    await vi.waitFor(async () => expect((await requiredEntry(w)).integratedResult.components[first]?.status).toBe("COMPLETED"));
    expect(await publication(w)).toMatchObject({ coverage: "WAITING" });
    expect(await publication(w)).not.toHaveProperty("contributions");
    const second = first === "e022" ? "echonext" : "e022";
    replies[second].resolve(prediction(second));
    await running;
    expect(await publication(w)).toMatchObject({ coverage: "COMPLETE", contributions: [{ component: "echonext", execution: { result: sampleProbabilities() } }, { component: "e022", execution: { result: { target: "lvef_lte_45", score: 0.72 } } }] });
    expect((await requiredEntry(w)).revision).toBe(5);
  });
  it.each(["INPUT_REJECTED", "MODEL_UNAVAILABLE", "TIMEOUT", "INTERNAL"] as const)("fallo %s conserva solo el éxito hermano y no crea resultado del fallido", async (code) => {
    const w = await setup(both);
    w.predict.mockImplementation(async ({ component }) => { if (component === "echonext") throw new ModelInferenceError(code); return prediction(component); });
    await (await w.request(input))?.run();
    expect(await publication(w)).toMatchObject({ coverage: "PARTIAL", components: { echonext: { status: "FAILED", failureCode: code } }, contributions: [{ component: "e022" }] });
    expect((await requiredEntry(w)).integratedResult.components.echonext).toMatchObject({ result: null, modelName: null, modelVersion: null });
  });
  it("ambos fallidos no publican informe y errores arbitrarios no filtran detalles", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const w = await setup(both);
    w.predict.mockRejectedValue(new Error("private-provider-patient-score"));
    await expect((await w.request(input))?.run()).resolves.toBeUndefined();
    expect(await publication(w)).toMatchObject({ coverage: "NONE", components: { echonext: { failureCode: "INTERNAL" }, e022: { failureCode: "INTERNAL" } } });
    expect(await publication(w)).not.toHaveProperty("contributions");
    expect(JSON.stringify(log.mock.calls)).not.toContain("private-provider");
  });
  it.each([
    { ...prediction("e022"), component: "echonext" },
    { ...prediction("e022"), preprocessingReference: "foreign-reference" },
    { ...prediction("e022"), modelVersion: "" },
    { ...prediction("e022"), result: { target: "lvef_lte_45", score: 1.01 } },
    { ...prediction("e022"), result: { target: "lvef_lte_45", score: NaN } },
    { ...prediction("e022"), result: { target: "lvef_lte_45", score: 0.72, fevi: 72 } },
    { ...prediction("e022"), patientId: "private" },
    undefined,
  ])("respuesta inválida %# falla íntegra con INTERNAL", async (reply) => {
    const w = await setup(); w.predict.mockResolvedValueOnce(reply);
    await (await w.request(input))?.run();
    expect(await publication(w)).toMatchObject({ coverage: "NONE", components: { e022: { failureCode: "INTERNAL" } } });
    expect((await requiredEntry(w)).integratedResult.components.e022).toMatchObject({ result: null, modelName: null, modelVersion: null });
    expect(await publication(w)).not.toHaveProperty("contributions");
  });
});

describe("plazos, cancelación y reconciliación CAS acotada", () => {
  it("vence el abandonado a 120s ANTES del nuevo arbitraje, conserva historial y descarta su run tardío", async () => {
    const w = await setup();
    const abandoned = await w.request(input);
    w.advance(120_000);
    const current = await w.request(input);
    expect(await w.read()).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT" });
    expect(await w.read("integrated-2")).toMatchObject({ status: "PENDING" });
    const old = await w.read();
    await abandoned?.run();
    expect(await w.read()).toEqual(old); expect(w.predict).not.toHaveBeenCalled();
    await current?.run();
    expect(await w.read()).toEqual(old); expect(await publication(w, "integrated-2")).toMatchObject({ coverage: "PARTIAL" });
  });
  it("a 119999ms el pedido sigue arbitrando y no ejecuta otro modelo", async () => {
    const w = await setup(); await w.request(input); w.advance(119_999);
    await expect(w.request(input)).rejects.toMatchObject({ name: "AnalysisInProgressError" });
    expect(await w.read()).toMatchObject({ status: "PENDING", revision: 0 }); expect(w.predict).not.toHaveBeenCalled();
  });
  it("inferencia que ignora abort termina a 30s; outcome posterior no cambia TIMEOUT", async () => {
    vi.useFakeTimers();
    const w = await setup(); const late = deferred<unknown>();
    w.predict.mockImplementation(() => late.promise);
    const running = (await w.request(input))?.run();
    await vi.advanceTimersByTimeAsync(0);
    expect(w.predict).toHaveBeenCalledTimes(1);
    w.advance(29_999); await vi.advanceTimersByTimeAsync(29_999);
    expect(await publication(w)).toMatchObject({ coverage: "WAITING" });
    w.advance(1); await vi.advanceTimersByTimeAsync(1); await running;
    expect(w.predict.mock.calls[0]?.[0].signal.aborted).toBe(true);
    expect(await w.read()).toMatchObject({ status: "FAILED", failureCode: "TIMEOUT" });
    const before = await w.read(); late.resolve(prediction("e022")); await vi.advanceTimersByTimeAsync(1);
    expect(await w.read()).toEqual(before); expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["previa", "durante"])("cancelación %s aborta sin clínica ni listeners/timers pendientes", async (scenario) => {
    vi.useFakeTimers(); const w = await setup(); const controller = new AbortController();
    const add = vi.spyOn(controller.signal, "addEventListener");
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    w.predict.mockImplementation(() => new Promise(() => undefined));
    if (scenario === "previa") controller.abort("private-reason");
    const running = (await w.request({ ...input, signal: controller.signal }))?.run();
    await vi.advanceTimersByTimeAsync(0);
    controller.abort("private-reason"); await vi.advanceTimersByTimeAsync(0); await running;
    expect(await publication(w)).toMatchObject({ coverage: "NONE", components: { e022: { failureCode: "TIMEOUT" } } });
    expect(w.predict).toHaveBeenCalledTimes(scenario === "previa" ? 0 : 1); expect(vi.getTimerCount()).toBe(0);
    expect(add).toHaveBeenCalledTimes(scenario === "previa" ? 0 : 1);
    expect(remove).toHaveBeenCalledTimes(scenario === "previa" ? 0 : 1);
    if (scenario === "durante") expect(remove).toHaveBeenCalledWith("abort", add.mock.calls[0]?.[1]);
  });
  it("un éxito previo se conserva al vencer otro en un proceso abandonado", async () => {
    const w = await setup(both);
    const late = deferred<unknown>();
    w.predict.mockImplementation(async ({ component }) => component === "e022" ? prediction(component) : late.promise);
    const running = (await w.request(input))?.run();
    await vi.waitFor(async () => expect((await requiredEntry(w)).integratedResult.components.e022?.status).toBe("COMPLETED"));
    const success = (await requiredEntry(w)).integratedResult.components.e022;
    w.advance(120_000); await w.request(input);
    expect(await publication(w)).toMatchObject({ coverage: "PARTIAL" });
    expect((await requiredEntry(w)).integratedResult.components.e022).toEqual(success);
    const old = await w.read(); late.resolve(prediction("echonext")); await running;
    expect(await w.read()).toEqual(old);
  });
  it("CAS false sin avance termina, no llama inferencia ni gira en bucle", async () => {
    const w = await setup(); const claim = vi.spyOn(repository, "claimIntegrated").mockResolvedValue(false);
    await (await w.request(input))?.run();
    expect(claim).toHaveBeenCalledTimes(1); expect(w.predict).not.toHaveBeenCalled();
    expect(await w.read()).toMatchObject({ status: "PENDING", revision: 0 });
  });
  it("duplicar run concurrente no duplica inferencia ni revive el terminal", async () => {
    const w = await setup(both); const result = await w.request(input);
    await Promise.all([result?.run(), result?.run()]);
    expect(w.predict).toHaveBeenCalledTimes(2); expect(await publication(w)).toMatchObject({ coverage: "COMPLETE" });
  });
  it("run no lanza aunque falle el repositorio, y registra solo un mensaje opaco", async () => {
    const w = await setup(); const result = await w.request(input);
    vi.spyOn(repository, "findIntegratedById").mockRejectedValue(new Error("private-db-detail"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(result?.run()).resolves.toBeUndefined();
    expect(w.predict).not.toHaveBeenCalled(); expect(JSON.stringify(log.mock.calls)).not.toContain("private-db-detail");
  });
});

describe("composición explícita y preservación legacy", () => {
  it("conecta el lector autorizado únicamente mediante composición, de forma perezosa", async () => {
    const { createPdfAnalysisStudySource } = await import("@/modules/analyses/composition");
    const source = createPdfAnalysisStudySource();
    expect(connections.authorize).not.toHaveBeenCalled();
    expect(connections.readExtraction).not.toHaveBeenCalled();
    connections.authorize.mockResolvedValueOnce({ status: "NO_ACCESS" });
    connections.readExtraction.mockResolvedValueOnce({ status: "FILE_UNAVAILABLE" });
    expect(await source.authorize(input)).toEqual({ status: "NO_ACCESS" });
    expect(await source.readExtraction(input)).toEqual({ status: "FILE_UNAVAILABLE" });
    expect(connections.authorize).toHaveBeenCalledExactlyOnceWith(input);
    expect(connections.readExtraction).toHaveBeenCalledExactlyOnceWith(input);
    expect(connections.legacyModelFactory).not.toHaveBeenCalled();
  });
  it("la factory usa solo raw/source inyectados; no configura un fake/endpoint ni llama modelos al construir", async () => {
    const w = await setup();
    const { createIntegratedAnalysesModule } = await import("@/modules/analyses/composition");
    const integratedModule = createIntegratedAnalysesModule({ studySource: { authorize: w.authorize, readExtraction: w.readExtraction }, rawEcgInference: { getCapabilities: w.getCapabilities, predict: w.predict } });
    expect(Object.keys(integratedModule)).toEqual(["requestIntegratedAnalysis"]);
    expect(w.authorize).not.toHaveBeenCalled(); expect(w.predict).not.toHaveBeenCalled(); expect(w.getCapabilities).not.toHaveBeenCalled(); expect(connections.legacyModelFactory).not.toHaveBeenCalled();
    const pending = await integratedModule.requestIntegratedAnalysis(input);
    expect(pending.analysis).toMatchObject({ coverage: "WAITING", capabilities: { echonext: miniMissing } });
    await pending.run();
    expect(w.predict).toHaveBeenCalledTimes(1);
    expect(await repository.findIntegratedById({ ...scope, analysisId: pending.analysis.analysisId })).toMatchObject({ status: "COMPLETED" });
  });
  it("el singleton legacy mantiene sus cuatro comandos y no expone/habilita el pedido integrado", async () => {
    const { getAnalysesModule } = await import("@/modules/analyses/composition");
    connections.legacyModelFactory.mockReturnValue({ predict: vi.fn() });
    const legacy = getAnalysesModule();
    expect(Object.keys(legacy)).toEqual(["requestAnalysis", "listAnalyses", "getAnalysis", "hasAnalysisInProgress"]);
    connections.authorize.mockResolvedValueOnce({ status: "NO_ACCESS" });
    await expect(legacy.requestAnalysis(input)).rejects.toMatchObject({ name: "AnalysisNotFoundError" });
    expect(connections.readExtraction).not.toHaveBeenCalled(); expect(db.create).not.toHaveBeenCalled();
  });
});
