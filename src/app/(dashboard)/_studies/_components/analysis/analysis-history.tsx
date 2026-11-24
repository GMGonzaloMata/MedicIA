import Link from "next/link";

import type { AnalysisStatus, AnalysisSummary } from "@/modules/analyses/domain/analysis";

import { ClinicalIcon } from "../../../_components/clinical-icon";

import {
  ANALYSIS_FAILURE_MESSAGES,
  ANALYSIS_MESSAGES,
  ANALYSIS_STATUS_LABELS,
  formatAnalysisDate,
} from "../../_lib/analysis-messages";

// El estado siempre va escrito; el color solo lo refuerza.
const STATUS_TONES: Record<AnalysisStatus, string> = {
  PENDING: "bg-info-surface text-info",
  PROCESSING: "bg-info-surface text-info",
  COMPLETED: "bg-success-surface text-success",
  FAILED: "bg-warning-surface text-warning",
};

interface AnalysisHistoryProps {
  studyId: string;
  items: AnalysisSummary[];
  // El análisis cuyo resultado se está mostrando.
  selectedId: string | null;
}

// Historial del más reciente al más antiguo. Solo los completados tienen resultado para abrir.
export function AnalysisHistory({ studyId, items, selectedId }: AnalysisHistoryProps) {
  return (
    <section aria-labelledby="analysis-history-title" className="flex flex-col gap-3">
      <h3 id="analysis-history-title" className="font-semibold">
        {ANALYSIS_MESSAGES.historyTitle}
      </h3>
      <ol className="flex flex-col gap-2">
        {items.map((item) => {
          const date = formatAnalysisDate(item.requestedAt);
          const requestedBy =
            item.requestedBy.kind === "PATIENT" ? ANALYSIS_MESSAGES.requestedByPatient : item.requestedBy.fullName;
          const isSelected = item.id === selectedId;

          return (
            <li
              key={item.id}
              aria-current={isSelected ? "true" : undefined}
              className={`flex flex-col gap-2 rounded-card border p-3 text-sm ${
                isSelected ? "border-primary bg-primary/[0.04]" : "border-border"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold tabular-nums">{date}</span>
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-label text-xs font-semibold ${STATUS_TONES[item.status]}`}>
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                  {ANALYSIS_STATUS_LABELS[item.status]}
                </span>
              </div>
              <span className="text-muted">Pedido por: {requestedBy}</span>
              {item.status === "FAILED" && item.failureCode ? (
                <span className="text-muted">{ANALYSIS_FAILURE_MESSAGES[item.failureCode]}</span>
              ) : null}
              {item.status === "COMPLETED" ? (
                <Link
                  href={`/studies/${studyId}?analysisId=${item.id}#analisis`}
                  aria-label={`Ver resultado del análisis del ${date}`}
                  className="relative inline-flex h-9 items-center gap-1.5 self-start rounded-control px-2 text-sm font-semibold text-primary outline-offset-2 after:absolute after:inset-x-0 after:-inset-y-1 after:content-[''] hover:bg-primary/10 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  Ver resultado
                  <ClinicalIcon name="arrow" />
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
