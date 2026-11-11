import { getAnalysesModule } from "@/modules/analyses/composition";
import {
  isInProgress,
  type AnalysisActor,
  type AnalysisResult as AnalysisResultView,
  type AnalysisSummary,
} from "@/modules/analyses/domain/analysis";
import { isAnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

import { ANALYSIS_FAILURE_MESSAGES, ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";
import { AnalysisHistory } from "./analysis-history";
import { AnalysisProgress } from "./analysis-progress";
import { AnalysisResult } from "./analysis-result";
import { RequestAnalysisButton } from "./request-analysis-button";

interface AnalysisSectionProps {
  actor: AnalysisActor;
  studyId: string;
  // Análisis pedido por el parámetro de la dirección; si no existe o no está completado, se muestra el más reciente.
  analysisId?: string;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

function isResult(value: AnalysisResultView | AnalysisSummary): value is AnalysisResultView {
  return "probabilities" in value;
}

// Sección «Análisis» de la pantalla del estudio: botón, progreso, resultado e historial. La página ya comprobó que el
// estudio es accesible; si el acceso se perdió entretanto se muestra el mismo mensaje de siempre.
export async function AnalysisSection({ actor, studyId, analysisId }: AnalysisSectionProps) {
  let items: AnalysisSummary[];

  try {
    items = await getAnalysesModule().listAnalyses({ actor, studyId });
  } catch (error) {
    if (isAnalysisNotFoundError(error)) {
      return <p className="text-base">{ANALYSIS_MESSAGES.forbidden}</p>;
    }

    console.error(`[análisis] no se pudo listar (${errorName(error)})`);

    return (
      <p role="alert" className="text-base">
        {ANALYSIS_MESSAGES.notAvailable}
      </p>
    );
  }

  const inProgress = items.some((item) => isInProgress(item.status));
  const completed = items.filter((item) => item.status === "COMPLETED");
  const selected = completed.find((item) => item.id === analysisId) ?? completed[0] ?? null;
  let result: AnalysisResultView | null = null;

  if (selected) {
    try {
      const loaded = await getAnalysesModule().getAnalysis({ actor, studyId, analysisId: selected.id });

      result = isResult(loaded) ? loaded : null;
    } catch (error) {
      console.error(`[análisis] no se pudo abrir (${errorName(error)})`);
    }
  }

  const latest = items[0];
  const lastFailure =
    !result && latest?.status === "FAILED" && latest.failureCode ? ANALYSIS_FAILURE_MESSAGES[latest.failureCode] : null;

  return (
    <section aria-labelledby="analysis-title" className="flex flex-col gap-4">
      <h2 id="analysis-title" className="text-2xl font-semibold">
        {ANALYSIS_MESSAGES.sectionTitle}
      </h2>
      {items.length === 0 ? <p className="text-base">{ANALYSIS_MESSAGES.empty}</p> : null}
      {/* Región en vivo siempre montada: un lector de pantalla anuncia el paso de «Analizando…» a terminado o fallido. */}
      <div role="status" aria-live="polite">
        {inProgress ? (
          <AnalysisProgress />
        ) : latest ? (
          <p className="sr-only">
            {latest.status === "FAILED" && latest.failureCode
              ? ANALYSIS_FAILURE_MESSAGES[latest.failureCode]
              : ANALYSIS_MESSAGES.finished}
          </p>
        ) : null}
      </div>
      <RequestAnalysisButton studyId={studyId} inProgress={inProgress} />
      {lastFailure ? (
        <div className="rounded-control border border-border bg-elevated p-3 text-base">
          <p className="font-medium">{ANALYSIS_MESSAGES.lastFailureTitle}</p>
          <p>{lastFailure}</p>
        </div>
      ) : null}
      {result ? <AnalysisResult result={result} /> : null}
      {items.length > 0 ? <AnalysisHistory studyId={studyId} items={items} selectedId={result?.id ?? null} /> : null}
    </section>
  );
}
