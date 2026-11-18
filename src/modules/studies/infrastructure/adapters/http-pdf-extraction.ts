import "server-only";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import { PdfExtractionError, type PdfExtraction } from "../../application/ports/out/pdf-extraction";
import { parsePdfExtraction } from "../../domain/pdf-extraction";
import { MAX_PDF_BYTES } from "../../domain/pdf-study-format";
import { StudyRejectedError } from "../../domain/study-errors";

const CONTRACT = "mortara-extraction.v1";
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
const DEADLINE_MS = 20_000;
const PDF_SIGNATURE = Buffer.from("%PDF-");
const errorResponse = z.strictObject({
  contract: z.literal(CONTRACT),
  error: z.strictObject({ code: z.enum(["PDF_INVALID", "PDF_UNSUPPORTED", "PDF_PROTECTED", "PDF_INCOMPLETE"]) }),
});

interface HttpPdfExtractionOptions {
  endpoint: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  allowLoopbackHttpForTests?: boolean;
}

function unavailable(): PdfExtractionError {
  return new PdfExtractionError("PDF_EXTRACTION_UNAVAILABLE");
}

function fixedEndpoint(options: HttpPdfExtractionOptions): string {
  let url: URL;
  try { url = new URL(options.endpoint); } catch { throw unavailable(); }
  const isLocalTest = options.allowLoopbackHttpForTests === true &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.protocol === "http:";
  if ((url.protocol !== "https:" && !isLocalTest) || url.username || url.password || url.hash) throw unavailable();
  return url.href;
}

function validateInput(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0) throw new StudyRejectedError("FILE_MISSING");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new StudyRejectedError("FILE_TOO_LARGE");
  // Prefiltro de formato, NO prueba de compatibilidad ni lectura del documento.
  if (!PDF_SIGNATURE.every((value, index) => bytes[index] === value)) throw new PdfExtractionError("PDF_INVALID");
}

/** URL solo de configuración de servidor. No habilita un lector externo ni elige un fake. */
export function createHttpPdfExtraction(options: HttpPdfExtractionOptions): PdfExtraction {
  const endpoint = fixedEndpoint(options);
  const transport = options.fetch ?? globalThis.fetch;
  return {
    async extract({ bytes, signal }) {
      validateInput(bytes);
      if (signal.aborted) throw unavailable();
      const controller = new AbortController();
      let responseBody: ReadableStream<Uint8Array> | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let cancelled = false;
      function cancelBody(): void {
        if (cancelled) return;
        cancelled = true;
        // La limpieza no debe prolongar el deadline ni publicar un error del proveedor.
        const cancellation = reader ? reader.cancel() : responseBody?.cancel();
        void cancellation?.catch(() => undefined);
      }
      const onCallerAbort = () => controller.abort();
      signal.addEventListener("abort", onCallerAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
      let onAbort: () => void = () => undefined;
      const aborted = new Promise<never>((_resolve, reject) => {
        onAbort = () => { cancelBody(); reject(unavailable()); };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        const work = async () => {
          const response = await transport(endpoint, {
            method: "POST", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ contract: CONTRACT, pdfBase64: Buffer.from(bytes).toString("base64"), requestId: randomUUID() }),
            signal: controller.signal,
          });
          responseBody = response.body;
          if (controller.signal.aborted) {
            // Un transporte defectuoso puede resolver después del aborto; no leer su cuerpo.
            void responseBody?.cancel().catch(() => undefined);
            throw unavailable();
          }
          if (![200, 400, 422].includes(response.status) || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw unavailable();
          const length = response.headers.get("content-length");
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw unavailable();
          if (!responseBody) throw unavailable();
          reader = responseBody.getReader();
          const chunks: Uint8Array[] = [];
          let total = 0;
          while (true) {
            const chunk = await reader.read();
            if (controller.signal.aborted) throw unavailable();
            if (chunk.done) break;
            total += chunk.value.byteLength;
            if (total > MAX_RESPONSE_BYTES) throw unavailable();
            chunks.push(chunk.value);
          }
          const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)));
          if (response.status !== 200) {
            const parsed = errorResponse.safeParse(value);
            if (!parsed.success) throw unavailable();
            throw new PdfExtractionError(parsed.data.error.code);
          }
          return parsePdfExtraction(value);
        };
        return await Promise.race([work(), aborted]);
      } catch (error) {
        // Recrear incluso errores propios evita causas/stacks/campos agregados por el transporte.
        throw error instanceof PdfExtractionError ? new PdfExtractionError(error.code) : unavailable();
      } finally {
        clearTimeout(timer);
        signal.removeEventListener("abort", onCallerAbort);
        controller.signal.removeEventListener("abort", onAbort);
        cancelBody();
        reader?.releaseLock();
      }
    },
  };
}
