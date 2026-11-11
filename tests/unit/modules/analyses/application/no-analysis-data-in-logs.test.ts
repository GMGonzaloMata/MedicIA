import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createRequestAnalysis } from "@/modules/analyses/application/use-cases/request-analysis";
import { ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";

import {
  STUDY_ID,
  createModelStub,
  createStudySourceStub,
  patient,
  samplePrediction,
} from "../../../../support/analysis-fixtures";
import { InMemoryAnalysisRepository } from "../../../../support/in-memory/in-memory-analysis-repository";

// Valores reconocibles en la onda y las variables, y un cuerpo de error externo, que no deben llegar a ningún registro.
const SECRET_SAMPLE = 3.14159;
const SECRET_NAME = "Juan Pérez";
const EXTERNAL_BODY = `cuerpo del error con ${SECRET_NAME} y ${SECRET_SAMPLE}`;

describe("los registros del análisis no llevan datos del estudio", () => {
  let errors: MockInstance<typeof console.error>;
  let warnings: MockInstance<typeof console.warn>;
  let logs: MockInstance<typeof console.log>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ni un análisis completado ni cada tipo de falla dejan probabilidades, valores ni nombres", async () => {
    const waveform = new Float32Array(30_000).fill(Math.fround(SECRET_SAMPLE));
    const tabular = Float32Array.from([1, SECRET_SAMPLE, 0, 0, 0, 0, 0]);
    const behaviors: (() => Promise<ReturnType<typeof samplePrediction>>)[] = [
      async () => samplePrediction(),
      async () => {
        throw new ModelInferenceError("INPUT_REJECTED");
      },
      async () => {
        throw new ModelInferenceError("MODEL_UNAVAILABLE");
      },
      async () => {
        throw new ModelInferenceError("TIMEOUT");
      },
      async () => {
        throw new Error(EXTERNAL_BODY);
      },
    ];

    for (const behavior of behaviors) {
      const request = createRequestAnalysis({
        analyses: new InMemoryAnalysisRepository(),
        studySource: createStudySourceStub({
          status: "READY",
          waveform,
          tabular,
        }),
        modelInference: createModelStub(behavior),
        now: () => new Date(),
      });

      await (await request({ actor: patient, studyId: STUDY_ID })).run?.();
    }

    const lines = [...errors.mock.calls, ...warnings.mock.calls, ...logs.mock.calls].map((call) => call.join(" "));
    const probabilityValues = Object.values(samplePrediction().probabilities).map(String);

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^\[análisis\] falló \([A-Z_]+\) id=[\w-]+$/);
      expect(line).not.toContain(String(SECRET_SAMPLE));
      expect(line).not.toContain(SECRET_NAME);
      expect(line).not.toContain("cuerpo del error");
      for (const value of probabilityValues) {
        expect(line).not.toContain(`=${value}`);
      }
    }
  });
});
