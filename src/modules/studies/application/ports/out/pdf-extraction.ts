import type { PdfExtraction as ExtractionResult } from "../../../domain/pdf-extraction";

const EXTRACTION_MESSAGES = {
  PDF_INVALID: "El archivo no es un PDF válido.",
  PDF_UNSUPPORTED: "Este PDF no es de un formato Mortara compatible.",
  PDF_PROTECTED: "El PDF está protegido y no se puede leer.",
  PDF_INCOMPLETE: "El PDF no contiene los datos necesarios para guardar el estudio.",
  PDF_EXTRACTION_UNAVAILABLE: "No pudimos leer el PDF. Probá de nuevo más tarde.",
} as const;

export type PdfExtractionCode = keyof typeof EXTRACTION_MESSAGES;

// Sin cuerpo, causa ni detalles del proveedor; los tamaños reutilizan StudyRejectedError.
export class PdfExtractionError extends Error {
  constructor(readonly code: PdfExtractionCode) {
    super(EXTRACTION_MESSAGES[code]);
    this.name = "PdfExtractionError";
  }
}

// El caso de uso debe autorizar al actor antes de invocar esta frontera privada.
export interface PdfExtraction {
  extract(input: { bytes: Uint8Array; signal: AbortSignal }): Promise<ExtractionResult>;
}
