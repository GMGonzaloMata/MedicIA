import { ANALYSIS_STALE_AFTER_MS, toSummary, type AnalysisActor, type AnalysisSummary } from "../../domain/analysis";
import { AnalysisNotFoundError } from "../../domain/analysis-errors";
import type { AnalysisRepository } from "../ports/out/analysis-repository";
import type { StudySource } from "../ports/out/study-source";

interface ListAnalysesDependencies {
  analyses: AnalysisRepository;
  studySource: StudySource;
  now: () => Date;
}

// Historial de análisis de un estudio, del más reciente al más antiguo. Antes de listar marca como fallidos los que
// quedaron en curso más de lo permitido.
export function createListAnalyses({ analyses, studySource, now }: ListAnalysesDependencies) {
  return async ({ actor, studyId }: { actor: AnalysisActor; studyId: string }): Promise<AnalysisSummary[]> => {
    const authorization = await studySource.authorize({ actor, studyId });

    if (authorization.status === "NO_ACCESS") {
      throw new AnalysisNotFoundError();
    }

    const current = now();

    await analyses.failStale({
      tenantId: actor.tenantId,
      studyId,
      olderThan: new Date(current.getTime() - ANALYSIS_STALE_AFTER_MS),
      finishedAt: current,
    });

    const entries = await analyses.listByStudy({
      tenantId: actor.tenantId,
      studyId,
    });

    return entries.map(toSummary);
  };
}
