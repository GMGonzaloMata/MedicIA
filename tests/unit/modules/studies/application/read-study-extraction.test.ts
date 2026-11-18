// @vitest-environment node
import { Buffer } from "node:buffer";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createAuthorizeStudy } from "@/modules/studies/application/use-cases/authorize-study";
import { createReadStudyExtraction } from "@/modules/studies/application/use-cases/read-study-extraction";
import { encodePdfStudy } from "@/modules/studies/domain/pdf-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { createFakePdfExtraction } from "@/modules/studies/infrastructure/adapters/fake-pdf-extraction";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";

const patient = { kind: "PATIENT", tenantId: "tenant-a", userId: "user-a", patientId: "patient-a" } satisfies StudyActor;
const doctor = { kind: "DOCTOR", tenantId: "tenant-a", userId: "doctor-a", membershipId: "member-a" } satisfies StudyActor;
const query = { tenantId: patient.tenantId, patientId: patient.patientId, page: 1, pageSize: 20 };
async function setup(extension = "pdfecg1") {
  const studies = new InMemoryStudyRepository();
  const directory = new InMemoryPatientDirectory();
  directory.assign({ tenantId: patient.tenantId, membershipId: doctor.membershipId, patient: { id: patient.patientId, fullName: "Identidad privada", documentType: "DNI", documentNumber: "private-number", studyCount: 1 } });
  const storage = createInMemoryStudyFileStorage(new Map());
  const original = Buffer.from("%PDF-private-original-marker");
  const extraction = await createFakePdfExtraction().extract({ bytes: original, signal: new AbortController().signal });
  const bytes = encodePdfStudy({ format: "MEDPDF01", originalPdfBase64: original.toString("base64"), extraction, derivatives: { version: 1 } });
  const key = `studies/tenant-a/study-a.${extension}`;
  await storage.put(key, bytes);
  const record = { id: "study-a", tenantId: patient.tenantId, patientId: patient.patientId, uploadedByUserId: patient.userId, type: "ECG" as const, storageKey: key };
  await studies.insertWithNextNumber(record);
  const before = await studies.listByPatient(query);
  const get = vi.spyOn(storage, "get");
  const put = vi.spyOn(storage, "put");
  const remove = vi.spyOn(storage, "delete");
  const insert = vi.spyOn(studies, "insertWithNextNumber");
  const read = createReadStudyExtraction({ studies, storage, authorizeStudy: createAuthorizeStudy({ studies, directory }) });
  return { studies, directory, storage, get, put, remove, insert, before, extraction, bytes, key, record, read };
}
async function unchanged(w: Awaited<ReturnType<typeof setup>>) {
  expect(await w.studies.listByPatient(query)).toEqual(w.before);
  expect(w.put).not.toHaveBeenCalled();
  expect(w.remove).not.toHaveBeenCalled();
  expect(w.insert).not.toHaveBeenCalled();
  expect(await w.storage.get(w.key)).toEqual(w.bytes);
  expect((await w.studies.insertWithNextNumber({ ...w.record, id: "next" })).number).toBe(2);
}
afterEach(() => vi.restoreAllMocks());

describe("lectura autorizada de extracción PDF sin original ni preparación", () => {
  it.each([patient, doctor])("devuelve solo extracción cruda validada para $kind", async (actor) => {
    const w = await setup();
    const result = await w.read({ actor, studyId: "study-a" });
    expect(result).toEqual({ status: "READY", extraction: w.extraction });
    expect(w.get).toHaveBeenCalledExactlyOnceWith(w.key);
    for (const marker of ["private-original-marker", "originalPdfBase64", "storageKey", "patient-a", "Identidad privada", "private-number", "derivatives"]) expect(JSON.stringify(result)).not.toContain(marker);
    await unchanged(w);
  });
  it.each(["otro paciente", "otra clínica", "sin asignación", "asignación terminada", "inexistente"])("%s no toca storage ni modifica datos", async (scenario) => {
    const w = await setup();
    let actor: StudyActor = patient;
    let studyId = "study-a";
    if (scenario === "otro paciente") actor = { ...patient, patientId: "patient-b" };
    if (scenario === "otra clínica") actor = { ...patient, tenantId: "tenant-b" };
    if (scenario === "sin asignación") actor = { ...doctor, membershipId: "other" };
    if (scenario === "asignación terminada") { actor = doctor; w.directory.end({ tenantId: patient.tenantId, membershipId: doctor.membershipId, patientId: patient.patientId }); }
    if (scenario === "inexistente") studyId = "missing";
    expect(await w.read({ actor, studyId })).toEqual({ status: "NO_ACCESS" });
    expect(w.get).not.toHaveBeenCalled();
    await unchanged(w);
  });
  it("si desaparece entre autorización y lectura devuelve NO_ACCESS sin storage", async () => {
    const w = await setup();
    vi.spyOn(w.studies, "findById").mockResolvedValueOnce(await w.studies.findById({ tenantId: patient.tenantId, studyId: "study-a" })).mockResolvedValueOnce(null);
    expect(await w.read({ actor: patient, studyId: "study-a" })).toEqual({ status: "NO_ACCESS" });
    expect(w.get).not.toHaveBeenCalled();
    await unchanged(w);
  });
  it("rechaza ecg1 como señal cruda aun si sus bytes contienen un sobre PDF", async () => {
    const w = await setup("ecg1");
    expect(await w.read({ actor: patient, studyId: "study-a" })).toEqual({ status: "UNSUPPORTED_FORMAT" });
    expect(w.get).not.toHaveBeenCalled();
    await unchanged(w);
  });
  it.each(["ausente", "corrupto", "versión ajena", "extracción inválida"])("%s es FILE_UNAVAILABLE sin efectos", async (scenario) => {
    const w = await setup();
    if (scenario === "ausente") w.get.mockResolvedValueOnce(null);
    if (scenario === "corrupto") w.get.mockResolvedValueOnce(Uint8Array.of(1, 2, 3));
    if (scenario === "versión ajena") w.get.mockResolvedValueOnce(new TextEncoder().encode(new TextDecoder().decode(w.bytes).replace("MEDPDF01", "MEDPDF99")));
    if (scenario === "extracción inválida") w.get.mockResolvedValueOnce(new TextEncoder().encode(JSON.stringify({ format: "MEDPDF01", originalPdfBase64: "YQ==", extraction: {}, derivatives: { version: 1 } })));
    expect(await w.read({ actor: patient, studyId: "study-a" })).toEqual({ status: "FILE_UNAVAILABLE" });
    await unchanged(w);
  });
  it("sanea un fallo storage sin copiar ni registrar el detalle externo", async () => {
    const w = await setup();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    w.get.mockRejectedValueOnce(new Error("private-provider-detail"));
    await expect(w.read({ actor: patient, studyId: "study-a" })).rejects.toMatchObject({ name: "StudyUnavailableError", message: "No pudimos completar la operación. Probá de nuevo en unos minutos." });
    expect(log).not.toHaveBeenCalled();
    await unchanged(w);
  });
});
