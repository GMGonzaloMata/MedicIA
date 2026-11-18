import { Buffer } from "node:buffer";

import { encodePdfStudy, MAX_PDF_BYTES } from "../../domain/pdf-study-format";
import type { StudyActor } from "../../domain/study-access";
import { StudyRejectedError, StudyUnavailableError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";
import { PdfExtractionError, type PdfExtraction } from "../ports/out/pdf-extraction";
import type { StudyFileStorage } from "../ports/out/study-file-storage";
import type { StudyRepository } from "../ports/out/study-repository";
import { authorizeStudyUpload, persistStudyUpload } from "./upload-study";

interface UploadPdfStudyDependencies {
  studies: StudyRepository;
  storage: StudyFileStorage;
  directory: PatientDirectory;
  extraction: PdfExtraction;
  generateId: () => string;
}

export interface UploadPdfStudyInput {
  actor: StudyActor;
  patientId: string;
  type: string;
  readBytes: () => Promise<Uint8Array>;
  signal: AbortSignal;
}

// readBytes es diferido: un actor rechazado nunca accede al contenido ni al extractor.
export function createUploadPdfStudy({ studies, storage, directory, extraction, generateId }: UploadPdfStudyDependencies) {
  return async ({ actor, patientId, type, readBytes, signal }: UploadPdfStudyInput): Promise<{ studyId: string; number: number }> => {
    const studyType = await authorizeStudyUpload({ actor, patientId, type, directory });

    let bytes: Uint8Array;
    try {
      bytes = await readBytes();
    } catch {
      // El lector del formulario puede fallar con datos sensibles; no se propagan ni registran.
      throw new StudyUnavailableError();
    }
    if (bytes.byteLength === 0) throw new StudyRejectedError("FILE_MISSING");
    if (bytes.byteLength > MAX_PDF_BYTES) throw new StudyRejectedError("FILE_TOO_LARGE");

    let stored: Uint8Array;
    try {
      // El original se captura antes de entregar una copia al puerto externo.
      const originalPdfBase64 = Buffer.from(bytes).toString("base64");
      const extracted = await extraction.extract({ bytes: Uint8Array.from(bytes), signal });
      stored = encodePdfStudy({ format: "MEDPDF01", originalPdfBase64, extraction: extracted, derivatives: { version: 1 } });
    } catch (error) {
      if (error instanceof PdfExtractionError) throw new PdfExtractionError(error.code);
      throw new PdfExtractionError("PDF_EXTRACTION_UNAVAILABLE");
    }

    return persistStudyUpload({ studies, storage, generateId, actor, patientId, type: studyType, stored, format: "pdfecg1" });
  };
}
