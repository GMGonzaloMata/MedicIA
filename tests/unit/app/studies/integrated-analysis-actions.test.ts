// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActionAccess } from "@/app/_lib/access";
import { AnalysisInProgressError, AnalysisNotFoundError, ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import { PdfExtractionError } from "@/modules/studies/application/ports/out/pdf-extraction";
import { createUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";

const mocks = vi.hoisted(() => ({ access: vi.fn(), request: vi.fn(), query: vi.fn(), upload: vi.fn(), queryFactory: vi.fn(), after: vi.fn(), revalidate: vi.fn(), redirect: vi.fn() }));
vi.mock("@/app/_lib/access", () => ({ requireClinicContextForAction: mocks.access }));
// La pantalla conoce solo las raíces de composición, nunca factories de infraestructura.
vi.mock("@/modules/analyses/composition", () => ({ requestConfiguredIntegratedAnalysis: mocks.request, createIntegratedReportQuery: mocks.queryFactory }));
vi.mock("@/modules/studies/composition", () => ({ uploadConfiguredPdfStudy: mocks.upload }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { requestIntegratedAnalysisAction } from "@/app/(dashboard)/_studies/_actions/request-integrated-analysis";
import { getIntegratedAnalysisAction } from "@/app/(dashboard)/_studies/_actions/get-integrated-analysis";
import { uploadPdfStudyAction } from "@/app/(dashboard)/_studies/_actions/upload-pdf-study";

const STUDY = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const ANALYSIS = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60";
const PATIENT = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e61";
const report = publishUnifiedReport(createUnifiedReport({ analysisId: ANALYSIS, studyId: STUDY, requestedByUserId: "private-requester", requestedAt: "2026-11-16T12:00:00.000Z", capabilities: { e022: { status: "AVAILABLE" }, echonext: { status: "NOT_AVAILABLE", reason: "Mini no habilitado" } } }));
const forbidden = { ok: false, code: "NOT_FOUND", message: "No tenés acceso a este estudio." };
function ready(kind: "PATIENT" | "DOCTOR" | "ADMIN" = "PATIENT"): ActionAccess {
  return { isAuthorized: true, context: { status: "ready", user: { id: "server-user", email: "synthetic@example.test", fullName: "Sintético", isPlatformAdmin: false }, clinic: { tenantId: "server-tenant", tenantName: "Sintética", relationship: kind === "PATIENT" ? { kind, patientId: PATIENT } : { kind: "STAFF", membershipId: "server-membership", isDoctor: kind === "DOCTOR", isClinicAdmin: kind === "ADMIN" } } } };
}
let run: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks(); mocks.access.mockResolvedValue(ready());
  run = vi.fn(async () => undefined);
  mocks.queryFactory.mockReturnValue(mocks.query);
  mocks.request.mockResolvedValue({ analysis: report, run }); mocks.query.mockResolvedValue(report);
  mocks.upload.mockResolvedValue({ studyId: STUDY, number: 1 });
  mocks.redirect.mockImplementation((path: string) => { throw new Error(`NEXT_REDIRECT:${path}`); });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
describe("acciones del informe integrado", () => {
  it("deriva actor del servidor, pide explícitamente el informe y programa sin ejecutar", async () => {
    expect(await requestIntegratedAnalysisAction(STUDY)).toEqual({ ok: true, report });
    expect(mocks.request).toHaveBeenCalledExactlyOnceWith({ actor: { kind: "PATIENT", tenantId: "server-tenant", userId: "server-user", patientId: PATIENT }, studyId: STUDY, capability: "ECG_UNIFIED_V1" });
    expect(mocks.after).toHaveBeenCalledExactlyOnceWith(run); expect(run).not.toHaveBeenCalled();
    expect(mocks.revalidate).toHaveBeenCalledExactlyOnceWith(`/studies/${STUDY}`);
    expect(JSON.stringify(await getIntegratedAnalysisAction(STUDY, ANALYSIS))).not.toMatch(/private-requester|server-tenant|predict|extraction/);
    await mocks.after.mock.calls[0]?.[0](); expect(run).toHaveBeenCalledTimes(1);
  });
  it("la consulta no construye modelos, no programa trabajos ni revalida", async () => {
    expect(await getIntegratedAnalysisAction(STUDY, ANALYSIS)).toEqual({ ok: true, report });
    expect(mocks.query).toHaveBeenCalledExactlyOnceWith({ actor: { kind: "PATIENT", tenantId: "server-tenant", userId: "server-user", patientId: PATIENT }, studyId: STUDY, analysisId: ANALYSIS });
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("conserva el actor médico del contexto autenticado", async () => {
    mocks.access.mockResolvedValue(ready("DOCTOR")); await requestIntegratedAnalysisAction(STUDY);
    expect(mocks.request.mock.calls[0]?.[0].actor).toEqual({ kind: "DOCTOR", tenantId: "server-tenant", userId: "server-user", membershipId: "server-membership" });
  });
  it.each(["anonymous", "no-clinic", "ADMIN"])("%s no construye servicios, consulta ni programa", async (kind) => {
    mocks.access.mockResolvedValue(kind === "ADMIN" ? ready("ADMIN") : { isAuthorized: false, reason: kind });
    expect(await requestIntegratedAnalysisAction(STUDY)).toEqual(forbidden);
    expect(await getIntegratedAnalysisAction(STUDY, ANALYSIS)).toEqual(forbidden);
    for (const effect of [mocks.request, mocks.queryFactory, mocks.query, mocks.upload, mocks.after, mocks.revalidate, run]) expect(effect).not.toHaveBeenCalled();
  });
  it.each(["", "not-a-uuid", { tenantId: "client", studyId: STUDY }])("rechaza referencia mal formada sin efectos (%s)", async (id) => {
    expect(await requestIntegratedAnalysisAction(id)).toEqual(forbidden);
    expect(await getIntegratedAnalysisAction(id, ANALYSIS)).toEqual(forbidden);
    expect(await getIntegratedAnalysisAction(STUDY, id)).toEqual(forbidden);
    expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.queryFactory).not.toHaveBeenCalled(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("fábrica ausente es indisponibilidad explícita, nunca fake o trabajo programado", async () => {
    mocks.request.mockRejectedValueOnce(new ModelInferenceError("MODEL_UNAVAILABLE"));
    expect(await requestIntegratedAnalysisAction(STUDY)).toEqual({ ok: false, code: "MODEL_UNAVAILABLE", message: "El análisis no está disponible en este momento. Probá de nuevo más tarde." });
    expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it.each([
    [new AnalysisNotFoundError(), forbidden],
    [new AnalysisInProgressError(), { ok: false, code: "IN_PROGRESS", message: "Ya hay un análisis en curso para este estudio." }],
    [new ModelInferenceError("INPUT_REJECTED"), { ok: false, code: "INPUT_REJECTED", message: "No pudimos analizar este estudio." }],
    [new Error("RAW_PDF_PRIVATE_KEY_DIAGNOSTIC"), { ok: false, code: "UNAVAILABLE", message: "No pudimos pedir el análisis. Probá de nuevo en unos minutos." }],
  ])("rechazo del pedido devuelve mensaje fijo y no programa (%s)", async (error, expected) => {
    mocks.request.mockRejectedValueOnce(error);
    expect(await requestIntegratedAnalysisAction(STUDY)).toEqual(expected);
    expect(mocks.after).not.toHaveBeenCalled(); expect(run).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
  it.each([new AnalysisNotFoundError(), new Error("RAW_PDF_PRIVATE_KEY_DIAGNOSTIC")])("consulta fallida sanitizada (%s)", async (error) => {
    mocks.query.mockRejectedValueOnce(error);
    expect(await getIntegratedAnalysisAction(STUDY, ANALYSIS)).toEqual(error instanceof AnalysisNotFoundError ? forbidden : { ok: false, code: "UNAVAILABLE", message: "No pudimos cargar el análisis. Probá de nuevo en unos minutos." });
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
});
describe("subida PDF concreta y navegación real", () => {
  function form() { const data = new FormData(); data.set("type", "ECG"); data.set("file", new File(["%PDF-synthetic-only"], "privado.pdf")); data.set("tenantId", "client"); data.set("patientId", STUDY); return data; }
  it("conecta el extractor configurado y navega al estudio guardado, sin iniciar inferencia", async () => {
    await expect(uploadPdfStudyAction(undefined, form())).rejects.toThrow(`NEXT_REDIRECT:/studies/${STUDY}`);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upload.mock.calls[0]?.[0]).toMatchObject({ actor: { tenantId: "server-tenant", userId: "server-user" }, patientId: PATIENT, type: "ECG" });
    expect(mocks.revalidate.mock.calls).toEqual([["/studies"], ["/patients", "layout"]]);
    expect(mocks.after).not.toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  });
  it("sin sesión no construye lector, lee bytes ni navega", async () => {
    mocks.access.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });
    expect(await uploadPdfStudyAction(undefined, form())).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(mocks.upload).not.toHaveBeenCalled(); expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
  it("lector no configurado conserva el error público anterior y no navega ni guarda", async () => {
    mocks.upload.mockRejectedValueOnce(new PdfExtractionError("PDF_EXTRACTION_UNAVAILABLE"));
    expect(await uploadPdfStudyAction(undefined, form())).toEqual({ ok: false, code: "PDF_EXTRACTION_UNAVAILABLE", message: "No pudimos leer el PDF. Probá de nuevo más tarde." });
    expect(mocks.upload).toHaveBeenCalledOnce(); expect(mocks.redirect).not.toHaveBeenCalled(); expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
