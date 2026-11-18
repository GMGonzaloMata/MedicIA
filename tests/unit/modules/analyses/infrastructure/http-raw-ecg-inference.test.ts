import { afterEach, expect, it, vi } from "vitest";
import type { RawEcgExtraction } from "@/modules/analyses/application/ports/out/raw-ecg-inference";
import { createHttpRawEcgInference } from "@/modules/analyses/infrastructure/adapters/http-raw-ecg-inference";
import { createRawEcgInference } from "@/modules/analyses/infrastructure/adapters/create-raw-ecg-inference";

const MODEL_SHA = "a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96";
const SOURCE_SHA = "243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9";
const SOURCE = "git:4ff99ce97a42ff32a47268996f3cedcdabe70c1c";
const options = { endpoint: "https://e022.internal/invocations", modelSha256: MODEL_SHA, preprocessingSha256: SOURCE_SHA };
const answer = { status: "scored", model: "e022-combined", target: "lvef_lte_45", score: 0.42, research_only: true };
function extraction(): RawEcgExtraction {
  const measure = (value: number | null, unit: string) => ({ value, unit });
  return {
    contract: "mortara-extraction.v1", extractorVersion: "2", sourceReference: SOURCE, samplingHz: 500, unit: "uV",
    leads: (["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const).map((name) => ({
      name, samples: Array.from({ length: 5000 }, (value, i) => { void value; return i === 0 ? 12 : 0; }),
      observed: Array.from({ length: 5000 }, (value, i) => { void value; return i === 0; }),
    })), measurements: { sex: "male", age: measure(49, "years"), ventricular_rate: measure(68, "bpm"),
      atrial_rate: measure(null, "bpm"), pr_interval: measure(null, "ms"), qrs_duration: measure(96, "ms"), qt_corrected: measure(410, "ms") },
  };
}
function json(value: unknown = answer, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}
function adapter(response: () => Response | Promise<Response> = () => json()) {
  const transport = vi.fn(async (url: string, init: RequestInit) => { void url; void init; return response(); });
  return { transport, inference: createHttpRawEcgInference({ ...options, fetch: transport }) };
}
const input = () => ({ component: "e022" as const, extraction: extraction(), signal: new AbortController().signal });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

it("publica solo E022 con procedencia inmutable y mapea sin normalizar ni parsear otra vez", async () => {
  const { inference, transport } = adapter();
  expect(inference.getCapabilities()).toEqual({ echonext: { status: "NOT_AVAILABLE", reason: "PDF_PREPROCESSING_NOT_VERIFIED" },
    e022: { status: "AVAILABLE", preprocessingReference: `sha256:${SOURCE_SHA}` } });
  const request = input();
  const before = JSON.stringify(request.extraction);
  const result = await inference.predict(request);
  expect(result).toEqual({ component: "e022", modelName: "e022-combined", modelVersion: `sha256:${MODEL_SHA}`,
    preprocessingReference: `sha256:${SOURCE_SHA}`, result: { target: "lvef_lte_45", score: 0.42 } });
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe(options.endpoint);
  expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer" });
  const body = String(init.body);
  expect(init.headers).toEqual({ "Content-Type": "application/json", Accept: "application/json", "Content-Length": String(Buffer.byteLength(body)) });
  expect(JSON.parse(body)).toEqual({ waveform_uv: request.extraction.leads.map((l) => l.samples), observed: request.extraction.leads.map((l) => l.observed),
    tabular: { age_at_ecg: 49, sex: 1, ventricular_rate: 68, pr_interval: null, qrs_duration: 96, qt_corrected: 410 } });
  expect(JSON.stringify(request.extraction)).toBe(before);
  expect(body).not.toContain(SOURCE);
});
it.each(["female", null] as const)("mapea sexo sin inventar valor: %s", async (sex) => {
  const { inference, transport } = adapter(); const request = input();
  request.extraction = { ...request.extraction, measurements: { ...request.extraction.measurements, sex } };
  await inference.predict(request);
  expect(JSON.parse(String(transport.mock.calls[0][1].body)).tabular.sex).toBe(sex === "female" ? 0 : null);
});
it("asocia por nombre aunque el lector cambie el orden", async () => {
  const { inference, transport } = adapter(); const request = input();
  request.extraction = { ...request.extraction, leads: [...request.extraction.leads].reverse() };
  await inference.predict(request);
  expect(JSON.parse(String(transport.mock.calls[0][1].body)).waveform_uv).toEqual(extraction().leads.map((l) => l.samples));
});
it("Mini no disponible nunca hace red", async () => {
  const { inference, transport } = adapter();
  await expect(inference.predict({ ...input(), component: "echonext" })).rejects.toMatchObject({ code: "MODEL_UNAVAILABLE" });
  expect(transport).not.toHaveBeenCalled();
});
it.each([
  (e: RawEcgExtraction) => ({ ...e, samplingHz: 250 }),
  (e: RawEcgExtraction) => ({ ...e, sourceReference: "unverified" }),
  (e: RawEcgExtraction) => ({ ...e, extractorVersion: "3" }),
  (e: RawEcgExtraction) => ({ ...e, measurements: { ...e.measurements, age: { value: 49, unit: "months" } } }),
  (e: RawEcgExtraction) => ({ ...e, measurements: { ...e.measurements, sex: 1 } }),
  (e: RawEcgExtraction) => ({ ...e, leads: [...e.leads.slice(1), e.leads[1]] }),
  (e: RawEcgExtraction) => ({ ...e, leads: e.leads.map((l) => ({ ...l, samples: [NaN, ...l.samples.slice(1)] })) }),
  (e: RawEcgExtraction) => ({ ...e, leads: e.leads.map((l) => ({ ...l, samples: [12, 1, ...l.samples.slice(2)] })) }),
])("rechaza entrada/procedencia no verificadas antes de red sin mutación %#", async (change) => {
  const { inference, transport } = adapter();
  const value = change(extraction()); const before = JSON.stringify(value);
  // Ejercita la frontera pública con entradas externas que el tipado no garantiza en runtime.
  await expect(inference.predict({ ...input(), extraction: value as RawEcgExtraction })).rejects.toMatchObject({ code: "INPUT_REJECTED" });
  expect(JSON.stringify(value)).toBe(before); expect(transport).not.toHaveBeenCalled();
});
it.each([
  { ...answer, score: -0.1 }, { ...answer, score: 1.1 }, { ...answer, score: null }, { ...answer, research_only: false },
  { ...answer, model: "mini" }, { ...answer, target: "other" }, { ...answer, model_version: "made-up" }, { ...answer, patient: "PRIVATE" },
  { status: "unscored", reason: "invalid_observed_signal" },
])("valida toda la respuesta y no publica datos parciales %#", async (value) => {
  const { inference, transport } = adapter(() => json(value));
  await expect(inference.predict(input())).rejects.toMatchObject({ code: "INTERNAL", message: "El modelo falló de forma inesperada." });
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([0, 1])("admite límite de score %s", async (score) => {
  const { inference } = adapter(() => json({ ...answer, score }));
  await expect(inference.predict(input())).resolves.toMatchObject({ result: { score } });
});
it("422 unscored sin score se distingue de resultado negativo", async () => {
  const { inference } = adapter(() => json({ status: "unscored", reason: "invalid_observed_signal" }, 422));
  await expect(inference.predict(input())).rejects.toMatchObject({ code: "INPUT_REJECTED" });
});
it("422 con score o campos extra es protocolo inválido", async () => {
  const { inference } = adapter(() => json({ status: "unscored", reason: "invalid_observed_signal", score: 0 }, 422));
  await expect(inference.predict(input())).rejects.toMatchObject({ code: "INTERNAL" });
});
it.each([301, 400, 404, 429, 500, 503])("status %s no se sigue ni reintenta", async (status) => {
  const { inference, transport } = adapter(() => json({}, status));
  await expect(inference.predict(input())).rejects.toMatchObject({ code: [404, 503].includes(status) ? "MODEL_UNAVAILABLE" : "INTERNAL" });
  expect(transport).toHaveBeenCalledTimes(1);
});
it.each([
  () => new Response("PRIVATE", { headers: { "Content-Type": "text/html" } }),
  () => new Response("PRIVATE", { headers: { "Content-Type": "application/json" } }),
  () => new Response(new Uint8Array([255]), { headers: { "Content-Type": "application/json" } }),
  () => new Response(null, { headers: { "Content-Type": "application/json" } }),
  () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "4097" } }),
  () => new Response("{}", { headers: { "Content-Type": "application/json", "Content-Length": "-1" } }),
])("body inválido nunca filtra datos %#", async (response) => {
  const { inference } = adapter(response);
  await expect(inference.predict(input())).rejects.toMatchObject({ code: "INTERNAL" });
});
it("acota bytes de stream aun con Content-Length falso y cancela", async () => {
  const cancel = vi.fn(); const { inference } = adapter(() => new Response(new ReadableStream({
    pull(c) { c.enqueue(new Uint8Array(4097)); }, cancel,
  }), { headers: { "Content-Type": "application/json", "Content-Length": "1" } }));
  await expect(inference.predict(input())).rejects.toMatchObject({ code: "INTERNAL" });
  expect(cancel).toHaveBeenCalledOnce();
});
it("admite exactamente 4 KiB", async () => {
  const body = JSON.stringify(answer); const { inference } = adapter(() => new Response(body.padEnd(4096), { headers: { "Content-Type": "application/json" } }));
  await expect(inference.predict(input())).resolves.toMatchObject({ result: { score: 0.42 } });
});
it("error de red se sanitiza sin logs/cause/reintentos", async () => {
  const logs = vi.spyOn(console, "error");
  const { inference, transport } = adapter(() => { throw new Error("PRIVATE"); });
  try { await inference.predict(input()); expect.fail("Debe fallar"); } catch (error) {
    expect(error).toMatchObject({ code: "MODEL_UNAVAILABLE", message: "El modelo no está disponible." });
    expect(error).not.toHaveProperty("cause"); expect(String(error)).not.toContain("PRIVATE");
  }
  expect(logs).not.toHaveBeenCalled(); expect(transport).toHaveBeenCalledOnce();
});
it("aborto previo no hace red", async () => {
  const { inference, transport } = adapter(); const controller = new AbortController(); controller.abort("PRIVATE");
  await expect(inference.predict({ ...input(), signal: controller.signal })).rejects.toMatchObject({ code: "TIMEOUT" });
  expect(transport).not.toHaveBeenCalled();
});
it.each(["fetch", "stream"])("deadline real de 30 s incluye %s que ignore abort", async (stage) => {
  vi.useFakeTimers(); const cancel = vi.fn();
  const { inference, transport } = adapter(() => stage === "fetch" ? new Promise(() => undefined) : new Response(new ReadableStream({ cancel }), { headers: { "Content-Type": "application/json" } }));
  const pending = inference.predict(input()); const check = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  await vi.advanceTimersByTimeAsync(30_000); await check;
  expect(transport.mock.calls[0][1].signal?.aborted).toBe(true); expect(vi.getTimerCount()).toBe(0);
  if (stage === "stream") expect(cancel).toHaveBeenCalledOnce();
});
it("aborto durante fetch termina y descarta body tardío", async () => {
  vi.useFakeTimers(); let finish: (r: Response) => void = () => undefined;
  const { inference } = adapter(() => new Promise((resolve) => { finish = resolve; })); const controller = new AbortController();
  const pending = inference.predict({ ...input(), signal: controller.signal }); const check = expect(pending).rejects.toMatchObject({ code: "TIMEOUT" });
  controller.abort("PRIVATE"); await check; const cancel = vi.fn();
  finish(new Response(new ReadableStream({ cancel }))); await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0);
});
it.each(["invalid", "http://e022.internal/invocations", "https://user:secret@e022.internal", "https://e022.internal/#x", "https://e022.internal/extract", "https://e022.internal/invocations?x=1"])("URL inválida/otra ruta falla cerrada %s", (endpoint) => {
  expect(() => createHttpRawEcgInference({ ...options, endpoint })).toThrow("El modelo no está disponible.");
});
it("proveniencia incorrecta no anuncia AVAILABLE", () => {
  for (const key of ["modelSha256", "preprocessingSha256"] as const) {
    expect(() => createHttpRawEcgInference({ ...options, [key]: "0".repeat(64) })).toThrow("El modelo no está disponible.");
  }
});
it("factories requieren endpoint y hashes exactos; local solo fuera de producción", () => {
  vi.stubEnv("E022_INFERENCE_ENDPOINT", ""); expect(createRawEcgInference()).toBeNull();
  vi.stubEnv("E022_INFERENCE_ENDPOINT", options.endpoint);
  vi.stubEnv("E022_MODEL_SHA256", ""); vi.stubEnv("E022_PREPROCESSING_SHA256", SOURCE_SHA);
  expect(createRawEcgInference()).toBeNull();
  vi.stubEnv("E022_MODEL_SHA256", MODEL_SHA); expect(createRawEcgInference()).not.toBeNull();
  vi.stubEnv("E022_INFERENCE_ENDPOINT", "http://127.0.0.1:18080/invocations"); vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "");
  expect(createRawEcgInference()).toBeNull();
  vi.stubEnv("PDF_E022_LOCAL_SYNTHETIC", "1"); vi.stubEnv("NODE_ENV", "test"); expect(createRawEcgInference()).not.toBeNull();
  vi.stubEnv("NODE_ENV", "production"); expect(createRawEcgInference()).toBeNull();
});
