import "server-only";

import { z } from "zod";

export interface S3Config {
  bucket: string;
  region: string;
}

const s3EnvironmentSchema = z.object({
  STUDIES_BUCKET: z.string().min(1),
  AWS_REGION: z.string().min(1),
});

// Valida las variables de entorno del bucket de estudios. El error nombra las variables que faltan,
// nunca sus valores.
export function loadS3Config(env: Record<string, string | undefined>): S3Config {
  const parsed = s3EnvironmentSchema.safeParse(env);

  if (!parsed.success) {
    const names = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))];

    throw new Error(`Faltan o son inválidas las variables del almacenamiento de estudios: ${names.join(", ")}.`);
  }

  return { bucket: parsed.data.STUDIES_BUCKET, region: parsed.data.AWS_REGION };
}
