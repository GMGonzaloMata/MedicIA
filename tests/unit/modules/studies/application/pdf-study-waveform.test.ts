// @vitest-environment node
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createGetStudyWaveform } from "@/modules/studies/application/use-cases/get-study-waveform";
import { encodePdfStudy } from "@/modules/studies/domain/pdf-study-format";
import { encodeStoredStudy } from "@/modules/studies/domain/stored-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import { syntheticTabular, syntheticWaveform } from "../../../../support/npz-builder";

const patient: StudyActor = { kind: "PATIENT", tenantId: "tenant-a", userId: "user-p1", patientId: "patient-1" };
const doctor: StudyActor = { kind: "DOCTOR", tenantId: "tenant-a", userId: "user-m1", membershipId: "membership-1" };
const assignment = { tenantId: "tenant-a", membershipId: "membership-1", patientId: "patient-1" };
const query = { tenantId: "tenant-a", patientId: "patient-1", page: 1, pageSize: 20 };
const original = Buffer.from("%PDF-synthetic-private-original");

async function setup(extension = "pdfecg1") {
  const studies = new InMemoryStudyRepository();
  studies.registerUploader("user-p1", { fullName: "Paciente sintético", isPatient: true });
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  directory.assign({ ...assignment, patient: { id: "patient-1", fullName: "Paciente sintético", documentType: "DNI", documentNumber: "1", studyCount: 1 } });
  const extraction = await createFakePdfExtraction().extract({ bytes: original, signal: new AbortController().signal });
  // Orden no canónico y valores no redondeados: el DTO debe conservar nombres, muestras y máscara.
  const leads = [...extraction.leads].reverse().map((lead) => ({
    ...lead,
    samples: lead.samples.map((_, i) => i === 1 ? 0.1 : i === 2 ? -123.25 : i === 4999 ? 456.5 : 0),
    observed: lead.observed.map((_, i) => i === 1 || i === 2 || i === 4 || i === 4999),
  }));
  const stored = encodePdfStudy({ format: "MEDPDF01", originalPdfBase64: original.toString("base64"), extraction: { ...extraction, leads }, derivatives: { version: 1 } });
  const key = `studies/tenant-a/study-1.${extension}`;
  await storage.put(key, stored);
  await studies.insertWithNextNumber({ id: "study-1", tenantId: "tenant-a", patientId: "patient-1", uploadedByUserId: "user-p1", type: "ECG", storageKey: key });
  const reads = vi.spyOn(storage, "get");
  const put = vi.spyOn(storage, "put");
  const remove = vi.spyOn(storage, "delete");
  const insert = vi.spyOn(studies, "insertWithNextNumber");
  const get = createGetStudyWaveform({ studies, storage, directory });
  const listBefore = await studies.listByPatient(query);
  const read = (actor: StudyActor = patient, studyId = "study-1") => get({ actor, studyId });
  return { studies, storage, directory, leads, stored, key, reads, put, remove, insert, listBefore, read };
}

async function expectUnchanged(w: Awaited<ReturnType<typeof setup>>) {
  expect(await w.studies.listByPatient(query)).toEqual(w.listBefore);
  expect(w.insert).not.toHaveBeenCalled();
  expect(w.put).not.toHaveBeenCalled();
  expect(w.remove).not.toHaveBeenCalled();
  // El contador se comprueba por su interfaz de asignación, no por almacenamiento interno.
  const next = await w.studies.insertWithNextNumber({ id: "next", tenantId: "tenant-a", patientId: "patient-1", uploadedByUserId: "user-p1", type: "ECG", storageKey: "next" });
  expect(next.number).toBe(2);
}

afterEach(() => vi.restoreAllMocks());

describe("onda PDF versionada sin preparación científica", () => {
  it("proyecta exactamente 12×5000 muestras crudas y máscaras a 500 Hz/uV sin original, medidas o procedencia libre", async () => {
    const w = await setup();
    const result = await w.read();
    expect(result).toEqual({ status: "PDF_READY", version: 2, format: "PDF", study: expect.objectContaining({ id: "study-1", number: 1, patientName: null }), samplingHz: 500, unit: "uV", leads: w.leads });
    expect(Object.keys(result).sort()).toEqual(["format", "leads", "samplingHz", "status", "study", "unit", "version"]);
    const serialized = JSON.stringify(result);
    for (const field of ["storageKey", "tenant-a", "originalPdfBase64", "measurements", "sourceReference", "extractorVersion", "derivatives", "documentNumber", "tabular"]) expect(serialized).not.toContain(field);
    expect(w.reads).toHaveBeenCalledExactlyOnceWith(w.key);
    expect(await w.storage.get(w.key)).toEqual(w.stored);
    await expectUnchanged(w);
  });

  it("conserva el encabezado autorizado para el médico sin extender los props de la onda", async () => {
    const w = await setup();
    expect(await w.read(doctor)).toMatchObject({ status: "PDF_READY", study: { patientName: "Paciente sintético", uploadedBy: { kind: "PATIENT" } } });
    await expectUnchanged(w);
  });

  it.each(["otro paciente", "otra clínica", "sin asignación", "asignación terminada", "inexistente"])("rechaza %s antes de storage y sin efectos", async (kind) => {
    const w = await setup();
    let actor: StudyActor = patient;
    let id = "study-1";
    if (kind === "otro paciente") actor = { ...patient, patientId: "patient-2" };
    if (kind === "otra clínica") actor = { ...patient, tenantId: "tenant-b" };
    if (kind === "sin asignación") actor = { ...doctor, membershipId: "membership-2" };
    if (kind === "asignación terminada") { actor = doctor; w.directory.end(assignment); }
    if (kind === "inexistente") id = "missing";
    const missing = kind === "otra clínica" || kind === "inexistente";
    await expect(w.read(actor, id)).rejects.toMatchObject({ name: missing ? "StudyNotFoundError" : "StudyForbiddenError", message: missing ? "No encontramos el estudio." : "No tenés acceso a este estudio." });
    expect(w.reads).not.toHaveBeenCalled();
    expect(await w.storage.get(w.key)).toEqual(w.stored);
    await expectUnchanged(w);
  });

  it.each(["ausente", "corrupto", "versión desconocida", "ecg1 bajo clave PDF", "máscara inválida"])("un PDF %s no activa el lector ni análisis legacy", async (kind) => {
    const w = await setup();
    if (kind === "ausente") w.reads.mockResolvedValueOnce(null);
    if (kind === "corrupto") w.reads.mockResolvedValueOnce(Uint8Array.of(1, 2, 3));
    if (kind === "versión desconocida") w.reads.mockResolvedValueOnce(new TextEncoder().encode(new TextDecoder().decode(w.stored).replace("MEDPDF01", "MEDPDF99")));
    if (kind === "ecg1 bajo clave PDF") w.reads.mockResolvedValueOnce(encodeStoredStudy({ waveform: syntheticWaveform(), tabular: syntheticTabular() }));
    if (kind === "máscara inválida") {
      const value: unknown = JSON.parse(new TextDecoder().decode(w.stored));
      // Solo se prepara una entrada externa inválida; la lectura pública debe rechazarla.
      if (typeof value === "object" && value !== null) w.reads.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({ ...value, extraction: {} })));
    }
    expect(await w.read()).toEqual({ status: "PDF_UNAVAILABLE", version: 2, format: "PDF", study: expect.objectContaining({ id: "study-1" }) });
    await expectUnchanged(w);
  });

  it("no intenta reconocer PDF por contenido bajo una clave legacy", async () => {
    const w = await setup("ecg1");
    expect(await w.read()).toEqual({ status: "UNAVAILABLE", study: expect.objectContaining({ id: "study-1" }) });
    await expectUnchanged(w);
  });

  it("traduce storage fallido a error genérico sin devolver datos PDF ni modificar estado", async () => {
    const w = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    w.reads.mockRejectedValueOnce(new Error("detalle privado"));
    await expect(w.read()).rejects.toMatchObject({ name: "StudyUnavailableError", message: "No pudimos completar la operación. Probá de nuevo en unos minutos." });
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("detalle privado");
    await expectUnchanged(w);
  });
});
