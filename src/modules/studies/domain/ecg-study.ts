import { StudyRejectedError } from "./study-errors";

// Dimensiones del electrocardiograma que consume EchoNext-Mini (specs/005-echonext-mini-sagemaker).
export const WAVEFORM_SAMPLES = 2500;
export const WAVEFORM_LEADS = 12;
export const TABULAR_LENGTH = 7;

// Tamaño máximo del archivo que sube la persona (comprimido). Lo comprueban la interfaz, la acción y el lector.
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

// Orden fijo de las variables: sexo (0 mujer, 1 hombre), edad, frecuencia ventricular, frecuencia auricular,
// intervalo PR, duración del QRS y QT corregido. Todas estandarizadas salvo el sexo.
export const SEX_INDEX = 0;

// Límites de valor absoluto (specs/006-carga-estudios-ecg/research.md, R4). Se fijaron con los agregados que imprime
// `report_ranges.py` sobre la partición de prueba: la onda llega a 10,72 y las variables estandarizadas a 10,03, así que
// 25 deja más del doble de margen y acepta cualquier estudio del conjunto. Siguen rechazando los valores sin estandarizar
// (una edad de 65, una frecuencia de 70). Si se revisan las particiones de entrenamiento y validación y hay extremos
// mayores, hay que volver a calcular estos límites.
export const MAX_ABS_WAVEFORM = 25;
export const MAX_ABS_STANDARDIZED = 25;

// La onda va fila por fila: la muestra `t` de la derivación `d` está en `t * WAVEFORM_LEADS + d`.
export interface EcgStudyData {
  waveform: Float32Array;
  tabular: Float32Array;
}

function firstIndexWhere(values: Float32Array, predicate: (value: number) => boolean, from = 0): number {
  for (let index = from; index < values.length; index += 1) {
    if (predicate(values[index] as number)) {
      return index;
    }
  }

  return -1;
}

// Reglas de contenido: tamaños, finitud, sexo y rangos. Los errores nombran el campo y, a lo sumo, la
// posición de la variable: nunca el valor.
export function validateEcgContent({ waveform, tabular }: EcgStudyData): void {
  if (waveform.length !== WAVEFORM_SAMPLES * WAVEFORM_LEADS) {
    throw new StudyRejectedError("FIELD_SHAPE", "waveform");
  }

  if (tabular.length !== TABULAR_LENGTH) {
    throw new StudyRejectedError("FIELD_SHAPE", "tabular");
  }

  if (firstIndexWhere(waveform, (value) => !Number.isFinite(value)) !== -1) {
    throw new StudyRejectedError("VALUE_NOT_FINITE", "waveform");
  }

  const nonFinite = firstIndexWhere(tabular, (value) => !Number.isFinite(value));
  if (nonFinite !== -1) {
    throw new StudyRejectedError("VALUE_NOT_FINITE", "tabular", nonFinite + 1);
  }

  const sex = tabular[SEX_INDEX];
  if (sex !== 0 && sex !== 1) {
    throw new StudyRejectedError("SEX_INVALID", "tabular");
  }

  if (firstIndexWhere(waveform, (value) => Math.abs(value) > MAX_ABS_WAVEFORM) !== -1) {
    throw new StudyRejectedError("VALUE_OUT_OF_RANGE", "waveform");
  }

  const outOfRange = firstIndexWhere(tabular, (value) => Math.abs(value) > MAX_ABS_STANDARDIZED, SEX_INDEX + 1);
  if (outOfRange !== -1) {
    throw new StudyRejectedError("VALUE_OUT_OF_RANGE", "tabular", outOfRange + 1);
  }
}
