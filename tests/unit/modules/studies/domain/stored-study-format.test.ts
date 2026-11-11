import { describe, expect, it } from "vitest";

import { WAVEFORM_LEADS, WAVEFORM_SAMPLES, type EcgStudyData } from "@/modules/studies/domain/ecg-study";
import {
  STORED_STUDY_BYTES,
  StoredStudyCorruptError,
  decodeStoredStudy,
  encodeStoredStudy,
} from "@/modules/studies/domain/stored-study-format";

const HEADER_BYTES = 36;

function sampleStudy(): EcgStudyData {
  const waveform = new Float32Array(WAVEFORM_SAMPLES * WAVEFORM_LEADS);
  for (let index = 0; index < waveform.length; index += 1) {
    waveform[index] = Math.fround(Math.sin(index / 17) * 3);
  }

  return { waveform, tabular: Float32Array.from([0, -1.5, 0.25, 2, -0.75, 1.125, 0.5]) };
}

function expectCorrupt(action: () => unknown) {
  expect(action).toThrow(StoredStudyCorruptError);
}

describe("formato guardado ecg1", () => {
  it("mide exactamente 120.036 bytes y empieza con la firma MEDECG01", () => {
    const bytes = encodeStoredStudy(sampleStudy());

    expect(STORED_STUDY_BYTES).toBe(120_036);
    expect(bytes.byteLength).toBe(STORED_STUDY_BYTES);
    expect(new TextDecoder().decode(bytes.slice(0, 8))).toBe("MEDECG01");
  });

  it("recupera exactamente lo que guardó (ida y vuelta)", () => {
    const original = sampleStudy();

    const decoded = decodeStoredStudy(encodeStoredStudy(original));

    expect(Array.from(decoded.tabular)).toEqual(Array.from(original.tabular));
    expect(Array.from(decoded.waveform)).toEqual(Array.from(original.waveform));
  });

  it("guarda la muestra t de la derivación d en la posición 36 + 4 * (t * 12 + d)", () => {
    const original = sampleStudy();
    const bytes = encodeStoredStudy(original);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    for (const [sample, lead] of [[0, 0], [0, 11], [1, 0], [1249, 5], [2499, 11]] as const) {
      const offset = HEADER_BYTES + 4 * (sample * WAVEFORM_LEADS + lead);

      expect(view.getFloat32(offset, true)).toBe(original.waveform[sample * WAVEFORM_LEADS + lead]);
    }
  });

  it("guarda las variables en little-endian a partir del byte 8", () => {
    const bytes = encodeStoredStudy(sampleStudy());
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    expect(view.getFloat32(8, true)).toBe(0);
    expect(view.getFloat32(12, true)).toBe(-1.5);
  });

  it("rechaza un objeto de otro tamaño", () => {
    const bytes = encodeStoredStudy(sampleStudy());

    expectCorrupt(() => decodeStoredStudy(bytes.slice(0, STORED_STUDY_BYTES - 1)));
    expectCorrupt(() => decodeStoredStudy(new Uint8Array(STORED_STUDY_BYTES + 1)));
    expectCorrupt(() => decodeStoredStudy(new Uint8Array(0)));
  });

  it("rechaza una firma o una versión desconocida", () => {
    const bytes = encodeStoredStudy(sampleStudy());
    const otherVersion = bytes.slice();
    otherVersion.set(new TextEncoder().encode("MEDECG02"), 0);
    const otherSignature = bytes.slice();
    otherSignature[0] = 0x58;

    expectCorrupt(() => decodeStoredStudy(otherVersion));
    expectCorrupt(() => decodeStoredStudy(otherSignature));
  });

  it("rechaza valores no finitos al leer", () => {
    const bytes = encodeStoredStudy(sampleStudy());
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat32(HEADER_BYTES + 40, Number.NaN, true);

    expectCorrupt(() => decodeStoredStudy(bytes));
  });

  it("no guarda datos de tamaño incorrecto", () => {
    const study = sampleStudy();

    expect(() => encodeStoredStudy({ waveform: study.waveform.slice(1), tabular: study.tabular })).toThrow();
    expect(() => encodeStoredStudy({ waveform: study.waveform, tabular: study.tabular.slice(1) })).toThrow();
  });

  it("el mensaje del error no incluye datos del estudio", () => {
    const bytes = encodeStoredStudy(sampleStudy());
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).setFloat32(HEADER_BYTES, Number.POSITIVE_INFINITY, true);

    try {
      decodeStoredStudy(bytes);
      throw new Error("Se esperaba un error.");
    } catch (error) {
      expect(error).toBeInstanceOf(StoredStudyCorruptError);
      expect((error as Error).message).not.toMatch(/Infinity/);
    }
  });
});
