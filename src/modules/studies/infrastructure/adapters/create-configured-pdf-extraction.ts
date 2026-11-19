import "server-only";
import type { PdfExtraction } from "../../application/ports/out/pdf-extraction";
import { createHttpPdfExtraction } from "./http-pdf-extraction";

/** Configuración exclusiva de servidor; nunca selecciona un fake ante ausencia/error. */
export function createConfiguredPdfExtraction(): PdfExtraction | null {
  const endpoint = process.env.PDF_EXTRACTION_ENDPOINT;
  if (!endpoint) return null;
  const isLocalSynthetic = process.env.PDF_E022_LOCAL_SYNTHETIC === "1" &&
    ["development", "test"].includes(process.env.NODE_ENV ?? "");
  try {
    return createHttpPdfExtraction({ endpoint, allowLoopbackHttpForTests: isLocalSynthetic });
  } catch {
    return null;
  }
}
