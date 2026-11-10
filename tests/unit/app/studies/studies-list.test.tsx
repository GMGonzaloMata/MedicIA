import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Pagination } from "@/app/(dashboard)/_studies/_components/pagination";
import { StudiesList } from "@/app/(dashboard)/_studies/_components/studies-list";
import type { StudySummary } from "@/modules/studies/domain/study";

function summary(overrides: Partial<StudySummary> = {}): StudySummary {
  return {
    id: "study-1",
    number: 2,
    type: "ECG",
    status: "UPLOADED",
    uploadedAt: new Date("2026-11-10T15:30:00Z"),
    uploadedBy: { kind: "PATIENT" },
    canDelete: false,
    ...overrides,
  };
}

describe("lista de estudios", () => {
  it("muestra número, tipo, fecha y hora, estado y quién lo cargó", () => {
    render(
      <StudiesList
        studies={[
          summary(),
          summary({ id: "study-2", number: 1, uploadedBy: { kind: "DOCTOR", fullName: "Dra. Pérez" } }),
        ]}
      />,
    );
    const table = screen.getByRole("table");

    expect(within(table).getByRole("rowheader", { name: "2" })).toBeTruthy();
    expect(within(table).getAllByText("Electrocardiograma")).toHaveLength(2);
    expect(within(table).getAllByText("Cargado")).toHaveLength(2);
    expect(within(table).getByText("El propio paciente")).toBeTruthy();
    expect(within(table).getByText("Dra. Pérez")).toBeTruthy();
    expect(within(table).getAllByText(/10\/11\/26.*12:30/)).toHaveLength(2);
  });

  it("repite los datos en tarjetas para el móvil, sin nombre de archivo", () => {
    const { container } = render(<StudiesList studies={[summary()]} />);

    expect(screen.getByText("Estudio 2")).toBeTruthy();
    expect(container.textContent).not.toMatch(/\.npz|\.ecg1/);
  });

  it("muestra un aviso cuando no hay estudios", () => {
    render(<StudiesList studies={[]} />);

    expect(screen.getByText("Todavía no hay estudios cargados.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("paginación", () => {
  it("no aparece con una sola página", () => {
    const { container } = render(<Pagination page={1} totalPages={1} basePath="/studies" />);

    expect(container.innerHTML).toBe("");
  });

  it("ofrece Anterior y Siguiente según la página", () => {
    const { rerender } = render(<Pagination page={1} totalPages={3} basePath="/studies" />);

    expect(screen.queryByRole("link", { name: "Anterior" })).toBeNull();
    expect(screen.getByRole("link", { name: "Siguiente" }).getAttribute("href")).toBe("/studies?page=2");
    expect(screen.getByText("Página 1 de 3")).toBeTruthy();

    rerender(<Pagination page={3} totalPages={3} basePath="/studies" />);
    expect(screen.getByRole("link", { name: "Anterior" }).getAttribute("href")).toBe("/studies?page=2");
    expect(screen.queryByRole("link", { name: "Siguiente" })).toBeNull();
  });
});
