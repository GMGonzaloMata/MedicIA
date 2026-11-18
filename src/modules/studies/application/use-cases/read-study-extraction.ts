import type { StudyActor } from "../../domain/study-access";
import type { PdfExtraction } from "../../domain/pdf-extraction";
import { decodePdfStudy } from "../../domain/pdf-study-format";
import { StudyUnavailableError } from "../../domain/study-errors";
import { StoredStudyCorruptError } from "../../domain/stored-study-format";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";
import type { createAuthorizeStudy } from "./authorize-study";

interface ReadStudyExtractionDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  authorizeStudy: ReturnType<typeof createAuthorizeStudy>;
}
export type StudyExtraction =
  | { status: "READY"; extraction: PdfExtraction }
  | { status: "NO_ACCESS" | "FILE_UNAVAILABLE" | "UNSUPPORTED_FORMAT" };

// Lectura privada de servidor: autoriza antes de storage y nunca entrega el original ni su clave.
export function createReadStudyExtraction({ studies, storage, authorizeStudy }: ReadStudyExtractionDependencies) {
  return async ({ actor, studyId }: { actor: StudyActor; studyId: string }): Promise<StudyExtraction> => {
    const authorization = await authorizeStudy({ actor, studyId });
    if (authorization.status === "NO_ACCESS") return { status: "NO_ACCESS" };
    const study = await studies.findById({ tenantId: actor.tenantId, studyId });
    if (!study) return { status: "NO_ACCESS" };
    // Se despacha por el formato persistido, no por hints ni por reconocer bytes bajo ecg1.
    if (!study.storageKey.endsWith(".pdfecg1")) return { status: "UNSUPPORTED_FORMAT" };
    let bytes: Uint8Array | null;
    try {
      bytes = await storage.get(study.storageKey);
    } catch {
      throw new StudyUnavailableError();
    }
    if (!bytes) return { status: "FILE_UNAVAILABLE" };
    try {
      return { status: "READY", extraction: decodePdfStudy(bytes).extraction };
    } catch (error) {
      if (error instanceof StoredStudyCorruptError) return { status: "FILE_UNAVAILABLE" };
      throw error;
    }
  };
}
