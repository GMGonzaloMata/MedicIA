import { describe, expect, it } from "vitest";

import { toResultOrSummary, isInProgress, type AnalysisEntry } from "@/modules/analyses/domain/analysis";
import { ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import {
  FINDING_KEYS,
  InvalidProbabilitiesError,
  orderProbabilities,
  parseProbabilities,
} from "@/modules/analyses/domain/findings";

import { sampleProbabilities } from "../../../../support/analysis-fixtures";

describe("hallazgos del modelo", () => {
  it("son 12, en el orden del contrato y con el compuesto al final", () => {
    expect(FINDING_KEYS).toHaveLength(12);
    expect(FINDING_KEYS[0]).toBe("lvef_lte_45");
    expect(FINDING_KEYS[11]).toBe("shd");
  });

  it("acepta 12 claves con valores entre 0 y 1, incluidos los extremos", () => {
    const valid = {
      ...sampleProbabilities(),
      ...Object.fromEntries([
        ["lvef_lte_45", 0],
        ["shd", 1],
      ]),
    };

    expect(parseProbabilities(valid)).toEqual(valid);
  });

  it("rechaza claves faltantes, sobrantes y valores inválidos", () => {
    const missing: Record<string, number> = { ...sampleProbabilities() };
    delete missing.shd;
    const cases: unknown[] = [
      missing,
      { ...sampleProbabilities(), extra: 0.5 },
      { ...sampleProbabilities(), shd: Number.NaN },
      { ...sampleProbabilities(), shd: Number.POSITIVE_INFINITY },
      { ...sampleProbabilities(), shd: -0.1 },
      { ...sampleProbabilities(), shd: 1.1 },
      { ...sampleProbabilities(), shd: "0.5" },
      null,
      [],
    ];

    for (const value of cases) {
      expect(() => parseProbabilities(value)).toThrow(InvalidProbabilitiesError);
    }
  });

  it("el mensaje del error no repite los valores recibidos", () => {
    try {
      parseProbabilities({ ...sampleProbabilities(), shd: 9.87654 });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).not.toContain("9.87654");
    }
  });

  it("las ordena según el contrato", () => {
    const ordered = orderProbabilities(sampleProbabilities());

    expect(ordered.map((item) => item.key)).toEqual([...FINDING_KEYS]);
    expect(ordered[0]?.value).toBe(0.05);
  });
});

describe("vistas del análisis", () => {
  const base: AnalysisEntry = {
    id: "a1",
    tenantId: "t1",
    studyId: "s1",
    requestedByUserId: "u1",
    status: "PENDING",
    failureCode: null,
    modelName: null,
    modelVersion: null,
    probabilities: null,
    requestedAt: new Date(0),
    startedAt: null,
    finishedAt: null,
    requestedBy: { kind: "PATIENT" },
  };

  it("un completado devuelve las probabilidades ordenadas y ninguna vista lleva la clínica", () => {
    const view = toResultOrSummary({
      ...base,
      status: "COMPLETED",
      probabilities: sampleProbabilities(),
    });

    expect(view.status).toBe("COMPLETED");
    expect("probabilities" in view && view.probabilities).toHaveLength(12);
    expect(view).not.toHaveProperty("tenantId");
    expect(view).not.toHaveProperty("requestedByUserId");
  });

  it("los demás estados devuelven solo el resumen", () => {
    expect(toResultOrSummary(base)).not.toHaveProperty("probabilities");
  });

  it("solo PENDING y PROCESSING están en curso", () => {
    expect(["PENDING", "PROCESSING", "COMPLETED", "FAILED"].map((status) => isInProgress(status as never))).toEqual([
      true,
      true,
      false,
      false,
    ]);
  });

  it("el error del modelo tiene un mensaje fijo por código", () => {
    expect(new ModelInferenceError("TIMEOUT").message).toBe("El modelo tardó demasiado en responder.");
    expect(new ModelInferenceError("INTERNAL").code).toBe("INTERNAL");
  });
});
