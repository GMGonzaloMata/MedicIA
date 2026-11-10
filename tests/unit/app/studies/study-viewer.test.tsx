import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { StudyViewer } from "@/app/(dashboard)/_studies/_components/viewer/study-viewer";
import { WaveformSummary } from "@/app/(dashboard)/_studies/_components/viewer/waveform-summary";
import { ECG_LEAD_NAMES } from "@/modules/studies/domain/ecg-leads";

// 12 derivaciones sintéticas de 2500 muestras: una senoide distinta por derivación.
function syntheticLeads(): Float32Array[] {
  const leads: Float32Array[] = [];

  for (let lead = 0; lead < ECG_LEAD_NAMES.length; lead += 1) {
    const samples = new Float32Array(2500);
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.sin((index / 20) * (lead + 1));
    }
    leads.push(samples);
  }

  return leads;
}

function openLead(name: string) {
  fireEvent.click(screen.getByRole("button", { name: `Ampliar la derivación ${name}` }));
}

describe("visor de la onda", () => {
  it("muestra las 12 derivaciones con su nombre y la ayuda para ampliar", () => {
    render(<StudyViewer leads={syntheticLeads()} />);

    expect(screen.getAllByRole("img")).toHaveLength(12);
    for (const name of ECG_LEAD_NAMES) {
      expect(screen.getByRole("button", { name: `Ampliar la derivación ${name}` })).toBeTruthy();
      expect(screen.getByRole("img", { name: new RegExp(`^Derivación ${name}, 10 segundos$`) })).toBeTruthy();
    }
    expect(screen.getByText("Tocá una derivación para verla ampliada.")).toBeTruthy();
  });

  it("elegir una derivación la amplía y se vuelve a las 12 con el botón", () => {
    render(<StudyViewer leads={syntheticLeads()} />);

    openLead("V2");

    expect(screen.getAllByRole("img")).toHaveLength(1);
    expect(screen.getByRole("group", { name: "Gráfica de la derivación V2" })).toBeTruthy();
    expect(screen.getByText("Mostrando de 0,0 a 10,0 s")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Ver las 12 derivaciones" }));

    expect(screen.getAllByRole("img")).toHaveLength(12);
  });

  it("el teclado acerca, se desplaza, cambia de derivación y Escape vuelve a las 12", () => {
    render(<StudyViewer leads={syntheticLeads()} />);
    openLead("I");
    const chart = screen.getByRole("group", { name: "Gráfica de la derivación I" });

    expect(chart.getAttribute("tabindex")).toBe("0");

    fireEvent.keyDown(chart, { key: "+" });
    expect(screen.getByText("Mostrando de 2,5 a 7,5 s")).toBeTruthy();

    fireEvent.keyDown(chart, { key: "ArrowRight" });
    expect(screen.getByText("Mostrando de 3,5 a 8,5 s")).toBeTruthy();

    fireEvent.keyDown(chart, { key: "End" });
    expect(screen.getByText("Mostrando de 5,0 a 10,0 s")).toBeTruthy();

    fireEvent.keyDown(chart, { key: "ArrowDown" });
    expect(screen.getByRole("group", { name: "Gráfica de la derivación II" })).toBeTruthy();

    fireEvent.keyDown(chart, { key: "0" });
    expect(screen.getByText("Mostrando de 0,0 a 10,0 s")).toBeTruthy();

    fireEvent.keyDown(screen.getByRole("group", { name: "Gráfica de la derivación II" }), { key: "Escape" });
    expect(screen.getAllByRole("img")).toHaveLength(12);
  });

  it("los botones hacen lo mismo y se deshabilitan en los límites", () => {
    render(<StudyViewer leads={syntheticLeads()} />);
    openLead("aVR");

    const zoomIn = screen.getByRole("button", { name: "Acercar" }) as HTMLButtonElement;
    const zoomOut = screen.getByRole("button", { name: "Alejar" }) as HTMLButtonElement;
    const previous = screen.getByRole("button", { name: "Anterior" }) as HTMLButtonElement;
    const next = screen.getByRole("button", { name: "Siguiente" }) as HTMLButtonElement;

    expect(zoomOut.disabled).toBe(true);
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(true);

    for (let step = 0; step < 4; step += 1) {
      fireEvent.click(zoomIn);
    }
    expect(zoomIn.disabled).toBe(true);
    expect(screen.getByText("Mostrando de 4,5 a 5,5 s")).toBeTruthy();

    fireEvent.click(next);
    expect(screen.getByText("Mostrando de 4,7 a 5,7 s")).toBeTruthy();
    expect(previous.disabled).toBe(false);
  });

  it("el selector de derivación abre la vista ampliada de esa derivación", () => {
    render(<StudyViewer leads={syntheticLeads()} />);

    fireEvent.change(screen.getByLabelText("Derivación"), { target: { value: "5" } });

    expect(screen.getByRole("group", { name: "Gráfica de la derivación aVF" })).toBeTruthy();
  });

  it("la vista ampliada explica las teclas", () => {
    render(<StudyViewer leads={syntheticLeads()} />);
    openLead("I");

    expect(screen.getByText(/← → desplazan.*Esc vuelve a las 12 derivaciones/)).toBeTruthy();
  });
});

describe("resumen de la señal", () => {
  it("lista las derivaciones, la duración y la frecuencia, y aclara que no hay milivolts", () => {
    render(<WaveformSummary />);
    const summary = screen.getByRole("region", { name: "Resumen de la señal" });

    expect(within(summary).getByText(/I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6/)).toBeTruthy();
    expect(within(summary).getByText("10 segundos")).toBeTruthy();
    expect(within(summary).getByText("250 Hz")).toBeTruthy();
    expect(within(summary).getByText(/sin unidades de milivolts/)).toBeTruthy();
    expect(within(summary).getByText(/no una interpretación/)).toBeTruthy();
  });
});
