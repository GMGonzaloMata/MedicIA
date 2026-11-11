import { describe, expect, it } from "vitest";

import { createGetAnalysis } from "@/modules/analyses/application/use-cases/get-analysis";
import { createHasAnalysisInProgress } from "@/modules/analyses/application/use-cases/has-analysis-in-progress";
import { createListAnalyses } from "@/modules/analyses/application/use-cases/list-analyses";
import { ANALYSIS_STALE_AFTER_MS } from "@/modules/analyses/domain/analysis";
import { AnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

import {
  STUDY_ID,
  TENANT,
  createStudySourceStub,
  doctor,
  otherDoctor,
  otherPatient,
  patient,
  sampleProbabilities,
} from "../../../../support/analysis-fixtures";
import { InMemoryAnalysisRepository } from "../../../../support/in-memory/in-memory-analysis-repository";

const NOW = new Date("2026-11-11T10:00:00Z");

async function setup() {
  const analyses = new InMemoryAnalysisRepository();
  const studySource = createStudySourceStub();
  const now = () => NOW;
  const base = {
    tenantId: TENANT,
    studyId: STUDY_ID,
    requestedByUserId: "user-p1",
  };

  // Uno completado, uno fallido y uno en curso (pedidos en ese orden).
  const first = await analyses.insertPending(base);
  await analyses.claim({
    tenantId: TENANT,
    studyId: STUDY_ID,
    analysisId: first.id,
    startedAt: NOW,
  });
  await analyses.complete({
    tenantId: TENANT,
    studyId: STUDY_ID,
    analysisId: first.id,
    modelName: "m",
    modelVersion: "1",
    probabilities: sampleProbabilities(),
    finishedAt: NOW,
  });
  await analyses.insertFailed({
    ...base,
    failureCode: "MODEL_UNAVAILABLE",
    finishedAt: NOW,
  });
  const third = await analyses.insertPending(base);

  analyses.setRequestedAt(first.id, new Date(NOW.getTime() - 3000));
  analyses.setRequestedAt("analysis-2", new Date(NOW.getTime() - 2000));
  analyses.setRequestedAt(third.id, new Date(NOW.getTime() - 1000));

  return {
    analyses,
    first,
    third,
    list: createListAnalyses({ analyses, studySource, now }),
    get: createGetAnalysis({ analyses, studySource }),
    hasInProgress: createHasAnalysisInProgress({ analyses, now }),
  };
}

describe("listar análisis", () => {
  it("devuelve el historial del más reciente al más antiguo, sin datos internos", async () => {
    const { list } = await setup();

    const items = await list({ actor: doctor, studyId: STUDY_ID });

    expect(items.map((item) => item.status)).toEqual(["PENDING", "FAILED", "COMPLETED"]);
    expect(items[0]).not.toHaveProperty("tenantId");
    expect(items[0]).not.toHaveProperty("probabilities");
  });

  it("marca como fallido al vencido antes de listar", async () => {
    const { list, analyses, third } = await setup();

    analyses.setRequestedAt(third.id, new Date(NOW.getTime() - ANALYSIS_STALE_AFTER_MS - 1));

    const items = await list({ actor: patient, studyId: STUDY_ID });

    expect(items.find((item) => item.id === third.id)).toMatchObject({
      status: "FAILED",
      failureCode: "TIMEOUT",
    });
  });

  it("sin acceso responde igual que con un estudio inexistente", async () => {
    const { list } = await setup();

    await expect(list({ actor: otherPatient, studyId: STUDY_ID })).rejects.toBeInstanceOf(AnalysisNotFoundError);
    await expect(list({ actor: otherDoctor, studyId: STUDY_ID })).rejects.toBeInstanceOf(AnalysisNotFoundError);
    await expect(list({ actor: patient, studyId: "otro" })).rejects.toBeInstanceOf(AnalysisNotFoundError);
  });
});

describe("abrir un análisis", () => {
  it("un completado devuelve las 12 probabilidades en orden", async () => {
    const { get, first } = await setup();

    const result = await get({
      actor: patient,
      studyId: STUDY_ID,
      analysisId: first.id,
    });

    expect(result.status).toBe("COMPLETED");
    expect("probabilities" in result && result.probabilities.map((item) => item.key)).toHaveLength(12);
  });

  it("uno fallido o en curso devuelve solo el resumen", async () => {
    const { get, third } = await setup();

    const failed = await get({
      actor: patient,
      studyId: STUDY_ID,
      analysisId: "analysis-2",
    });
    const pending = await get({
      actor: patient,
      studyId: STUDY_ID,
      analysisId: third.id,
    });

    expect(failed).toMatchObject({
      status: "FAILED",
      failureCode: "MODEL_UNAVAILABLE",
    });
    expect(pending).not.toHaveProperty("probabilities");
  });

  it("uno inexistente, de otro estudio o sin acceso al estudio da el mismo error", async () => {
    const { get, first } = await setup();

    await expect(get({ actor: patient, studyId: STUDY_ID, analysisId: "no-existe" })).rejects.toBeInstanceOf(
      AnalysisNotFoundError,
    );
    await expect(get({ actor: patient, studyId: "otro-estudio", analysisId: first.id })).rejects.toBeInstanceOf(
      AnalysisNotFoundError,
    );
    await expect(get({ actor: otherPatient, studyId: STUDY_ID, analysisId: first.id })).rejects.toBeInstanceOf(
      AnalysisNotFoundError,
    );
  });
});

describe("hay un análisis en curso", () => {
  it("es verdadero con uno pendiente reciente", async () => {
    const { hasInProgress } = await setup();

    await expect(hasInProgress({ tenantId: TENANT, studyId: STUDY_ID })).resolves.toBe(true);
  });

  it("un vencido no cuenta, aunque no se haya marcado como fallido", async () => {
    const { hasInProgress, analyses, third } = await setup();

    analyses.setRequestedAt(third.id, new Date(NOW.getTime() - ANALYSIS_STALE_AFTER_MS - 1));

    await expect(hasInProgress({ tenantId: TENANT, studyId: STUDY_ID })).resolves.toBe(false);
  });

  it("es falso en otra clínica o en otro estudio", async () => {
    const { hasInProgress } = await setup();

    await expect(hasInProgress({ tenantId: "tenant-b", studyId: STUDY_ID })).resolves.toBe(false);
    await expect(hasInProgress({ tenantId: TENANT, studyId: "otro" })).resolves.toBe(false);
  });
});
