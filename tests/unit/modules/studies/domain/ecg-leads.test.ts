import { describe, expect, it } from "vitest";

import { ECG_DURATION_SECONDS, ECG_LEAD_NAMES, ECG_SAMPLING_HZ, splitLeads } from "@/modules/studies/domain/ecg-leads";

const SAMPLES = 2500;
const LEADS = 12;

// El valor de cada celda codifica su derivación y su muestra, para comprobar el orden sin ambigüedad.
function codedWaveform(): Float32Array {
  const waveform = new Float32Array(SAMPLES * LEADS);

  for (let sample = 0; sample < SAMPLES; sample += 1) {
    for (let lead = 0; lead < LEADS; lead += 1) {
      waveform[sample * LEADS + lead] = lead * 10_000 + sample;
    }
  }

  return waveform;
}

describe("derivaciones del electrocardiograma", () => {
  it("define las 12 derivaciones, la frecuencia de muestreo y la duración", () => {
    expect(ECG_LEAD_NAMES).toEqual(["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]);
    expect(ECG_SAMPLING_HZ).toBe(250);
    expect(ECG_DURATION_SECONDS).toBe(10);
  });

  it("separa la onda en 12 derivaciones de 2500 muestras, en el orden de las columnas", () => {
    const leads = splitLeads(codedWaveform());

    expect(leads).toHaveLength(LEADS);
    leads.forEach((samples, lead) => {
      expect(samples).toHaveLength(SAMPLES);
      expect(samples[0]).toBe(lead * 10_000);
      expect(samples[1234]).toBe(lead * 10_000 + 1234);
      expect(samples[SAMPLES - 1]).toBe(lead * 10_000 + SAMPLES - 1);
    });
  });

  it("rechaza una onda con otro largo", () => {
    expect(() => splitLeads(new Float32Array(30_000 - 1))).toThrow(RangeError);
    expect(() => splitLeads(new Float32Array(0))).toThrow(RangeError);
  });
});
