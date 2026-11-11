import { describe, expect, it } from "vitest";

import {
  canPanBack,
  canPanForward,
  canZoomIn,
  canZoomOut,
  formatRange,
  fullWindow,
  panBy,
  panStep,
  toEnd,
  toStart,
  zoomBy,
  zoomIn,
  zoomOut,
  type ViewWindow,
} from "@/app/(dashboard)/_studies/_lib/viewport";

function isValid({ start, span }: ViewWindow): boolean {
  return Number.isInteger(start) && Number.isInteger(span) && span >= 250 && span <= 2500 && start >= 0 && start + span <= 2500;
}

describe("ventana de tiempo del visor", () => {
  it("empieza mostrando todo el estudio", () => {
    expect(fullWindow()).toEqual({ start: 0, span: 2500 });
  });

  it("acerca por pasos de 2 hasta 1 segundo y no pasa de ahí", () => {
    let window = fullWindow();
    const spans = [window.span];

    for (let step = 0; step < 6; step += 1) {
      window = zoomIn(window);
      spans.push(window.span);
    }

    expect(spans).toEqual([2500, 1250, 625, 313, 250, 250, 250]);
    expect(canZoomIn(window)).toBe(false);
  });

  it("aleja hasta ver todo y no pasa de ahí", () => {
    let window: ViewWindow = { start: 1000, span: 250 };

    for (let step = 0; step < 6; step += 1) {
      window = zoomOut(window);
      expect(isValid(window)).toBe(true);
    }

    expect(window).toEqual({ start: 0, span: 2500 });
    expect(canZoomOut(window)).toBe(false);
  });

  it("acerca alrededor del centro y mantiene fijo el punto ancla", () => {
    expect(zoomIn({ start: 0, span: 2500 })).toEqual({ start: 625, span: 1250 });

    // Ancla en el borde izquierdo: el inicio no se mueve.
    expect(zoomBy({ start: 500, span: 1000 }, 2, 0)).toEqual({ start: 500, span: 500 });
    // Ancla en el borde derecho: el final no se mueve.
    expect(zoomBy({ start: 500, span: 1000 }, 2, 1)).toEqual({ start: 1000, span: 500 });
  });

  it("el zoom cerca de un extremo no saca la ventana del estudio", () => {
    // El centro (2375) pediría empezar en 2125, pero 2125 + 500 pasa del final: se acota a 2000.
    expect(zoomOut({ start: 2250, span: 250 })).toEqual({ start: 2000, span: 500 });
    expect(zoomBy({ start: 2000, span: 500 }, 0.1, 1)).toEqual({ start: 0, span: 2500 });
  });

  it("se desplaza y se detiene en los extremos", () => {
    const window: ViewWindow = { start: 1000, span: 500 };

    expect(panBy(window, 200)).toEqual({ start: 1200, span: 500 });
    expect(panBy(window, 10_000)).toEqual({ start: 2000, span: 500 });
    expect(panBy(window, -10_000)).toEqual({ start: 0, span: 500 });
  });

  it("un paso de desplazamiento es la quinta parte de lo que se ve", () => {
    expect(panStep({ start: 1000, span: 500 }, 1)).toEqual({ start: 1100, span: 500 });
    expect(panStep({ start: 1000, span: 500 }, -1)).toEqual({ start: 900, span: 500 });
    expect(panStep({ start: 0, span: 500 }, -1)).toEqual({ start: 0, span: 500 });
  });

  it("va al principio y al final conservando el zoom", () => {
    expect(toStart({ start: 1000, span: 500 })).toEqual({ start: 0, span: 500 });
    expect(toEnd({ start: 1000, span: 500 })).toEqual({ start: 2000, span: 500 });
  });

  it("indica si se puede desplazar hacia cada lado", () => {
    expect(canPanBack({ start: 0, span: 500 })).toBe(false);
    expect(canPanBack({ start: 10, span: 500 })).toBe(true);
    expect(canPanForward({ start: 2000, span: 500 })).toBe(false);
    expect(canPanForward({ start: 1999, span: 500 })).toBe(true);
  });

  it("siempre devuelve una ventana válida, incluso con valores extremos o no numéricos", () => {
    const base: ViewWindow = { start: 700, span: 600 };
    const results = [
      zoomBy(base, Number.NaN),
      zoomBy(base, 0),
      zoomBy(base, -3),
      zoomBy(base, Number.POSITIVE_INFINITY),
      zoomBy(base, 2, Number.NaN),
      zoomBy(base, 2, 9),
      panBy(base, Number.NaN),
      panBy(base, Number.POSITIVE_INFINITY),
      panBy({ start: Number.NaN, span: 600 }, 5),
      panBy({ start: -50, span: 99_999 }, 5),
      toEnd({ start: 5000, span: 10 }),
      toStart({ start: 5000, span: 10 }),
    ];

    for (const result of results) {
      expect(isValid(result)).toBe(true);
    }
  });

  it("anuncia el rango con coma decimal", () => {
    expect(formatRange({ start: 500, span: 500 })).toBe("Mostrando de 2,0 a 4,0 s");
    expect(formatRange(fullWindow())).toBe("Mostrando de 0,0 a 10,0 s");
    expect(formatRange({ start: 125, span: 250 })).toBe("Mostrando de 0,5 a 1,5 s");
  });
});
