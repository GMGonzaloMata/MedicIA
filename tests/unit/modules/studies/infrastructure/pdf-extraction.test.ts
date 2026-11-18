import { Buffer } from "node:buffer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PdfExtractionError, type PdfExtraction } from "@/modules/studies/application/ports/out/pdf-extraction";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { createHttpPdfExtraction } from "@/modules/studies/infrastructure/adapters/http-pdf-extraction";

const ENDPOINT = "https://reader.internal/extract";
const MAX_RESPONSE = 4 * 1024 * 1024;
const PRIVATE = "SYNTHETIC-PRIVATE-NAME-document.pdf token=private-marker";
const pdf = () => new TextEncoder().encode(`%PDF-1.7\n${PRIVATE}\n%%EOF`);
const signal = () => new AbortController().signal;
const messages = {
  FILE_MISSING: "Elegí un archivo para subir.",
  FILE_TOO_LARGE: "El archivo supera el tamaño máximo de 2 MB.",
  PDF_INVALID: "El archivo no es un PDF válido.",
  PDF_UNSUPPORTED: "Este PDF no es de un formato Mortara compatible.",
  PDF_PROTECTED: "El PDF está protegido y no se puede leer.",
  PDF_INCOMPLETE: "El PDF no contiene los datos necesarios para guardar el estudio.",
  PDF_EXTRACTION_UNAVAILABLE: "No pudimos leer el PDF. Probá de nuevo más tarde.",
} as const;

function extraction() {
  const measure = { value: null, unit: "synthetic" };
  return {
    contract: "mortara-extraction.v1", extractorVersion: "synthetic-test-v1", sourceReference: "synthetic-test-only",
    samplingHz: 500, unit: "uV",
    leads: ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"].map((name) => ({
      name, samples: Array<number>(5000).fill(0), observed: Array<boolean>(5000).fill(false),
    })),
    measurements: { sex: null, age: measure, ventricular_rate: measure, atrial_rate: measure,
      pr_interval: measure, qrs_duration: measure, qt_corrected: measure },
  };
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function adapter(response: () => Response | Promise<Response> = () => json(extraction())) {
  const transport = vi.fn(async (_url: string, _init: RequestInit) => response());
  return { reader: createHttpPdfExtraction({ endpoint: ENDPOINT, fetch: transport }), transport };
}

async function rejects(reader: PdfExtraction, code: keyof typeof messages, bytes = pdf()) {
  const before = bytes.slice();
  await expect(reader.extract({ bytes, signal: signal() })).rejects.toMatchObject({ code, message: messages[code] });
  expect(bytes).toEqual(before);
}

beforeEach(() => {
  for (const method of ["log", "info", "warn", "error", "debug"] as const) vi.spyOn(console, method).mockImplementation(() => undefined);
  vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Red real prohibida en esta prueba."));
});
afterEach(() => {
  expect(globalThis.fetch).not.toHaveBeenCalled();
  for (const method of ["log", "info", "warn", "error", "debug"] as const) expect(console[method]).not.toHaveBeenCalled();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("frontera HTTP privada de extracción PDF", () => {
  it("envía solo bytes/protocolo/correlación opaca a URL fija, sin redirects, credenciales ni caché", async () => {
    const value = extraction();
    value.leads[0].samples[0] = 0.1;
    value.leads[0].observed[0] = true;
    const original = JSON.stringify(value);
    const { reader, transport } = adapter(() => json(value));
    const bytes = pdf();
    const before = bytes.slice();
    const result = await reader.extract({ bytes, signal: signal() });
    expect(result).toEqual(value);
    expect(Object.isFrozen(result.leads[0].samples)).toBe(true);
    expect(JSON.stringify(value)).toBe(original);
    expect(bytes).toEqual(before);
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(ENDPOINT);
    expect(init).toMatchObject({ method: "POST", redirect: "error", credentials: "omit", cache: "no-store", referrerPolicy: "no-referrer",
      headers: { "Content-Type": "application/json", Accept: "application/json" } });
    const body: unknown = JSON.parse(String(init.body));
    expect(body).toEqual({ contract: "mortara-extraction.v1", pdfBase64: Buffer.from(bytes).toString("base64"), requestId: expect.stringMatching(/^[a-f0-9-]{36}$/) });
    expect(String(init.body)).not.toContain(PRIVATE);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    [new Uint8Array(), "FILE_MISSING"], [new Uint8Array(1), "PDF_INVALID"],
    [new TextEncoder().encode(PRIVATE), "PDF_INVALID"], [new Uint8Array(2_097_153), "FILE_TOO_LARGE"],
  ] as const)("rechaza localmente entrada inválida %# sin invocaciones ni mutación", async (bytes, code) => {
    const { reader, transport } = adapter();
    await rejects(reader, code, bytes);
    expect(transport).not.toHaveBeenCalled();
  });

  it("admite el límite exacto de 2 MiB sin afirmar compatibilidad por el encabezado", async () => {
    const bytes = new Uint8Array(2_097_152);
    bytes.set(pdf());
    const { reader, transport } = adapter(() => json({ contract: "mortara-extraction.v1", error: { code: "PDF_UNSUPPORTED" } }, 422));
    await rejects(reader, "PDF_UNSUPPORTED", bytes);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each(["PDF_INVALID", "PDF_UNSUPPORTED", "PDF_PROTECTED", "PDF_INCOMPLETE"] as const)("acepta solo rechazo explícito validado %s", async (code) => {
    const { reader, transport } = adapter(() => json({ contract: "mortara-extraction.v1", error: { code } }, 422));
    await rejects(reader, code);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    { contract: "mortara-extraction.v1", error: { code: "PDF_PROTECTED", message: PRIVATE } },
    { contract: "mortara-extraction.v1", error: { code: PRIVATE } },
    { contract: "unknown", error: { code: "PDF_PROTECTED" } },
    { contract: "mortara-extraction.v1", error: { code: "PDF_PROTECTED" }, patient: PRIVATE },
    { error: { code: "PDF_PROTECTED" } },
  ])("no confía en errores externos fuera de esquema %#", async (value) => {
    const { reader, transport } = adapter(() => json(value, 400));
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([201, 204, 301, 302, 303, 307, 308, 401, 403, 404, 429, 500, 503])("HTTP %s no reintenta ni sigue redirecciones", async (status) => {
    const { reader, transport } = adapter(() => new Response(null, { status, headers: { Location: "https://outside.invalid/private" } }));
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => ({ ...extraction(), extractorVersion: "x".repeat(129) }),
    () => ({ ...extraction(), sourceReference: "" }),
    () => ({ ...extraction(), sourceReference: "x".repeat(129) }),
    () => ({ ...extraction(), patient: PRIVATE }),
    () => ({ ...extraction(), contract: "other" }),
    () => ({ ...extraction(), samplingHz: 250 }),
    () => ({ ...extraction(), leads: [] }),
    () => ({ contract: "mortara-extraction.v1", error: { code: "PDF_PROTECTED" } }),
  ])("rechaza extracción inválida/metadata excesiva sin devolver payload %#", async (value) => {
    const { reader, transport } = adapter(() => json(value()));
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([
    () => new Response(PRIVATE, { headers: { "Content-Type": "text/html" } }),
    () => new Response(PRIVATE, { headers: { "Content-Type": "application/json" } }),
    () => new Response(new Uint8Array([0xff]), { headers: { "Content-Type": "application/json" } }),
    () => new Response(null, { headers: { "Content-Type": "application/json" } }),
  ])("JSON, UTF-8 o body inválidos son genéricos %#", async (response) => {
    const { reader, transport } = adapter(response);
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it.each([String(MAX_RESPONSE + 1), "invalid", "-1"])("rechaza Content-Length inválido/excesivo %s antes de leer", async (length) => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream<Uint8Array>({ cancel }), {
      headers: { "Content-Type": "application/json", "Content-Length": length },
    });
    const { reader, transport } = adapter(() => response);
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("corta streaming al superar 4 MiB sin confiar en Content-Length ni parsear", async () => {
    const cancel = vi.fn();
    let reads = 0;
    const response = new Response(new ReadableStream<Uint8Array>({
      pull(controller) { reads++; controller.enqueue(new Uint8Array(MAX_RESPONSE / 2 + 1)); }, cancel,
    }), { headers: { "Content-Type": "application/json", "Content-Length": "1" } });
    const { reader, transport } = adapter(() => response);
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    expect(transport).toHaveBeenCalledTimes(1);
    expect(reads).toBeLessThanOrEqual(3);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("admite exactamente 4 MiB antes de parsear y conserva contenido", async () => {
    const value = extraction();
    const body = JSON.stringify(value);
    expect(body.length).toBeLessThan(MAX_RESPONSE);
    const response = new Response(body + " ".repeat(MAX_RESPONSE - body.length), { headers: { "Content-Type": "application/json" } });
    const { reader, transport } = adapter(() => response);
    expect(await reader.extract({ bytes: pdf(), signal: signal() })).toEqual(value);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("fallo de transporte no filtra mensaje/cause/stack externos ni reintenta", async () => {
    const { reader, transport } = adapter(() => { throw new Error(PRIVATE); });
    await rejects(reader, "PDF_EXTRACTION_UNAVAILABLE");
    try { await reader.extract({ bytes: pdf(), signal: signal() }); } catch (error) {
      expect(error).toBeInstanceOf(PdfExtractionError);
      expect(String(error)).not.toContain(PRIVATE);
      expect(JSON.stringify(error)).not.toContain(PRIVATE);
      expect(error).not.toHaveProperty("cause");
    }
    expect(transport).toHaveBeenCalledTimes(2);
  });

  it("rechaza cancelación previa sin invocar transporte", async () => {
    const controller = new AbortController(); controller.abort(PRIVATE);
    const { reader, transport } = adapter();
    const bytes = pdf(); const before = bytes.slice();
    await expect(reader.extract({ bytes, signal: controller.signal })).rejects.toMatchObject({
      code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE,
    });
    expect(bytes).toEqual(before);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["fetch", "stream"])("deadline 20 s incluye %s aunque ignore el signal", async (stage) => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    const { reader, transport } = adapter(() => stage === "fetch" ? new Promise<Response>(() => undefined) :
      new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "Content-Type": "application/json" } }));
    const bytes = pdf(); const before = bytes.slice();
    const pending = reader.extract({ bytes, signal: signal() });
    const check = expect(pending).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE });
    await vi.advanceTimersByTimeAsync(19_999);
    expect(transport.mock.calls[0][1].signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await check;
    expect(bytes).toEqual(before);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(transport.mock.calls[0][1].signal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    if (stage === "stream") expect(cancel).toHaveBeenCalledTimes(1);
  });

  it("cancelación durante fetch no espera al transporte y descarta un body tardío", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    let finish: (response: Response) => void = () => undefined;
    const { reader, transport } = adapter(() => new Promise<Response>((resolve) => { finish = resolve; }));
    const bytes = pdf(); const before = bytes.slice();
    const pending = reader.extract({ bytes, signal: controller.signal });
    const check = expect(pending).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE });
    controller.abort(PRIVATE);
    await check;
    expect(bytes).toEqual(before);
    const cancel = vi.fn(() => Promise.reject(new Error(PRIVATE)));
    finish(new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "Content-Type": "application/json" } }));
    await vi.advanceTimersByTimeAsync(0);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("cancelación durante lectura cierra stream, sanitiza motivo y limpia timer/listener", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const remove = vi.spyOn(controller.signal, "removeEventListener");
    const cancel = vi.fn();
    const { reader, transport } = adapter(() => new Response(new ReadableStream<Uint8Array>({ cancel }), { headers: { "Content-Type": "application/json" } }));
    const bytes = pdf(); const before = bytes.slice();
    const pending = reader.extract({ bytes, signal: controller.signal });
    const check = expect(pending).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE });
    await vi.advanceTimersByTimeAsync(0);
    controller.abort(PRIVATE);
    await check;
    expect(bytes).toEqual(before);
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalled();
    expect(transport).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["http://reader.internal/extract", "http://127.0.0.1/extract", "ftp://reader.internal/extract", "invalid", "https://user:password@reader.internal/extract", "https://reader.internal/extract#private"])("rechaza configuración insegura %s sin invocar", (endpoint) => {
    const transport = vi.fn();
    expect(() => createHttpPdfExtraction({ endpoint, fetch: transport })).toThrow(messages.PDF_EXTRACTION_UNAVAILABLE);
    expect(transport).not.toHaveBeenCalled();
  });

  it.each(["localhost", "127.0.0.1", "[::1]"])("permite solo loopback explícito de prueba %s", async (host) => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => json(extraction()));
    const reader = createHttpPdfExtraction({ endpoint: `http://${host}:9000/extract`, allowLoopbackHttpForTests: true, fetch: transport });
    await reader.extract({ bytes: pdf(), signal: signal() });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("flag de prueba no admite hosts remotos o parecidos a loopback", () => {
    for (const host of ["reader.internal", "localhost.evil.invalid", "127.0.0.1.evil.invalid"]) {
      expect(() => createHttpPdfExtraction({ endpoint: `http://${host}/extract`, allowLoopbackHttpForTests: true, fetch: vi.fn() })).toThrow(messages.PDF_EXTRACTION_UNAVAILABLE);
    }
  });

  it("captura configuración y genera correlaciones independientes, sin URL del llamante", async () => {
    const transport = vi.fn(async (_url: string, _init: RequestInit) => json(extraction()));
    const options = { endpoint: ENDPOINT, fetch: transport };
    const reader = createHttpPdfExtraction(options);
    options.endpoint = "https://changed.invalid";
    for (let i = 0; i < 2; i++) await reader.extract({ bytes: pdf(), signal: signal() });
    expect(transport.mock.calls.map((call) => call[0])).toEqual([ENDPOINT, ENDPOINT]);
    expect(transport).toHaveBeenCalledTimes(2);
    const bodies = transport.mock.calls.map((call) => JSON.parse(String(call[1].body)) as { requestId: string });
    expect(bodies[0].requestId).not.toBe(bodies[1].requestId);
  });
});

describe("fake explícitamente sintético, nunca fallback clínico", () => {
  it("éxito determinista identificado y aislado por llamada, sin señal inventada", async () => {
    const reader = createFakePdfExtraction();
    const a = await reader.extract({ bytes: pdf(), signal: signal() });
    const b = await reader.extract({ bytes: pdf(), signal: signal() });
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
    expect(a.extractorVersion).toContain("synthetic");
    expect(a.sourceReference).toContain("synthetic");
    expect(a.leads.every((lead) => lead.samples.every((value) => value === 0) && lead.observed.every((value) => !value))).toBe(true);
    const { sex, ...numericMeasurements } = a.measurements;
    expect(sex).toBeNull();
    expect(Object.values(numericMeasurements).every((value) => value.value === null)).toBe(true);
  });
  it.each(["PDF_INVALID", "PDF_PROTECTED", "PDF_UNSUPPORTED", "PDF_INCOMPLETE", "PDF_EXTRACTION_UNAVAILABLE"] as const)("escenario explícito %s", async (outcome) => {
    await rejects(createFakePdfExtraction({ outcome }), outcome);
  });
  it.each(["INVALID_OUTPUT", "MISSING_REFERENCE"] as const)("simula contrato inválido %s sin presentarlo como éxito", async (outcome) => {
    await rejects(createFakePdfExtraction({ outcome }), "PDF_EXTRACTION_UNAVAILABLE");
  });
  it("reutiliza validación de entrada y errores compartidos", async () => {
    await rejects(createFakePdfExtraction(), "FILE_MISSING", new Uint8Array());
    await rejects(createFakePdfExtraction(), "FILE_TOO_LARGE", new Uint8Array(2_097_153));
    await rejects(createFakePdfExtraction(), "PDF_INVALID", new Uint8Array(1));
  });
  it("simula demora sin esperar tiempo real y libera el deadline tras éxito", async () => {
    vi.useFakeTimers();
    const pending = createFakePdfExtraction({ delayMs: 50 }).extract({ bytes: pdf(), signal: signal() });
    await vi.advanceTimersByTimeAsync(50);
    expect((await pending).extractorVersion).toContain("synthetic");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("timeout/cancelación del fake no produce extracción ni deja timers", async () => {
    vi.useFakeTimers();
    const bytes = pdf(); const before = bytes.slice();
    const pending = createFakePdfExtraction({ outcome: "TIMEOUT" }).extract({ bytes, signal: signal() });
    const check = expect(pending).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE });
    await vi.advanceTimersByTimeAsync(20_000); await check;
    expect(bytes).toEqual(before);
    const controller = new AbortController();
    const delayed = createFakePdfExtraction({ delayMs: 10_000 }).extract({ bytes, signal: controller.signal });
    const cancelled = expect(delayed).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: messages.PDF_EXTRACTION_UNAVAILABLE });
    controller.abort(PRIVATE); await cancelled;
    expect(bytes).toEqual(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
