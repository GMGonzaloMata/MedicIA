import "server-only";
import { Buffer } from "node:buffer";
import { z } from "zod";
import type { RawEcgCapabilities, RawEcgExtraction, RawEcgInference } from "../../application/ports/out/raw-ecg-inference";
import { ModelInferenceError } from "../../domain/analysis-errors";

const MODEL_SHA256 = "a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96";
const PREPROCESSING_SHA256 = "243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9";
const READER_REFERENCE = "git:4ff99ce97a42ff32a47268996f3cedcdabe70c1c";
const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;
const MAX_REQUEST_BYTES = 2 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 4096;
const DEADLINE_MS = 30_000;
const measurement = (unit: string) => z.strictObject({ value: z.number().finite().nullable(), unit: z.literal(unit) });
// Contrato propio de analyses: no importa el núcleo de studies. No transforma señal ni imputa.
const rawSchema = z.strictObject({
  contract: z.literal("mortara-extraction.v1"), extractorVersion: z.literal("2"), sourceReference: z.literal(READER_REFERENCE),
  samplingHz: z.literal(500), unit: z.literal("uV"),
  leads: z.array(z.strictObject({ name: z.enum(LEADS), samples: z.array(z.number().finite().refine((n) => Number.isFinite(Math.fround(n)))).length(5000),
    observed: z.array(z.boolean()).length(5000) }).refine((l) => l.samples.every((v, i) => l.observed[i] || v === 0))).length(12)
    .refine((leads) => new Set(leads.map((l) => l.name)).size === 12),
  measurements: z.strictObject({ sex: z.enum(["male", "female"]).nullable(), age: measurement("years"),
    ventricular_rate: measurement("bpm"), atrial_rate: measurement("bpm"), pr_interval: measurement("ms"),
    qrs_duration: measurement("ms"), qt_corrected: measurement("ms") }),
});
const scoredSchema = z.strictObject({ status: z.literal("scored"), model: z.literal("e022-combined"),
  target: z.literal("lvef_lte_45"), score: z.number().finite().min(0).max(1), research_only: z.literal(true) });
const unscoredSchema = z.strictObject({ status: z.literal("unscored"), reason: z.enum([
  "invalid_request_fields", "invalid_tabular_fields", "invalid_tabular_values", "invalid_sex", "invalid_samples_or_mask",
  "invalid_shape", "invalid_observed_signal",
]) });
interface HttpRawEcgInferenceOptions {
  endpoint: string;
  modelSha256: string;
  preprocessingSha256: string;
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  allowLoopbackHttpForTests?: boolean;
}
function fixedEndpoint(options: HttpRawEcgInferenceOptions): string {
  const fail = () => new ModelInferenceError("MODEL_UNAVAILABLE");
  if (options.modelSha256 !== MODEL_SHA256 || options.preprocessingSha256 !== PREPROCESSING_SHA256) throw fail();
  let url: URL;
  try { url = new URL(options.endpoint); } catch { throw fail(); }
  const local = options.allowLoopbackHttpForTests === true && url.protocol === "http:" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if ((url.protocol !== "https:" && !local) || url.username || url.password || url.hash || url.search || url.pathname !== "/invocations") throw fail();
  return url.href;
}
function numericBody(extraction: RawEcgExtraction): string {
  const parsed = rawSchema.safeParse(extraction);
  if (!parsed.success) throw new ModelInferenceError("INPUT_REJECTED");
  const e = parsed.data;
  // Asociación por nombre, nunca por orden de llegada. El esquema garantiza doce nombres únicos.
  const ordered = LEADS.map((name) => e.leads.find((lead) => lead.name === name));
  const m = e.measurements;
  const body = JSON.stringify({ waveform_uv: ordered.map((l) => l?.samples), observed: ordered.map((l) => l?.observed),
    tabular: { age_at_ecg: m.age.value, sex: m.sex === null ? null : m.sex === "male" ? 1 : 0,
      ventricular_rate: m.ventricular_rate.value, pr_interval: m.pr_interval.value,
      qrs_duration: m.qrs_duration.value, qt_corrected: m.qt_corrected.value } });
  if (Buffer.byteLength(body) > MAX_REQUEST_BYTES) throw new ModelInferenceError("INPUT_REJECTED");
  return body;
}

/** E022 ya normaliza/imputa/escala en inference.py. Aquí solo se valida y mapea su wire. */
export function createHttpRawEcgInference(options: HttpRawEcgInferenceOptions): RawEcgInference {
  const endpoint = fixedEndpoint(options);
  const transport = options.fetch ?? globalThis.fetch;
  const preprocessingReference = `sha256:${PREPROCESSING_SHA256}`;
  const capabilities: RawEcgCapabilities = Object.freeze({
    echonext: Object.freeze({ status: "NOT_AVAILABLE", reason: "PDF_PREPROCESSING_NOT_VERIFIED" }),
    e022: Object.freeze({ status: "AVAILABLE", preprocessingReference }),
  });
  return {
    getCapabilities: () => capabilities,
    async predict({ component, extraction, signal }) {
      if (component !== "e022") throw new ModelInferenceError("MODEL_UNAVAILABLE");
      if (signal.aborted) throw new ModelInferenceError("TIMEOUT");
      const body = numericBody(extraction);
      const controller = new AbortController();
      let responseBody: ReadableStream<Uint8Array> | null = null;
      let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
      let cancelled = false;
      const cancelBody = () => {
        if (cancelled) return;
        cancelled = true;
        void (reader ? reader.cancel() : responseBody?.cancel())?.catch(() => undefined);
      };
      const onCallerAbort = () => controller.abort();
      signal.addEventListener("abort", onCallerAbort, { once: true });
      const timer = setTimeout(() => controller.abort(), DEADLINE_MS);
      let onAbort: () => void = () => undefined;
      const aborted = new Promise<never>((resolve, reject) => {
        void resolve;
        onAbort = () => { cancelBody(); reject(new ModelInferenceError("TIMEOUT")); };
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      try {
        const work = async () => {
          let response: Response;
          try {
            response = await transport(endpoint, { method: "POST", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
              headers: { "Content-Type": "application/json", Accept: "application/json", "Content-Length": String(Buffer.byteLength(body)) },
              body, signal: controller.signal });
          } catch { throw new ModelInferenceError("MODEL_UNAVAILABLE"); }
          responseBody = response.body;
          if (controller.signal.aborted) {
            void responseBody?.cancel().catch(() => undefined);
            throw new ModelInferenceError("TIMEOUT");
          }
          if ([404, 503].includes(response.status)) throw new ModelInferenceError("MODEL_UNAVAILABLE");
          if (![200, 422].includes(response.status) || !/^application\/json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new ModelInferenceError("INTERNAL");
          const length = response.headers.get("content-length");
          if (length !== null && (!/^\d+$/.test(length) || Number(length) > MAX_RESPONSE_BYTES)) throw new ModelInferenceError("INTERNAL");
          if (!responseBody) throw new ModelInferenceError("INTERNAL");
          reader = responseBody.getReader();
          const chunks: Uint8Array[] = [];
          let total = 0;
          while (true) {
            const chunk = await reader.read();
            if (controller.signal.aborted) throw new ModelInferenceError("TIMEOUT");
            if (chunk.done) break;
            total += chunk.value.byteLength;
            if (total > MAX_RESPONSE_BYTES) throw new ModelInferenceError("INTERNAL");
            chunks.push(chunk.value);
          }
          const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, total)));
          if (response.status === 422) {
            if (!unscoredSchema.safeParse(value).success) throw new ModelInferenceError("INTERNAL");
            throw new ModelInferenceError("INPUT_REJECTED");
          }
          const parsed = scoredSchema.safeParse(value);
          if (!parsed.success) throw new ModelInferenceError("INTERNAL");
          return { component: "e022", modelName: parsed.data.model, modelVersion: `sha256:${MODEL_SHA256}`, preprocessingReference,
            result: { target: parsed.data.target, score: parsed.data.score } };
        };
        return await Promise.race([work(), aborted]);
      } catch (error) {
        throw new ModelInferenceError(controller.signal.aborted ? "TIMEOUT" : error instanceof ModelInferenceError ? error.code : "INTERNAL");
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
