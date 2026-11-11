import {
  toResultOrSummary,
  type AnalysisActor,
  type AnalysisResult,
  type AnalysisSummary,
} from "../../domain/analysis";
import { AnalysisNotFoundError } from "../../domain/analysis-errors";
import type { AnalysisRepository } from "../ports/out/analysis-repository";
import type { StudySource } from "../ports/out/study-source";

interface GetAnalysisDependencies {
  analyses: AnalysisRepository;
  studySource: StudySource;
}

// Un análisis de un estudio. El acceso al análisis pasa siempre por el acceso a su estudio; uno inexistente, de otro
// estudio o de otra clínica da el mismo error.
export function createGetAnalysis({ analyses, studySource }: GetAnalysisDependencies) {
  return async ({
    actor,
    studyId,
    analysisId,
  }: {
    actor: AnalysisActor;
    studyId: string;
    analysisId: string;
  }): Promise<AnalysisResult | AnalysisSummary> => {
    const authorization = await studySource.authorize({ actor, studyId });

    if (authorization.status === "NO_ACCESS") {
      throw new AnalysisNotFoundError();
    }

    const entry = await analyses.findById({
      tenantId: actor.tenantId,
      studyId,
      analysisId,
    });

    if (!entry) {
      throw new AnalysisNotFoundError();
    }

    return toResultOrSummary(entry);
  };
}
