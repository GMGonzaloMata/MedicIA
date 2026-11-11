import { orderProbabilities, type FindingKey, type Probabilities } from "./findings";

export const ANALYSIS_STATUSES = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"] as const;
export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[number];

export const ANALYSIS_FAILURE_CODES = [
  "MODEL_UNAVAILABLE",
  "INPUT_REJECTED",
  "TIMEOUT",
  "STUDY_FILE_UNAVAILABLE",
  "INTERNAL",
] as const;
export type AnalysisFailureCode = (typeof ANALYSIS_FAILURE_CODES)[number];

// Tope del pedido al modelo y de un análisis en curso (specs/008-analisis-estudio-ecg/research.md).
export const ANALYSIS_MODEL_TIMEOUT_MS = 30_000;
export const ANALYSIS_STALE_AFTER_MS = 120_000;

// Quién pide o ve un análisis. Tiene la misma forma que el actor de `studies`, pero es propio del módulo: la regla
// de límites de `eslint.config.mjs` impide importar el dominio de otro módulo. El administrador sin rol de médico no
// tiene actor.
export type AnalysisActor =
  | { kind: "PATIENT"; tenantId: string; userId: string; patientId: string }
  | { kind: "DOCTOR"; tenantId: string; userId: string; membershipId: string };

export type AnalysisRequester = { kind: "PATIENT" } | { kind: "DOCTOR"; fullName: string };

// Fila completa, solo para el repositorio y los casos de uso. Nunca llega a la pantalla.
export interface AnalysisRecord {
  id: string;
  tenantId: string;
  studyId: string;
  requestedByUserId: string;
  status: AnalysisStatus;
  failureCode: AnalysisFailureCode | null;
  modelName: string | null;
  modelVersion: string | null;
  probabilities: Probabilities | null;
  requestedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
}

export interface AnalysisEntry extends AnalysisRecord {
  requestedBy: AnalysisRequester;
}

// Lo que ve la pantalla: sin clínica, sin quién lo pidió por identificador y sin la clave del archivo.
export interface AnalysisSummary {
  id: string;
  status: AnalysisStatus;
  failureCode: AnalysisFailureCode | null;
  requestedAt: Date;
  finishedAt: Date | null;
  requestedBy: AnalysisRequester;
  modelName: string | null;
  modelVersion: string | null;
}

export interface AnalysisResult extends AnalysisSummary {
  status: "COMPLETED";
  probabilities: { key: FindingKey; value: number }[];
}

export function isInProgress(status: AnalysisStatus): boolean {
  return status === "PENDING" || status === "PROCESSING";
}

export function toSummary(entry: AnalysisEntry): AnalysisSummary {
  return {
    id: entry.id,
    status: entry.status,
    failureCode: entry.failureCode,
    requestedAt: entry.requestedAt,
    finishedAt: entry.finishedAt,
    requestedBy: entry.requestedBy,
    modelName: entry.modelName,
    modelVersion: entry.modelVersion,
  };
}

export function toResultOrSummary(entry: AnalysisEntry): AnalysisResult | AnalysisSummary {
  if (entry.status === "COMPLETED" && entry.probabilities) {
    return {
      ...toSummary(entry),
      status: "COMPLETED",
      probabilities: orderProbabilities(entry.probabilities),
    };
  }

  return toSummary(entry);
}
