import { Activity } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/(dashboard)/_studies/_actions/delete-study", () => ({ deleteStudyAction: vi.fn() }));

import { DeleteStudyDialog } from "@/app/(dashboard)/_studies/_components/delete-study-dialog";
import { ModalDialog } from "@/app/(dashboard)/clinic/_components/modal-dialog";

// jsdom no implementa los métodos de `<dialog>`; `close` dispara el evento como el navegador.
const showModal = vi.fn(function (this: HTMLDialogElement) {
  this.setAttribute("open", "");
});
const close = vi.fn(function (this: HTMLDialogElement) {
  if (!this.hasAttribute("open")) return;
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
});

beforeEach(() => {
  showModal.mockClear();
  close.mockClear();
  HTMLDialogElement.prototype.showModal = showModal;
  HTMLDialogElement.prototype.close = close;
});

// Next oculta la página al navegar con <Activity mode="hidden"> en lugar de desmontarla. Un diálogo modal que
// quede abierto deja su fondo oscuro sobre la página al volver atrás.
describe("diálogos modales al ocultarse la página", () => {
  it("«Cargar estudio» se cierra cuando la página queda oculta", () => {
    const modal = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <ModalDialog triggerLabel="Cargar estudio" title="Cargar estudio" description="Elegí el archivo.">
          <p>Formulario</p>
        </ModalDialog>
      </Activity>
    );
    const { container, rerender } = render(modal("visible"));
    fireEvent.click(screen.getByRole("button", { name: "Cargar estudio" }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);

    rerender(modal("hidden"));

    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });

  it("«Eliminar estudio» se cierra cuando la página queda oculta", () => {
    const dialog = (mode: "visible" | "hidden") => (
      <Activity mode={mode}>
        <DeleteStudyDialog studyId="study-1" number={3} />
      </Activity>
    );
    const { container, rerender } = render(dialog("visible"));
    fireEvent.click(screen.getByRole("button", { name: "Eliminar el estudio 3" }));
    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(true);

    rerender(dialog("hidden"));

    expect(container.querySelector("dialog")?.hasAttribute("open")).toBe(false);
  });
});
