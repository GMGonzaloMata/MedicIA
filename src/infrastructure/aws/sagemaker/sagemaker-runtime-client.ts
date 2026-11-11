import "server-only";

import { SageMakerRuntimeClient } from "@aws-sdk/client-sagemaker-runtime";

import type { SageMakerConfig } from "./config";

// Las credenciales no están en el código: el SDK las toma de la cadena estándar de AWS (variables de entorno, perfil o
// rol). Un solo intento: el tope de tiempo lo pone quien llama con un `AbortSignal`, y un reintento automático
// podría duplicar una inferencia que ya está en marcha.
export function createSageMakerRuntimeClient({ region }: Pick<SageMakerConfig, "region">): SageMakerRuntimeClient {
  return new SageMakerRuntimeClient({ region, maxAttempts: 1 });
}
