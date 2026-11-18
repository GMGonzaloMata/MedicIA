// @vitest-environment node
import { Buffer } from "node:buffer";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";

import { InvalidPdfExtractionError, parsePdfExtraction } from "@/modules/studies/domain/pdf-extraction";
import { decodePdfStudy, encodePdfStudy, MAX_PDF_BYTES, MAX_PDF_STUDY_BYTES } from "@/modules/studies/domain/pdf-study-format";
import { decodeStoredStudy, StoredStudyCorruptError } from "@/modules/studies/domain/stored-study-format";

const LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"];
const NUMERIC_MEASURES = ["age", "ventricular_rate", "atrial_rate", "pr_interval", "qrs_duration", "qt_corrected"] as const;
const CORRUPT_MESSAGE = "El archivo guardado del estudio está dañado o tiene un formato desconocido.";
const EXTRACTION_MESSAGE = "La extracción del PDF no tiene la forma esperada.";
const PIN = "4ff99ce97a42ff32a47268996f3cedcdabe70c1c";
type Measurement = { value: number | null; unit: string };

function extraction() {
  const measurement = (value: number | null, unit: string): Measurement => ({ value, unit });
  const measurements: { sex: "female" | "male" | null } & Record<typeof NUMERIC_MEASURES[number], Measurement> = {
    sex: "female", age: measurement(40, "years"), ["ventricular_rate"]: measurement(70, "bpm"),
    ["atrial_rate"]: measurement(null, "bpm"), ["pr_interval"]: measurement(null, "ms"),
    ["qrs_duration"]: measurement(90, "ms"), ["qt_corrected"]: measurement(400, "ms"),
  };
  return {
    contract: "mortara-extraction.v1", extractorVersion: "2", sourceReference: PIN,
    samplingHz: 500, unit: "uV",
    leads: LEADS.map((name, index) => ({
      name,
      samples: Array.from({ length: 5000 }, (unused, sample) => sample < 2 ? Math.fround(index + sample / 10) : 0),
      observed: Array.from({ length: 5000 }, (unused, sample) => sample < 2),
    })),
    measurements,
  };
}

function envelope() {
  return {
    format: "MEDPDF01", originalPdfBase64: Buffer.from("%PDF-synthetic\u0000\u00ff").toString("base64"),
    extraction: extraction(), derivatives: { version: 1 },
  };
}
function jsonBytes(value: unknown): Uint8Array { return new TextEncoder().encode(JSON.stringify(value)); }
function expectError(action: () => unknown, kind: typeof StoredStudyCorruptError | typeof InvalidPdfExtractionError, message: string) {
  try {
    action();
    expect.unreachable("Se esperaba rechazo.");
  } catch (error) {
    expect(error).toBeInstanceOf(kind);
    expect(error).toHaveProperty("message", message);
  }
}
function rejectEnvelope(value: unknown) {
  const before = structuredClone(value);
  expectError(() => encodePdfStudy(value), StoredStudyCorruptError, CORRUPT_MESSAGE);
  expectError(() => decodePdfStudy(jsonBytes(value)), StoredStudyCorruptError, CORRUPT_MESSAGE);
  expect(value).toEqual(before);
}
function rejectExtraction(value: unknown) {
  const before = structuredClone(value);
  const storedBytes = jsonBytes({ ...envelope(), extraction: value });
  const beforeBytes = storedBytes.slice();
  expectError(() => parsePdfExtraction(value), InvalidPdfExtractionError, EXTRACTION_MESSAGE);
  expectError(() => encodePdfStudy({ ...envelope(), extraction: value }), StoredStudyCorruptError, CORRUPT_MESSAGE);
  // JSON convierte NaN/Infinity de una medida a null válido: no es la misma entrada rechazada.
  if (isDeepStrictEqual(value, JSON.parse(JSON.stringify(value)))) {
    expectError(() => decodePdfStudy(storedBytes), StoredStudyCorruptError, CORRUPT_MESSAGE);
  }
  expect(isDeepStrictEqual(storedBytes, beforeBytes)).toBe(true);
  expect(isDeepStrictEqual(value, before)).toBe(true);
}

describe("sobre MEDPDF01 independiente de ecg1", () => {
  it("preserva bytes privados, señal observada, máscara, unidades, medidas y procedencia sin mutar", () => {
    const original = envelope();
    // Incluye los 256 bytes posibles, no solo una cadena PDF convertida a UTF-8.
    const originalBytes = Buffer.from(Array.from({ length: 256 }, (unused, index) => index));
    original.originalPdfBase64 = originalBytes.toString("base64");
    const before = structuredClone(original);
    const bytes = encodePdfStudy(original);
    const decoded = decodePdfStudy(bytes);
    expect(decoded).toEqual(before);
    expect(JSON.parse(new TextDecoder().decode(bytes))).toEqual(before);
    expect(Buffer.from(decoded.originalPdfBase64, "base64")).toEqual(originalBytes);
    expect(original).toEqual(before);
    const padded = new Uint8Array(bytes.length + 8);
    padded.set(bytes, 4);
    expect(decodePdfStudy(padded.subarray(4, 4 + bytes.length))).toEqual(decoded);
    expectError(() => decodeStoredStudy(bytes), StoredStudyCorruptError, CORRUPT_MESSAGE);
    bytes.fill(0);
    expect(decoded).toEqual(before);
  });

  it.each([0, 1, 2_097_152, 2_097_153])("valida original de %s bytes sin recortarlo", (size) => {
    expect(MAX_PDF_BYTES).toBe(2_097_152);
    const input = { ...envelope(), originalPdfBase64: Buffer.alloc(size, 0xab).toString("base64") };
    if (size === 0 || size > MAX_PDF_BYTES) {
      rejectEnvelope(input);
    } else {
      const decoded = decodePdfStudy(encodePdfStudy(input));
      expect(Buffer.from(decoded.originalPdfBase64, "base64")).toEqual(Buffer.alloc(size, 0xab));
    }
  });

  it("admite 16 MiB exactos y rechaza por encima antes de parsear; no muta bytes", () => {
    expect(MAX_PDF_STUDY_BYTES).toBe(16 * 1024 * 1024);
    const input = envelope();
    const raw = jsonBytes(input);
    const atLimit = new Uint8Array(MAX_PDF_STUDY_BYTES).fill(32);
    atLimit.set(raw);
    expect(decodePdfStudy(atLimit)).toEqual(input);
    expect(atLimit.subarray(0, raw.length)).toEqual(raw);
    expect(atLimit.at(-1)).toBe(32);
    const above = new Uint8Array(MAX_PDF_STUDY_BYTES + 1).fill(32);
    above.set(raw);
    expectError(() => decodePdfStudy(above), StoredStudyCorruptError, CORRUPT_MESSAGE);
    expect(above.subarray(0, raw.length)).toEqual(raw);
    expect(above.at(-1)).toBe(32);
  });

  it.each([new Uint8Array(), new Uint8Array([0xff]), new Uint8Array([0x7b, 0xff]), jsonBytes("not-envelope"),
    new TextEncoder().encode("{truncated"), jsonBytes(null), jsonBytes([])])("rechaza corrupción/UTF-8/JSON %#", (bytes) => {
    const before = bytes.slice();
    expectError(() => decodePdfStudy(bytes), StoredStudyCorruptError, CORRUPT_MESSAGE);
    expect(bytes).toEqual(before);
  });

  it.each(["", "YQ", "YR==", "YQ==\n", " YQ==", "-w==", "!!!!", "é", "YQ==="])("rechaza base64 no canónico %#", (originalPdfBase64) => {
    rejectEnvelope({ ...envelope(), originalPdfBase64 });
  });

  it.each([
    { format: "MEDPDF02" }, { format: "MEDECG01" }, { originalPdfBase64: null },
    { derivatives: {} }, { derivatives: { version: 2 } }, { derivatives: { version: 1, tensors: [] } },
    { originalFilename: "private-value" }, { patient: "private-value" },
  ])("rechaza versión, derivados o metadata extra %#", (override) => rejectEnvelope({ ...envelope(), ...override }));

  it.each(["format", "originalPdfBase64", "extraction", "derivatives"])("rechaza campo obligatorio ausente %s", (key) => {
    const value: Record<string, unknown> = { ...envelope() };
    delete value[key];
    rejectEnvelope(value);
  });
});

describe("extracción estricta: ninguna adaptación científica", () => {
  it("conserva orden por nombre, ceros observados y huecos distintos; no redondea ni reordena", () => {
    const input = extraction();
    input.leads.reverse();
    const first = input.leads[0];
    if (!first) throw new Error("Missing synthetic lead");
    first.samples[0] = 0.1;
    const before = structuredClone(input);
    const parsed = parsePdfExtraction(input);
    expect(parsed).toEqual(before);
    expect(parsed.leads[0]?.samples[0]).toBe(0.1);
    expect(parsed.leads[11]?.observed.slice(0, 3)).toEqual([true, true, false]);
    expect(parsed.leads[11]?.samples.slice(0, 3)).toEqual([0, Math.fround(0.1), 0]);
    const decoded = decodePdfStudy(encodePdfStudy({ ...envelope(), extraction: input }));
    expect(decoded.extraction).toEqual(before);
    expect(decoded.extraction.leads[0]?.samples[0]).toBe(0.1);
    expect(decoded.extraction.leads[0]?.samples[0]).not.toBe(Math.fround(0.1));
    expect(input).toEqual(before);
  });

  it("conserva null explícito, cero y ambos sexos sin imputar medidas", () => {
    for (const sex of ["male", "female", null] as const) {
      const input = extraction();
      input.measurements.sex = sex;
      for (const key of NUMERIC_MEASURES) input.measurements[key].value = null;
      input.measurements.age.value = 0;
      expect(parsePdfExtraction(input)).toEqual(input);
    }
  });

  it.each([128, 129])("acota referencia y versión a %s caracteres", (length) => {
    const input = { ...extraction(), extractorVersion: "v".repeat(length), sourceReference: "r".repeat(length) };
    if (length === 128) expect(parsePdfExtraction(input)).toEqual(input);
    else rejectExtraction(input);
  });

  it.each([32, 33])("acota unidades a %s caracteres", (length) => {
    const input = extraction();
    input.measurements.age.unit = "u".repeat(length);
    if (length === 32) expect(parsePdfExtraction(input)).toEqual(input);
    else rejectExtraction(input);
  });

  it.each([
    { contract: "mortara-extraction.v2" }, { samplingHz: 250 }, { unit: "mV" },
    { extractorVersion: " " }, { sourceReference: "" }, { patient: "private-value" },
    { leads: [] }, { measurements: {} },
  ])("rechaza versión/unidades/dimensiones/metadata %#", (override) => rejectExtraction({ ...extraction(), ...override }));

  it.each(["contract", "extractorVersion", "sourceReference", "samplingHz", "unit", "leads", "measurements"])(
    "rechaza campo de extracción ausente %s", (key) => {
      const input: Record<string, unknown> = { ...extraction() };
      delete input[key];
      rejectExtraction(input);
    },
  );

  it.each([11, 13])("rechaza %s derivaciones", (count) => {
    const input = extraction();
    input.leads = count === 11 ? input.leads.slice(1) : [...input.leads, ...input.leads.slice(0, 1)];
    rejectExtraction(input);
  });

  it.each(["duplicate", "unknown", "extra", "sample-short", "sample-long", "mask-short", "mask-long", "mask-number"])(
    "rechaza nombre/dimensión/tipo de derivación %s", (kind) => {
      const input = extraction();
      const lead = input.leads[0];
      if (!lead) throw new Error("Missing synthetic lead");
      if (kind === "duplicate") lead.name = "II";
      if (kind === "unknown") lead.name = "X";
      if (kind === "sample-short") lead.samples.pop();
      if (kind === "sample-long") lead.samples.push(0);
      if (kind === "mask-short") lead.observed.pop();
      if (kind === "mask-long") lead.observed.push(false);
      if (kind === "extra") {
        rejectExtraction({ ...input, leads: [{ ...lead, patient: "private-value" }, ...input.leads.slice(1)] });
      } else if (kind === "mask-number") {
        rejectExtraction({ ...input, leads: [{ ...lead, observed: [1, ...lead.observed.slice(1)] }, ...input.leads.slice(1)] });
      } else rejectExtraction(input);
    },
  );

  it.each([true, false])("rechaza NaN/Infinity/overflow con observed=%s, sin sustituirlos", (observed) => {
    for (const value of [NaN, Infinity, -Infinity, Number.MAX_VALUE, -Number.MAX_VALUE, "0", null]) {
      const input = extraction();
      const lead = input.leads[0];
      if (!lead) throw new Error("Missing synthetic lead");
      rejectExtraction({ ...input, leads: [{ ...lead,
        samples: [value, ...lead.samples.slice(1)], observed: [observed, ...lead.observed.slice(1)],
      }, ...input.leads.slice(1)] });
    }
  });

  it("acepta extremos float32 finitos observados sin cambiar su magnitud", () => {
    const input = extraction();
    const lead = input.leads[0];
    if (!lead) throw new Error("Missing synthetic lead");
    lead.samples[0] = Math.fround(3.4028234663852886e38);
    lead.samples[1] = -lead.samples[0];
    expect(parsePdfExtraction(input)).toEqual(input);
  });

  it.each([1, -1, 0.1, Number.MIN_VALUE, -Number.MIN_VALUE])("rechaza muestra finita %s bajo máscara falsa; no la convierte a cero", (value) => {
    const input = extraction();
    const lead = input.leads[0];
    if (!lead) throw new Error("Missing synthetic lead");
    lead.samples[2] = value;
    rejectExtraction(input);
  });

  it.each(NUMERIC_MEASURES)("valida %s cruda, null, unidades y claves exactas", (key) => {
    for (const measure of [null, {}, { value: NaN, unit: "ms" }, { value: Infinity, unit: "ms" },
      { value: -Infinity, unit: "ms" }, { value: "0", unit: "ms" }, { value: 1, unit: " " },
      { value: 1, unit: "ms", private: "private-value" }]) {
      const input = extraction();
      rejectExtraction({ ...input, measurements: { ...input.measurements, [key]: measure } });
    }
    const input = extraction();
    const measurements: Record<string, unknown> = { ...input.measurements };
    delete measurements[key];
    rejectExtraction({ ...input, measurements });
  });

  it("rechaza sexo supuesto, campos extra y resultado vacío", () => {
    for (const sex of [0, 1, "unknown", " "]) {
      const input = extraction();
      rejectExtraction({ ...input, measurements: { ...input.measurements, sex } });
    }
    const input = extraction();
    rejectExtraction({ ...input, measurements: { ...input.measurements, name: "private-value" } });
    rejectExtraction(null);
    rejectExtraction([]);
  });
});
