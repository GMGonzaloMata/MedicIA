import { Buffer } from "node:buffer";
import { z } from "zod";

import { InvalidPdfExtractionError, parsePdfExtraction, type PdfExtraction } from "./pdf-extraction";
import { StoredStudyCorruptError } from "./stored-study-format";

export const MAX_PDF_BYTES = 2_097_152;
export const MAX_PDF_STUDY_BYTES = 16 * 1024 * 1024;
const MAX_PDF_BASE64_LENGTH = 4 * Math.ceil(MAX_PDF_BYTES / 3);

function isCanonicalPdfBase64(value: string): boolean {
  if (value.length === 0 || value.length > MAX_PDF_BASE64_LENGTH) return false;
  const bytes = Buffer.from(value, "base64");
  return bytes.byteLength >= 1 && bytes.byteLength <= MAX_PDF_BYTES && bytes.toString("base64") === value;
}

const envelopeSchema = z.strictObject({
  format: z.literal("MEDPDF01"),
  originalPdfBase64: z.string().refine(isCanonicalPdfBase64),
  extraction: z.unknown(),
  // V1 conserva la extracción suficiente para consulta; no duplica tensores ni originales.
  derivatives: z.strictObject({ version: z.literal(1) }).readonly(),
});

export type PdfStudy = Readonly<{
  format: "MEDPDF01";
  originalPdfBase64: string;
  extraction: PdfExtraction;
  derivatives: Readonly<{ version: 1 }>;
}>;

function parseEnvelope(value: unknown): PdfStudy {
  const parsed = envelopeSchema.safeParse(value);
  if (!parsed.success) throw new StoredStudyCorruptError();
  let extraction: PdfExtraction;
  try {
    extraction = parsePdfExtraction(parsed.data.extraction);
  } catch (error) {
    if (!(error instanceof InvalidPdfExtractionError)) throw error;
    throw new StoredStudyCorruptError();
  }
  return Object.freeze({ ...parsed.data, extraction });
}

/** Serializa únicamente el nuevo sobre privado; no valida contenido PDF ni habilita modelos. */
export function encodePdfStudy(value: unknown): Uint8Array {
  const bytes = new TextEncoder().encode(JSON.stringify(parseEnvelope(value)));
  if (bytes.byteLength > MAX_PDF_STUDY_BYTES) throw new StoredStudyCorruptError();
  return bytes;
}

/** Rechaza tamaño y UTF-8 inválidos antes de validar el documento completo, sin leer ecg1. */
export function decodePdfStudy(bytes: Uint8Array): PdfStudy {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0 || bytes.byteLength > MAX_PDF_STUDY_BYTES) {
    throw new StoredStudyCorruptError();
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    if (!(error instanceof SyntaxError) && !(error instanceof TypeError)) throw error;
    throw new StoredStudyCorruptError();
  }
  return parseEnvelope(value);
}
