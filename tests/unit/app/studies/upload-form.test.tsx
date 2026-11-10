import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadStudyAction = vi.hoisted(() => vi.fn());

vi.mock("@/app/(dashboard)/_studies/_actions/upload-study", () => ({ uploadStudyAction }));

import { UploadForm } from "@/app/(dashboard)/_studies/_components/upload-form";

const MAX_BYTES = 100;

function chooseFile(size: number) {
  const input = screen.getByLabelText("Archivo del electrocardiograma") as HTMLInputElement;
  const file = new File([new Uint8Array(size)], "ecg.npz");
  fireEvent.change(input, { target: { files: [file] } });

  return input;
}

beforeEach(() => {
  uploadStudyAction.mockReset();
  vi.unstubAllGlobals();
});

describe("formulario de carga", () => {
  it("avisa antes de enviar si el archivo es demasiado grande y no llama a la acción", async () => {
    // jsdom no vuelca el archivo elegido en el FormData del formulario: se lo agrega el doble.
    const OriginalFormData = FormData;
    vi.stubGlobal(
      "FormData",
      class extends OriginalFormData {
        constructor(form?: HTMLFormElement) {
          super(form);
          this.set("file", new File([new Uint8Array(MAX_BYTES + 1)], "ecg.npz"));
        }
      },
    );
    render(<UploadForm maxBytes={MAX_BYTES} />);
    chooseFile(MAX_BYTES + 1);

    expect(screen.getByText("El archivo supera el tamaño máximo de 2 MB.")).toBeTruthy();

    fireEvent.submit(screen.getByRole("button", { name: "Subir estudio" }).closest("form") as HTMLFormElement);

    await waitFor(() => expect(screen.getAllByText("El archivo supera el tamaño máximo de 2 MB.").length).toBeGreaterThan(0));
    expect(uploadStudyAction).not.toHaveBeenCalled();
  });

  it("muestra el aviso de éxito y el motivo de un rechazo", async () => {
    uploadStudyAction.mockResolvedValueOnce({ ok: true, number: 3 });
    const { rerender } = render(<UploadForm maxBytes={MAX_BYTES} />);
    chooseFile(10);

    fireEvent.submit(screen.getByRole("button", { name: "Subir estudio" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByText("Estudio 3 guardado.")).toBeTruthy());

    uploadStudyAction.mockResolvedValueOnce({ ok: false, code: "SEX_INVALID", message: "El sexo debe ser 0 o 1." });
    rerender(<UploadForm maxBytes={MAX_BYTES} />);
    fireEvent.submit(screen.getByRole("button", { name: "Subir estudio" }).closest("form") as HTMLFormElement);
    await waitFor(() => expect(screen.getByText("El sexo debe ser 0 o 1.")).toBeTruthy());
  });

  it("incluye el paciente solo cuando se lo indica", () => {
    const { container, rerender } = render(<UploadForm maxBytes={MAX_BYTES} />);
    expect(container.querySelector("input[name=patientId]")).toBeNull();

    rerender(<UploadForm patientId="patient-1" maxBytes={MAX_BYTES} />);
    expect((container.querySelector("input[name=patientId]") as HTMLInputElement).value).toBe("patient-1");
  });
});
