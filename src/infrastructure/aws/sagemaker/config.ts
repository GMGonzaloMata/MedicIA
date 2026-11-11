import "server-only";

import { z } from "zod";

export interface SageMakerConfig {
  endpointName: string;
  region: string;
}

const sageMakerEnvironmentSchema = z.object({
  SAGEMAKER_ENDPOINT_NAME: z.string().min(1),
  AWS_REGION: z.string().min(1),
});

// Valida las variables de entorno del punto de inferencia. El error nombra las variables que faltan, nunca sus valores.
export function loadSageMakerConfig(env: Record<string, string | undefined>): SageMakerConfig {
  const parsed = sageMakerEnvironmentSchema.safeParse(env);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];

    throw new Error(`Faltan o son inválidas las variables del punto de inferencia: ${names.join(", ")}.`);
  }

  return { endpointName: parsed.data.SAGEMAKER_ENDPOINT_NAME, region: parsed.data.AWS_REGION };
}
