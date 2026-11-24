import type { ReactNode } from "react";

import type { AnalysisResult as AnalysisResultView } from "@/modules/analyses/domain/analysis";

import { ANALYSIS_MESSAGES, formatAnalysisDate, formatPercent } from "../../_lib/analysis-messages";
import { COMPOSITE_DESCRIPTION, findingLabel } from "../../_lib/findings-labels";
import { AnalysisDisclaimer } from "./analysis-disclaimer";

// La pantalla muestra solo el compuesto «cardiopatía estructural». Los otros once valores se guardan con el análisis
// (trazabilidad) pero no se muestran ni llegan al navegador: este componente se arma en el servidor.
const COMPOSITE_KEY = "shd";

function MetaItem({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="font-label text-xs font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="break-words font-medium">{children}</dd>
    </div>
  );
}

function roundedPercent(probability: number): number {
  return Math.round(probability * 1000) / 10;
}

// Resultado de un análisis: el valor va escrito y con una barra, sin umbrales ni colores que cambien según el valor.
export function AnalysisResult({ result }: { result: AnalysisResultView }) {
  const requestedBy =
    result.requestedBy.kind === "PATIENT" ? ANALYSIS_MESSAGES.requestedByPatient : result.requestedBy.fullName;
  const composite = result.probabilities.find(({ key }) => key === COMPOSITE_KEY);

  return (
    <section aria-labelledby="analysis-result-title" className="flex flex-col gap-4">
      <h3 id="analysis-result-title" className="font-semibold">
        {ANALYSIS_MESSAGES.resultTitle}
      </h3>
      <AnalysisDisclaimer />
      {composite ? (
        <div className="flex flex-col gap-4 rounded-panel border-2 border-primary bg-primary/[0.04] p-5">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between sm:gap-4">
            <p className="font-label text-sm font-semibold uppercase tracking-wider text-muted">
              {findingLabel(COMPOSITE_KEY)}
            </p>
            <p className="font-sans text-4xl font-extrabold leading-none tracking-tight tabular-nums">
              {formatPercent(composite.value)}
            </p>
          </div>
          <div
            role="meter"
            aria-label={`${findingLabel(COMPOSITE_KEY)}: ${formatPercent(composite.value)}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={roundedPercent(composite.value)}
            className="h-3 w-full overflow-hidden rounded-full bg-elevated"
          >
            <div className="h-full bg-primary" style={{ width: `${roundedPercent(composite.value)}%` }} />
          </div>
          <p className="text-sm leading-relaxed text-muted">{COMPOSITE_DESCRIPTION}</p>
        </div>
      ) : (
        <p role="alert" className="text-base">
          {ANALYSIS_MESSAGES.notAvailable}
        </p>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-card bg-elevated p-4 text-sm">
        <MetaItem label="Modelo">{result.modelName}</MetaItem>
        <MetaItem label="Versión">{result.modelVersion}</MetaItem>
        <MetaItem label="Fecha y hora">{formatAnalysisDate(result.finishedAt ?? result.requestedAt)}</MetaItem>
        <MetaItem label="Pedido por">{requestedBy}</MetaItem>
      </dl>
    </section>
  );
}
