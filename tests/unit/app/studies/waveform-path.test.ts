import { describe, expect, it } from "vitest";

import { buildPolylinePoints, computeLeadScale, gridLines } from "@/app/(dashboard)/_studies/_lib/waveform-path";

describe("escala de una derivación", () => {
  it("va del mínimo al máximo con un margen del 10 %", () => {
    const scale = computeLeadScale(Float32Array.from([0, 10, 5]));

    expect(scale.min).toBeCloseTo(-1);
    expect(scale.max).toBeCloseTo(11);
  });

  it("usa un rango fijo alrededor de una derivación constante", () => {
    expect(computeLeadScale(new Float32Array(100).fill(3))).toEqual({ min: 2, max: 4 });
    expect(computeLeadScale(new Float32Array(100))).toEqual({ min: -1, max: 1 });
  });

  it("ignora los valores no finitos y resiste una derivación vacía", () => {
    const scale = computeLeadScale([Number.NaN, 0, 10, Number.POSITIVE_INFINITY]);

    expect(scale.min).toBeCloseTo(-1);
    expect(scale.max).toBeCloseTo(11);
    expect(computeLeadScale([])).toEqual({ min: -1, max: 1 });
  });
});

describe("trazo de una derivación", () => {
  const scale = { min: 0, max: 10 };

  it("dibuja una muestra por punto, con Y creciendo hacia abajo", () => {
    const points = buildPolylinePoints([0, 10, 5], { start: 0, span: 3, width: 100, height: 50, scale });

    expect(points).toBe("0,50 50,0 100,25");
  });

  it("dibuja solo las muestras de la ventana", () => {
    const samples = new Float32Array(2500);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = index % 10;
    }
    const points = buildPolylinePoints(samples, { start: 1000, span: 250, width: 500, height: 40, scale });

    expect(points.split(" ")).toHaveLength(250);
    expect(points.startsWith("0,")).toBe(true);
    expect(points.split(" ").at(-1)?.startsWith("500,")).toBe(true);
  });

  it("no sale de la derivación si la ventana se pasa del final, y una ventana de una muestra no divide por cero", () => {
    expect(buildPolylinePoints([1, 2, 3], { start: 1, span: 10, width: 100, height: 10, scale }).split(" ")).toHaveLength(2);
    expect(buildPolylinePoints([4], { start: 0, span: 1, width: 100, height: 10, scale })).toBe("0,6");
  });
});

describe("cuadrícula de tiempo", () => {
  it("marca una línea fina cada 0,2 s y una marcada cada 1 s", () => {
    const lines = gridLines({ start: 0, span: 2500 });

    expect(lines).toHaveLength(50);
    expect(lines[0]).toEqual({ sample: 0, seconds: 0, major: true });
    expect(lines[1]).toEqual({ sample: 50, seconds: 0.2, major: false });
    expect(lines.filter((line) => line.major).map((line) => line.seconds)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("solo incluye las líneas que caen dentro de la ventana", () => {
    const lines = gridLines({ start: 260, span: 250 });

    expect(lines.map((line) => line.seconds)).toEqual([1.2, 1.4, 1.6, 1.8, 2]);
    expect(lines.find((line) => line.major)?.seconds).toBe(2);
  });
});
