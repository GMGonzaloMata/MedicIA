import { StudyRejectedError } from "./study-errors";

// Dimensiones del electrocardiograma que consume EchoNext-Mini (specs/005-echonext-mini-sagemaker).
export const WAVEFORM_SAMPLES = 2500;
export const WAVEFORM_LEADS = 12;
export const TABULAR_LENGTH = 7;

// Orden fijo de las variables: sexo (0 mujer, 1 hombre), edad, frecuencia ventricular, frecuencia auricular,
// intervalo PR, duración del QRS y QT corregido. Todas estandarizadas salvo el sexo.
export const SEX_INDEX = 0;

// Límites provisionales (specs/006-carga-estudios-ecg/research.md, R4). Se confirman con los agregados del
// conjunto de datos que imprime `report_ranges.py` y deben dejar un margen amplio sobre lo observado.
export const MAX_ABS_WAVEFORM = 100;
export const MAX_ABS_STANDARDIZED = 20;

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
