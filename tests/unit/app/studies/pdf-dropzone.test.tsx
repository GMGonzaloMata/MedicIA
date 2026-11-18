import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pdfAction = vi.hoisted(() => vi.fn());
const npzAction = vi.hoisted(() => vi.fn());
vi.mock("@/app/(dashboard)/_studies/_actions/upload-pdf-study", () => ({ uploadPdfStudyAction: pdfAction }));
vi.mock("@/app/(dashboard)/_studies/_actions/upload-study", () => ({ uploadStudyAction: npzAction }));
import { UploadForm } from "@/app/(dashboard)/_studies/_components/upload-form";

const MAX = 2 * 1024 * 1024;
const MESSAGES = {
  multiple: "Elegí un solo PDF por vez.",
  type: "Elegí un archivo con extensión .pdf. El contenido se valida en el servidor.",
  size: "El archivo supera el tamaño máximo de 2 MB.",
  missing: "Elegí un archivo para subir.",
};
function file(name = "sintético.pdf", size = 12, type = "application/pdf") {
  return new File([new Uint8Array(size)], name, { type });
}
function pick(files: File[]) {
  fireEvent.change(screen.getByLabelText("Archivo del electrocardiograma"), { target: { files } });
}
function drop(files: File[]) {
  return fireEvent.drop(screen.getByRole("region", { name: "Carga de PDF" }), { dataTransfer: { files, types: ["Files"] } });
}
function send() {
  const form = screen.getByRole("button", { name: "Subir estudio" }).closest("form");
  if (!form) throw new Error("Formulario ausente");
  fireEvent.submit(form);
}
function ecg() { fireEvent.change(screen.getByLabelText("Tipo de estudio"), { target: { value: "ECG" } }); }
function expectNoActions() { expect(pdfAction).not.toHaveBeenCalled(); expect(npzAction).not.toHaveBeenCalled(); }
beforeEach(() => {
  vi.resetAllMocks();
  pdfAction.mockResolvedValue({ ok: false, code: "PDF_EXTRACTION_UNAVAILABLE", message: "No pudimos leer el PDF. Probá de nuevo más tarde." });
});

describe("dropzone PDF integrado, sin servicios reales", () => {
  it.each([pick, drop])("envía el archivo elegido real, con tamaño/nombre y sin identidad inventada (%#)", async (choose) => {
    render(<UploadForm patientId="synthetic-patient" maxBytes={MAX} />); ecg();
    const selected = file("onda.PDF", MAX, ""); choose([selected]);
    expect(screen.getByText("onda.PDF")).toBeTruthy();
    expect(screen.getByText("2.097.152 bytes")).toBeTruthy();
    send();
    await waitFor(() => expect(pdfAction).toHaveBeenCalledTimes(1));
    const data: FormData = pdfAction.mock.calls[0][1];
    expect(data.get("file")).toBe(selected);
    expect(data.getAll("file")).toHaveLength(1);
    expect(data.get("type")).toBe("ECG"); expect(data.get("patientId")).toBe("synthetic-patient");
    expect(data.get("actor")).toBeNull(); expect(data.get("tenantId")).toBeNull();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No pudimos leer el PDF. Probá de nuevo más tarde."));
    expect(screen.queryByText(/Estudio .* guardado/)).toBeNull(); expect(npzAction).not.toHaveBeenCalled();
  });
  for (const [source, choose] of [["selección", pick], ["drop", drop]] as const) {
    it.each([
      { files: [file("uno.pdf"), file("dos.pdf")], message: MESSAGES.multiple },
      { files: [file("onda.txt", 12, "application/pdf")], message: MESSAGES.type },
      { files: [file("onda.pdf.exe", 12, "application/pdf")], message: MESSAGES.type },
      { files: [file("onda.pdf", MAX + 1)], message: MESSAGES.size },
      { files: [file("onda.pdf", 0)], message: MESSAGES.missing },
    ])(`${source}: rechaza sin acción ni archivo anterior: $message`, async ({ files, message }) => {
      render(<UploadForm maxBytes={MAX} />); ecg(); choose([file("anterior.pdf")]); choose(files);
      expect(screen.getByRole("alert").textContent).toBe(message);
      expect(screen.queryByText("anterior.pdf")).toBeNull();
      expect(screen.getByRole("button", { name: "Elegir PDF" }).getAttribute("aria-describedby")).toContain("study-feedback");
      expect(document.activeElement?.id).toBe("study-feedback");
      send();
      await waitFor(() => expect(screen.getAllByRole("alert").map((el) => el.textContent)).toContain(message));
      expectNoActions();
    });
  }
  it.each([pick, drop])("no confía en MIME y acepta extensión PDF para validación posterior (%#)", async (choose) => {
    render(<UploadForm maxBytes={MAX} />); ecg(); const selected = file("onda.pdf", 1, "text/plain"); choose([selected]); send();
    await waitFor(() => expect(pdfAction).toHaveBeenCalledTimes(1));
    expect(pdfAction.mock.calls[0][1].get("file")).toBe(selected);
  });
  it("exige ECG explícito aun con un drop válido y no amplía el límite por prop", async () => {
    render(<UploadForm maxBytes={MAX * 2} />); drop([file()]); send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("Elegí un tipo de estudio disponible.")); expectNoActions();
    ecg(); drop([file("grande.pdf", MAX + 1)]); send();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(MESSAGES.size)); expectNoActions();
  });
  it("ofrece selector nativo por botón semántico, foco y click sin enviar el formulario", () => {
    render(<UploadForm maxBytes={MAX} />);
    const input = screen.getByLabelText("Archivo del electrocardiograma");
    const click = vi.spyOn(input, "click"); const button = screen.getByRole("button", { name: "Elegir PDF" });
    button.focus(); expect(document.activeElement).toBe(button);
    expect(button.tagName).toBe("BUTTON"); expect(button.getAttribute("type")).toBe("button");
    // Enter/Espacio activan un botón nativo en navegador; jsdom no implementa ese comportamiento por defecto.
    fireEvent.click(button); expect(click).toHaveBeenCalledTimes(1); expectNoActions();
    expect(button.className).toContain("focus-visible:outline-ring");
    expect(input.getAttribute("accept")).toBe(".pdf");
  });
  it("previene navegación por drop/drag y anuncia el destino sin depender del color", () => {
    render(<UploadForm maxBytes={MAX} />);
    const region = screen.getByRole("region", { name: "Carga de PDF" });
    expect(fireEvent.dragOver(region, { dataTransfer: { types: ["Files"] } })).toBe(false);
    fireEvent.dragEnter(region, { dataTransfer: { types: ["Files"] } });
    expect(screen.getByText("Soltá el PDF acá")).toBeTruthy();
    fireEvent.dragLeave(region);
    expect(screen.queryByText("Soltá el PDF acá")).toBeNull();
    expect(drop([file()])).toBe(false);
    expect(screen.getByText("sintético.pdf")).toBeTruthy();
  });
  it("previene abrir archivos fuera del destino solo mientras PDF esté montado", () => {
    render(<UploadForm maxBytes={MAX} />);
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ["Files"], files: [file()] } })).toBe(false);
    expect(fireEvent.dragOver(document.body, { dataTransfer: { types: ["Files"] } })).toBe(false);
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ["text/plain"], files: [] } })).toBe(true);
    expect(screen.queryByText("sintético.pdf")).toBeNull(); expectNoActions();
    fireEvent.change(screen.getByLabelText("Formato del archivo"), { target: { value: "NPZ" } });
    expect(fireEvent.drop(document.body, { dataTransfer: { types: ["Files"], files: [file()] } })).toBe(true);
    expectNoActions();
  });
  it("reemplaza, elimina y permite volver a elegir el mismo archivo sin resultados viejos", async () => {
    pdfAction.mockResolvedValue({ ok: true, number: 6 });
    render(<UploadForm maxBytes={MAX} />); ecg(); pick([file("primero.pdf")]); send();
    await waitFor(() => expect(screen.getByText("Estudio 6 guardado.")).toBeTruthy());
    pick([file("segundo.pdf")]); expect(screen.queryByText("Estudio 6 guardado.")).toBeNull();
    const input = screen.getByLabelText("Archivo del electrocardiograma");
    const click = vi.spyOn(input, "click"); fireEvent.click(screen.getByRole("button", { name: "Reemplazar PDF" })); expect(click).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Quitar PDF" }));
    expect(screen.queryByText("segundo.pdf")).toBeNull(); expect(input).toHaveProperty("value", "");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Elegir PDF" }));
    expect(screen.getByText("PDF quitado. Elegí otro archivo para subir.")).toBeTruthy();
    pick([file("segundo.pdf")]); send(); await waitFor(() => expect(pdfAction).toHaveBeenCalledTimes(2));
    expect(pdfAction.mock.calls[1][1].get("file").name).toBe("segundo.pdf");
  });
  it("cancelar el selector conserva la elección actual; no acepta drop sin archivos", () => {
    render(<UploadForm maxBytes={MAX} />); pick([file()]); pick([]);
    expect(screen.getByText("sintético.pdf")).toBeTruthy(); drop([]);
    expect(screen.getByText("sintético.pdf")).toBeTruthy(); expectNoActions();
  });
  it("pending dura exactamente la promesa, impide cambiar el archivo y muestra error recuperable sin detalles", async () => {
    let reject: (error: Error) => void = () => { throw new Error("Promesa ausente"); };
    pdfAction.mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    render(<UploadForm maxBytes={MAX} />); ecg(); drop([file()]); send();
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviando estudio…" })).toHaveProperty("disabled", true));
    expect(screen.getByRole("status").textContent).toBe("Enviando el archivo para validar y guardar. Esto no ejecuta un análisis.");
    expect(screen.queryByRole("progressbar")).toBeNull(); expect(screen.queryByText(/\d+ %/)).toBeNull();
    expect(screen.getByRole("button", { name: "Reemplazar PDF" })).toHaveProperty("disabled", true);
    expect(screen.getByLabelText("Tipo de estudio")).toHaveProperty("disabled", true);
    const pendingForm = screen.getByRole("button", { name: "Enviando estudio…" }).closest("form");
    if (!pendingForm) throw new Error("Formulario ausente");
    fireEvent.submit(pendingForm); expect(pdfAction).toHaveBeenCalledTimes(1);
    expect(drop([file("otro.pdf")])).toBe(false); expect(screen.queryByText("otro.pdf")).toBeNull();
    await act(async () => { reject(new Error("synthetic-sensitive-detail")); });
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("No pudimos guardar el estudio. Probá de nuevo en unos minutos."));
    expect(screen.queryByText(/synthetic-sensitive-detail/)).toBeNull(); expect(screen.queryByRole("status")).toBeNull();
    expect(screen.getByRole("button", { name: "Subir estudio" })).toHaveProperty("disabled", false);
    expect(screen.getByText("sintético.pdf")).toBeTruthy(); expect(pdfAction).toHaveBeenCalledTimes(1);
    expect(npzAction).not.toHaveBeenCalled();
  });
  it("cambiar formato durante envío descarta archivo/resultado y no revive el éxito tardío", async () => {
    let resolve: (state: { ok: true; number: number }) => void = () => { throw new Error("Promesa ausente"); };
    pdfAction.mockImplementation(() => new Promise((done) => { resolve = done; }));
    render(<UploadForm maxBytes={MAX} />); ecg(); drop([file()]); send();
    await waitFor(() => expect(pdfAction).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByLabelText("Formato del archivo"), { target: { value: "NPZ" } });
    await act(async () => { resolve({ ok: true, number: 99 }); });
    expect(screen.queryByText("Estudio 99 guardado.")).toBeNull();
    fireEvent.change(screen.getByLabelText("Formato del archivo"), { target: { value: "PDF" } });
    expect(screen.getByLabelText("Tipo de estudio")).toHaveProperty("value", "");
    expect(screen.queryByText("sintético.pdf")).toBeNull(); expect(screen.queryByText("Estudio 99 guardado.")).toBeNull();
    ecg(); send(); await waitFor(() => expect(screen.getByRole("alert").textContent).toBe(MESSAGES.missing));
    expect(pdfAction).toHaveBeenCalledTimes(1); expect(npzAction).not.toHaveBeenCalled();
  });
});
