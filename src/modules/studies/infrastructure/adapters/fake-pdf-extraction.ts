import "server-only";

import type { PdfExtraction, PdfExtractionCode } from "../../application/ports/out/pdf-extraction";
import { createHttpPdfExtraction } from "./http-pdf-extraction";

type SyntheticOutcome = "SUCCESS" | PdfExtractionCode | "INVALID_OUTPUT" | "MISSING_REFERENCE" | "TIMEOUT";
interface FakePdfExtractionOptions { outcome?: SyntheticOutcome; delayMs?: number }

function syntheticExtraction() {
  const measurement = { value: null, unit: "synthetic" };
  return {
    contract: "mortara-extraction.v1", extractorVersion: "synthetic-v1", sourceReference: "synthetic-only-not-a-reader",
    samplingHz: 500, unit: "uV",
    leads: ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"].map((name) => ({
      name, samples: Array<number>(5000).fill(0), observed: Array<boolean>(5000).fill(false),
    })),
    measurements: { sex: null, age: measurement, ventricular_rate: measurement, atrial_rate: measurement,
      pr_interval: measurement, qrs_duration: measurement, qt_corrected: measurement },
  };
}

/** Simulación explícita: no lee PDFs, no observa señal ni demuestra compatibilidad clínica. */
export function createFakePdfExtraction({ outcome = "SUCCESS", delayMs = 0 }: FakePdfExtractionOptions = {}): PdfExtraction {
  return createHttpPdfExtraction({
    endpoint: "https://synthetic.invalid/extract",
    // Transporte cerrado: nunca hay red ni fallback a globalThis.fetch.
    fetch: async (url, init) => {
      if (outcome === "TIMEOUT") return new Promise<Response>(() => undefined);
      if (delayMs > 0) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => { clearTimeout(timer); reject(new Error("Simulación cancelada.")); };
          const timer = setTimeout(() => { init.signal?.removeEventListener("abort", abort); resolve(); }, delayMs);
          init.signal?.addEventListener("abort", abort, { once: true });
        });
      }
      if (outcome === "PDF_EXTRACTION_UNAVAILABLE") throw new Error("Simulación no disponible.");
      const value = syntheticExtraction();
      if (outcome === "MISSING_REFERENCE") value.sourceReference = "";
      const isRejection = outcome.startsWith("PDF_");
      const body = isRejection ? { contract: "mortara-extraction.v1", error: { code: outcome } } :
        outcome === "INVALID_OUTPUT" ? {} : value;
      return new Response(JSON.stringify(body), { status: isRejection ? 422 : 200, headers: { "Content-Type": "application/json" } });
    },
  });
}
