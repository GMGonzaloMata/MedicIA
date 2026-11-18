"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, useTransition } from "react";

import { primaryButtonClassName, secondaryButtonClassName } from "@/components/form/button-styles";
import type { UnifiedReportPublication } from "@/modules/analyses/domain/unified-report";

import { getIntegratedAnalysisAction } from "../../_actions/get-integrated-analysis";
import { requestIntegratedAnalysisAction } from "../../_actions/request-integrated-analysis";
import { ANALYSIS_MESSAGES } from "../../_lib/analysis-messages";
import { UnifiedReport } from "./unified-report";

interface IntegratedAnalysisSectionProps { studyId: string; analysisId?: string }
const REFRESH_INTERVAL_MS = 3000;

export function IntegratedAnalysisSection(props: IntegratedAnalysisSectionProps) {
  // Un cambio de estudio/pedido invalida estado y continuaciones, no reutiliza el informe anterior.
  return <IntegratedAnalysisPanel key={`${props.studyId}:${props.analysisId ?? ""}`} {...props} />;
}

function IntegratedAnalysisPanel({ studyId, analysisId }: IntegratedAnalysisSectionProps) {
  const { refresh, replace } = useRouter();
  const [report, setReport] = useState<UnifiedReportPublication | null>(null);
  const [activeId, setActiveId] = useState(analysisId);
  const [error, setError] = useState<string | null>(null);
  const [readAttempt, setReadAttempt] = useState(0);
  const [isLoading, setIsLoading] = useState(Boolean(analysisId));
  const [isRequesting, requestTransition] = useTransition();
  const alive = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  useEffect(() => {
    if (!activeId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function read() {
      try {
        const result = await getIntegratedAnalysisAction(studyId, activeId);
        if (cancelled) return;
        setIsLoading(false);
        if (!result.ok) {
          if (result.code === "NOT_FOUND") {
            // Una selección inexistente o inaccesible vuelve al estudio sin iniciar otro pedido.
            setReport(null);
            setActiveId(undefined);
            setError(ANALYSIS_MESSAGES.notAvailable);
            replace(`/studies/${encodeURIComponent(studyId)}`, { scroll: false });
          } else {
            setError(result.message);
          }
          return;
        }
        if (result.report.studyId !== studyId || result.report.analysisId !== activeId) {
          setError(ANALYSIS_MESSAGES.notAvailable); return;
        }
        setError(null);
        setReport(result.report);
        if (result.report.coverage === "WAITING") {
          // Un solo pedido en vuelo; el siguiente se programa al terminar la lectura anterior.
          timer = setTimeout(() => startTransition(read), REFRESH_INTERVAL_MS);
        } else {
          refresh();
        }
      } catch {
        if (!cancelled) { setIsLoading(false); setError(ANALYSIS_MESSAGES.notAvailable); }
      }
    }
    startTransition(read);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [activeId, readAttempt, refresh, replace, studyId]);

  const unresolved = Boolean(activeId && (!report || report.coverage === "WAITING"));
  function request() {
    if (isRequesting || unresolved) return;
    setError(null);
    requestTransition(async () => {
      try {
        const result = await requestIntegratedAnalysisAction(studyId);
        if (!alive.current) return;
        if (!result.ok) { setError(result.message); return; }
        if (result.report.studyId !== studyId) { setError(ANALYSIS_MESSAGES.requestUnavailable); return; }
        setReport(result.report);
        setActiveId(result.report.analysisId);
        replace(`/studies/${studyId}?analysisId=${result.report.analysisId}`, { scroll: false });
      } catch {
        if (alive.current) setError(ANALYSIS_MESSAGES.requestUnavailable);
      }
    });
  }

  return (
    <section aria-labelledby="integrated-analysis-title" className="flex min-w-0 flex-col gap-4 rounded-panel border border-border bg-card p-4 sm:p-6">
      <div className="space-y-2">
        <p className="font-label text-sm font-medium text-primary">Apoyo clínico con IA</p>
        <h2 id="integrated-analysis-title" className="text-2xl font-semibold">Informe unificado</h2>
        <p className="text-sm text-muted">Solicitá el análisis de este ECG en PDF. No es un diagnóstico ni una estimación numérica de la FEVI.</p>
        {!report ? <p className="text-sm text-muted">EchoNext-Mini no está habilitado para PDF. Su ausencia no impide publicar un resultado válido de E022.</p> : null}
      </div>
      <div className="flex flex-wrap gap-3">
        <button type="button" onClick={request} disabled={isRequesting || unresolved} className={primaryButtonClassName}>
          {isRequesting ? ANALYSIS_MESSAGES.requestPending : unresolved ? ANALYSIS_MESSAGES.requestInProgress : ANALYSIS_MESSAGES.requestButton}
        </button>
        {error && activeId ? <button type="button" className={secondaryButtonClassName} onClick={() => { setError(null); setIsLoading(true); setReadAttempt((attempt) => attempt + 1); }}>Actualizar informe</button> : null}
      </div>
      {isLoading ? <p role="status" className="text-sm text-muted">{ANALYSIS_MESSAGES.loading}</p> : null}
      {error ? <p role="alert" className="rounded-control border border-danger bg-danger-surface p-3 text-sm text-danger">{error}</p> : null}
      {report ? <UnifiedReport report={report} /> : null}
    </section>
  );
}
