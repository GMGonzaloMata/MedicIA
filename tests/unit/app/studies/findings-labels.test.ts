import { describe, expect, it } from "vitest";

import { formatPercent } from "@/app/(dashboard)/_studies/_lib/analysis-messages";
import { COMPOSITE_NOTE, findingLabel } from "@/app/(dashboard)/_studies/_lib/findings-labels";
import { FINDING_KEYS } from "@/modules/analyses/domain/findings";

describe("etiquetas de los hallazgos", () => {
  it("las 12 claves tienen una etiqueta propia en español", () => {
    const labels = FINDING_KEYS.map(findingLabel);

    expect(new Set(labels).size).toBe(12);
    for (const [index, label] of labels.entries()) {
      expect(label, FINDING_KEYS[index]).not.toBe(FINDING_KEYS[index]);
      expect(label.length).toBeGreaterThan(5);
    }
  });

  it("no usan lenguaje de diagnóstico", () => {
    const text = [...FINDING_KEYS.map(findingLabel), COMPOSITE_NOTE].join(" ").toLowerCase();

    expect(text).not.toMatch(/diagn|padece|enfermedad confirmada|positivo|negativo/);
  });

  it("el compuesto aclara que es al menos uno de los otros once", () => {
    expect(COMPOSITE_NOTE).toBe("al menos uno de los otros once");
  });
});

describe("formato del porcentaje", () => {
  it("usa una decimal, coma decimal y espacio antes del signo", () => {
    expect(formatPercent(0.234)).toBe("23,4 %");
    expect(formatPercent(0)).toBe("0,0 %");
    expect(formatPercent(1)).toBe("100,0 %");
    expect(formatPercent(0.0005)).toBe("0,1 %");
  });
});
