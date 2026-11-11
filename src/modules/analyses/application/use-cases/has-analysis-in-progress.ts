import { ANALYSIS_STALE_AFTER_MS } from "../../domain/analysis";
import type { AnalysisRepository } from "../ports/out/analysis-repository";

interface HasAnalysisInProgressDependencies {
  analyses: AnalysisRepository;
  now: () => Date;
}

// Lo que `studies` inyecta como `canDeleteStudy`. Un análisis vencido no cuenta, aunque todavía no se haya marcado
// como fallido: no debe bloquear la eliminación del estudio.
export function createHasAnalysisInProgress({ analyses, now }: HasAnalysisInProgressDependencies) {
  return ({ tenantId, studyId }: { tenantId: string; studyId: string }): Promise<boolean> =>
    analyses.hasInProgress({
      tenantId,
      studyId,
      since: new Date(now().getTime() - ANALYSIS_STALE_AFTER_MS),
    });
}
