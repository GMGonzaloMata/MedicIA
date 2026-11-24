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
    <section
      aria-labelledby="analysis-title"
      className="flex flex-col gap-5 rounded-panel border border-border bg-card p-5 shadow-[0_1px_2px_rgb(15_23_42/0.05)] sm:p-6"
    >
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 id="analysis-title" className="text-lg font-bold tracking-tight">
            {ANALYSIS_MESSAGES.sectionTitle}
          </h2>
          <p className="max-w-xl text-sm text-muted">{ANALYSIS_MESSAGES.sectionLead}</p>
        </div>
        <RequestAnalysisButton studyId={studyId} inProgress={inProgress} />
      </header>
      {items.length === 0 ? (
        <p className="rounded-card border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {ANALYSIS_MESSAGES.empty}
        </p>
      ) : null}
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
      {lastFailure ? (
        <div className="flex flex-col gap-0.5 rounded-card border border-warning/40 bg-warning-surface px-4 py-3 text-sm">
          <p className="font-semibold text-warning">{ANALYSIS_MESSAGES.lastFailureTitle}</p>
          <p className="text-foreground">{lastFailure}</p>
        </div>
      ) : null}
      {result || items.length > 0 ? (
        <div className={result && items.length > 0 ? "grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]" : "flex flex-col gap-6"}>
          {result ? <AnalysisResult result={result} /> : null}
          {items.length > 0 ? <AnalysisHistory studyId={studyId} items={items} selectedId={result?.id ?? null} /> : null}
        </div>
      ) : null}
    </section>
  );
}
