import type { UnifiedReportPublication } from "@/modules/analyses/domain/unified-report";
import { FINDING_KEYS } from "@/modules/analyses/domain/findings";

import { ANALYSIS_FAILURE_MESSAGES, ANALYSIS_MESSAGES, formatAnalysisDate, formatPercent } from "../../_lib/analysis-messages";
import { COMPOSITE_NOTE, findingLabel } from "../../_lib/findings-labels";

const names = { echonext: "EchoNext-Mini", e022: "E022" } as const;
const progressLabels = { PENDING: "pendiente", PROCESSING: "procesando", COMPLETED: "completado", FAILED: "falló" } as const;
const scoreFormat = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 });
const professionalWarning = "Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.";

export function UnifiedReport({ report }: { report: UnifiedReportPublication }) {
  const published = report.coverage === "PARTIAL" || report.coverage === "COMPLETE";
  const contributions = published ? report.contributions : [];
  const mini = contributions.find((item) => item.component === "echonext");
  const requester = published ? report.requestedBy : undefined;
  const requesterLabel = requester?.kind === "PATIENT" ? ANALYSIS_MESSAGES.requestedByPatient : requester?.fullName;

  return (
    <div className="flex min-w-0 flex-col gap-4 [overflow-wrap:anywhere]">
      <div role="status" aria-live="polite">
        {report.coverage === "WAITING" ? <p className="font-medium">{ANALYSIS_MESSAGES.progress}</p> : null}
        {report.coverage === "NONE" ? <p className="font-medium text-danger">No se obtuvo un resultado válido.</p> : null}
        {published ? <p className="font-medium text-primary">{report.coverage === "PARTIAL" ? "Informe parcial" : "Informe completo"}</p> : null}
      </div>
      <p className="font-label text-sm text-muted">Pedido {report.analysisId} · {formatAnalysisDate(new Date(report.requestedAt))}</p>
      {requesterLabel ? <p className="text-sm text-muted">Pedido por: {requesterLabel}</p> : null}
      <div className="text-sm text-muted">
        {(["e022", "echonext"] as const).map((component) => {
          const execution = report.components[component];
          return execution ? <p key={component}>{names[component]}: {progressLabels[execution.status]}{execution.failureCode ? ` — ${ANALYSIS_FAILURE_MESSAGES[execution.failureCode]}` : ""}</p> : null;
        })}
      </div>
      {published ? (
        <>
          <p className="text-sm text-muted">{professionalWarning}</p>
          <section aria-labelledby="ventricular-title" className="flex flex-col gap-4 rounded-card border border-border bg-panel p-4 sm:p-6">
            <h3 id="ventricular-title" className="text-lg font-semibold">Función ventricular</h3>
            <p className="text-sm text-muted">Indicadores independientes de posible FEVI ≤45 %. No son una estimación numérica de la FEVI.</p>
            <div className="grid min-w-0 gap-6 sm:grid-cols-2">
              {contributions.map(({ component, execution }) => (
                <div key={component} role="group" aria-labelledby={`${component}-indicator-title`} className="min-w-0 space-y-2">
                  <h4 id={`${component}-indicator-title`} className="font-medium">{component === "e022" ? "Puntuación de investigación para posible FEVI ≤45 %" : "Probabilidad estimada de posible FEVI ≤45 %"}</h4>
                  <p className="font-label text-2xl font-semibold tabular-nums">{component === "e022" ? scoreFormat.format(execution.result.score) : formatPercent(execution.result.lvef_lte_45)}</p>
                  <p className="text-sm text-muted">{names[component]} · {execution.modelName} · versión {execution.modelVersion}</p>
                  <p className="text-sm text-muted">Preparación: {execution.preprocessingReference} · Ejecución: {formatAnalysisDate(new Date(execution.finishedAt))}</p>
                  <p className="text-sm">{component === "e022" ? "Es una puntuación de investigación, no un valor de FEVI ni una probabilidad clínicamente calibrada." : ANALYSIS_MESSAGES.disclaimer}</p>
                </div>
              ))}
            </div>
          </section>
          {mini?.component === "echonext" ? (
            <section aria-labelledby="other-findings-title" className="space-y-3">
              <h3 id="other-findings-title" className="text-lg font-semibold">Otros posibles hallazgos de EchoNext-Mini</h3>
              <ul className="divide-y divide-border">
                {FINDING_KEYS.filter((key) => key !== "lvef_lte_45").map((key) => (
                  <li key={key} className="flex flex-wrap justify-between gap-2 py-3 text-sm">
                    <span>{findingLabel(key)}{key === "shd" ? ` (${COMPOSITE_NOTE})` : ""}</span>
                    <span className="font-label tabular-nums">{formatPercent(mini.execution.result[key])}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : null}
      <aside aria-label="Completitud del informe" className="text-sm text-muted">
        {(["echonext", "e022"] as const).map((component) => report.capabilities[component].status === "NOT_AVAILABLE"
          ? <p key={component}>{names[component]} no disponible (NOT_AVAILABLE). No se ejecutó. Esto no equivale a un hallazgo negativo.</p>
          : null)}
        {report.coverage === "PARTIAL" ? <p>El informe incluye solo las contribuciones válidas. La información ausente no se reemplaza por ceros.</p> : null}
      </aside>
    </div>
  );
}
