import type { Probabilities } from "../../../domain/findings";

export interface ModelPrediction {
  modelName: string;
  modelVersion: string;
  probabilities: Probabilities;
}

// Puerto de salida hacia el modelo. Si falla, lanza `ModelInferenceError` con un código genérico.
export interface ModelInference {
  predict(input: { waveform: Float32Array; tabular: Float32Array; signal: AbortSignal }): Promise<ModelPrediction>;
}
