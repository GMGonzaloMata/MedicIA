import { beforeEach, describe, expect, it } from "vitest";

import { StudyInUseError } from "@/modules/studies/domain/study-errors";

import { createAnalysisWorld } from "../../support/analysis-world";
import { prismaClient, resetDatabase } from "../../support/database";

beforeEach(resetDatabase);

describe("eliminar un estudio con análisis", () => {
  it("con un análisis en curso lanza StudyInUseError y no borra nada", async () => {
    const w = await createAnalysisWorld();

    await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });

    await expect(w.deleteStudy({ actor: w.actors.p1, studyId: w.study.id })).rejects.toBeInstanceOf(StudyInUseError);
    expect(await prismaClient.study.count()).toBe(1);
    expect(await prismaClient.analysis.count()).toBe(1);
  });

  it("con análisis completados o fallidos elimina el estudio y la cascada elimina todos sus análisis", async () => {
    const w = await createAnalysisWorld();

    await (await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id })).run?.();
    await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id }).then(({ analysis }) =>
      prismaClient.analysis.update({
        where: { id: analysis.id },
        data: { status: "FAILED", failureCode: "INTERNAL", finishedAt: new Date() },
      }),
    );
    expect(await prismaClient.analysis.count()).toBe(2);

    await w.deleteStudy({ actor: w.actors.p1, studyId: w.study.id });

    expect(await prismaClient.study.count()).toBe(0);
    expect(await prismaClient.analysis.count()).toBe(0);
  });

  it("un análisis vencido no bloquea la eliminación", async () => {
    const w = await createAnalysisWorld();
    const { analysis } = await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });

    await prismaClient.analysis.update({
      where: { id: analysis.id },
      data: { requestedAt: new Date(Date.now() - 10 * 60_000) },
    });

    await expect(w.deleteStudy({ actor: w.actors.p1, studyId: w.study.id })).resolves.toBeDefined();
    expect(await prismaClient.analysis.count()).toBe(0);
  });
});
