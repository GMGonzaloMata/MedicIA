import { describe, expect, it } from "vitest";

import { STUDY_PAGE_SIZE, clampPage, normalizePage, totalPagesFor } from "@/modules/studies/domain/study";

describe("normalizePage", () => {
  it.each([
    ["3", 3],
    [5, 5],
    ["1", 1],
  ])("acepta el entero positivo %s", (value, expected) => {
    expect(normalizePage(value)).toBe(expected);
  });

  it.each([undefined, null, "", "abc", "0", "-2", "1.5", 0, -1, 2.5, Number.NaN, ["2"]])(
    "trata %s como la página 1",
    (value) => {
      expect(normalizePage(value)).toBe(1);
    },
  );
});

describe("paginación", () => {
  it("la cantidad de páginas es al menos 1 y redondea hacia arriba", () => {
    expect(totalPagesFor(0)).toBe(1);
    expect(totalPagesFor(STUDY_PAGE_SIZE)).toBe(1);
    expect(totalPagesFor(STUDY_PAGE_SIZE + 1)).toBe(2);
    expect(totalPagesFor(500)).toBe(25);
  });

  it("una página fuera de rango se acota a la última", () => {
    expect(clampPage(9, 45)).toBe(3);
    expect(clampPage(2, 45)).toBe(2);
    expect(clampPage(4, 0)).toBe(1);
  });
});
