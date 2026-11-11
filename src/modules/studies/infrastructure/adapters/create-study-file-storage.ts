import "server-only";

import { loadS3Config } from "@/infrastructure/aws/s3/config";
import { createS3Client } from "@/infrastructure/aws/s3/s3-client";

import type { StudyFileStorage } from "../../application/ports/out/study-file-storage";
import { createInMemoryStudyFileStorage } from "./in-memory-study-file-storage";
import { createS3StudyFileStorage } from "./s3-study-file-storage";

// Elige el almacenamiento según STUDY_STORAGE. No hay valor por defecto: si falta o es desconocido la
// aplicación no arranca, para que un entorno mal configurado no use el simulado por error.
export function createStudyFileStorage(env: Record<string, string | undefined>): StudyFileStorage {
  switch (env.STUDY_STORAGE) {
    case "s3": {
      const config = loadS3Config(env);

      return createS3StudyFileStorage({ client: createS3Client(config), bucket: config.bucket });
    }
    case "fake":
      return createInMemoryStudyFileStorage();
    default:
      throw new Error('STUDY_STORAGE debe ser "s3" o "fake".');
  }
}
