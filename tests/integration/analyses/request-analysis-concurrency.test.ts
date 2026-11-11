import { beforeEach, describe, expect, it } from "vitest";

import { AnalysisInProgressError } from "@/modules/analyses/domain/analysis-errors";
import { prismaAnalysisRepository } from "@/modules/analyses/infrastructure/repositories/prisma-analysis-repository";

import { createAnalysisWorld } from "../../support/analysis-world";
import { prismaClient, resetDatabase } from "../../support/database";
import { buildNpz } from "../../support/npz-builder";

beforeEach(resetDatabase);

describe("pedidos simultáneos de análisis", () => {
  it("varios pedidos sobre el mismo estudio crean exactamente uno y el resto lanza AnalysisInProgressError", async () => {
    const w = await createAnalysisWorld();

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id })),
    );
    const accepted = results.filter((result) => result.status === "fulfilled");
    const rejected = results.filter((result) => result.status === "rejected");

    expect(accepted).toHaveLength(1);
    expect(rejected).toHaveLength(9);
    for (const result of rejected) {
      expect(result.reason).toBeInstanceOf(AnalysisInProgressError);
    }
    expect(await prismaClient.analysis.count()).toBe(1);
  });

  it("varios insertPending simultáneos crean uno solo", async () => {
    const w = await createAnalysisWorld();
    const input = { tenantId: w.tenantA.id, studyId: w.study.id, requestedByUserId: w.actors.p1.userId };

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, () => prismaAnalysisRepository.insertPending(input)),
    );

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await prismaClient.analysis.count()).toBe(1);
  });

  it("estudios distintos no se bloquean entre sí", async () => {
    const w = await createAnalysisWorld();

    await w.uploadStudy({
      actor: w.actors.p1,
      patientId: w.p1.id,
      type: "ECG",
      bytes: new Uint8Array(buildNpz()),
    });
    const [first, second] = await prismaClient.study.findMany({ orderBy: { number: "asc" } });

    const results = await Promise.all([
      w.requestAnalysis({ actor: w.actors.p1, studyId: first!.id }),
      w.requestAnalysis({ actor: w.actors.p1, studyId: second!.id }),
    ]);

    expect(results.map((result) => result.analysis.status)).toEqual(["PENDING", "PENDING"]);
  });

  it("tras completar o fallar se puede pedir otro", async () => {
    const w = await createAnalysisWorld();

    const first = await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });

    await first.run?.();
    expect((await prismaClient.analysis.findFirstOrThrow()).status).toBe("COMPLETED");

    const second = await w.requestAnalysis({ actor: w.actors.doctor1, studyId: w.study.id });

    expect(second.analysis.status).toBe("PENDING");
    await prismaAnalysisRepository.fail({
      tenantId: w.tenantA.id,
      studyId: w.study.id,
      analysisId: second.analysis.id,
      failureCode: "INTERNAL",
      finishedAt: new Date(),
    });

    await expect(w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id })).resolves.toBeDefined();
    expect(await prismaClient.analysis.count()).toBe(3);
  });
});
