import { TABULAR_LENGTH, WAVEFORM_LEADS, WAVEFORM_SAMPLES, type EcgStudyData } from "./ecg-study";

// Formato guardado `ecg1` (specs/006-carga-estudios-ecg/contracts/stored-study-format.md): firma, siete
// variables y la onda fila por fila, todo en `float32` little-endian y de tamaño fijo. No conserva nada del
// archivo que se subió salvo estos datos.
const SIGNATURE = "MEDECG01";
const SIGNATURE_BYTES = 8;
const FLOAT_BYTES = 4;
const TABULAR_OFFSET = SIGNATURE_BYTES;
const WAVEFORM_OFFSET = TABULAR_OFFSET + TABULAR_LENGTH * FLOAT_BYTES;
const WAVEFORM_VALUES = WAVEFORM_SAMPLES * WAVEFORM_LEADS;

export const STORED_STUDY_BYTES = WAVEFORM_OFFSET + WAVEFORM_VALUES * FLOAT_BYTES;

// El objeto guardado no tiene el formato esperado. El mensaje no incluye datos del estudio.
export class StoredStudyCorruptError extends Error {
  constructor() {
    super("El archivo guardado del estudio está dañado o tiene un formato desconocido.");
    this.name = "StoredStudyCorruptError";
  }
}

export function encodeStoredStudy({ waveform, tabular }: EcgStudyData): Uint8Array {
  if (waveform.length !== WAVEFORM_VALUES || tabular.length !== TABULAR_LENGTH) {
    throw new RangeError("El estudio no tiene las dimensiones esperadas.");
  }

  const bytes = new Uint8Array(STORED_STUDY_BYTES);
  bytes.set(new TextEncoder().encode(SIGNATURE), 0);

  const view = new DataView(bytes.buffer);
  tabular.forEach((value, index) => view.setFloat32(TABULAR_OFFSET + index * FLOAT_BYTES, value, true));
  waveform.forEach((value, index) => view.setFloat32(WAVEFORM_OFFSET + index * FLOAT_BYTES, value, true));

  return bytes;
}

export function decodeStoredStudy(bytes: Uint8Array): EcgStudyData {
  if (bytes.byteLength !== STORED_STUDY_BYTES) {
    throw new StoredStudyCorruptError();
  }

  if (new TextDecoder().decode(bytes.subarray(0, SIGNATURE_BYTES)) !== SIGNATURE) {
    throw new StoredStudyCorruptError();
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tabular = new Float32Array(TABULAR_LENGTH);
  const waveform = new Float32Array(WAVEFORM_VALUES);

  for (let index = 0; index < TABULAR_LENGTH; index += 1) {
    tabular[index] = view.getFloat32(TABULAR_OFFSET + index * FLOAT_BYTES, true);
  }

  for (let index = 0; index < WAVEFORM_VALUES; index += 1) {
    waveform[index] = view.getFloat32(WAVEFORM_OFFSET + index * FLOAT_BYTES, true);
  }

  if (!tabular.every(Number.isFinite) || !waveform.every(Number.isFinite)) {
    throw new StoredStudyCorruptError();
  }

  return { waveform, tabular };
}
