// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ActionAccess } from "@/app/_lib/access";
import { createUploadPdfStudy } from "@/modules/studies/application/use-cases/upload-pdf-study";
import { PdfExtractionError } from "@/modules/studies/application/ports/out/pdf-extraction";
import { MAX_PDF_BYTES, decodePdfStudy } from "@/modules/studies/domain/pdf-study-format";
import { StudyUnavailableError } from "@/modules/studies/domain/study-errors";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { InMemoryPatientDirectory } from "../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../support/in-memory/in-memory-study-repository";

const access = vi.hoisted(() => ({ requireClinicContextForAction: vi.fn() }));
const revalidatePath = vi.hoisted(() => vi.fn());
const composition = vi.hoisted(() => vi.fn());
vi.mock("@/app/_lib/access", () => access);
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/modules/studies/composition", () => ({ uploadConfiguredPdfStudy: composition }));
import { createPdfUploadAction } from "@/app/(dashboard)/_studies/_lib/pdf-upload-action";
import { uploadPdfStudyAction } from "@/app/(dashboard)/_studies/_actions/upload-pdf-study";

const PATIENT_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f";
const OTHER_ID = "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e60";
const FORBIDDEN = { ok: false, code: "FORBIDDEN", message: "No tenés acceso para cargar estudios a este paciente." };
const UNAVAILABLE = { ok: false, code: "PDF_EXTRACTION_UNAVAILABLE", message: "No pudimos leer el PDF. Probá de nuevo más tarde." };

function ready(kind: "PATIENT" | "DOCTOR" | "ADMIN" = "PATIENT", tenantId = "tenant-a"): ActionAccess {
  return { isAuthorized: true, context: { status: "ready",
    user: { id: "synthetic-user", email: "synthetic@example.test", fullName: "Persona sintética", isPlatformAdmin: false },
    clinic: { tenantId, tenantName: "Clínica sintética", relationship: kind === "PATIENT"
      ? { kind: "PATIENT", patientId: PATIENT_ID }
      : { kind: "STAFF", membershipId: "membership-1", isDoctor: kind === "DOCTOR", isClinicAdmin: kind === "ADMIN" } },
  } };
}
function form(fields: Record<string, string | File> = {}) {
  const data = new FormData();
  const file = new File(["%PDF-synthetic-only"], "dato-privado.pdf", { type: "application/pdf" });
  const read = vi.spyOn(file, "arrayBuffer");
  data.set("file", file); data.set("type", "ECG");
  Object.entries(fields).forEach(([key, value]) => data.set(key, value));
  return { data, read };
}
function world() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  const extract = vi.fn(createFakePdfExtraction().extract);
  const insert = vi.spyOn(studies, "insertWithNextNumber");
  const put = vi.spyOn(storage, "put");
  const upload = vi.fn(createUploadPdfStudy({ studies, storage, directory, extraction: { extract }, generateId: () => "synthetic-study" }));
  const action = createPdfUploadAction(upload);
  const list = () => studies.listByPatient({ tenantId: "tenant-a", patientId: PATIENT_ID, page: 1, pageSize: 20 });
  async function untouched() {
    expect(await list()).toEqual({ items: [], totalItems: 0 });
    expect(await storage.list("studies/")).toEqual([]);
    expect(extract).not.toHaveBeenCalled(); expect(put).not.toHaveBeenCalled(); expect(insert).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  }
  return { studies, storage, directory, extract, insert, put, upload, action, list, untouched };
}
beforeEach(() => {
  vi.resetAllMocks(); access.requireClinicContextForAction.mockResolvedValue(ready());
  composition.mockRejectedValue(new PdfExtractionError("PDF_EXTRACTION_UNAVAILABLE"));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Red prohibida"); }));
});

describe("acción PDF pública, servicios explícitamente sintéticos", () => {
  it("la acción concreta usa composición de servidor, nunca servicios aportados por cliente o estado previo", async () => {
    const { data, read } = form({ patientId: OTHER_ID, tenantId: "tenant-b", userId: "intruso", actor: "DOCTOR", extraction: "fake", upload: "synthetic", endpoint: "https://invalid.test", enabled: "true" });
    expect(await uploadPdfStudyAction({ ok: true, number: 99 }, data)).toEqual(UNAVAILABLE);
    expect(access.requireClinicContextForAction).toHaveBeenCalledTimes(1);
    expect(composition).toHaveBeenCalledExactlyOnceWith({
      actor: { kind: "PATIENT", patientId: PATIENT_ID, tenantId: "tenant-a", userId: "synthetic-user" },
      patientId: PATIENT_ID, type: "ECG", readBytes: expect.any(Function), signal: expect.any(AbortSignal),
    });
    expect(access.requireClinicContextForAction.mock.invocationCallOrder[0]).toBeLessThan(composition.mock.invocationCallOrder[0]);
    expect(read).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
  it("inyecta solo desde servidor y deriva identidad; conserva original/autor/número y refresca solo al guardar", async () => {
    const w = world(); const { data, read } = form({ patientId: OTHER_ID, tenantId: "tenant-b", userId: "intruso", actor: "DOCTOR" });
    expect(await w.action(undefined, data)).toEqual({ ok: true, number: 1 });
    expect(access.requireClinicContextForAction).toHaveBeenCalledTimes(1);
    expect(w.upload).toHaveBeenCalledTimes(1); expect(read).toHaveBeenCalledTimes(1); expect(w.extract).toHaveBeenCalledTimes(1);
    const input = w.upload.mock.calls[0]?.[0];
    expect(input).toMatchObject({ actor: { kind: "PATIENT", patientId: PATIENT_ID, tenantId: "tenant-a", userId: "synthetic-user" }, patientId: PATIENT_ID, type: "ECG", signal: expect.any(AbortSignal) });
    expect(Object.keys(input ?? {}).sort()).toEqual(["actor", "patientId", "readBytes", "signal", "type"]);
    expect((await w.list()).items).toMatchObject([{ number: 1, uploadedByUserId: "synthetic-user" }]);
    const stored = await w.storage.get("studies/tenant-a/synthetic-study.pdfecg1");
    expect(Buffer.from(decodePdfStudy(stored ?? new Uint8Array()).originalPdfBase64, "base64").toString()).toBe("%PDF-synthetic-only");
    expect(w.put).toHaveBeenCalledTimes(1); expect(w.insert).toHaveBeenCalledTimes(1);
    expect(revalidatePath.mock.calls).toEqual([["/studies"], ["/patients", "layout"]]);
    expect(fetch).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
  it.each(["anonymous", "no-clinic", "ADMIN"] as const)("rechaza %s sin leer ni cambiar datos", async (kind) => {
    const w = world(); const { data, read } = form();
    access.requireClinicContextForAction.mockResolvedValue(kind === "ADMIN" ? ready("ADMIN") : { isAuthorized: false, reason: kind });
    expect(await w.action(undefined, data)).toEqual(FORBIDDEN);
    expect(read).not.toHaveBeenCalled(); expect(w.upload).not.toHaveBeenCalled(); await w.untouched();
    expect(await uploadPdfStudyAction(undefined, data)).toEqual(FORBIDDEN);
    expect(composition).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled();
  });
  it.each([undefined, "no-uuid"])("médico sin paciente válido (%s) no invoca el caso de uso", async (id) => {
    const w = world(); access.requireClinicContextForAction.mockResolvedValue(ready("DOCTOR"));
    const { data, read } = form(id ? { patientId: id } : {});
    expect(await w.action(undefined, data)).toEqual(FORBIDDEN);
    expect(w.upload).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); await w.untouched();
  });
  it.each(["sin asignación", "otra clínica", "asignación terminada"])("médico %s: autoriza antes de bytes y no consume número", async (scenario) => {
    const w = world(); access.requireClinicContextForAction.mockResolvedValue(ready("DOCTOR"));
    const assignment = { tenantId: scenario === "otra clínica" ? "tenant-b" : "tenant-a", membershipId: "membership-1", patientId: PATIENT_ID };
    if (scenario !== "sin asignación") {
      w.directory.assign({ ...assignment, patient: { id: PATIENT_ID, fullName: null, documentType: "DNI", documentNumber: "synthetic", studyCount: 0 } });
      if (scenario === "asignación terminada") w.directory.end(assignment);
    }
    const { data, read } = form({ patientId: PATIENT_ID });
    expect(await w.action(undefined, data)).toEqual(FORBIDDEN);
    expect(w.upload).toHaveBeenCalledTimes(1); expect(read).not.toHaveBeenCalled(); await w.untouched();
    access.requireClinicContextForAction.mockResolvedValue(ready());
    expect(await w.action(undefined, form().data)).toEqual({ ok: true, number: 1 });
  });
  it("médico asignado usa paciente seleccionado, nunca datos del PDF", async () => {
    const w = world(); access.requireClinicContextForAction.mockResolvedValue(ready("DOCTOR"));
    w.directory.assign({ tenantId: "tenant-a", membershipId: "membership-1",
      patient: { id: PATIENT_ID, fullName: null, documentType: "DNI", documentNumber: "synthetic", studyCount: 0 } });
    expect(await w.action(undefined, form({ patientId: PATIENT_ID }).data)).toEqual({ ok: true, number: 1 });
    expect(w.upload.mock.calls[0]?.[0]).toMatchObject({ actor: { kind: "DOCTOR", tenantId: "tenant-a", membershipId: "membership-1" }, patientId: PATIENT_ID });
    expect(w.extract).toHaveBeenCalledTimes(1);
  });
  it.each(["ausente", "vacío", "texto", "grande"])("archivo %s: mensaje fijo antes de bytes y sin efectos", async (kind) => {
    const w = world(); const { data } = form();
    const file = new File([new Uint8Array(kind === "grande" ? MAX_PDF_BYTES + 1 : 0)], "privado.pdf");
    const read = vi.spyOn(file, "arrayBuffer");
    if (kind === "ausente") data.delete("file"); else data.set("file", kind === "texto" ? "privado.pdf" : file);
    expect(await w.action(undefined, data)).toEqual(kind === "grande"
      ? { ok: false, code: "FILE_TOO_LARGE", message: "El archivo supera el tamaño máximo de 2 MB." }
      : { ok: false, code: "FILE_MISSING", message: "Elegí un archivo para subir." });
    expect(w.upload).not.toHaveBeenCalled(); expect(read).not.toHaveBeenCalled(); await w.untouched();
  });
  it.each(["", "RX", "ausente", "archivo"])("exige ECG explícito (%s) antes de leer", async (type) => {
    const w = world(); const { data, read } = form({ type });
    if (type === "ausente") data.delete("type"); if (type === "archivo") data.set("type", new File(["ECG"], "x"));
    expect(await w.action(undefined, data)).toEqual({ ok: false, code: "TYPE_UNSUPPORTED", message: "Elegí un tipo de estudio disponible." });
    expect(read).not.toHaveBeenCalled(); await w.untouched();
  });
  it.each([1, MAX_PDF_BYTES])("acepta tamaño %i sin aumentar el límite", async (size) => {
    const upload = vi.fn(async () => ({ studyId: "synthetic", number: 4 }));
    expect(await createPdfUploadAction(upload)(undefined, form({ file: new File([new Uint8Array(size)], "arbitrario.bin") }).data)).toEqual({ ok: true, number: 4 });
    expect(upload).toHaveBeenCalledTimes(1); // El contenido real es responsabilidad del caso de uso/lector.
  });
  it.each([
    ["PDF_INVALID", "El archivo no es un PDF válido."], ["PDF_UNSUPPORTED", "Este PDF no es de un formato Mortara compatible."],
    ["PDF_PROTECTED", "El PDF está protegido y no se puede leer."], ["PDF_INCOMPLETE", "El PDF no contiene los datos necesarios para guardar el estudio."],
    ["PDF_EXTRACTION_UNAVAILABLE", "No pudimos leer el PDF. Probá de nuevo más tarde."],
  ] as const)("sanitiza %s y deja número/objetos intactos", async (code, message) => {
    const w = world(); w.extract.mockRejectedValueOnce(new PdfExtractionError(code));
    expect(await w.action(undefined, form().data)).toEqual({ ok: false, code, message });
    expect(w.extract).toHaveBeenCalledTimes(1); expect(w.put).not.toHaveBeenCalled(); expect(w.insert).not.toHaveBeenCalled();
    expect(await w.list()).toEqual({ items: [], totalItems: 0 }); expect(await w.storage.list("studies/")).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
    expect(await w.action(undefined, form().data)).toEqual({ ok: true, number: 1 });
  });
  it("traduce fallo de lectura a mensaje fijo sin revelar ni persistir", async () => {
    const w = world(); const { data, read } = form(); read.mockRejectedValueOnce(new Error("dato-privado"));
    expect(await w.action(undefined, data)).toEqual({ ok: false, code: "UNAVAILABLE", message: "No pudimos guardar el estudio. Probá de nuevo en unos minutos." });
    expect(read).toHaveBeenCalledTimes(1); await w.untouched();
    expect(await w.action(undefined, form().data)).toEqual({ ok: true, number: 1 });
  });
  it.each([new StudyUnavailableError(), new Error("dato-privado"), "dato-privado"])("fallo de servicio no expone detalles ni refresca", async (error) => {
    const upload = vi.fn().mockRejectedValueOnce(error);
    expect(await createPdfUploadAction(upload)(undefined, form().data)).toEqual({ ok: false, code: "UNAVAILABLE", message: "No pudimos guardar el estudio. Probá de nuevo en unos minutos." });
    expect(upload).toHaveBeenCalledTimes(1); expect(revalidatePath).not.toHaveBeenCalled(); expect(console.error).not.toHaveBeenCalled();
  });
});
