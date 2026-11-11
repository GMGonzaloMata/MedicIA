import { ECG_SAMPLING_HZ } from "@/modules/studies/domain/ecg-leads";

// Geometría del trazo de una derivación (specs/007-visor-onda-ecg/research.md, R3). Lógica pura: el componente solo
// dibuja lo que acá se calcula.

export interface LeadScale {
  min: number;
  max: number;
}

const SCALE_MARGIN = 0.1;
const FLAT_HALF_RANGE = 1;

// Escala vertical de una derivación completa: del mínimo al máximo con un margen del 10 %. Una derivación constante
// usa un rango fijo alrededor de su valor para no dividir por cero. No cambia al hacer zoom ni al desplazarse.
export function computeLeadScale(samples: ArrayLike<number>): LeadScale {
  let min = Infinity;
  let max = -Infinity;

  for (let index = 0; index < samples.length; index += 1) {
    const value = samples[index] as number;

    if (Number.isFinite(value)) {
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
  }

  if (min === Infinity) {
    return { min: -FLAT_HALF_RANGE, max: FLAT_HALF_RANGE };
  }

  if (max - min < 1e-9) {
    return { min: min - FLAT_HALF_RANGE, max: max + FLAT_HALF_RANGE };
  }

  const margin = (max - min) * SCALE_MARGIN;

  return { min: min - margin, max: max + margin };
}

export interface PolylineOptions {
  start: number;
  span: number;
  width: number;
  height: number;
  scale: LeadScale;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// Atributo `points` de un <polyline> con solo las muestras de la ventana. El eje Y crece hacia abajo.
export function buildPolylinePoints(samples: ArrayLike<number>, { start, span, width, height, scale }: PolylineOptions): string {
  const end = Math.min(start + span, samples.length);
  const horizontalStep = span > 1 ? width / (span - 1) : 0;
  const range = scale.max - scale.min || 1;
  const points: string[] = [];

  for (let index = Math.max(0, start); index < end; index += 1) {
    const value = samples[index] as number;
    const x = round((index - start) * horizontalStep);
    const y = round(height - ((value - scale.min) / range) * height);

    points.push(`${x},${y}`);
  }

  return points.join(" ");
}

export interface GridLine {
  sample: number;
  seconds: number;
  // Una línea marcada cada segundo; las finas, cada 0,2 s.
  major: boolean;
}

const MINOR_STEP_SAMPLES = ECG_SAMPLING_HZ / 5;

// Líneas de la cuadrícula de tiempo que caen dentro de la ventana.
export function gridLines({ start, span }: { start: number; span: number }): GridLine[] {
  const lines: GridLine[] = [];
  const first = Math.ceil(start / MINOR_STEP_SAMPLES);
  const last = Math.floor((start + span - 1) / MINOR_STEP_SAMPLES);

  for (let step = first; step <= last; step += 1) {
    lines.push({
      sample: step * MINOR_STEP_SAMPLES,
      seconds: (step * MINOR_STEP_SAMPLES) / ECG_SAMPLING_HZ,
      major: step % 5 === 0,
    });
  }

  return lines;
}
