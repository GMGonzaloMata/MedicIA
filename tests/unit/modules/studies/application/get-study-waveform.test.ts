import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createGetStudyWaveform } from "@/modules/studies/application/use-cases/get-study-waveform";
import { encodeStoredStudy } from "@/modules/studies/domain/stored-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import {
  StudyForbiddenError,
  StudyNotFoundError,
  StudyUnavailableError,
} from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import { syntheticTabular, syntheticWaveform } from "../../../../support/npz-builder";

const TENANT = "tenant-a";
const STUDY_ID = "study-1";
const STORAGE_KEY = `studies/${TENANT}/${STUDY_ID}.ecg1`;

const patient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p1", patientId: "patient-1" };
const otherPatient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p2", patientId: "patient-2" };
const otherTenantPatient: StudyActor = {
  kind: "PATIENT",
  tenantId: "tenant-b",
  userId: "user-p1",
  patientId: "patient-1",
};
const doctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m1", membershipId: "membership-1" };
const otherDoctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m2", membershipId: "membership-2" };

const patientSummary = {
  id: "patient-1",
  fullName: "Paciente Uno",
  documentType: "DNI" as const,
  documentNumber: "1",
  studyCount: 1,
};

async function setup(uploadedByUserId = "user-m1") {
  const studies = new InMemoryStudyRepository();
  studies.registerUploader("user-m1", { fullName: "Dra. Pérez", isPatient: false });
  studies.registerUploader("user-p1", { fullName: "Paciente Uno", isPatient: true });
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  directory.assign({ tenantId: TENANT, membershipId: "membership-1", patient: patientSummary });

  await storage.put(STORAGE_KEY, encodeStoredStudy({ waveform: syntheticWaveform(), tabular: syntheticTabular() }));
  await studies.insertWithNextNumber({
    id: STUDY_ID,
    tenantId: TENANT,
    patientId: "patient-1",
    uploadedByUserId,
    type: "ECG",
    storageKey: STORAGE_KEY,
  });

  const reads = vi.spyOn(storage, "get");

  return { studies, storage, directory, reads, getWaveform: createGetStudyWaveform({ studies, storage, directory }) };
}

describe("leer la onda de un estudio", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("el paciente dueño recibe las 12 derivaciones y no ve su nombre", async () => {
    const { getWaveform } = await setup("user-p1");

    const result = await getWaveform({ actor: patient, studyId: STUDY_ID });

    expect(result.status).toBe("READY");
    if (result.status !== "READY") {
      return;
    }
    expect(result.leads).toHaveLength(12);
    expect(result.leads.every((samples) => samples.length === 2500)).toBe(true);
    expect(result.study).toMatchObject({
      id: STUDY_ID,
      number: 1,
      uploadedBy: { kind: "PATIENT" },
      patientId: "patient-1",
      patientName: null,
    });
  });

  it("el médico con asignación vigente la ve con el nombre del paciente y de quién la cargó", async () => {
    const { getWaveform } = await setup("user-m1");

    const result = await getWaveform({ actor: doctor, studyId: STUDY_ID });

    expect(result.status).toBe("READY");
    expect(result.study).toMatchObject({
      uploadedBy: { kind: "DOCTOR", fullName: "Dra. Pérez" },
      patientName: "Paciente Uno",
    });
  });

  it("un paciente ajeno, un médico sin asignación y quien perdió la asignación reciben FORBIDDEN sin leer el archivo", async () => {
    const { directory, reads, getWaveform } = await setup();

    await expect(getWaveform({ actor: otherPatient, studyId: STUDY_ID })).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(getWaveform({ actor: otherDoctor, studyId: STUDY_ID })).rejects.toBeInstanceOf(StudyForbiddenError);

    directory.end({ tenantId: TENANT, membershipId: "membership-1", patientId: "patient-1" });
    await expect(getWaveform({ actor: doctor, studyId: STUDY_ID })).rejects.toBeInstanceOf(StudyForbiddenError);

    expect(reads).not.toHaveBeenCalled();
  });

  it("un estudio inexistente o de otra clínica da NOT_FOUND sin leer el archivo", async () => {
    const { reads, getWaveform } = await setup();

    await expect(getWaveform({ actor: patient, studyId: "no-existe" })).rejects.toBeInstanceOf(StudyNotFoundError);
    await expect(getWaveform({ actor: otherTenantPatient, studyId: STUDY_ID })).rejects.toBeInstanceOf(
      StudyNotFoundError,
    );

    expect(reads).not.toHaveBeenCalled();
  });

  it("un archivo ausente da UNAVAILABLE con los datos del estudio", async () => {
    const { storage, getWaveform } = await setup("user-p1");
    await storage.delete(STORAGE_KEY);

    const result = await getWaveform({ actor: patient, studyId: STUDY_ID });

    expect(result).toMatchObject({ status: "UNAVAILABLE", study: { id: STUDY_ID, number: 1 } });
    expect("leads" in result).toBe(false);
  });

  it("un archivo con formato inválido da UNAVAILABLE", async () => {
    const { storage, getWaveform } = await setup("user-p1");
    await storage.put(STORAGE_KEY, Uint8Array.from([1, 2, 3]));

    expect((await getWaveform({ actor: patient, studyId: STUDY_ID })).status).toBe("UNAVAILABLE");
  });

  it("una falla del almacenamiento lanza UNAVAILABLE y registra solo el nombre del error y la clave", async () => {
    const { reads, getWaveform } = await setup("user-p1");
    reads.mockRejectedValueOnce(Object.assign(new Error("detalle interno 123"), { name: "AccessDenied" }));

    await expect(getWaveform({ actor: patient, studyId: STUDY_ID })).rejects.toBeInstanceOf(StudyUnavailableError);

    expect(errors).toHaveBeenCalledTimes(1);
    const logged = String(errors.mock.calls[0]?.[0]);
    expect(logged).toContain("AccessDenied");
    expect(logged).toContain(STORAGE_KEY);
    expect(logged).not.toContain("detalle interno");
  });

  it("el resultado no incluye la clave del archivo, la clínica ni las variables", async () => {
    const { getWaveform } = await setup("user-p1");

    const result = await getWaveform({ actor: patient, studyId: STUDY_ID });
    const serialized = JSON.stringify(result.study);

    expect(serialized).not.toContain("studies/");
    expect(serialized).not.toContain(TENANT);
    expect(serialized).not.toContain("storageKey");
    expect(serialized).not.toContain("tabular");
    expect(Object.keys(result).sort()).toEqual(["leads", "status", "study"]);
  });
});
