import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const uploadPdfStudyAction = vi.hoisted(() => vi.fn());
const uploadStudyAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(dashboard)/_studies/_actions/upload-pdf-study", () => ({ uploadPdfStudyAction }));
vi.mock("@/app/(dashboard)/_studies/_actions/upload-study", () => ({ uploadStudyAction }));
import { UploadForm } from "@/app/(dashboard)/_studies/_components/upload-form";
const MAX = 2 * 1024 * 1024;
const UNAVAILABLE = "No pudimos leer el PDF. Probá de nuevo más tarde.";

function selectEcg() { fireEvent.change(screen.getByLabelText("Tipo de estudio"), { target: { value: "ECG" } }); }
function submit() {
  const form = screen.getByRole("button", { name: "Subir estudio" }).closest("form");
  if (!form) throw new Error("Formulario ausente");
  fireEvent.submit(form);
}
function supplyFile(size: number) {
  // El formulario debe enviar este File sin parchear FormData ni FileList.
  const file = new File([new Uint8Array(size)], "sintético.pdf", { type: "application/pdf" });
  fireEvent.change(screen.getByLabelText("Archivo del electrocardiograma"), { target: { files: [file] } });
}
beforeEach(() => { vi.resetAllMocks(); vi.unstubAllGlobals(); });

describe("formulario PDF, acciones simuladas explícitamente", () => {
  it("PDF es la opción normal, ECG requiere selección explícita y explica la carga seguida del análisis", () => {
    const { container } = render(<UploadForm maxBytes={MAX} />);
    expect(screen.getByLabelText("Formato del archivo")).toHaveProperty("value", "PDF");
    const type = screen.getByLabelText("Tipo de estudio");
    expect(type).toHaveProperty("value", ""); expect(type).toHaveProperty("required", true);
    const file = screen.getByLabelText("Archivo del electrocardiograma");
    expect(file.getAttribute("accept")).toBe(".pdf"); expect(file.getAttribute("aria-describedby")).toBe("study-file-hint pdf-availability");
    expect(screen.getByText("Un PDF Mortara compatible de hasta 2 MB (2.097.152 bytes). No se admiten PDFs escaneados ni de otros fabricantes.")).toBeTruthy();
    expect(screen.getByText("Al guardar el PDF, se abrirá el estudio. Desde allí podés solicitar el análisis con E022.")).toBeTruthy();
    expect(screen.queryByText("La carga PDF todavía no está habilitada. Podés seguir usando la carga NPZ de compatibilidad.")).toBeNull();
    expect(container.querySelector("input[type=hidden][name=type]")).toBeNull();
    expect(container.querySelector("[aria-live=polite]")).toBeTruthy();
  });
  it.each(["", "RX"])("un envío directo con tipo %s no llama a ninguna acción", async (type) => {
    const Original = FormData;
    vi.stubGlobal("FormData", class extends Original { constructor(form?: HTMLFormElement) { super(form); this.set("type", type); } });
    render(<UploadForm maxBytes={MAX} />); submit();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Elegí un tipo de estudio disponible."));
    expect(uploadPdfStudyAction).not.toHaveBeenCalled(); expect(uploadStudyAction).not.toHaveBeenCalled();
  });
  it.each([MAX, MAX + 1])("límite cliente %i bytes, mensaje fijo e invocaciones exactas", async (size) => {
    uploadPdfStudyAction.mockResolvedValue({ ok: false, code: "PDF_EXTRACTION_UNAVAILABLE", message: UNAVAILABLE });
    render(<UploadForm maxBytes={MAX} />); selectEcg(); supplyFile(size); submit();
    const expected = size > MAX ? "El archivo supera el tamaño máximo de 2 MB." : UNAVAILABLE;
    await waitFor(() => expect(screen.getAllByText(expected).length).toBeGreaterThan(0));
    expect(uploadPdfStudyAction).toHaveBeenCalledTimes(size > MAX ? 0 : 1); expect(uploadStudyAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("un prop permisivo no amplía los 2 MiB del cliente", async () => {
    render(<UploadForm maxBytes={MAX * 2} />); selectEcg(); supplyFile(MAX + 1); submit();
    await waitFor(() => expect(screen.getAllByText("El archivo supera el tamaño máximo de 2 MB.").length).toBeGreaterThan(0));
    expect(uploadPdfStudyAction).not.toHaveBeenCalled(); expect(uploadStudyAction).not.toHaveBeenCalled();
  });
  it("solo confirma éxito devuelto por acción; un rechazo muestra el mensaje accesible exacto", async () => {
    uploadPdfStudyAction.mockResolvedValueOnce({ ok: true, number: 8 });
    uploadPdfStudyAction.mockResolvedValueOnce({ ok: false, code: "PDF_PROTECTED", message: "El PDF está protegido y no se puede leer." });
    render(<UploadForm patientId="synthetic-patient" maxBytes={MAX} />); selectEcg(); supplyFile(10); submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Estudio 8 guardado."));
    expect(uploadPdfStudyAction).toHaveBeenCalledTimes(1);
    const data = uploadPdfStudyAction.mock.calls[0]?.[1];
    expect(data.get("type")).toBe("ECG"); expect(data.get("patientId")).toBe("synthetic-patient");
    expect(data.get("actor")).toBeNull(); expect(data.get("tenantId")).toBeNull();
    // React restablece los controles nativos al resolver la acción; se vuelve a elegir ECG.
    selectEcg(); submit(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("El PDF está protegido y no se puede leer."));
    expect(screen.queryByRole("status")).toBeNull(); expect(uploadPdfStudyAction).toHaveBeenCalledTimes(2);
    expect(uploadStudyAction).not.toHaveBeenCalled();
  });
  it("NPZ sigue accesible por control etiquetado; cambiar formato limpia archivo y resultado para no reutilizar éxito", async () => {
    uploadPdfStudyAction.mockResolvedValue({ ok: true, number: 3 });
    render(<UploadForm maxBytes={MAX} />); selectEcg(); supplyFile(5); submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Estudio 3 guardado."));
    vi.unstubAllGlobals();
    const format = screen.getByLabelText("Formato del archivo"); format.focus(); expect(document.activeElement).toBe(format);
    fireEvent.change(format, { target: { value: "NPZ" } });
    expect(screen.getByLabelText("Archivo del electrocardiograma").getAttribute("accept")).toBe(".npz");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByText(/Un archivo .npz de hasta 2 MB/)).toBeTruthy();
    selectEcg(); uploadStudyAction.mockResolvedValue({ ok: true, number: 4 }); submit();
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Estudio 4 guardado."));
    expect(uploadStudyAction).toHaveBeenCalledTimes(1); expect(uploadPdfStudyAction).toHaveBeenCalledTimes(1);
  });
  it("conserva controles fluidos, tokens y foco visible (patrones DOM, no prueba visual)", () => {
    render(<UploadForm maxBytes={MAX} />);
    for (const label of ["Formato del archivo", "Tipo de estudio"]) {
      const control = screen.getByLabelText(label); control.focus(); expect(document.activeElement).toBe(control);
      expect(control.className).toContain("w-full"); expect(control.className).toContain("focus-visible:outline-ring");
      expect(control.className).toContain("bg-card"); expect(control.className).not.toMatch(/#[0-9a-f]{3,8}/i);
    }
    const picker = screen.getByRole("button", { name: "Elegir PDF" });
    picker.focus(); expect(document.activeElement).toBe(picker);
    expect(picker.className).toContain("focus-visible:outline-ring");
    const dropzone = screen.getByRole("region", { name: "Carga de PDF" });
    expect(dropzone.className).toContain("min-w-0"); expect(dropzone.className).toContain("bg-card");
    expect(dropzone.className).not.toMatch(/#[0-9a-f]{3,8}/i);
  });
});
