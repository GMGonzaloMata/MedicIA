import Link from "next/link";

import { linkClassName } from "@/components/form/button-styles";
import type { AnalysisSummary } from "@/modules/analyses/domain/analysis";

import {
  ANALYSIS_FAILURE_MESSAGES,
  ANALYSIS_MESSAGES,
  ANALYSIS_STATUS_LABELS,
  formatAnalysisDate,
} from "../../_lib/analysis-messages";

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
      <h3 id="analysis-history-title" className="text-xl font-semibold">
        {ANALYSIS_MESSAGES.historyTitle}
      </h3>
      <ol className="flex flex-col gap-2">
        {items.map((item) => {
          const date = formatAnalysisDate(item.requestedAt);
          const requestedBy =
            item.requestedBy.kind === "PATIENT" ? ANALYSIS_MESSAGES.requestedByPatient : item.requestedBy.fullName;

          return (
            <li
              key={item.id}
              aria-current={item.id === selectedId ? "true" : undefined}
              className={`flex flex-col gap-1 rounded-control border p-3 text-base ${
                item.id === selectedId ? "border-2 border-primary bg-card" : "border-border"
              }`}
            >
              <span>
                <span className="font-medium">{date}</span> · {requestedBy}
              </span>
              <span className="font-medium">{ANALYSIS_STATUS_LABELS[item.status]}</span>
              {item.status === "FAILED" && item.failureCode ? (
                <span className="text-muted">{ANALYSIS_FAILURE_MESSAGES[item.failureCode]}</span>
              ) : null}
              {item.status === "COMPLETED" ? (
                <Link
                  href={`/studies/${studyId}?analysisId=${item.id}`}
                  aria-label={`Ver el resultado del análisis del ${date}`}
                  className={`${linkClassName} inline-flex min-h-11 items-center self-start`}
                >
                  Ver resultado
                </Link>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
