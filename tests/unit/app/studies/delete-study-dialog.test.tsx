import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { StudySummary } from "@/modules/studies/domain/study";

vi.mock("@/app/(dashboard)/_studies/_actions/delete-study", () => ({ deleteStudyAction: vi.fn() }));

import { DeleteStudyDialog } from "@/app/(dashboard)/_studies/_components/delete-study-dialog";
import { StudiesList } from "@/app/(dashboard)/_studies/_components/studies-list";

// jsdom no implementa los métodos de `<dialog>`.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  this.removeAttribute("open");
});

beforeEach(() => {
  showModal.mockClear();
  close.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

function summary(overrides: Partial<StudySummary>): StudySummary {
  return {
    id: "study-1",
    number: 1,
    type: "ECG",
    status: "UPLOADED",
    uploadedAt: new Date("2026-11-10T15:30:00Z"),
    uploadedBy: { kind: "PATIENT" },
    canDelete: true,
    ...overrides,
  };
}

describe("diálogo de eliminación", () => {
  it("abre el diálogo con la advertencia y no borra nada hasta confirmar", () => {
    const { container } = render(<DeleteStudyDialog studyId="study-1" number={3} />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar el estudio 3" }));

    expect(showModal).toHaveBeenCalledTimes(1);
    expect(container.querySelector("dialog")?.textContent).toContain(
      "Se borrará el estudio 3 y su archivo. No se puede deshacer.",
    );
    expect((container.querySelector("input[name=studyId]") as HTMLInputElement).value).toBe("study-1");
  });

  it("Cancelar cierra el diálogo sin enviar el formulario", () => {
    render(<DeleteStudyDialog studyId="study-1" number={3} />);
    fireEvent.click(screen.getByRole("button", { name: "Eliminar el estudio 3" }));

    fireEvent.click(screen.getByText("Cancelar"));

    expect(close).toHaveBeenCalledTimes(1);
  });

  it("el diálogo es nativo y se rotula con su título", () => {
    const { container } = render(<DeleteStudyDialog studyId="study-1" number={3} />);
    const dialog = container.querySelector("dialog") as HTMLDialogElement;

    expect(dialog.getAttribute("aria-labelledby")).toBe("delete-title-study-1");
    expect(container.querySelector("#delete-title-study-1")?.textContent).toBe("Eliminar estudio");
  });
});

describe("botón Eliminar en la lista", () => {
  it("aparece solo en los estudios que cargó quien mira", () => {
    render(
      <StudiesList
        studies={[
          summary({ id: "propio", number: 2, canDelete: true }),
          summary({ id: "ajeno", number: 1, canDelete: false, uploadedBy: { kind: "DOCTOR", fullName: "Dra. Pérez" } }),
        ]}
      />,
    );

    expect(screen.getAllByRole("button", { name: "Eliminar el estudio 2" }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Eliminar el estudio 1" })).toBeNull();
  });
});
