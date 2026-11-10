import { describe, expect, it } from "vitest";

import { initialViewerState, viewerReducer } from "@/app/(dashboard)/_studies/_lib/viewer-state";

describe("estado del visor", () => {
  it("empieza en la vista de las 12 derivaciones, con todo el tiempo", () => {
    expect(initialViewerState()).toEqual({ view: "ALL", lead: 0, window: { start: 0, span: 2500 } });
  });

  it("elegir una derivación abre la vista ampliada con la ventana completa", () => {
    const state = viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: 4 });

    expect(state).toEqual({ view: "SINGLE", lead: 4, window: { start: 0, span: 2500 } });
  });

  it("acota la derivación elegida a las 12 existentes", () => {
    expect(viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: 99 }).lead).toBe(11);
    expect(viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: -3 }).lead).toBe(0);
    expect(viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: 1.5 }).lead).toBe(0);
  });

  it("las teclas, el arrastre y el pellizco no hacen nada en la vista de las 12 derivaciones", () => {
    const state = initialViewerState();

    expect(viewerReducer(state, { type: "KEY", action: "ZOOM_IN" })).toBe(state);
    expect(viewerReducer(state, { type: "DRAG", fraction: 0.3 })).toBe(state);
    expect(viewerReducer(state, { type: "ZOOM", factor: 2, anchor: 0.5 })).toBe(state);
  });

  it("acerca, se desplaza, cambia de derivación y vuelve con las acciones de teclado", () => {
    let state = viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: 0 });

    state = viewerReducer(state, { type: "KEY", action: "ZOOM_IN" });
    expect(state.window).toEqual({ start: 625, span: 1250 });

    state = viewerReducer(state, { type: "KEY", action: "GO_END" });
    expect(state.window).toEqual({ start: 1250, span: 1250 });

    state = viewerReducer(state, { type: "KEY", action: "PAN_LEFT" });
    expect(state.window).toEqual({ start: 1000, span: 1250 });

    state = viewerReducer(state, { type: "KEY", action: "NEXT_LEAD" });
    expect(state.lead).toBe(1);
    state = viewerReducer(state, { type: "KEY", action: "PREVIOUS_LEAD" });
    state = viewerReducer(state, { type: "KEY", action: "PREVIOUS_LEAD" });
    expect(state.lead).toBe(0);

    state = viewerReducer(state, { type: "KEY", action: "ZOOM_RESET" });
    expect(state.window).toEqual({ start: 0, span: 2500 });

    state = viewerReducer(state, { type: "KEY", action: "BACK_TO_ALL" });
    expect(state.view).toBe("ALL");
  });

  it("arrastrar hacia la derecha muestra un tramo anterior, y el pellizco acerca", () => {
    let state = viewerReducer(initialViewerState(), { type: "SELECT_LEAD", lead: 0 });
    state = viewerReducer(state, { type: "ZOOM", factor: 5, anchor: 0.5 });
    expect(state.window.span).toBe(500);
    const before = state.window.start;

    state = viewerReducer(state, { type: "DRAG", fraction: 0.2 });
    expect(state.window.start).toBe(before - 100);

    state = viewerReducer(state, { type: "DRAG", fraction: -100 });
    expect(state.window.start).toBe(2000);
  });
});
