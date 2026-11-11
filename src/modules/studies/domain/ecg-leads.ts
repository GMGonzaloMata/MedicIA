import { WAVEFORM_LEADS, WAVEFORM_SAMPLES } from "./ecg-study";

// Las 12 derivaciones, en el orden de las columnas de la onda guardada (specs/007-visor-onda-ecg/data-model.md).
export const ECG_LEAD_NAMES = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"] as const;

export const ECG_SAMPLING_HZ = 250;
export const ECG_DURATION_SECONDS = WAVEFORM_SAMPLES / ECG_SAMPLING_HZ;

// Separa la onda guardada fila por fila (la muestra `t` de la derivación `d` está en `t * 12 + d`) en una serie
// por derivación.
export function splitLeads(waveform: Float32Array): Float32Array[] {
  if (waveform.length !== WAVEFORM_SAMPLES * WAVEFORM_LEADS) {
    throw new RangeError("La onda no tiene las dimensiones esperadas.");
  }

  const leads: Float32Array[] = [];

  for (let lead = 0; lead < WAVEFORM_LEADS; lead += 1) {
    const samples = new Float32Array(WAVEFORM_SAMPLES);

    for (let sample = 0; sample < WAVEFORM_SAMPLES; sample += 1) {
      samples[sample] = waveform[sample * WAVEFORM_LEADS + lead] as number;
    }

    leads.push(samples);
  }

  return leads;
}
