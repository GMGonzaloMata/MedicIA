import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

import type { ViewerAction, ViewerView } from "./viewer-keys";
import { fullWindow, panBy, panStep, toEnd, toStart, zoomBy, zoomIn, zoomOut, type ViewWindow } from "./viewport";

// Estado del visor (specs/007-visor-onda-ecg/data-model.md). Es un reductor puro: el componente solo le pasa eventos.
export interface ViewerState {
  view: ViewerView;
  lead: number;
  window: ViewWindow;
}

export type ViewerEvent =
  | { type: "KEY"; action: ViewerAction }
  | { type: "SELECT_LEAD"; lead: number }
  | { type: "SHOW_ALL" }
  // Arrastre: fracción del ancho visible que se movió el dedo (positiva hacia la derecha).
  | { type: "DRAG"; fraction: number }
  | { type: "ZOOM"; factor: number; anchor: number };

const LAST_LEAD = ECG_LEAD_NAMES.length - 1;

export function initialViewerState(): ViewerState {
  return { view: "ALL", lead: 0, window: fullWindow() };
}

function clampLead(lead: number): number {
  return Number.isInteger(lead) ? Math.min(LAST_LEAD, Math.max(0, lead)) : 0;
}

function reduceKey(state: ViewerState, action: ViewerAction): ViewerState {
  const { window } = state;

  switch (action) {
    case "PAN_LEFT":
      return { ...state, window: panStep(window, -1) };
    case "PAN_RIGHT":
      return { ...state, window: panStep(window, 1) };
    case "GO_START":
      return { ...state, window: toStart(window) };
    case "GO_END":
      return { ...state, window: toEnd(window) };
    case "ZOOM_IN":
      return { ...state, window: zoomIn(window) };
    case "ZOOM_OUT":
      return { ...state, window: zoomOut(window) };
    case "ZOOM_RESET":
      return { ...state, window: fullWindow() };
    case "PREVIOUS_LEAD":
      return { ...state, lead: clampLead(state.lead - 1) };
    case "NEXT_LEAD":
      return { ...state, lead: clampLead(state.lead + 1) };
    case "BACK_TO_ALL":
      return { ...state, view: "ALL", window: fullWindow() };
  }
}

export function viewerReducer(state: ViewerState, event: ViewerEvent): ViewerState {
  switch (event.type) {
    case "KEY":
      return state.view === "SINGLE" ? reduceKey(state, event.action) : state;
    case "SELECT_LEAD":
      return { view: "SINGLE", lead: clampLead(event.lead), window: fullWindow() };
    case "SHOW_ALL":
      return { ...state, view: "ALL", window: fullWindow() };
    case "DRAG":
      return state.view === "SINGLE"
        ? { ...state, window: panBy(state.window, -event.fraction * state.window.span) }
        : state;
    case "ZOOM":
      return state.view === "SINGLE"
        ? { ...state, window: zoomBy(state.window, event.factor, event.anchor) }
        : state;
  }
}
