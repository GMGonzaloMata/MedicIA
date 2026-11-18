import type { AnalysisEntry, AnalysisFailureCode } from "../../../domain/analysis";
import type { Probabilities } from "../../../domain/findings";
import type { UnifiedReport } from "../../../domain/unified-report";

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

// Contrato separado: los consumidores/fakes legacy no necesitan conocer el documento integrado.
export interface IntegratedAnalysisEntry extends Omit<AnalysisEntry, "modelName" | "modelVersion" | "probabilities"> {
  kind: "ECG_UNIFIED_V1";
  modelName: null;
  modelVersion: null;
  probabilities: null;
  integratedResult: UnifiedReport;
  revision: number;
}

export type IntegratedAnalysisComponent = keyof UnifiedReport["capabilities"];
export interface IntegratedAnalysisMutation {
  tenantId: string;
  studyId: string;
  analysisId: string;
  expectedRevision: number;
}

export interface IntegratedAnalysisRepository {
  // Contexto de servidor ya autorizado. Valida el documento entero y su vinculación antes de escribir.
  // Comparte el índice de arbitraje con insertPending; solo admite componentes PENDING.
  insertIntegratedPending(input: {
    tenantId: string;
    studyId: string;
    requestedByUserId: string;
    integratedResult: unknown;
  }): Promise<IntegratedAnalysisEntry>;

  findIntegratedById(input: {
    tenantId: string;
    studyId: string;
    analysisId: string;
  }): Promise<IntegratedAnalysisEntry | null>;

  // CAS: false = inexistente, revisión distinta o transición ya no aplicable. Releer antes de reintentar.
  claimIntegrated(input: IntegratedAnalysisMutation & { startedAt: Date }): Promise<boolean>;
  startIntegratedComponent(input: IntegratedAnalysisMutation & {
    component: IntegratedAnalysisComponent;
    startedAt: Date;
    preprocessingReference: string | null;
  }): Promise<boolean>;
  // Valida el documento entero tras sustituir solo esta ejecución terminal. `now` es reloj del servidor.
  finishIntegratedComponent(input: IntegratedAnalysisMutation & {
    component: IntegratedAnalysisComponent;
    execution: unknown;
    now: Date;
  }): Promise<boolean>;
  // 30 s desde inicio de componente; 120 s desde pedido. Conserva todos los terminales previos.
  expireIntegrated(input: IntegratedAnalysisMutation & { now: Date }): Promise<boolean>;
  // Barrido tenant/estudio integrado, separado del failStale legacy; cada fila se muta con su revisión leída.
  // Devuelve CAS exitosos. Relee conflictos mientras la fila siga activa y su revisión avance, sin sobrescribir.
  expireIntegratedStale(input: { tenantId: string; studyId: string; now: Date }): Promise<number>;
}
