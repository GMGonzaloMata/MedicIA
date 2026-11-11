import type { AnalysisFailureCode, AnalysisStatus } from "@/modules/analyses/domain/analysis";

// Textos de la sección de análisis. Sin lenguaje de diagnóstico y sin detalles internos de las fallas.
export const ANALYSIS_MESSAGES = {
  sectionTitle: "Análisis",
  resultTitle: "Resultado del análisis",
  historyTitle: "Historial de análisis",
  empty: "Todavía no hay análisis de este estudio.",
  requestButton: "Analizar estudio",
  requestPending: "Pidiendo el análisis…",
  requestInProgress: "Hay un análisis en curso",
  progress: "Analizando el estudio…",
  loading: "Cargando análisis…",
  notAvailable: "No pudimos cargar el análisis. Probá de nuevo en unos minutos.",
  forbidden: "No tenés acceso a este estudio.",
  requestUnavailable: "No pudimos pedir el análisis. Probá de nuevo en unos minutos.",
  lastFailureTitle: "El último análisis no se completó",
  requestedByPatient: "El propio paciente",
  disclaimer:
    "Son probabilidades estimadas por un modelo de investigación. Pueden no estar calibradas: leelas como un indicador relativo de riesgo. Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.",
} as const;

export const ANALYSIS_STATUS_LABELS: Record<AnalysisStatus, string> = {
  PENDING: "En curso",
  PROCESSING: "En curso",
  COMPLETED: "Completado",
  FAILED: "Fallido",
};

export const ANALYSIS_FAILURE_MESSAGES: Record<AnalysisFailureCode, string> = {
  MODEL_UNAVAILABLE: "El análisis no está disponible en este momento. Probá de nuevo más tarde.",
  INPUT_REJECTED: "No pudimos analizar este estudio.",
  TIMEOUT: "El análisis tardó demasiado. Probá de nuevo.",
  STUDY_FILE_UNAVAILABLE: "La onda de este estudio no está disponible.",
  INTERNAL: "No pudimos completar el análisis. Probá de nuevo en unos minutos.",
};

const percentFormat = new Intl.NumberFormat("es-AR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// «23,4 %»: una decimal, coma decimal y espacio antes del signo.
export function formatPercent(probability: number): string {
  return `${percentFormat.format(probability * 100)} %`;
}

const dateFormat = new Intl.DateTimeFormat("es-AR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: "America/Argentina/Buenos_Aires",
});

export function formatAnalysisDate(date: Date): string {
  return dateFormat.format(date);
}
