import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import { STORED_STUDY_BYTES } from "@/modules/studies/domain/stored-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import {
  StudyForbiddenError,
  StudyRejectedError,
  StudyUnavailableError,
} from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import { buildNpz } from "../../../../support/npz-builder";

const TENANT = "tenant-a";
const patient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p1", patientId: "patient-1" };
const doctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m1", membershipId: "membership-1" };

function setup() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  let counter = 0;
  const upload = createUploadStudy({
    studies,
    storage,
    reader: createNpzStudyFileReader(),
    directory,
    generateId: () => `study-${(counter += 1)}`,
  });

  return { studies, storage, directory, upload };
}

const validBytes = () => new Uint8Array(buildNpz());

describe("subir un estudio", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("guarda el objeto en el formato propio y registra el estudio con el siguiente número", async () => {
    const { studies, storage, upload } = setup();

    const first = await upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() });
    const second = await upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() });

    expect(first).toEqual({ studyId: "study-1", number: 1 });
    expect(second.number).toBe(2);
    expect(storage.read(`studies/${TENANT}/study-1.ecg1`)?.byteLength).toBe(STORED_STUDY_BYTES);
    expect(studies.all()[0]).toMatchObject({
      tenantId: TENANT,
      patientId: "patient-1",
      uploadedByUserId: "user-p1",
      storageKey: `studies/${TENANT}/study-1.ecg1`,
    });
  });

  it("el paciente solo sube a su propio paciente", async () => {
    const { studies, storage, upload } = setup();

    await expect(
      upload({ actor: patient, patientId: "patient-2", type: "ECG", bytes: validBytes() }),
    ).rejects.toBeInstanceOf(StudyForbiddenError);

    expect(studies.all()).toHaveLength(0);
    expect(await storage.list("studies/")).toHaveLength(0);
  });

  it("el médico sube a un paciente asignado y el estudio queda a nombre del paciente", async () => {
    const { studies, directory, upload } = setup();
    directory.assign({
      tenantId: TENANT,
      membershipId: "membership-1",
      patient: { id: "patient-1", fullName: "Paciente Uno", documentType: "DNI", documentNumber: "1", studyCount: 0 },
    });

    await upload({ actor: doctor, patientId: "patient-1", type: "ECG", bytes: validBytes() });

    expect(studies.all()[0]).toMatchObject({ patientId: "patient-1", uploadedByUserId: "user-m1" });
  });

  it("el médico sin asignación vigente no sube nada", async () => {
    const { studies, storage, upload } = setup();

    await expect(
      upload({ actor: doctor, patientId: "patient-1", type: "ECG", bytes: validBytes() }),
    ).rejects.toBeInstanceOf(StudyForbiddenError);

    expect(studies.all()).toHaveLength(0);
    expect(await storage.list("studies/")).toHaveLength(0);
  });

  it("rechaza un archivo inválido sin guardar ni consumir un número", async () => {
    const { studies, storage, upload } = setup();

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: Uint8Array.from([1, 2, 3]) }),
    ).rejects.toBeInstanceOf(StudyRejectedError);
    expect(await storage.list("studies/")).toHaveLength(0);
    expect(studies.all()).toHaveLength(0);

    const next = await upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() });
    expect(next.number).toBe(1);
  });

  it("rechaza el contenido fuera de las reglas del dominio", async () => {
    const { storage, upload } = setup();
    const outOfRange = new Uint8Array(buildNpz({ tabular: { shape: [7], values: Float32Array.from([2, 0, 0, 0, 0, 0, 0]) } }));

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: outOfRange }),
    ).rejects.toMatchObject({ code: "SEX_INVALID" });
    expect(await storage.list("studies/")).toHaveLength(0);
  });

  it("rechaza un tipo de estudio no admitido", async () => {
    const { upload } = setup();

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "RX", bytes: validBytes() }),
    ).rejects.toMatchObject({ code: "TYPE_UNSUPPORTED" });
  });

  it("si falla el almacenamiento no queda estudio", async () => {
    const { studies, storage, upload } = setup();
    storage.failNextPut = true;

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() }),
    ).rejects.toBeInstanceOf(StudyUnavailableError);

    expect(studies.all()).toHaveLength(0);
  });

  it("si falla la base tras guardar el objeto, lo borra como compensación", async () => {
    const { studies, storage, upload } = setup();
    studies.failNextInsert = true;

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() }),
    ).rejects.toBeInstanceOf(StudyUnavailableError);

    expect(await storage.list("studies/")).toHaveLength(0);
  });

  it("si falla la base y la compensación, registra solo la clave opaca y responde que no está disponible", async () => {
    const { studies, storage, upload } = setup();
    studies.failNextInsert = true;
    storage.failNextDelete = true;

    await expect(
      upload({ actor: patient, patientId: "patient-1", type: "ECG", bytes: validBytes() }),
    ).rejects.toBeInstanceOf(StudyUnavailableError);

    const logged = errors.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
    expect(logged).toContain(`studies/${TENANT}/study-1.ecg1`);
    expect(logged).not.toMatch(/falla simulada/);
    expect(await storage.list("studies/")).toHaveLength(1);
  });
});
