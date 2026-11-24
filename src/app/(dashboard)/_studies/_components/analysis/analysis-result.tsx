import type { AnalysisResult as AnalysisResultView } from "@/modules/analyses/domain/analysis";

import { ANALYSIS_MESSAGES, formatPercent } from "../../_lib/analysis-messages";
import { COMPOSITE_DESCRIPTION, findingLabel } from "../../_lib/findings-labels";
import { AnalysisDisclaimer } from "./analysis-disclaimer";
import { AnalysisHeart } from "./analysis-heart";

// La pantalla muestra solo el compuesto «cardiopatía estructural». Los otros once valores se guardan con el análisis
// (trazabilidad) pero no se muestran ni llegan al navegador: este componente se arma en el servidor.
const COMPOSITE_KEY = "shd";

function roundedPercent(probability: number): number {
  return Math.round(probability * 1000) / 10;
}

// Resultado de un análisis: el valor va escrito y con una barra, sin umbrales ni colores que cambien según el valor.
export function AnalysisResult({ result }: { result: AnalysisResultView }) {
  const composite = result.probabilities.find(({ key }) => key === COMPOSITE_KEY);

  return (
    <section aria-labelledby="analysis-result-title" className="flex flex-col gap-4">
      <h3 id="analysis-result-title" className="font-semibold">
        {ANALYSIS_MESSAGES.resultTitle}
      </h3>
      <AnalysisDisclaimer />
      {composite ? (
        <div className="@container flex flex-col gap-5 rounded-panel border border-primary/30 bg-primary/[0.04] p-4 sm:p-5">
          <div className="flex flex-col items-center gap-5 py-2 @min-[33rem]:flex-row @min-[33rem]:justify-center @min-[33rem]:gap-0">
            <AnalysisHeart />
            {/* Línea que sale del corazón hacia el valor. */}
            <svg
              aria-hidden="true"
              viewBox="0 0 96 96"
              className="-ml-16 hidden h-24 w-24 shrink-0 overflow-visible @min-[33rem]:block"
            >
              <path
                d="M 0 34 C 44 34, 52 48, 96 48"
                pathLength={1}
                fill="none"
                stroke="var(--primary)"
                strokeWidth={1.75}
                strokeDasharray={1}
                className="animate-draw-line motion-reduce:animate-none"
              />
              <circle cx={0} cy={34} r={6} fill="var(--primary)" fillOpacity={0.35} className="origin-center animate-ping [transform-box:fill-box] motion-reduce:animate-none" />
              <circle cx={0} cy={34} r={3.5} fill="var(--primary)" />
              <circle cx={96} cy={48} r={3} fill="var(--primary)" />
            </svg>
            <div className="flex max-w-full animate-callout-in items-center gap-3 rounded-full border border-primary/40 bg-card px-5 py-3 @xs:gap-4 @xs:px-6 shadow-[0_10px_30px_-14px_var(--primary)] motion-reduce:animate-none">
              <p className="max-w-[8.5rem] text-sm font-semibold leading-snug">{findingLabel(COMPOSITE_KEY)}</p>
              <span aria-hidden="true" className="w-px self-stretch bg-primary/30" />
              <p className="whitespace-nowrap font-sans text-2xl font-extrabold @xs:text-3xl leading-none tracking-tight tabular-nums">
                {formatPercent(composite.value)}
              </p>
            </div>
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
    </section>
  );
}
