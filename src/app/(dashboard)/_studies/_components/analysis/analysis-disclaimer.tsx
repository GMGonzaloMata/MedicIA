import { ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";

// Advertencia permanente: acompaña a todo resultado. Son posibles hallazgos de apoyo clínico, nunca un diagnóstico.
export function AnalysisDisclaimer() {
  return (
    <p className="rounded-control border border-border bg-elevated px-3 py-2 text-sm text-foreground">
      {ANALYSIS_MESSAGES.disclaimer}
    </p>
  );
}
