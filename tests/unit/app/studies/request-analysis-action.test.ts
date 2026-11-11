import { beforeEach, describe, expect, it, vi } from "vitest";

import { AnalysisInProgressError, AnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const analysesModule = vi.hoisted(() => ({ requestAnalysis: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const after = vi.hoisted(() => vi.fn());

vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/server", () => ({ after }));
vi.mock("@/modules/analyses/composition", () => ({ getAnalysesModule: () => analysesModule }));

import { requestAnalysisAction } from "@/app/(dashboard)/_studies/_actions/request-analysis";

const STUDY_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";

function ready(relationship: unknown) {
  return {
    isAuthorized: true,
    context: {
      status: "ready",
      user: { id: "user-1", email: "persona@example.com", fullName: "Persona", isPlatformAdmin: false },
      clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship },
    },
  };
}

function form(fields: Record<string, string>) {
  const formData = new FormData();
  Object.entries(fields).forEach(([name, value]) => formData.set(name, value));

  return formData;
}

const run = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  access.requireClinicContextForAction.mockResolvedValue(ready({ kind: "PATIENT", patientId: "patient-1" }));
  analysesModule.requestAnalysis.mockResolvedValue({ analysis: { id: "a1" }, run });
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("acción de pedir un análisis", () => {
  it("pide con el actor de la sesión, programa la ejecución con after y actualiza la pantalla", async () => {
    const result = await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }));

    expect(result).toEqual({ ok: true });
    expect(analysesModule.requestAnalysis).toHaveBeenCalledWith({
      actor: { kind: "PATIENT", tenantId: "tenant-1", userId: "user-1", patientId: "patient-1" },
      studyId: STUDY_ID,
    });
    expect(after).toHaveBeenCalledWith(run);
    expect(revalidatePath).toHaveBeenCalledWith(`/studies/${STUDY_ID}`);
  });

  it("con run en null no programa nada", async () => {
    analysesModule.requestAnalysis.mockResolvedValue({ analysis: { id: "a1" }, run: null });

    expect(await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }))).toEqual({ ok: true });
    expect(after).not.toHaveBeenCalled();
  });

  it("nunca toma la clínica del formulario", async () => {
    await requestAnalysisAction(undefined, form({ studyId: STUDY_ID, tenantId: "otra" }));

    const call = analysesModule.requestAnalysis.mock.calls[0]?.[0];

    expect(Object.keys(call).sort()).toEqual(["actor", "studyId"]);
    expect(call.actor.tenantId).toBe("tenant-1");
  });

  it("un identificador inválido da el mismo mensaje que un estudio inexistente y no llama al caso de uso", async () => {
    const invalid = await requestAnalysisAction(undefined, form({ studyId: "no-es-uuid" }));

    analysesModule.requestAnalysis.mockRejectedValueOnce(new AnalysisNotFoundError());
    const missing = await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }));

    expect(invalid).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(missing).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect((invalid as { message: string }).message).toBe((missing as { message: string }).message);
    expect(analysesModule.requestAnalysis).toHaveBeenCalledTimes(1);
  });

  it("rechaza sin sesión y al administrador sin rol de médico", async () => {
    access.requireClinicContextForAction.mockResolvedValue({ isAuthorized: false, reason: "anonymous" });
    expect(await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "FORBIDDEN" });

    access.requireClinicContextForAction.mockResolvedValue(
      ready({ kind: "STAFF", membershipId: "m", isClinicAdmin: true, isDoctor: false }),
    );
    expect(await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "FORBIDDEN" });
    expect(analysesModule.requestAnalysis).not.toHaveBeenCalled();
    expect(after).not.toHaveBeenCalled();
  });

  it("traduce uno en curso y una falla genérica, sin registrar datos", async () => {
    analysesModule.requestAnalysis.mockRejectedValueOnce(new AnalysisInProgressError());
    expect(await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }))).toEqual({
      ok: false,
      code: "IN_PROGRESS",
      message: "Ya hay un análisis en curso para este estudio.",
    });

    analysesModule.requestAnalysis.mockRejectedValueOnce(new TypeError("dato 12345"));
    expect(await requestAnalysisAction(undefined, form({ studyId: STUDY_ID }))).toMatchObject({ code: "UNAVAILABLE" });
    expect(
      vi
        .mocked(console.error)
        .mock.calls.map((call) => String(call[0]))
        .join(""),
    ).not.toContain("12345");
    expect(after).not.toHaveBeenCalled();
  });
});
