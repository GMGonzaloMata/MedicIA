import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createRequestAnalysis } from "@/modules/analyses/application/use-cases/request-analysis";
import { ANALYSIS_STALE_AFTER_MS } from "@/modules/analyses/domain/analysis";
import {
  AnalysisInProgressError,
  AnalysisNotFoundError,
  ModelInferenceError,
} from "@/modules/analyses/domain/analysis-errors";

import {
  STUDY_ID,
  TENANT,
  createModelStub,
  createStudySourceStub,
  doctor,
  otherDoctor,
  otherPatient,
  patient,
  samplePrediction,
} from "../../../../support/analysis-fixtures";
import { InMemoryAnalysisRepository } from "../../../../support/in-memory/in-memory-analysis-repository";

function setup(
  options: {
    model?: ReturnType<typeof createModelStub>;
    source?: ReturnType<typeof createStudySourceStub>;
  } = {},
) {
  let current = new Date("2026-11-11T10:00:00Z");
  const analyses = new InMemoryAnalysisRepository(() => current);
  const studySource = options.source ?? createStudySourceStub();
  const modelInference = options.model ?? createModelStub();

  const request = createRequestAnalysis({
    analyses,
    studySource,
    modelInference,
    now: () => current,
  });

  return {
    analyses,
    studySource,
    modelInference,
    request,
    advance(milliseconds: number) {
      current = new Date(current.getTime() + milliseconds);
    },
  };
}

describe("pedir un análisis", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("registra el análisis pendiente y, al ejecutarse, lo deja completado con el modelo, la versión y las 12 probabilidades", async () => {
    const { request, analyses, modelInference } = setup();

    const { analysis, run } = await request({
      actor: patient,
      studyId: STUDY_ID,
    });

    expect(analysis.status).toBe("PENDING");
    expect(analysis.requestedBy).toEqual({
      kind: "DOCTOR",
      fullName: "Dra. Pérez",
    });
    expect(run).not.toBeNull();
    expect(modelInference.predict).not.toHaveBeenCalled();

    await run?.();

    const [stored] = analyses.all();

    expect(stored).toMatchObject({
      status: "COMPLETED",
      modelName: "modelo-de-prueba",
      modelVersion: "1.2.3",
    });
    expect(stored?.probabilities).toEqual(samplePrediction().probabilities);
    expect(stored?.startedAt).not.toBeNull();
    expect(stored?.finishedAt).not.toBeNull();
    expect(modelInference.predict).toHaveBeenCalledTimes(1);
  });

  it("el médico con acceso también puede pedirlo", async () => {
    const { request } = setup();

    const { analysis } = await request({ actor: doctor, studyId: STUDY_ID });

    expect(analysis.status).toBe("PENDING");
  });

  it("sin acceso no crea nada, no llama al modelo ni lee el archivo, y da el mismo resultado que un estudio inexistente", async () => {
    const { request, analyses, modelInference, studySource } = setup();

    for (const [actor, studyId] of [
      [otherPatient, STUDY_ID],
      [otherDoctor, STUDY_ID],
      [patient, "inexistente"],
    ] as const) {
      await expect(request({ actor, studyId })).rejects.toBeInstanceOf(AnalysisNotFoundError);
    }

    expect(analyses.all()).toHaveLength(0);
    expect(modelInference.predict).not.toHaveBeenCalled();
    expect(studySource.readModelInput).not.toHaveBeenCalled();
  });

  it("si el archivo del estudio no está disponible queda fallido, sin llamar al modelo", async () => {
    const { request, analyses, modelInference } = setup({
      source: createStudySourceStub({ status: "FILE_UNAVAILABLE" }),
    });

    const { analysis, run } = await request({
      actor: patient,
      studyId: STUDY_ID,
    });

    expect(analysis).toMatchObject({
      status: "FAILED",
      failureCode: "STUDY_FILE_UNAVAILABLE",
    });
    expect(run).toBeNull();
    expect(analyses.all()).toHaveLength(1);
    expect(modelInference.predict).not.toHaveBeenCalled();
  });

  it("un segundo pedido con uno en curso lanza AnalysisInProgressError y no llama al modelo", async () => {
    const { request, analyses } = setup();

    await request({ actor: patient, studyId: STUDY_ID });

    await expect(request({ actor: doctor, studyId: STUDY_ID })).rejects.toBeInstanceOf(AnalysisInProgressError);
    expect(analyses.all()).toHaveLength(1);
  });

  it("terminado el anterior, se puede pedir otro y los anteriores se conservan", async () => {
    const { request, analyses } = setup();

    await (await request({ actor: patient, studyId: STUDY_ID })).run?.();
    await (await request({ actor: patient, studyId: STUDY_ID })).run?.();

    expect(analyses.all().map((entry) => entry.status)).toEqual(["COMPLETED", "COMPLETED"]);
  });

  it.each([
    ["INPUT_REJECTED", new ModelInferenceError("INPUT_REJECTED")],
    ["MODEL_UNAVAILABLE", new ModelInferenceError("MODEL_UNAVAILABLE")],
    ["TIMEOUT", new ModelInferenceError("TIMEOUT")],
    ["INTERNAL", new ModelInferenceError("INTERNAL")],
    ["INTERNAL", new Error("algo inesperado")],
  ])("una falla del modelo deja el análisis fallido con el código %s y run no lanza", async (code, error) => {
    const { request, analyses } = setup({
      model: createModelStub(async () => {
        throw error;
      }),
    });

    const { run } = await request({ actor: patient, studyId: STUDY_ID });

    await expect(run?.()).resolves.toBeUndefined();
    expect(analyses.all()[0]).toMatchObject({
      status: "FAILED",
      failureCode: code,
    });
    expect(analyses.all()[0]?.finishedAt).not.toBeNull();
  });

  it("una respuesta del modelo con probabilidades inválidas queda como falla interna", async () => {
    const { request, analyses } = setup({
      model: createModelStub(async () => ({
        ...samplePrediction(),
        probabilities: { ...samplePrediction().probabilities, shd: 3 },
      })),
    });

    await (await request({ actor: patient, studyId: STUDY_ID })).run?.();

    expect(analyses.all()[0]).toMatchObject({
      status: "FAILED",
      failureCode: "INTERNAL",
      probabilities: null,
    });
  });

  it("run no lanza ni siquiera si falla el repositorio al registrar la falla", async () => {
    const { request, analyses } = setup({
      model: createModelStub(async () => {
        throw new Error("falla");
      }),
    });
    const { run } = await request({ actor: patient, studyId: STUDY_ID });

    vi.spyOn(analyses, "fail").mockRejectedValue(new Error("base caída"));

    await expect(run?.()).resolves.toBeUndefined();
  });

  it("un análisis en curso por más de 2 minutos pasa a fallido con TIMEOUT y se acepta el nuevo", async () => {
    const { request, analyses, advance } = setup();

    await request({ actor: patient, studyId: STUDY_ID });
    advance(ANALYSIS_STALE_AFTER_MS + 1);
    analyses.setRequestedAt("analysis-1", new Date("2026-11-11T10:00:00Z"));

    const { analysis } = await request({ actor: patient, studyId: STUDY_ID });

    expect(analysis.status).toBe("PENDING");
    expect(analyses.all()[0]).toMatchObject({
      status: "FAILED",
      failureCode: "TIMEOUT",
    });
    expect(analyses.all()).toHaveLength(2);
  });

  it("una ejecución tardía de un análisis vencido no pisa su estado", async () => {
    const { request, analyses, advance, modelInference } = setup();
    const { run } = await request({ actor: patient, studyId: STUDY_ID });

    advance(ANALYSIS_STALE_AFTER_MS + 1);
    analyses.setRequestedAt("analysis-1", new Date("2026-11-11T10:00:00Z"));
    await request({ actor: patient, studyId: STUDY_ID });

    await run?.();

    expect(analyses.all()[0]).toMatchObject({
      status: "FAILED",
      failureCode: "TIMEOUT",
    });
    expect(modelInference.predict).not.toHaveBeenCalled();
  });

  it("si venció mientras el modelo respondía, el resultado tardío no lo pisa", async () => {
    const { request, analyses } = setup({
      model: createModelStub(async () => {
        analyses.all()[0]!.status = "FAILED";
        analyses.all()[0]!.failureCode = "TIMEOUT";

        return samplePrediction();
      }),
    });

    await (await request({ actor: patient, studyId: STUDY_ID })).run?.();

    expect(analyses.all()[0]).toMatchObject({
      status: "FAILED",
      failureCode: "TIMEOUT",
      probabilities: null,
    });
  });

  it("el tenant del actor va en toda operación del repositorio", async () => {
    const { request, analyses } = setup();

    await request({ actor: patient, studyId: STUDY_ID });

    expect(analyses.all()[0]?.tenantId).toBe(TENANT);
  });
});
