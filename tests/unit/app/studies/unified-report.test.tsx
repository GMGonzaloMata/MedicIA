import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { UnifiedReport } from "@/app/(dashboard)/_studies/_components/analysis/unified-report";
import { createUnifiedReport, publishUnifiedReport } from "@/modules/analyses/domain/unified-report";
import { sampleProbabilities } from "../../../support/analysis-fixtures";

const PROFESSIONAL_WARNING = "Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.";
const PROBABILITY_WARNING = `Son probabilidades estimadas por un modelo de investigación. Pueden no estar calibradas: leelas como un indicador relativo de riesgo. ${PROFESSIONAL_WARNING}`;

function publication(e022: "PENDING" | "COMPLETED" | "FAILED", mini: "NOT_AVAILABLE" | "PENDING" | "COMPLETED" | "FAILED" = "NOT_AVAILABLE") {
  const requestedAt = "2026-11-16T12:00:00.000Z";
  const base = createUnifiedReport({ analysisId: "analysis-visible", studyId: "study-visible", requestedByUserId: "PRIVATE_REQUESTER", requestedAt, capabilities: { e022: { status: "AVAILABLE" }, echonext: mini === "NOT_AVAILABLE" ? { status: "NOT_AVAILABLE", reason: "PRIVATE_DIAGNOSTIC" } : { status: "AVAILABLE" } } });
  function execution(status: "PENDING" | "COMPLETED" | "FAILED", component: "e022" | "echonext") {
    const pending = { analysisId: base.analysisId, status, startedAt: null, finishedAt: null, modelName: null, modelVersion: null, preprocessingReference: null, result: null, failureCode: null };
    if (status === "PENDING") return pending;
    return { ...pending, startedAt: requestedAt, finishedAt: requestedAt, ...(status === "FAILED" ? { failureCode: "TIMEOUT" } : { modelName: component === "e022" ? "E022" : "EchoNext-Mini", modelVersion: "version-synthetic", preprocessingReference: "prep-synthetic", result: component === "e022" ? { target: "lvef_lte_45", score: 0.7234 } : sampleProbabilities() }) };
  }
  const report = publishUnifiedReport({ ...base, components: { e022: execution(e022, "e022"), ...(mini === "NOT_AVAILABLE" ? {} : { echonext: execution(mini, "echonext") }) } });
  if (report.coverage === "COMPLETE") return { ...report, requestedBy: { kind: "DOCTOR", fullName: "Dra. Solicitante Sintética" } as const };
  if (report.coverage === "PARTIAL") return { ...report, requestedBy: { kind: "PATIENT" } as const };
  return report;
}
describe("informe único sin fusionar modelos", () => {
  it("WAITING no expone el resultado ya completado mientras Mini sigue pendiente", () => {
    const { container } = render(<UnifiedReport report={publication("COMPLETED", "PENDING")} />);
    expect(screen.getByText("Analizando el estudio…")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Función ventricular" })).toBeNull();
    expect(container.textContent).not.toMatch(/0,7234|Puntuación de investigación|version-synthetic|prep-synthetic|PRIVATE/);
  });
  it("PARTIAL muestra E022 decimal, procedencia y límites, Mini solo como información de cobertura", () => {
    const { container } = render(<UnifiedReport report={publication("COMPLETED")} />);
    expect(screen.getByText("Informe parcial")).toBeTruthy();
    const section = screen.getByRole("region", { name: "Función ventricular" });
    expect(within(section).getByText("Puntuación de investigación para posible FEVI ≤45 %")).toBeTruthy();
    expect(within(section).getByText("0,7234")).toBeTruthy();
    expect(within(section).getByText(/version-synthetic/)).toBeTruthy();
    expect(within(section).getByText(/prep-synthetic/)).toBeTruthy();
    expect(screen.getByText("Es una puntuación de investigación, no un valor de FEVI ni una probabilidad clínicamente calibrada.")).toBeTruthy();
    expect(screen.getByText(/EchoNext-Mini no disponible \(NOT_AVAILABLE\). No se ejecutó./)).toBeTruthy();
    expect(screen.getByText(PROFESSIONAL_WARNING)).toBeTruthy();
    expect(screen.queryByText(/Son probabilidades estimadas/)).toBeNull();
    expect(container.textContent).not.toMatch(/PRIVATE|72,34|FEVI del paciente|normal|diagnóstico confirmado/);
    expect(container.querySelector("progress, meter")).toBeNull();
  });
  it("NONE informa falla sin sección clínica ni puntuación y distingue ejecución fallida de ausencia", () => {
    render(<UnifiedReport report={publication("FAILED")} />);
    expect(screen.getByText("No se obtuvo un resultado válido.")).toBeTruthy();
    expect(screen.getByText(/E022: falló/)).toBeTruthy();
    expect(screen.getByText(/EchoNext-Mini no disponible/)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Función ventricular" })).toBeNull();
    expect(screen.queryByText(/Puntuación de investigación/)).toBeNull();
  });
  it("un intento Mini fallido es parcial, no NOT_AVAILABLE ni un cero inventado", () => {
    render(<UnifiedReport report={publication("COMPLETED", "FAILED")} />);
    expect(screen.getByText("Informe parcial")).toBeTruthy();
    expect(screen.getByText(/EchoNext-Mini: falló/)).toBeTruthy();
    expect(screen.queryByText(/NOT_AVAILABLE|Son probabilidades estimadas/)).toBeNull();
  });
  it("COMPLETE agrupa ambos indicadores FEVI al mismo nivel y conserva los otros once Mini", () => {
    render(<UnifiedReport report={publication("COMPLETED", "COMPLETED")} />);
    expect(screen.getByText("Informe completo")).toBeTruthy();
    const section = screen.getByRole("region", { name: "Función ventricular" });
    expect(within(section).getByText("Puntuación de investigación para posible FEVI ≤45 %")).toBeTruthy();
    expect(within(section).getByText("Probabilidad estimada de posible FEVI ≤45 %")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(11);
    expect(screen.getByText(/Cardiopatía estructural/)).toBeTruthy();
    const mini = within(section).getByRole("group", { name: "Probabilidad estimada de posible FEVI ≤45 %" });
    expect(within(mini).getByText(PROBABILITY_WARNING)).toBeTruthy();
    const e022 = within(section).getByRole("group", { name: "Puntuación de investigación para posible FEVI ≤45 %" });
    expect(within(e022).getByText("Es una puntuación de investigación, no un valor de FEVI ni una probabilidad clínicamente calibrada.")).toBeTruthy();
    expect(within(e022).queryByText(PROBABILITY_WARNING)).toBeNull();
    expect(screen.getByText(PROFESSIONAL_WARNING)).toBeTruthy();
  });
  it.each([
    ["COMPLETED", "Informe completo", "Dra. Solicitante Sintética"],
    ["NOT_AVAILABLE", "Informe parcial", "El propio paciente"],
  ] as const)("muestra el solicitante autorizado con Mini %s", (mini, heading, label) => {
    const { container } = render(<UnifiedReport report={publication("COMPLETED", mini)} />);
    expect(screen.getByText(heading)).toBeTruthy();
    expect(screen.getByText(`Pedido por: ${label}`)).toBeTruthy();
    expect(container.textContent).not.toContain("PRIVATE_REQUESTER");
  });
  it("solo Mini válido sigue siendo parcial sin rellenar E022 con cero", () => {
    render(<UnifiedReport report={publication("FAILED", "COMPLETED")} />);
    expect(screen.getByText("Informe parcial")).toBeTruthy();
    expect(screen.getByText("Probabilidad estimada de posible FEVI ≤45 %")).toBeTruthy();
    expect(screen.queryByText("Puntuación de investigación para posible FEVI ≤45 %")).toBeNull();
    expect(screen.getByText(PROBABILITY_WARNING)).toBeTruthy();
    expect(screen.getByText(/E022: falló/)).toBeTruthy();
  });
});
