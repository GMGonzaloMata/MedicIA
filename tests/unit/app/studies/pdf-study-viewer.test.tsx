import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PdfStudyViewer } from "@/app/(dashboard)/_studies/_components/viewer/pdf-study-viewer";
import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

function syntheticLeads() {
  return ECG_LEAD_NAMES.map((name) => ({ name, samples: Array<number>(5000).fill(0), observed: Array<boolean>(5000).fill(false) }));
}
function open(name = "I") {
  fireEvent.click(screen.getByRole("button", { name: `Ampliar la derivación ${name}` }));
  return screen.getByRole("group", { name: `Gráfica de la derivación ${name}` });
}
function image(name = "I") { return screen.getByRole("img", { name: `Derivación ${name}, señal cruda del PDF` }); }
afterEach(cleanup);

describe("visor PDF: muestras observadas, no señal normalizada", () => {
  it("muestra las 12 derivaciones por nombre aun con entrada desordenada, unidades y límites de interpretación", () => {
    render(<PdfStudyViewer leads={syntheticLeads().reverse()} />);
    expect(screen.getAllByRole("img")).toHaveLength(12);
    for (const name of ECG_LEAD_NAMES) expect(image(name)).toBeTruthy();
    expect(screen.getAllByRole("img").map((node) => node.getAttribute("aria-label"))).toEqual(ECG_LEAD_NAMES.map((name) => `Derivación ${name}, señal cruda del PDF`));
    expect(screen.getByText(/500 Hz/)).toBeTruthy();
    expect(screen.getByText(/microvoltios/)).toBeTruthy();
    expect(screen.getByText(/no es una escala clínica calibrada/)).toBeTruthy();
    expect(screen.getByText(/Los huecos son tramos no observados, no amplitud cero/)).toBeTruthy();
    expect(screen.getByText(/sin remuestreo, normalización ni interpolación/)).toBeTruthy();
    expect(screen.getAllByText("Sin muestras observadas")).toHaveLength(12);
  });

  it("corta cada hueco, incluidos consecutivos y extremos; conserva cero observado y muestras aisladas", () => {
    const leads = syntheticLeads();
    const first = leads[0];
    if (!first) throw new Error("Fixture sin derivación");
    for (const [index, sample] of [[1, 0], [2, -12.25], [5, 30], [6, 40], [9, 0], [4998, 2]] as const) {
      first.observed[index] = true;
      first.samples[index] = sample;
    }
    const before = JSON.stringify(leads);
    render(<PdfStudyViewer leads={leads} />);
    expect(image().querySelector("path")?.getAttribute("d")).toBe("M1,0 L2,12.25 M5,-30 L6,-40 M9,0 M4998,-2");
    const dots = [...image().querySelectorAll("circle")].map((dot) => [dot.getAttribute("cx"), dot.getAttribute("cy")]);
    expect(dots).toEqual([["9", "0"], ["4998", "-2"]]);
    expect(image("II").querySelector("path")).toBeNull();
    expect(image("II").querySelectorAll("circle")).toHaveLength(0);
    expect(JSON.stringify(leads)).toBe(before);
  });

  it("dibuja las 5000 muestras observadas sin decimación, escalas por derivación ni redondeo de amplitud", () => {
    const leads = syntheticLeads();
    const first = leads[0];
    const second = leads[1];
    if (!first || !second) throw new Error("Fixture incompleta");
    first.observed.fill(true);
    first.samples = first.samples.map((_, index) => index === 100 ? 0.1 : index === 4999 ? -123.25 : 0);
    second.observed[0] = true;
    second.samples[0] = 5000;
    render(<PdfStudyViewer leads={leads} />);
    const path = image().querySelector("path")?.getAttribute("d") ?? "";
    expect(path.split(" ")).toHaveLength(5000);
    expect(path).toContain("L100,-0.1");
    expect(path.endsWith("L4999,123.25")).toBe(true);
    expect(image().getAttribute("viewBox")).toBe(image("II").getAttribute("viewBox"));
  });

  it("opera selector, botones, zoom/desplazamiento y teclado sin unir huecos ni atrapar Tab", () => {
    const leads = syntheticLeads();
    const first = leads[0];
    if (!first) throw new Error("Fixture incompleta");
    first.observed.fill(true);
    render(<PdfStudyViewer leads={leads} />);
    let chart = open();
    expect(chart.getAttribute("tabindex")).toBe("0");
    fireEvent.keyDown(chart, { key: "+" });
    expect(screen.getByText("Mostrando de 2,5 a 7,5 s")).toBeTruthy();
    const path = image().querySelector("path")?.getAttribute("d") ?? "";
    expect(path.startsWith("M1250,0 ")).toBe(true);
    expect(path.split(" ")).toHaveLength(2500);
    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByText("Mostrando de 3,5 a 8,5 s")).toBeTruthy();
    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByText("Mostrando de 5,0 a 10,0 s")).toBeTruthy();
    fireEvent.keyDown(chart, { key: "Home" });
    expect(screen.getByText("Mostrando de 0,0 a 5,0 s")).toBeTruthy();
    fireEvent.keyDown(chart, { key: "ArrowDown" });
    chart = screen.getByRole("group", { name: "Gráfica de la derivación II" });
    fireEvent.keyDown(chart, { key: "ArrowUp" });
    chart = screen.getByRole("group", { name: "Gráfica de la derivación I" });
    expect(fireEvent.keyDown(chart, { key: "Tab" })).toBe(true);
    fireEvent.keyDown(chart, { key: "0" });
    expect(screen.getByText("Mostrando de 0,0 a 10,0 s")).toBeTruthy();
    fireEvent.keyDown(chart, { key: "Escape" });
    expect(screen.getAllByRole("img")).toHaveLength(12);
    fireEvent.change(screen.getByLabelText("Derivación"), { target: { value: "7" } });
    expect(screen.getByRole("group", { name: "Gráfica de la derivación V2" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Acercar" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Anterior" }));
    fireEvent.click(screen.getByRole("button", { name: "Alejar" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver completo" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver las 12 derivaciones" }));
    expect(screen.getAllByRole("img")).toHaveLength(12);
    expect(screen.getByText("Tocá una derivación para verla ampliada.")).toBeTruthy();
  });
});
