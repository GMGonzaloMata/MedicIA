import type { IntegratedAnalysisComponent } from "./analysis-repository";

// Contrato propio del consumidor; studies lo satisface por composición, sin imports entre núcleos.
export type RawEcgExtraction = Readonly<{
  contract: "mortara-extraction.v1";
  extractorVersion: string;
  sourceReference: string;
  samplingHz: 500;
  unit: "uV";
  leads: readonly Readonly<{
    name: "I" | "II" | "III" | "aVR" | "aVL" | "aVF" | "V1" | "V2" | "V3" | "V4" | "V5" | "V6";
    samples: readonly number[];
    observed: readonly boolean[];
  }>[];
  measurements: Readonly<Record<"age" | "ventricular_rate" | "atrial_rate" | "pr_interval" | "qrs_duration" | "qt_corrected",
    Readonly<{ value: number | null; unit: string }>> & { sex: "female" | "male" | null }>;
}>;

export type RawEcgCapabilities = Readonly<Record<IntegratedAnalysisComponent,
  | Readonly<{ status: "AVAILABLE"; preprocessingReference: string }>
  | Readonly<{ status: "NOT_AVAILABLE"; reason: string }>>>;

export interface RawEcgInference {
  // Disponibilidad verificada por configuración de servidor, nunca inferida por la presencia del PDF.
  getCapabilities(): RawEcgCapabilities;
  // Frontera no confiable: el caso de uso valida componente, referencia y resultado completo.
  // Respuesta: { component, modelName, modelVersion, preprocessingReference, result }.
  predict(input: {
    component: IntegratedAnalysisComponent;
    extraction: RawEcgExtraction;
    signal: AbortSignal;
  }): Promise<unknown>;
}
