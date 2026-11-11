import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";

const STUDIES_PREFIX = "studies/";
const MINUTE_MS = 60 * 1000;
const LOOKUP_CHUNK_SIZE = 500;

interface ReconcileDependencies {
  studies: Pick<StudyRepository, "findExistingStorageKeys">;
  storage: StudyFileStorage;
  now: () => Date;
}

export interface ReconcileResult {
  scanned: number;
  // Objetos sin estudio y más viejos que el mínimo: los que quedaron tras una falla entre guardar y registrar.
  orphans: string[];
  deleted: number;
}

// Encuentra los archivos de `studies/` que no tienen fila. Por defecto solo informa; con `apply` los borra.
// Nunca toca un objeto con fila ni uno más nuevo que `minAgeMinutes` (puede estar guardándose ahora mismo).
export function createReconcileStudyFiles({ studies, storage, now }: ReconcileDependencies) {
  return async ({ apply, minAgeMinutes }: { apply: boolean; minAgeMinutes: number }): Promise<ReconcileResult> => {
    const cutoff = now().getTime() - minAgeMinutes * MINUTE_MS;
    const objects = await storage.list(STUDIES_PREFIX);
    const old = objects.filter((object) => object.lastModified.getTime() <= cutoff).map((object) => object.key);
    const orphans: string[] = [];

    for (let start = 0; start < old.length; start += LOOKUP_CHUNK_SIZE) {
      const chunk = old.slice(start, start + LOOKUP_CHUNK_SIZE);
      const existing = await studies.findExistingStorageKeys(chunk);
      orphans.push(...chunk.filter((key) => !existing.has(key)));
    }

    let deleted = 0;
    if (apply) {
      for (const key of orphans) {
        await storage.delete(key);
        deleted += 1;
      }
    }

    return { scanned: objects.length, orphans, deleted };
  };
}
