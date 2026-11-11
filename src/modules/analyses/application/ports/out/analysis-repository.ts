import type { AnalysisEntry, AnalysisFailureCode } from "../../../domain/analysis";
import type { Probabilities } from "../../../domain/findings";

// Toda operación recibe `tenantId`; no hay ninguna que busque por `id` solo. Las transiciones llevan la condición
// de estado y devuelven si afectaron una fila.
export interface AnalysisRepository {
  // Lanza `AnalysisInProgressError` si ya hay uno en curso para el estudio (índice único parcial).
  insertPending(input: { tenantId: string; studyId: string; requestedByUserId: string }): Promise<AnalysisEntry>;

  insertFailed(input: {
    tenantId: string;
    studyId: string;
    requestedByUserId: string;
    failureCode: AnalysisFailureCode;
    finishedAt: Date;
  }): Promise<AnalysisEntry>;

  // PENDING -> PROCESSING.
  claim(input: { tenantId: string; studyId: string; analysisId: string; startedAt: Date }): Promise<boolean>;

  // PROCESSING -> COMPLETED.
  complete(input: {
    tenantId: string;
    studyId: string;
    analysisId: string;
    modelName: string;
    modelVersion: string;
    probabilities: Probabilities;
    finishedAt: Date;
  }): Promise<boolean>;

  // PENDING o PROCESSING -> FAILED.
  fail(input: {
    tenantId: string;
    studyId: string;
    analysisId: string;
    failureCode: AnalysisFailureCode;
    finishedAt: Date;
  }): Promise<boolean>;

  // Pasa a FAILED con TIMEOUT los análisis en curso del estudio pedidos antes de `olderThan`. Devuelve cuántos.
  failStale(input: { tenantId: string; studyId: string; olderThan: Date; finishedAt: Date }): Promise<number>;

  findById(input: { tenantId: string; studyId: string; analysisId: string }): Promise<AnalysisEntry | null>;

  // Del más reciente al más antiguo.
  listByStudy(input: { tenantId: string; studyId: string }): Promise<AnalysisEntry[]>;

  // Hay uno en curso pedido a partir de `since`.
  hasInProgress(input: { tenantId: string; studyId: string; since: Date }): Promise<boolean>;
}
