import "server-only";

import { S3Client } from "@aws-sdk/client-s3";

import type { S3Config } from "./config";

// Las credenciales no están en el código: el SDK las toma de la cadena estándar de AWS (variables de entorno,
// perfil o rol).
export function createS3Client({ region }: Pick<S3Config, "region">): S3Client {
  return new S3Client({ region });
}
