import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createDeleteStudy } from "@/modules/studies/application/use-cases/delete-study";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import {
  StudyForbiddenError,
  StudyInUseError,
  StudyNotFoundError,
} from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";

const TENANT = "tenant-a";
const patient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p1", patientId: "patient-1" };
const otherPatient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p2", patientId: "patient-2" };
const doctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m1", membershipId: "membership-1" };
const otherDoctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m2", membershipId: "membership-2" };
const patientSummary = {
  id: "patient-1",
  fullName: "Uno",
  documentType: "DNI" as const,
  documentNumber: "1",
  studyCount: 0,
};

async function setup(canDeleteStudy?: (input: { tenantId: string; studyId: string }) => Promise<boolean>) {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();
  directory.assign({ tenantId: TENANT, membershipId: "membership-1", patient: patientSummary });
  directory.assign({ tenantId: TENANT, membershipId: "membership-2", patient: patientSummary });

  const upload = async (uploadedByUserId: string, id: string) => {
    const storageKey = `studies/${TENANT}/${id}.ecg1`;
    await storage.put(storageKey, Uint8Array.from([1]));

    return studies.insertWithNextNumber({
      id,
      tenantId: TENANT,
      patientId: "patient-1",
      uploadedByUserId,
      type: "ECG",
      storageKey,
    });
  };

  return {
    studies,
    storage,
    directory,
    upload,
    remove: createDeleteStudy({ studies, storage, directory, canDeleteStudy }),
  };
}

describe("eliminar un estudio", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("quien lo cargó elimina el registro y el archivo", async () => {
    const { studies, storage, upload, remove } = await setup();
    await upload("user-p1", "study-1");

    expect(await remove({ actor: patient, studyId: "study-1" })).toEqual({ fileLeftBehind: false });

    expect(studies.all()).toHaveLength(0);
    expect(storage.has(`studies/${TENANT}/study-1.ecg1`)).toBe(false);
  });

  it("el médico elimina un estudio que cargó mientras conserva la asignación", async () => {
    const { studies, upload, remove } = await setup();
    await upload("user-m1", "study-1");

    await remove({ actor: doctor, studyId: "study-1" });

    expect(studies.all()).toHaveLength(0);
  });

  it("otro paciente, otro médico y quien perdió la asignación reciben FORBIDDEN y no se borra nada", async () => {
    const { studies, storage, directory, upload, remove } = await setup();
    await upload("user-m1", "study-1");

    for (const actor of [patient, otherPatient, otherDoctor]) {
      await expect(remove({ actor, studyId: "study-1" })).rejects.toBeInstanceOf(StudyForbiddenError);
    }

    directory.end({ tenantId: TENANT, membershipId: "membership-1", patientId: "patient-1" });
    await expect(remove({ actor: doctor, studyId: "study-1" })).rejects.toBeInstanceOf(StudyForbiddenError);

    expect(studies.all()).toHaveLength(1);
    expect(storage.has(`studies/${TENANT}/study-1.ecg1`)).toBe(true);
  });

  it("un estudio inexistente o de otra clínica es NOT_FOUND", async () => {
    const { upload, remove } = await setup();
    await upload("user-p1", "study-1");

    await expect(remove({ actor: patient, studyId: "no-existe" })).rejects.toBeInstanceOf(StudyNotFoundError);
    await expect(remove({ actor: { ...patient, tenantId: "tenant-b" }, studyId: "study-1" })).rejects.toBeInstanceOf(
      StudyNotFoundError,
    );
  });

  it("si falla el borrado del archivo responde éxito con la advertencia y registra la clave opaca", async () => {
    const { studies, storage, upload, remove } = await setup();
    await upload("user-p1", "study-1");
    storage.failNextDelete = true;

    expect(await remove({ actor: patient, studyId: "study-1" })).toEqual({ fileLeftBehind: true });

    expect(studies.all()).toHaveLength(0);
    const logged = errors.mock.calls.map((call: unknown[]) => String(call[0])).join("\n");
    expect(logged).toContain(`studies/${TENANT}/study-1.ecg1`);
    expect(logged).not.toContain("falla simulada");
  });

  it("con un análisis en curso responde IN_USE y no borra nada", async () => {
    const { studies, storage, upload, remove } = await setup(async () => false);
    await upload("user-p1", "study-1");

    await expect(remove({ actor: patient, studyId: "study-1" })).rejects.toBeInstanceOf(StudyInUseError);

    expect(studies.all()).toHaveLength(1);
    expect(storage.has(`studies/${TENANT}/study-1.ecg1`)).toBe(true);
  });

  it("el número de un estudio eliminado no se reutiliza", async () => {
    const { upload, remove } = await setup();
    const first = await upload("user-p1", "study-1");
    await remove({ actor: patient, studyId: "study-1" });

    expect(first.number).toBe(1);
    expect((await upload("user-p1", "study-2")).number).toBe(2);
  });
});
