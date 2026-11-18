import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { IntegratedAnalysisSection } from "@/app/(dashboard)/_studies/_components/analysis/integrated-analysis-section";
import { createUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
const mocks = vi.hoisted(() => ({ request: vi.fn(), read: vi.fn(), refresh: vi.fn(), replace: vi.fn() }));
vi.mock("@/app/(dashboard)/_studies/_actions/request-integrated-analysis", () => ({ requestIntegratedAnalysisAction: mocks.request }));
vi.mock("@/app/(dashboard)/_studies/_actions/get-integrated-analysis", () => ({ getIntegratedAnalysisAction: mocks.read }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh, replace: mocks.replace }) }));
const STUDY = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const ANALYSIS = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60";
function publication(status: "PENDING" | "COMPLETED" | "FAILED" = "PENDING") {
  const time = "2026-11-16T12:00:00.000Z";
  const base = createUnifiedReport({ analysisId: ANALYSIS, studyId: STUDY, requestedByUserId: "PRIVATE_REQUESTER", requestedAt: time, capabilities: { e022: { status: "AVAILABLE" }, echonext: { status: "NOT_AVAILABLE", reason: "Mini no disponible" } } });
  return publishUnifiedReport(status === "PENDING" ? base : { ...base, components: { e022: { ...base.components.e022, status, startedAt: time, finishedAt: time, ...(status === "COMPLETED" ? { modelName: "E022", modelVersion: "v-test", preprocessingReference: "prep-test", result: { target: "lvef_lte_45", score: 0.7234 } } : { failureCode: "TIMEOUT" }) } } });
}
function deferred<T>() { let resolve: (value: T) => void = () => { throw new Error("not ready"); }; const promise = new Promise<T>((done) => { resolve = done; }); return { promise, resolve }; }
async function tick(ms = 0) { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); }
beforeEach(() => { vi.resetAllMocks(); vi.useFakeTimers(); mocks.request.mockResolvedValue({ ok: true, report: publication() }); mocks.read.mockResolvedValue({ ok: true, report: publication() }); });
afterEach(() => { vi.useRealTimers(); });
describe("panel PDF con pedido explícito y consulta real", () => {
  it("abrir el estudio sin id no pide ni ejecuta nada; exige una acción explícita", () => {
    render(<IntegratedAnalysisSection studyId={STUDY} />);
    expect(screen.getByRole("button", { name: "Analizar estudio" })).toHaveProperty("disabled", false);
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("pedido, WAITING, sondeo y PARTIAL real sin inferencia fabricada", async () => {
    render(<IntegratedAnalysisSection studyId={STUDY} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizar estudio" })); await tick();
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith(STUDY);
    expect(screen.getByText("Analizando el estudio…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hay un análisis en curso" })).toHaveProperty("disabled", true);
    expect(mocks.replace).toHaveBeenCalledWith(`/studies/${STUDY}?analysisId=${ANALYSIS}`, { scroll: false });
    expect(screen.queryByText("0,7234")).toBeNull();
    mocks.read.mockResolvedValueOnce({ ok: true, report: publication("COMPLETED") });
    await tick(3000);
    expect(screen.getByText("Informe parcial")).toBeTruthy(); expect(screen.getByText("0,7234")).toBeTruthy();
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    const reads = mocks.read.mock.calls.length; await tick(12000); expect(mocks.read).toHaveBeenCalledTimes(reads);
  });
  it("mantiene deshabilitado el pedido durante la promesa y sanitiza un rechazo de transporte", async () => {
    const pending = deferred<unknown>(); mocks.request.mockReturnValueOnce(pending.promise);
    render(<IntegratedAnalysisSection studyId={STUDY} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizar estudio" })); await tick();
    expect(screen.getByRole("button", { name: "Pidiendo el análisis…" })).toHaveProperty("disabled", true);
    await act(async () => { pending.resolve({ ok: false, code: "MODEL_UNAVAILABLE", message: "El análisis no está disponible en este momento. Probá de nuevo más tarde." }); });
    expect(screen.getByRole("alert").textContent).toContain("El análisis no está disponible");
    expect(mocks.read).not.toHaveBeenCalled(); expect(mocks.replace).not.toHaveBeenCalled();
    mocks.request.mockRejectedValueOnce(new Error("PRIVATE_RAW_PAYLOAD"));
    fireEvent.click(screen.getByRole("button", { name: "Analizar estudio" })); await tick();
    expect(screen.getByRole("alert").textContent).toBe("No pudimos pedir el análisis. Probá de nuevo en unos minutos.");
    expect(document.body.textContent).not.toContain("PRIVATE_RAW_PAYLOAD");
  });
  it("un id conocido se consulta, jamás se inicia otro trabajo; NONE permite reintentar", async () => {
    mocks.read.mockResolvedValueOnce({ ok: true, report: publication("FAILED") });
    render(<IntegratedAnalysisSection studyId={STUDY} analysisId={ANALYSIS} />); await tick();
    expect(mocks.read).toHaveBeenCalledExactlyOnceWith(STUDY, ANALYSIS);
    expect(mocks.request).not.toHaveBeenCalled(); expect(screen.getByText("No se obtuvo un resultado válido.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Analizar estudio" })).toHaveProperty("disabled", false);
  });
  it("un error de lectura detiene el sondeo y ofrece recuperación sin otro pedido", async () => {
    mocks.read.mockResolvedValueOnce({ ok: false, code: "UNAVAILABLE", message: "No pudimos cargar el análisis. Probá de nuevo en unos minutos." });
    render(<IntegratedAnalysisSection studyId={STUDY} analysisId={ANALYSIS} />); await tick();
    expect(screen.getByRole("alert").textContent).toContain("No pudimos cargar el análisis");
    await tick(9000); expect(mocks.read).toHaveBeenCalledTimes(1);
    mocks.read.mockResolvedValueOnce({ ok: true, report: publication("COMPLETED") });
    fireEvent.click(screen.getByRole("button", { name: "Actualizar informe" })); await tick();
    expect(screen.getByText("Informe parcial")).toBeTruthy(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("rechazo de transporte en lectura solo muestra error fijo", async () => {
    mocks.read.mockRejectedValueOnce(new Error("PRIVATE_RAW_PAYLOAD"));
    render(<IntegratedAnalysisSection studyId={STUDY} analysisId={ANALYSIS} />); await tick();
    expect(screen.getByRole("alert").textContent).toBe("No pudimos cargar el análisis. Probá de nuevo en unos minutos.");
    expect(document.body.textContent).not.toContain("PRIVATE_RAW_PAYLOAD");
  });
  it("desmontar limpia temporizador y descarta respuestas tardías", async () => {
    const pending = deferred<unknown>(); mocks.read.mockReturnValueOnce(pending.promise);
    const view = render(<IntegratedAnalysisSection studyId={STUDY} analysisId={ANALYSIS} />); await tick(); view.unmount();
    await act(async () => { pending.resolve({ ok: true, report: publication("COMPLETED") }); });
    await tick(9000); expect(mocks.read).toHaveBeenCalledTimes(1); expect(mocks.refresh).not.toHaveBeenCalled();
  });
  it("cambiar de estudio descarta el pedido anterior aunque responda tarde", async () => {
    const pending = deferred<unknown>(); mocks.request.mockReturnValueOnce(pending.promise);
    const view = render(<IntegratedAnalysisSection studyId={STUDY} />);
    fireEvent.click(screen.getByRole("button", { name: "Analizar estudio" })); await tick();
    view.rerender(<IntegratedAnalysisSection studyId="other-study" />);
    await act(async () => { pending.resolve({ ok: true, report: publication("COMPLETED") }); });
    expect(screen.queryByText("Informe parcial")).toBeNull(); expect(mocks.replace).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
  });
  it("desmontar durante WAITING cancela el siguiente sondeo", async () => {
    const view = render(<IntegratedAnalysisSection studyId={STUDY} analysisId={ANALYSIS} />); await tick(); view.unmount();
    await tick(9000); expect(mocks.read).toHaveBeenCalledTimes(1);
  });
});
