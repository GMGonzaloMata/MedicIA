import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AnalysisHistory } from "@/app/(dashboard)/_studies/_components/analysis/analysis-history";
import { AnalysisResult } from "@/app/(dashboard)/_studies/_components/analysis/analysis-result";
import {
  ANALYSIS_FAILURE_MESSAGES,
  ANALYSIS_MESSAGES,
  formatPercent,
} from "@/app/(dashboard)/_studies/_lib/analysis-messages";
import { COMPOSITE_NOTE, findingLabel } from "@/app/(dashboard)/_studies/_lib/findings-labels";
import type { AnalysisResult as AnalysisResultView, AnalysisSummary } from "@/modules/analyses/domain/analysis";
import { FINDING_KEYS, orderProbabilities } from "@/modules/analyses/domain/findings";

import { sampleProbabilities } from "../../../support/analysis-fixtures";

const RESULT: AnalysisResultView = {
  id: "a1",
  status: "COMPLETED",
  failureCode: null,
  requestedAt: new Date("2026-11-11T13:00:00Z"),
  finishedAt: new Date("2026-11-11T13:00:03Z"),
  requestedBy: { kind: "DOCTOR", fullName: "Dra. Pérez" },
  modelName: "echonext-mini-fake",
  modelVersion: "0.0.0-fake",
  probabilities: orderProbabilities({ ...sampleProbabilities(), ...Object.fromEntries([["lvef_lte_45", 0.234]]) }),
};

describe("resultado del análisis", () => {
  it("muestra las 12 filas en el orden del contrato, con nombre, porcentaje escrito y barra", () => {
    render(<AnalysisResult result={RESULT} />);

    const rows = screen.getAllByRole("listitem");

    expect(rows).toHaveLength(12);
    FINDING_KEYS.forEach((key, index) => {
      expect(rows[index]?.textContent).toContain(findingLabel(key));
    });
    expect(rows[0]?.textContent).toContain("23,4 %");
    expect(formatPercent(0.5)).toBe("50,0 %");
  });

  it("cada barra es un medidor accesible con su valor", () => {
    render(<AnalysisResult result={RESULT} />);

    const meters = screen.getAllByRole("meter");

    expect(meters).toHaveLength(12);
    expect(meters[0]?.getAttribute("aria-valuemin")).toBe("0");
    expect(meters[0]?.getAttribute("aria-valuemax")).toBe("100");
    expect(meters[0]?.getAttribute("aria-valuenow")).toBe("23.4");
    expect(meters[0]?.getAttribute("aria-label")).toBe(`${findingLabel("lvef_lte_45")}: 23,4 %`);
    expect((meters[0]?.firstElementChild as HTMLElement).style.width).toBe("23.4%");
  });

  it("destaca el compuesto, que va último, con su aclaración", () => {
    render(<AnalysisResult result={RESULT} />);

    const rows = screen.getAllByRole("listitem");
    const composite = rows[11] as HTMLElement;

    expect(composite.textContent).toContain(findingLabel("shd"));
    expect(composite.textContent).toContain(COMPOSITE_NOTE);
    expect(composite.className).toContain("border-primary");
    expect(rows[0]?.className).not.toContain("border-primary");
  });

  it("incluye la advertencia permanente, el modelo, la versión y quién lo pidió", () => {
    const { container } = render(<AnalysisResult result={RESULT} />);

    expect(screen.getByText(ANALYSIS_MESSAGES.disclaimer)).toBeTruthy();
    expect(screen.getByRole("heading", { name: ANALYSIS_MESSAGES.resultTitle })).toBeTruthy();
    expect(container.textContent).toContain("echonext-mini-fake");
    expect(container.textContent).toContain("0.0.0-fake");
    expect(container.textContent).toContain("Dra. Pérez");
  });

  it("no usa umbrales ni lenguaje de diagnóstico", () => {
    const { container } = render(<AnalysisResult result={RESULT} />);
    const text = (container.textContent ?? "").toLowerCase();

    expect(text).not.toMatch(
      /positivo|negativo|normal|anormal|presenta|padece|tiene la enfermedad|riesgo alto|riesgo bajo/,
    );
    expect(container.innerHTML).not.toMatch(/bg-(red|green|yellow|orange)|text-(red|green)|#[0-9a-f]{3,6}/i);
  });
});

function summary(overrides: Partial<AnalysisSummary>): AnalysisSummary {
  return {
    id: "a1",
    status: "COMPLETED",
    failureCode: null,
    requestedAt: new Date("2026-11-11T13:00:00Z"),
    finishedAt: new Date("2026-11-11T13:00:03Z"),
    requestedBy: { kind: "PATIENT" },
    modelName: "m",
    modelVersion: "1",
    ...overrides,
  };
}

describe("historial de análisis", () => {
  const items = [
    summary({ id: "a3", status: "PENDING", finishedAt: null, requestedAt: new Date("2026-11-11T15:00:00Z") }),
    summary({
      id: "a2",
      status: "FAILED",
      failureCode: "MODEL_UNAVAILABLE",
      requestedAt: new Date("2026-11-11T14:00:00Z"),
      requestedBy: { kind: "DOCTOR", fullName: "Dra. Pérez" },
    }),
    summary({ id: "a1" }),
  ];

  it("lista del más reciente al más antiguo con el estado en texto y quién lo pidió", () => {
    render(<AnalysisHistory studyId="study-1" items={items} selectedId="a1" />);

    const rows = within(screen.getByRole("list")).getAllByRole("listitem");

    expect(rows).toHaveLength(3);
    expect(rows[0]?.textContent).toContain("En curso");
    expect(rows[1]?.textContent).toContain("Fallido");
    expect(rows[1]?.textContent).toContain("Dra. Pérez");
    expect(rows[1]?.textContent).toContain(ANALYSIS_FAILURE_MESSAGES.MODEL_UNAVAILABLE);
    expect(rows[2]?.textContent).toContain("Completado");
    expect(rows[2]?.textContent).toContain(ANALYSIS_MESSAGES.requestedByPatient);
  });

  it("solo los completados tienen vínculo, con nombre accesible, y el mostrado lleva aria-current", () => {
    render(<AnalysisHistory studyId="study-1" items={items} selectedId="a1" />);

    const links = screen.getAllByRole("link");
    const rows = screen.getAllByRole("listitem");

    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute("href")).toBe("/studies/study-1?analysisId=a1");
    expect(links[0]?.getAttribute("aria-label")).toMatch(/^Ver resultado del análisis del /);
    expect(rows[2]?.getAttribute("aria-current")).toBe("true");
    expect(rows[0]?.getAttribute("aria-current")).toBeNull();
  });
});
