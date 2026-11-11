import { beforeEach, describe, expect, it } from "vitest";

import { AnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

import { createAnalysisWorld } from "../../support/analysis-world";
import { createAssignment, prismaClient, resetDatabase } from "../../support/database";

beforeEach(resetDatabase);

describe("acceso a los análisis de un estudio", () => {
  it("el paciente dueño y el médico con asignación vigente piden, listan y abren", async () => {
    const w = await createAnalysisWorld();

    for (const actor of [w.actors.p1, w.actors.doctor1]) {
      const { analysis, run } = await w.requestAnalysis({ actor, studyId: w.study.id });

      await run?.();

      expect(await w.listAnalyses({ actor, studyId: w.study.id })).not.toHaveLength(0);
      expect(await w.getAnalysis({ actor, studyId: w.study.id, analysisId: analysis.id })).toMatchObject({
        status: "COMPLETED",
      });
    }
  });

  it("un paciente ajeno, un médico sin asignación y uno de otra clínica reciben el mismo resultado que un inexistente", async () => {
    const w = await createAnalysisWorld();
    const { analysis, run } = await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });

    await run?.();
    const before = await prismaClient.analysis.count();

    for (const actor of [w.actors.p2, w.actors.doctor2, w.actors.doctorB]) {
      await expect(w.requestAnalysis({ actor, studyId: w.study.id })).rejects.toBeInstanceOf(AnalysisNotFoundError);
      await expect(w.listAnalyses({ actor, studyId: w.study.id })).rejects.toBeInstanceOf(AnalysisNotFoundError);
      await expect(
        w.getAnalysis({ actor, studyId: w.study.id, analysisId: analysis.id }),
      ).rejects.toBeInstanceOf(AnalysisNotFoundError);
    }

    await expect(
      w.requestAnalysis({ actor: w.actors.p1, studyId: "00000000-0000-4000-8000-0000000000ff" }),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);
    expect(await prismaClient.analysis.count()).toBe(before);
  });

  it("leer la entrada del modelo se rechaza igual para quien no tiene acceso al estudio", async () => {
    const w = await createAnalysisWorld();

    for (const actor of [w.actors.p2, w.actors.doctor2, w.actors.doctorB]) {
      expect(await w.studySource.readModelInput({ actor, studyId: w.study.id })).toEqual({ status: "NO_ACCESS" });
    }
    expect(await w.studySource.readModelInput({ actor: w.actors.p1, studyId: w.study.id })).toMatchObject({
      status: "READY",
    });
  });

  it("una asignación terminada quita el acceso y una reiniciada lo devuelve", async () => {
    const w = await createAnalysisWorld();
    const { analysis, run } = await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });

    await run?.();

    await prismaClient.doctorPatientAssignment.updateMany({
      where: { membershipId: w.doctor1.id },
      data: { endedAt: new Date(), endedByUserId: w.adminUser.id },
    });
    await expect(
      w.getAnalysis({ actor: w.actors.doctor1, studyId: w.study.id, analysisId: analysis.id }),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);

    await createAssignment({
      tenantId: w.tenantA.id,
      membershipId: w.doctor1.id,
      patientId: w.p1.id,
      createdByUserId: w.adminUser.id,
    });
    await expect(
      w.getAnalysis({ actor: w.actors.doctor1, studyId: w.study.id, analysisId: analysis.id }),
    ).resolves.toMatchObject({ status: "COMPLETED" });
  });

  it("el identificador de un análisis de otro estudio no se encuentra", async () => {
    const w = await createAnalysisWorld();
    const { analysis } = await w.requestAnalysis({ actor: w.actors.p1, studyId: w.study.id });
    const other = await prismaClient.study.create({
      data: {
        tenantId: w.tenantA.id,
        patientId: w.p1.id,
        uploadedByUserId: w.actors.p1.userId,
        number: 99,
        storageKey: "studies/otro",
      },
    });

    await expect(
      w.getAnalysis({ actor: w.actors.p1, studyId: other.id, analysisId: analysis.id }),
    ).rejects.toBeInstanceOf(AnalysisNotFoundError);
  });
});
