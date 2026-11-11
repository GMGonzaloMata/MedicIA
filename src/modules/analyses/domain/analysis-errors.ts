// Errores del dominio de análisis. Los mensajes nunca incluyen valores del estudio ni del resultado.

export class AnalysisNotFoundError extends Error {
  constructor() {
    super("No encontramos el análisis.");
    this.name = "AnalysisNotFoundError";
  }
}

export class AnalysisInProgressError extends Error {
  constructor() {
    super("Ya hay un análisis en curso para este estudio.");
    this.name = "AnalysisInProgressError";
  }
}

export type ModelInferenceErrorCode = "MODEL_UNAVAILABLE" | "INPUT_REJECTED" | "TIMEOUT" | "INTERNAL";

const MODEL_ERROR_MESSAGES: Record<ModelInferenceErrorCode, string> = {
  MODEL_UNAVAILABLE: "El modelo no está disponible.",
  INPUT_REJECTED: "El modelo rechazó los datos del estudio.",
  TIMEOUT: "El modelo tardó demasiado en responder.",
  INTERNAL: "El modelo falló de forma inesperada.",
};

// Falla del modelo. El mensaje es fijo por código: no copia el cuerpo del error original ni la respuesta.
export class ModelInferenceError extends Error {
  readonly code: ModelInferenceErrorCode;

  constructor(code: ModelInferenceErrorCode) {
    super(MODEL_ERROR_MESSAGES[code]);
    this.name = "ModelInferenceError";
    this.code = code;
  }
}
