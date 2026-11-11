import "server-only";

import { loadSageMakerConfig } from "@/infrastructure/aws/sagemaker/config";
import { createSageMakerRuntimeClient } from "@/infrastructure/aws/sagemaker/sagemaker-runtime-client";

import type { ModelInference } from "../../application/ports/out/model-inference";
import { DEFAULT_FAKE_DELAY_MS, createFakeModelInference } from "./fake-model-inference";
import { createSageMakerModelInference } from "./sagemaker-model-inference";

// Elige el adaptador del modelo según `MODEL_INFERENCE`. No hay valor por defecto: si falta o es desconocido, falla
// al armarse el módulo (de forma perezosa, para que `next build` no falle si faltan las variables).
export function createModelInference(env: Record<string, string | undefined>): ModelInference {
  switch (env.MODEL_INFERENCE) {
    case "sagemaker": {
      const config = loadSageMakerConfig(env);

      return createSageMakerModelInference({
        client: createSageMakerRuntimeClient(config),
        endpointName: config.endpointName,
      });
    }
    case "fake": {
      const delay = env.FAKE_MODEL_DELAY_MS === undefined ? DEFAULT_FAKE_DELAY_MS : Number(env.FAKE_MODEL_DELAY_MS);

      if (!Number.isFinite(delay) || delay < 0) {
        throw new Error("FAKE_MODEL_DELAY_MS debe ser un número de milisegundos mayor o igual a 0.");
      }

      return createFakeModelInference({ delayMs: delay });
    }
    default:
      throw new Error('MODEL_INFERENCE debe ser "sagemaker" o "fake".');
  }
}
