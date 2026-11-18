import type { AnalysisActor } from "../../domain/analysis";
import { AnalysisNotFoundError } from "../../domain/analysis-errors";
import { publishUnifiedReport, type UnifiedReportPublication } from "../../domain/unified-report";
import type { IntegratedAnalysisRepository } from "../ports/out/analysis-repository";
import type { IntegratedStudySource } from "../ports/out/study-source";

export interface GetIntegratedAnalysisDependencies {
  analyses: Pick<IntegratedAnalysisRepository, "findIntegratedById" | "expireIntegratedStale">;
  studySource: Pick<IntegratedStudySource, "authorize">;
  now: () => Date;
}

// El vencimiento perezoso es explícito: nunca se lee una publicación anterior al barrido autorizado.
export function createGetIntegratedAnalysis({ analyses, studySource, now }: GetIntegratedAnalysisDependencies) {
  return async ({ actor, studyId, analysisId }: {
    actor: AnalysisActor; studyId: string; analysisId: string;
  }): Promise<UnifiedReportPublication> => {
    const authorization = await studySource.authorize({ actor, studyId });
    if (authorization.status === "NO_ACCESS") throw new AnalysisNotFoundError();
    await analyses.expireIntegratedStale({ tenantId: actor.tenantId, studyId, now: now() });
    const row = await analyses.findIntegratedById({ tenantId: actor.tenantId, studyId, analysisId });
    if (!row || row.tenantId !== actor.tenantId || row.studyId !== studyId || row.id !== analysisId
      || row.integratedResult.analysisId !== analysisId || row.integratedResult.studyId !== studyId) {
      throw new AnalysisNotFoundError();
    }
    // Reutiliza la política de publicación: WAITING/NONE no transportan contribuciones clínicas.
    return publishUnifiedReport(row.integratedResult);
  };
}
