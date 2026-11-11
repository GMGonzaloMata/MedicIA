import { InvokeEndpointCommand, type SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";
import { z } from "zod";

import type { ModelInference } from "../../application/ports/out/model-inference";
import { ModelInferenceError, type ModelInferenceErrorCode } from "../../domain/analysis-errors";
import { parseProbabilities } from "../../domain/findings";

const WAVEFORM_SAMPLES = 2500;
const WAVEFORM_LEADS = 12;

const responseSchema = z.object({
  model: z.string().min(1),
  model_version: z.string().min(1),
  probabilities: z.unknown(),
});

interface ErrorLike {
  name?: unknown;
  code?: unknown;
  cause?: unknown;
  $metadata?: { httpStatusCode?: number };
}

const UNAVAILABLE_NAMES = new Set(["ValidationError", "ServiceUnavailable"]);
const UNAVAILABLE_CODES = new Set(["ECONNREFUSED", "ENOTFOUND"]);

function codeOf(error: unknown): ModelInferenceErrorCode {
  if (error instanceof ModelInferenceError) {
    return error.code;
  }

  const candidate = error as ErrorLike | null;
  const name = typeof candidate?.name === "string" ? candidate.name : "";
  const status = candidate?.$metadata?.httpStatusCode;
  const cause = candidate?.cause as ErrorLike | undefined;
  const code = typeof candidate?.code === "string" ? candidate.code : typeof cause?.code === "string" ? cause.code : "";

  if (name === "AbortError" || name === "TimeoutError") {
    return "TIMEOUT";
  }

  // Primero el modelo no disponible: un punto de inferencia apagado o inexistente responde `ValidationError` con 400,
  // y eso no es un rechazo de los datos del estudio.
  if (UNAVAILABLE_NAMES.has(name) || UNAVAILABLE_CODES.has(code)) {
    return "MODEL_UNAVAILABLE";
  }

  if (name === "ModelError" || status === 424 || status === 400) {
    return "INPUT_REJECTED";
  }

  return "INTERNAL";
}

// Arma el cuerpo del contrato de la 005: la onda como 2.500 filas de 12 números y las 7 variables. Los valores
// `float32` se envían tal cual, sin redondear.
function buildBody(waveform: Float32Array, tabular: Float32Array): string {
  const rows: number[][] = [];

  for (let sample = 0; sample < WAVEFORM_SAMPLES; sample += 1) {
    rows.push(Array.from(waveform.subarray(sample * WAVEFORM_LEADS, (sample + 1) * WAVEFORM_LEADS)));
  }

  return JSON.stringify({ waveform: rows, tabular: Array.from(tabular) });
}

interface SageMakerModelInferenceOptions {
  client: Pick<SageMakerRuntimeClient, "send">;
  endpointName: string;
}

// Adaptador real del modelo: invoca el punto de inferencia de SageMaker. Cualquier falla se traduce a un
// `ModelInferenceError` con un código genérico; el registro dice solo el nombre del error y el código resultante, nunca
// el cuerpo del error, la respuesta ni valores del estudio.
export function createSageMakerModelInference({
  client,
  endpointName,
}: SageMakerModelInferenceOptions): ModelInference {
  return {
    async predict({ waveform, tabular, signal }) {
      try {
        const response = await client.send(
          new InvokeEndpointCommand({
            EndpointName: endpointName,
            ContentType: "application/json",
            Accept: "application/json",
            Body: buildBody(waveform, tabular),
          }),
          { abortSignal: signal },
        );
        const text = response.Body ? await response.Body.transformToString() : "";
        const parsed = responseSchema.parse(JSON.parse(text));

        return {
          modelName: parsed.model,
          modelVersion: parsed.model_version,
          probabilities: parseProbabilities(parsed.probabilities),
        };
      } catch (error) {
        const code = codeOf(error);
        const name = error instanceof Error ? error.name : "UnknownError";

        console.error(`[modelo] falló la inferencia (${name}) código=${code}`);

        throw new ModelInferenceError(code);
      }
    },
  };
}
