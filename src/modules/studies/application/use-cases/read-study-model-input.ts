import type { StudyActor } from "../../domain/study-access";
import { StudyUnavailableError } from "../../domain/study-errors";
import { StoredStudyCorruptError, decodeStoredStudy } from "../../domain/stored-study-format";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";
import type { createAuthorizeStudy } from "./authorize-study";

interface ReadStudyModelInputDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  authorizeStudy: ReturnType<typeof createAuthorizeStudy>;
}

export type StudyModelInput =
  | { status: "READY"; waveform: Float32Array; tabular: Float32Array }
  | { status: "FILE_UNAVAILABLE" }
  | { status: "NO_ACCESS" };

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : "UnknownError";
}

// Lee la onda y las siete variables de un estudio para enviarlas al modelo, solo en el servidor. El acceso se
// resuelve antes de tocar el almacenamiento. Un archivo ausente o dañado es un resultado; una falla del
// almacenamiento es una excepción, y solo se registra el nombre del error y la clave opaca.
export function createReadStudyModelInput({ studies, storage, authorizeStudy }: ReadStudyModelInputDependencies) {
  return async ({ actor, studyId }: { actor: StudyActor; studyId: string }): Promise<StudyModelInput> => {
    const authorization = await authorizeStudy({ actor, studyId });

    if (authorization.status === "NO_ACCESS") {
      return { status: "NO_ACCESS" };
    }

    const study = await studies.findById({ tenantId: actor.tenantId, studyId });

    if (!study) {
      return { status: "NO_ACCESS" };
    }

    let bytes: Uint8Array | null;

    try {
      bytes = await storage.get(study.storageKey);
    } catch (error) {
      console.error(`[estudios] no se pudo leer el archivo (${errorName(error)}) clave=${study.storageKey}`);

      throw new StudyUnavailableError();
    }

    if (!bytes) {
      return { status: "FILE_UNAVAILABLE" };
    }

    try {
      const { waveform, tabular } = decodeStoredStudy(bytes);

      return { status: "READY", waveform, tabular };
    } catch (error) {
      if (error instanceof StoredStudyCorruptError) {
        return { status: "FILE_UNAVAILABLE" };
      }

      throw error;
    }
  };
}
