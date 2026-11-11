import type { AnalysisResult as AnalysisResultView } from "@/modules/analyses/domain/analysis";

import { ANALYSIS_MESSAGES, formatAnalysisDate, formatPercent } from "../../_lib/analysis-messages";
import { COMPOSITE_NOTE, findingLabel } from "../../_lib/findings-labels";
import { AnalysisDisclaimer } from "./analysis-disclaimer";

// El modelo devuelve el compuesto en último lugar.
const COMPOSITE_KEY = "shd";

function roundedPercent(probability: number): number {
  return Math.round(probability * 1000) / 10;
}

// Resultado de un análisis: 12 filas en el orden del contrato. Cada valor va escrito y con una barra, sin umbrales ni
// colores que cambien según el valor.
export function AnalysisResult({ result }: { result: AnalysisResultView }) {
  const requestedBy =
    result.requestedBy.kind === "PATIENT" ? ANALYSIS_MESSAGES.requestedByPatient : result.requestedBy.fullName;

  return (
    <section aria-labelledby="analysis-result-title" className="flex flex-col gap-4">
      <h3 id="analysis-result-title" className="text-xl font-semibold">
        {ANALYSIS_MESSAGES.resultTitle}
      </h3>
      <AnalysisDisclaimer />
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-base sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Modelo</dt>
        <dd>{result.modelName}</dd>
        <dt className="font-medium">Versión</dt>
        <dd>{result.modelVersion}</dd>
        <dt className="font-medium">Fecha y hora</dt>
        <dd>{formatAnalysisDate(result.finishedAt ?? result.requestedAt)}</dd>
        <dt className="font-medium">Pedido por</dt>
        <dd>{requestedBy}</dd>
      </dl>
      <ul className="flex flex-col gap-3">
        {result.probabilities.map(({ key, value }) => {
          const isComposite = key === COMPOSITE_KEY;
          const percent = roundedPercent(value);
          const label = findingLabel(key);

          return (
            <li
              key={key}
              className={`flex flex-col gap-2 rounded-control border p-3 ${
                isComposite ? "border-2 border-primary bg-card" : "border-border"
              }`}
            >
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
                <span className={`break-words text-base ${isComposite ? "font-semibold" : ""}`}>
                  {label}
                  {isComposite ? <span className="font-normal text-muted"> ({COMPOSITE_NOTE})</span> : null}
                </span>
                <span className="shrink-0 text-base font-semibold tabular-nums">{formatPercent(value)}</span>
              </div>
              <div
                role="meter"
                aria-label={`${label}: ${formatPercent(value)}`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                className="h-2 w-full overflow-hidden rounded-full bg-elevated"
              >
                <div className="h-full bg-primary" style={{ width: `${percent}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
