import { ECG_SAMPLING_HZ } from "@/modules/studies/domain/ecg-leads";
import { WAVEFORM_SAMPLES } from "@/modules/studies/domain/ecg-study";

// Ventana de tiempo visible del visor, en muestras (specs/007-visor-onda-ecg/research.md, R4). Todas las funciones
// devuelven una ventana válida: 250 ≤ span ≤ 2500, start ≥ 0 y start + span ≤ 2500. Es lógica pura, sin DOM.

export const TOTAL_SAMPLES = WAVEFORM_SAMPLES;
export const MIN_SPAN = ECG_SAMPLING_HZ;

export interface ViewWindow {
  start: number;
  span: number;
}

export function fullWindow(): ViewWindow {
  return { start: 0, span: TOTAL_SAMPLES };
}

// Acota cualquier ventana, incluso con valores no finitos, a una ventana válida.
function normalize(start: number, span: number): ViewWindow {
  if (!Number.isFinite(start) || !Number.isFinite(span)) {
    return fullWindow();
  }

  const safeSpan = Math.min(TOTAL_SAMPLES, Math.max(MIN_SPAN, Math.round(span)));
  const safeStart = Math.min(TOTAL_SAMPLES - safeSpan, Math.max(0, Math.round(start)));

  return { start: safeStart, span: safeSpan };
}

// `factor` mayor que 1 acerca y menor que 1 aleja. `anchor` es la fracción de la ventana (0 a 1) que queda fija.
export function zoomBy(window: ViewWindow, factor: number, anchor = 0.5): ViewWindow {
  if (!Number.isFinite(factor) || factor <= 0) {
    return normalize(window.start, window.span);
  }

  const safeAnchor = Number.isFinite(anchor) ? Math.min(1, Math.max(0, anchor)) : 0.5;
  const current = normalize(window.start, window.span);
  const nextSpan = Math.min(TOTAL_SAMPLES, Math.max(MIN_SPAN, Math.round(current.span / factor)));
  const anchorSample = current.start + current.span * safeAnchor;

  return normalize(anchorSample - nextSpan * safeAnchor, nextSpan);
}

export function zoomIn(window: ViewWindow): ViewWindow {
  return zoomBy(window, 2);
}

export function zoomOut(window: ViewWindow): ViewWindow {
  return zoomBy(window, 0.5);
}

export function panBy(window: ViewWindow, deltaSamples: number): ViewWindow {
  const current = normalize(window.start, window.span);

  return normalize(current.start + (Number.isFinite(deltaSamples) ? deltaSamples : 0), current.span);
}

// Un paso es la quinta parte de lo que se ve.
export function panStep(window: ViewWindow, direction: -1 | 1): ViewWindow {
  const current = normalize(window.start, window.span);

  return panBy(current, direction * Math.max(1, Math.round(current.span / 5)));
}

export function toStart(window: ViewWindow): ViewWindow {
  return normalize(0, window.span);
}

export function toEnd(window: ViewWindow): ViewWindow {
  const current = normalize(window.start, window.span);

  return normalize(TOTAL_SAMPLES - current.span, current.span);
}

export function canZoomIn(window: ViewWindow): boolean {
  return window.span > MIN_SPAN;
}

export function canZoomOut(window: ViewWindow): boolean {
  return window.span < TOTAL_SAMPLES;
}

export function canPanBack(window: ViewWindow): boolean {
  return window.start > 0;
}

export function canPanForward(window: ViewWindow): boolean {
  return window.start + window.span < TOTAL_SAMPLES;
}

function seconds(sample: number): string {
  return (sample / ECG_SAMPLING_HZ).toFixed(1).replace(".", ",");
}

// Texto que se anuncia al cambiar la ventana, con coma decimal.
export function formatRange(window: ViewWindow): string {
  return `Mostrando de ${seconds(window.start)} a ${seconds(window.start + window.span)} s`;
}
