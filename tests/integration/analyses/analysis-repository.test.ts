import { beforeEach, describe, expect, it } from "vitest";

import { AnalysisInProgressError } from "@/modules/analyses/domain/analysis-errors";
import { prismaAnalysisRepository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";

import { createAnalysisWorld } from "../../support/analysis-world";
import { sampleProbabilities } from "../../support/analysis-fixtures";
import { prismaClient, resetDatabase } from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

async function setup() {
  const world = await createAnalysisWorld();

  return {
    ...world,
    scope: { tenantId: world.tenantA.id, studyId: world.study.id },
    requester: { requestedByUserId: world.actors.p1.userId },
  };
}

describe("repositorio de análisis", () => {
  it("inserta un análisis pendiente con quién lo pidió y lo pasa a completado paso a paso", async () => {
    const w = await setup();

    const pending = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });

    expect(pending).toMatchObject({ status: "PENDING", requestedBy: { kind: "PATIENT" }, probabilities: null });

    expect(await prismaAnalysisRepository.claim({ ...w.scope, analysisId: pending.id, startedAt: new Date() })).toBe(
      true,
    );
    expect(await prismaAnalysisRepository.claim({ ...w.scope, analysisId: pending.id, startedAt: new Date() })).toBe(
      false,
    );
    expect(
      await prismaAnalysisRepository.complete({
        ...w.scope,
        analysisId: pending.id,
        modelName: "modelo",
        modelVersion: "1.0",
        probabilities: sampleProbabilities(),
        finishedAt: new Date(),
      }),
    ).toBe(true);

    const stored = await prismaAnalysisRepository.findById({ ...w.scope, analysisId: pending.id });

    expect(stored).toMatchObject({ status: "COMPLETED", modelName: "modelo", modelVersion: "1.0" });
    expect(stored?.probabilities).toEqual(sampleProbabilities());
  });

  it("las transiciones respetan el estado de origen", async () => {
    const w = await setup();
    const pending = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });
    const complete = (analysisId: string) =>
      prismaAnalysisRepository.complete({
        ...w.scope,
        analysisId,
        modelName: "m",
        modelVersion: "1",
        probabilities: sampleProbabilities(),
        finishedAt: new Date(),
      });

    // Completar desde PENDING no es una transición válida.
    expect(await complete(pending.id)).toBe(false);

    expect(
      await prismaAnalysisRepository.fail({
        ...w.scope,
        analysisId: pending.id,
        failureCode: "MODEL_UNAVAILABLE",
        finishedAt: new Date(),
      }),
    ).toBe(true);
    // Ya fallido: ni reclamar, ni completar, ni fallar de nuevo.
    expect(await prismaAnalysisRepository.claim({ ...w.scope, analysisId: pending.id, startedAt: new Date() })).toBe(
      false,
    );
    expect(await complete(pending.id)).toBe(false);
    expect(
      await prismaAnalysisRepository.fail({
        ...w.scope,
        analysisId: pending.id,
        failureCode: "INTERNAL",
        finishedAt: new Date(),
      }),
    ).toBe(false);
    expect(await prismaAnalysisRepository.findById({ ...w.scope, analysisId: pending.id })).toMatchObject({
      status: "FAILED",
      failureCode: "MODEL_UNAVAILABLE",
    });
  });

  it("failStale pasa a fallido con TIMEOUT solo los en curso anteriores al límite", async () => {
    const w = await setup();
    const old = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });
    const now = new Date();

    await prismaClient.analysis.update({
      where: { id: old.id },
      data: { requestedAt: new Date(now.getTime() - 10 * 60_000) },
    });

    expect(
      await prismaAnalysisRepository.failStale({
        ...w.scope,
        olderThan: new Date(now.getTime() - 120_000),
        finishedAt: now,
      }),
    ).toBe(1);
    expect(await prismaAnalysisRepository.findById({ ...w.scope, analysisId: old.id })).toMatchObject({
      status: "FAILED",
      failureCode: "TIMEOUT",
    });

    const recent = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });

    expect(
      await prismaAnalysisRepository.failStale({
        ...w.scope,
        olderThan: new Date(now.getTime() - 120_000),
        finishedAt: now,
      }),
    ).toBe(0);
    expect(await prismaAnalysisRepository.findById({ ...w.scope, analysisId: recent.id })).toMatchObject({
      status: "PENDING",
    });
  });

  it("lista del más reciente al más antiguo y distingue al paciente de un médico", async () => {
    const w = await setup();
    const first = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });

    await prismaAnalysisRepository.fail({
      ...w.scope,
      analysisId: first.id,
      failureCode: "TIMEOUT",
      finishedAt: new Date(),
    });
    await prismaAnalysisRepository.insertPending({
      ...w.scope,
      requestedByUserId: w.actors.doctor1.userId,
    });

    const list = await prismaAnalysisRepository.listByStudy(w.scope);

    expect(list.map((entry) => entry.status)).toEqual(["PENDING", "FAILED"]);
    expect(list[0]?.requestedBy).toMatchObject({ kind: "DOCTOR" });
    expect(list[1]?.requestedBy).toEqual({ kind: "PATIENT" });
  });

  it("un segundo análisis en curso en el mismo estudio lanza AnalysisInProgressError", async () => {
    const w = await setup();

    await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });

    await expect(prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester })).rejects.toBeInstanceOf(
      AnalysisInProgressError,
    );
  });

  it("con otro tenantId no encuentra, no lista ni modifica nada", async () => {
    const w = await setup();
    const pending = await prismaAnalysisRepository.insertPending({ ...w.scope, ...w.requester });
    const other = { tenantId: w.tenantB.id, studyId: w.study.id };

    expect(await prismaAnalysisRepository.findById({ ...other, analysisId: pending.id })).toBeNull();
    expect(await prismaAnalysisRepository.listByStudy(other)).toEqual([]);
    expect(await prismaAnalysisRepository.claim({ ...other, analysisId: pending.id, startedAt: new Date() })).toBe(
      false,
    );
    expect(
      await prismaAnalysisRepository.fail({
        ...other,
        analysisId: pending.id,
        failureCode: "INTERNAL",
        finishedAt: new Date(),
      }),
    ).toBe(false);
    expect(
      await prismaAnalysisRepository.failStale({
        ...other,
        olderThan: new Date(Date.now() + 60_000),
        finishedAt: new Date(),
      }),
    ).toBe(0);
    expect(await prismaAnalysisRepository.findById({ ...w.scope, analysisId: pending.id })).toMatchObject({
      status: "PENDING",
    });

    // Completar con otra clínica un análisis ya reclamado en la correcta tampoco lo toca.
    await prismaAnalysisRepository.claim({ ...w.scope, analysisId: pending.id, startedAt: new Date() });
    expect(
      await prismaAnalysisRepository.complete({
        ...other,
        analysisId: pending.id,
        modelName: "m",
        modelVersion: "1",
        probabilities: sampleProbabilities(),
        finishedAt: new Date(),
      }),
    ).toBe(false);
    expect(await prismaAnalysisRepository.findById({ ...w.scope, analysisId: pending.id })).toMatchObject({
      status: "PROCESSING",
    });
    expect(await prismaAnalysisRepository.hasInProgress({ ...other, since: new Date(0) })).toBe(false);
    expect(await prismaAnalysisRepository.hasInProgress({ ...w.scope, since: new Date(0) })).toBe(true);
  });

  it("la clave foránea compuesta impide un análisis en una clínica distinta de la del estudio", async () => {
    const w = await setup();

    await expectRejectedBy(
      prismaClient.analysis.create({
        data: { tenantId: w.tenantB.id, studyId: w.study.id, requestedByUserId: w.actors.p1.userId },
      }),
      "analyses_tenant_id_study_id_fkey",
    );
  });
});

describe("restricciones CHECK de la tabla de análisis", () => {
  async function insertRaw(
    w: Awaited<ReturnType<typeof setup>>,
    columns: { status: string; failureCode?: string; probabilities?: string; finishedAt?: boolean },
  ) {
    const finishedAt = columns.finishedAt ? new Date() : null;

    await prismaClient.$executeRaw`
      INSERT INTO analyses (id, tenant_id, study_id, requested_by_user_id, status, failure_code, probabilities, finished_at)
      VALUES (
        gen_random_uuid(), ${w.tenantA.id}::uuid, ${w.study.id}::uuid, ${w.actors.p1.userId}::uuid,
        ${columns.status}::analysis_status, ${columns.failureCode ?? null}::analysis_failure_code,
        ${columns.probabilities ?? null}::jsonb, ${finishedAt}
      )
    `;
  }

  it("rechaza un COMPLETED sin probabilidades", async () => {
    const w = await setup();

    await expectRejectedBy(insertRaw(w, { status: "COMPLETED", finishedAt: true }), "analyses_status_fields_check");
  });

  it("rechaza un FAILED sin código de falla", async () => {
    const w = await setup();

    await expectRejectedBy(insertRaw(w, { status: "FAILED", finishedAt: true }), "analyses_status_fields_check");
  });

  it("rechaza un PENDING con resultado", async () => {
    const w = await setup();

    await expectRejectedBy(
      insertRaw(w, { status: "PENDING", probabilities: JSON.stringify(sampleProbabilities()) }),
      "analyses_status_fields_check",
    );
  });

  it("rechaza probabilidades que no son un objeto", async () => {
    const w = await setup();

    await expectRejectedBy(
      insertRaw(w, { status: "FAILED", failureCode: "INTERNAL", finishedAt: true, probabilities: "[1,2]" }),
      "analyses_probabilities_object_check",
    );
  });

  it("acepta un FAILED con código y fecha de fin", async () => {
    const w = await setup();

    await insertRaw(w, { status: "FAILED", failureCode: "INTERNAL", finishedAt: true });

    expect(await prismaClient.analysis.count()).toBe(1);
  });
});
