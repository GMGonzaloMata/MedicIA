// @vitest-environment node
import { Buffer } from "node:buffer";

import { getStudiesModule } from "@/modules/studies/composition";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createUploadPdfStudy } from "@/modules/studies/application/use-cases/upload-pdf-study";
import { PdfExtractionError } from "@/modules/studies/application/ports/out/pdf-extraction";
import { decodePdfStudy, MAX_PDF_BYTES } from "@/modules/studies/domain/pdf-study-format";
import { resolveStudyActor, type StudyActor } from "@/modules/studies/domain/study-access";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";

// Solo se simulan las fronteras de infraestructura: importar/componer no abre DB, red ni config.
vi.mock("@/modules/analyses/composition", () => ({ getAnalysesModule: vi.fn(() => { throw new Error("No se permite inferencia."); }) }));
vi.mock("@/modules/studies/infrastructure/repositories/prisma-study-repository", async () => {
  const { InMemoryStudyRepository } = await import("../../../../support/in-memory/in-memory-study-repository");
  return { prismaStudyRepository: new InMemoryStudyRepository() };
});
vi.mock("@/modules/studies/infrastructure/repositories/prisma-patient-directory", async () => {
  const { InMemoryPatientDirectory } = await import("../../../../support/in-memory/in-memory-patient-directory");
  return { prismaPatientDirectory: new InMemoryPatientDirectory() };
});
vi.mock("@/modules/studies/infrastructure/adapters/create-study-file-storage", async () => {
  const { createInMemoryStudyFileStorage } = await import("@/modules/studies/infrastructure/adapters/in-memory-study-file-storage");
  return { createStudyFileStorage: vi.fn(() => createInMemoryStudyFileStorage(new Map())) };
});

const patient: StudyActor = { kind: "PATIENT", tenantId: "tenant-a", userId: "user-p1", patientId: "patient-1" };
const doctor: StudyActor = { kind: "DOCTOR", tenantId: "tenant-a", userId: "user-m1", membershipId: "membership-1" };
const assignment = { tenantId: "tenant-a", membershipId: "membership-1", patientId: "patient-1" };
const summary = { id: "patient-1", fullName: null, documentType: "DNI" as const, documentNumber: "1", studyCount: 0 };
const pdfBytes = () => Buffer.concat([Buffer.from("%PDF-synthetic\n"), Buffer.from([0, 128, 255])]);
const forbidden = { name: "StudyForbiddenError", message: "No tenés acceso a este estudio." };
const unavailable = { name: "StudyUnavailableError", message: "No pudimos completar la operación. Probá de nuevo en unos minutos." };

function setup() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  const source = createFakePdfExtraction();
  const extract = vi.fn(source.extract);
  const generateId = vi.fn(() => `study-${generateId.mock.calls.length}`);
  const insert = vi.spyOn(studies, "insertWithNextNumber");
  const put = vi.spyOn(storage, "put");
  const remove = vi.spyOn(storage, "delete");
  const hasAssignment = vi.spyOn(directory, "hasActiveAssignment");
  const readBytes = vi.fn(async (): Promise<Uint8Array> => pdfBytes());
  const input = { actor: patient, patientId: "patient-1", type: "ECG", readBytes, signal: new AbortController().signal };
  const upload = createUploadPdfStudy({ studies, storage, directory, extraction: { extract }, generateId });
  const list = () => studies.listByPatient({ tenantId: "tenant-a", patientId: "patient-1", page: 1, pageSize: 20 });
  return { studies, storage, directory, extract, generateId, insert, put, remove, hasAssignment, readBytes, input, upload, list };
}

async function expectUntouched(world: ReturnType<typeof setup>) {
  expect(await world.list()).toEqual({ items: [], totalItems: 0 });
  expect(await world.storage.list("studies/")).toEqual([]);
  expect(world.put).not.toHaveBeenCalled();
  expect(world.insert).not.toHaveBeenCalled();
  expect(world.remove).not.toHaveBeenCalled();
  expect(world.generateId).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
  expect(console.log).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});
afterEach(() => vi.restoreAllMocks());

describe("carga PDF autorizada con servicios únicamente sintéticos", () => {
  it.each([
    ["Buffer", false], ["Buffer", true],
    ["Uint8Array", false], ["Uint8Array", true],
  ] as const)("aísla los bytes %s del extractor; rechazo=%s", async (kind, reject) => {
    const w = setup();
    const original = kind === "Buffer" ? pdfBytes() : Uint8Array.from(pdfBytes());
    const expected = Buffer.from(original);
    w.readBytes.mockResolvedValueOnce(original);
    w.extract.mockImplementationOnce(async ({ bytes, signal }) => {
      bytes.fill(0);
      if (reject) throw new PdfExtractionError("PDF_INVALID");
      return createFakePdfExtraction().extract({ bytes: expected, signal });
    });

    if (reject) {
      await expect(w.upload(w.input)).rejects.toMatchObject({
        name: "PdfExtractionError", code: "PDF_INVALID", message: "El archivo no es un PDF válido.",
      });
      await expectUntouched(w);
    } else {
      await expect(w.upload(w.input)).resolves.toEqual({ studyId: "study-1", number: 1 });
      const stored = await w.storage.get("studies/tenant-a/study-1.pdfecg1");
      expect(Buffer.from(decodePdfStudy(stored ?? new Uint8Array()).originalPdfBase64, "base64")).toEqual(expected);
    }
    expect(Buffer.from(original)).toEqual(expected);
    expect(w.extract).toHaveBeenCalledTimes(1);
    if (reject) expect(await w.upload(w.input)).toEqual({ studyId: "study-1", number: 1 });
  });
  it("la composición conserva NPZ y requiere inyectar un extractor PDF, sin fake por defecto", async () => {
    const module = getStudiesModule();
    expect(module.uploadStudy).toBeTypeOf("function");
    expect(module).not.toHaveProperty("uploadPdfStudy");
    const extract = vi.fn(createFakePdfExtraction().extract);
    const upload = module.createUploadPdfStudy({ extract });
    expect(extract).not.toHaveBeenCalled();
    expect(await upload({ actor: patient, patientId: "patient-1", type: "ECG", readBytes: async () => pdfBytes(), signal: new AbortController().signal }))
      .toEqual({ studyId: expect.any(String), number: 1 });
    expect(extract).toHaveBeenCalledTimes(1);
    expect(getStudiesModule()).toBe(module);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it("autoriza antes de leer bytes; conserva original, extracción y numeración sin exponer claves", async () => {
    const w = setup();
    w.directory.assign({ ...assignment, patient: summary });
    const original = pdfBytes();
    w.readBytes.mockImplementation(async () => {
      expect(w.hasAssignment).toHaveBeenCalledExactlyOnceWith(assignment);
      return original;
    });
    const result = await w.upload({ ...w.input, actor: doctor });
    expect(result).toEqual({ studyId: "study-1", number: 1 });
    expect(w.readBytes).toHaveBeenCalledTimes(1);
    expect(w.extract).toHaveBeenCalledExactlyOnceWith({ bytes: Uint8Array.from(original), signal: w.input.signal });
    expect(w.generateId).toHaveBeenCalledTimes(1);
    expect(w.put).toHaveBeenCalledTimes(1);
    expect(w.insert).toHaveBeenCalledExactlyOnceWith({ id: "study-1", tenantId: "tenant-a", patientId: "patient-1",
      uploadedByUserId: "user-m1", type: "ECG", storageKey: "studies/tenant-a/study-1.pdfecg1" });
    expect(w.put.mock.invocationCallOrder[0]).toBeLessThan(w.insert.mock.invocationCallOrder[0]);
    const stored = await w.storage.get("studies/tenant-a/study-1.pdfecg1");
    expect(stored).not.toBeNull();
    const envelope = decodePdfStudy(stored ?? new Uint8Array());
    expect(Buffer.from(envelope.originalPdfBase64, "base64")).toEqual(original);
    expect(envelope.extraction).toEqual(await w.extract.mock.results[0]?.value);
    expect(envelope.derivatives).toEqual({ version: 1 });
    expect(original).toEqual(pdfBytes());
    expect((await w.list()).items).toMatchObject([{ id: "study-1", number: 1, uploadedByUserId: "user-m1" }]);
    expect(await w.upload(w.input)).toEqual({ studyId: "study-2", number: 2 });
    expect(w.hasAssignment).toHaveBeenCalledTimes(1);
    expect(console.error).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
  });

  it.each(["otro paciente", "sin asignación", "otra clínica", "asignación terminada"])("rechaza %s antes de leer/extraer y no consume número", async (scenario) => {
    const w = setup();
    if (scenario === "otra clínica") w.directory.assign({ ...assignment, tenantId: "tenant-b", patient: summary });
    if (scenario === "asignación terminada") {
      w.directory.assign({ ...assignment, patient: summary });
      w.directory.end(assignment);
    }
    const actor = scenario === "otro paciente" ? { ...patient, patientId: "patient-2" } : doctor;
    await expect(w.upload({ ...w.input, actor })).rejects.toMatchObject(forbidden);
    expect(w.readBytes).not.toHaveBeenCalled();
    expect(w.extract).not.toHaveBeenCalled();
    if (actor.kind === "DOCTOR") expect(w.hasAssignment).toHaveBeenCalledExactlyOnceWith(assignment);
    await expectUntouched(w);
    expect(await w.upload(w.input)).toEqual({ studyId: "study-1", number: 1 });
  });

  it("no convierte un administrador no médico en actor", () => {
    expect(resolveStudyActor({ tenantId: "tenant-a", userId: "admin", relationship: {
      kind: "STAFF", membershipId: "admin-membership", isDoctor: false, isClinicAdmin: true,
    } })).toBeNull();
  });

  it("una nueva asignación devuelve el permiso sin otra política de acceso", async () => {
    const w = setup();
    w.directory.assign({ ...assignment, patient: summary });
    w.directory.end(assignment);
    await expect(w.upload({ ...w.input, actor: doctor })).rejects.toMatchObject(forbidden);
    w.directory.assign({ ...assignment, patient: summary });
    expect(await w.upload({ ...w.input, actor: doctor })).toEqual({ studyId: "study-1", number: 1 });
  });

  it("rechaza tipo ajeno sin leer bytes ni consultar asignación", async () => {
    const w = setup();
    await expect(w.upload({ ...w.input, actor: doctor, type: "RX" })).rejects.toMatchObject({
      name: "StudyRejectedError", code: "TYPE_UNSUPPORTED", message: "Elegí un tipo de estudio disponible.",
    });
    expect(w.readBytes).not.toHaveBeenCalled();
    expect(w.extract).not.toHaveBeenCalled();
    expect(w.hasAssignment).not.toHaveBeenCalled();
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it.each([
    [0, "FILE_MISSING", "Elegí un archivo para subir."],
    [MAX_PDF_BYTES + 1, "FILE_TOO_LARGE", "El archivo supera el tamaño máximo de 2 MB."],
  ] as const)("rechaza %i bytes antes del extractor", async (size, code, message) => {
    const w = setup();
    w.readBytes.mockResolvedValueOnce(new Uint8Array(size));
    await expect(w.upload(w.input)).rejects.toMatchObject({ name: "StudyRejectedError", code, message });
    expect(w.extract).not.toHaveBeenCalled();
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it("acepta el límite exacto del PDF sin cambiar sus bytes", async () => {
    const w = setup();
    const bytes = new Uint8Array(MAX_PDF_BYTES);
    bytes.set(Buffer.from("%PDF-"));
    w.readBytes.mockResolvedValueOnce(bytes);
    expect((await w.upload(w.input)).number).toBe(1);
    const stored = await w.storage.get("studies/tenant-a/study-1.pdfecg1");
    expect(Buffer.from(decodePdfStudy(stored ?? new Uint8Array()).originalPdfBase64, "base64")).toEqual(Buffer.from(bytes));
  });

  it.each([
    ["PDF_INVALID", "El archivo no es un PDF válido."],
    ["PDF_UNSUPPORTED", "Este PDF no es de un formato Mortara compatible."],
    ["PDF_PROTECTED", "El PDF está protegido y no se puede leer."],
    ["PDF_INCOMPLETE", "El PDF no contiene los datos necesarios para guardar el estudio."],
    ["PDF_EXTRACTION_UNAVAILABLE", "No pudimos leer el PDF. Probá de nuevo más tarde."],
  ] as const)("propaga solo el rechazo fijo %s sin persistir ni consumir número", async (code, message) => {
    const w = setup();
    w.extract.mockRejectedValueOnce(new PdfExtractionError(code));
    await expect(w.upload(w.input)).rejects.toMatchObject({ name: "PdfExtractionError", code, message });
    expect(w.readBytes).toHaveBeenCalledTimes(1);
    expect(w.extract).toHaveBeenCalledTimes(1);
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it("rechaza contenido no PDF por la frontera existente", async () => {
    const w = setup();
    w.readBytes.mockResolvedValueOnce(Uint8Array.of(1));
    await expect(w.upload(w.input)).rejects.toMatchObject({ code: "PDF_INVALID", message: "El archivo no es un PDF válido." });
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it("sanitiza errores al leer bytes sin persistir", async () => {
    const w = setup();
    w.readBytes.mockRejectedValueOnce(new Error("identificador privado"));
    await expect(w.upload(w.input)).rejects.toMatchObject(unavailable);
    expect(w.extract).not.toHaveBeenCalled();
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it("no codifica una extracción inválida ni expone errores arbitrarios del puerto", async () => {
    const w = setup();
    w.extract.mockImplementationOnce(async () => { throw new Error("identificador privado"); });
    await expect(w.upload(w.input)).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: "No pudimos leer el PDF. Probá de nuevo más tarde." });
    await expectUntouched(w);
    // Entrada deliberadamente no confiable: se viola el puerto para comprobar validación runtime.
    w.extract.mockResolvedValueOnce({} as Awaited<ReturnType<typeof w.extract>>);
    await expect(w.upload(w.input)).rejects.toMatchObject({ code: "PDF_EXTRACTION_UNAVAILABLE", message: "No pudimos leer el PDF. Probá de nuevo más tarde." });
    await expectUntouched(w);
    expect((await w.upload(w.input)).number).toBe(1);
  });

  it("si storage falla no inserta y el próximo estudio conserva número 1", async () => {
    const w = setup();
    w.storage.failNextPut = true;
    await expect(w.upload(w.input)).rejects.toMatchObject(unavailable);
    expect(await w.list()).toEqual({ items: [], totalItems: 0 });
    expect(await w.storage.list("studies/")).toEqual([]);
    expect(w.insert).not.toHaveBeenCalled();
    expect(w.remove).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledExactlyOnceWith("[estudios] no se guardó el archivo (Error) estudio=study-1");
    expect(await w.upload(w.input)).toEqual({ studyId: "study-2", number: 1 });
  });

  it.each([false, true])("compensa inserción fallida; limpieza pendiente=%s", async (cleanupFails) => {
    const w = setup();
    w.studies.failNextInsert = true;
    w.storage.failNextDelete = cleanupFails;
    await expect(w.upload(w.input)).rejects.toMatchObject(unavailable);
    expect(await w.list()).toEqual({ items: [], totalItems: 0 });
    expect(w.put).toHaveBeenCalledTimes(1);
    expect(w.insert).toHaveBeenCalledTimes(1);
    expect(w.remove).toHaveBeenCalledExactlyOnceWith("studies/tenant-a/study-1.pdfecg1");
    const objects = await w.storage.list("studies/");
    expect(objects.map(({ key }) => key)).toEqual(cleanupFails ? ["studies/tenant-a/study-1.pdfecg1"] : []);
    expect(await w.studies.findExistingStorageKeys(objects.map(({ key }) => key))).toEqual(new Set());
    expect(vi.mocked(console.error).mock.calls).toEqual([
      ["[estudios] no se registró el estudio (Error) estudio=study-1"],
      ...(cleanupFails ? [["[estudios] archivo huérfano pendiente de conciliar (Error) clave=studies/tenant-a/study-1.pdfecg1"]] : []),
    ]);
    expect(console.log).not.toHaveBeenCalled();
    expect(await w.upload(w.input)).toEqual({ studyId: "study-2", number: 1 });
  });
});
