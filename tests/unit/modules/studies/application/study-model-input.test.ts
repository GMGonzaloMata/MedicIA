import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createAuthorizeStudy } from "@/modules/studies/application/use-cases/authorize-study";
import { createReadStudyModelInput } from "@/modules/studies/application/use-cases/read-study-model-input";
import { encodeStoredStudy } from "@/modules/studies/domain/stored-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyUnavailableError } from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import { syntheticTabular, syntheticWaveform } from "../../../../support/npz-builder";

const TENANT = "tenant-a";
const STUDY_ID = "study-1";
const STORAGE_KEY = `studies/${TENANT}/${STUDY_ID}.ecg1`;

const patient: StudyActor = {
  kind: "PATIENT",
  tenantId: TENANT,
  userId: "user-p1",
  patientId: "patient-1",
};
const otherPatient: StudyActor = {
  kind: "PATIENT",
  tenantId: TENANT,
  userId: "user-p2",
  patientId: "patient-2",
};
const otherTenantPatient: StudyActor = { ...patient, tenantId: "tenant-b" };
const doctor: StudyActor = {
  kind: "DOCTOR",
  tenantId: TENANT,
  userId: "user-m1",
  membershipId: "membership-1",
};
const otherDoctor: StudyActor = {
  kind: "DOCTOR",
  tenantId: TENANT,
  userId: "user-m2",
  membershipId: "membership-2",
};

async function setup() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  const directory = new InMemoryPatientDirectory();

  directory.assign({
    tenantId: TENANT,
    membershipId: "membership-1",
    patient: {
      id: "patient-1",
      fullName: "Paciente Uno",
      documentType: "DNI",
      documentNumber: "1",
      studyCount: 1,
    },
  });
  await storage.put(
    STORAGE_KEY,
    encodeStoredStudy({
      waveform: syntheticWaveform(),
      tabular: syntheticTabular(),
    }),
  );
  await studies.insertWithNextNumber({
    id: STUDY_ID,
    tenantId: TENANT,
    patientId: "patient-1",
    uploadedByUserId: "user-p1",
    type: "ECG",
    storageKey: STORAGE_KEY,
  });

  const reads = vi.spyOn(storage, "get");
  const authorizeStudy = createAuthorizeStudy({ studies, directory });

  return {
    storage,
    directory,
    reads,
    authorizeStudy,
    readInput: createReadStudyModelInput({ studies, storage, authorizeStudy }),
  };
}

describe("autorizar un estudio", () => {
  it("permite al paciente dueño y al médico con asignación vigente", async () => {
    const { authorizeStudy } = await setup();

    await expect(authorizeStudy({ actor: patient, studyId: STUDY_ID })).resolves.toEqual({
      status: "ALLOWED",
      studyId: STUDY_ID,
      patientId: "patient-1",
    });
    await expect(authorizeStudy({ actor: doctor, studyId: STUDY_ID })).resolves.toMatchObject({ status: "ALLOWED" });
  });

  it("devuelve NO_ACCESS, sin lanzar, para ajenos, sin asignación, asignación terminada, otra clínica e inexistente", async () => {
    const { authorizeStudy, directory } = await setup();

    for (const [actor, studyId] of [
      [otherPatient, STUDY_ID],
      [otherDoctor, STUDY_ID],
      [otherTenantPatient, STUDY_ID],
      [patient, "no-existe"],
    ] as const) {
      await expect(authorizeStudy({ actor, studyId })).resolves.toEqual({
        status: "NO_ACCESS",
      });
    }

    directory.end({
      tenantId: TENANT,
      membershipId: "membership-1",
      patientId: "patient-1",
    });
    await expect(authorizeStudy({ actor: doctor, studyId: STUDY_ID })).resolves.toEqual({ status: "NO_ACCESS" });
  });
});

describe("leer la entrada del modelo", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it("devuelve la onda y las siete variables al paciente dueño y al médico con asignación", async () => {
    const { readInput } = await setup();

    for (const actor of [patient, doctor]) {
      const result = await readInput({ actor, studyId: STUDY_ID });

      expect(result.status).toBe("READY");
      if (result.status === "READY") {
        expect(result.waveform).toHaveLength(30_000);
        expect(result.tabular).toHaveLength(7);
      }
    }
  });

  it("sin acceso devuelve NO_ACCESS sin leer el archivo", async () => {
    const { readInput, reads } = await setup();

    for (const [actor, studyId] of [
      [otherPatient, STUDY_ID],
      [otherDoctor, STUDY_ID],
      [otherTenantPatient, STUDY_ID],
      [patient, "no-existe"],
    ] as const) {
      await expect(readInput({ actor, studyId })).resolves.toEqual({
        status: "NO_ACCESS",
      });
    }

    expect(reads).not.toHaveBeenCalled();
  });

  it("un archivo ausente o dañado devuelve FILE_UNAVAILABLE", async () => {
    const { readInput, storage } = await setup();

    await storage.put(STORAGE_KEY, Uint8Array.from([1, 2, 3]));
    await expect(readInput({ actor: patient, studyId: STUDY_ID })).resolves.toEqual({ status: "FILE_UNAVAILABLE" });

    await storage.delete(STORAGE_KEY);
    await expect(readInput({ actor: patient, studyId: STUDY_ID })).resolves.toEqual({ status: "FILE_UNAVAILABLE" });
  });

  it("una falla del almacenamiento lanza StudyUnavailableError y registra solo el nombre del error y la clave", async () => {
    const { readInput, reads } = await setup();

    reads.mockRejectedValueOnce(Object.assign(new Error("detalle interno 123"), { name: "AccessDenied" }));

    await expect(readInput({ actor: patient, studyId: STUDY_ID })).rejects.toBeInstanceOf(StudyUnavailableError);

    const logged = String(errors.mock.calls[0]?.[0]);

    expect(logged).toContain("AccessDenied");
    expect(logged).toContain(STORAGE_KEY);
    expect(logged).not.toContain("detalle interno");
  });

  it("relanza un error inesperado al decodificar", async () => {
    const { readInput, reads } = await setup();

    reads.mockResolvedValueOnce({
      get byteLength(): number {
        throw new TypeError("inesperado");
      },
    } as unknown as Uint8Array);

    await expect(readInput({ actor: patient, studyId: STUDY_ID })).rejects.toBeInstanceOf(TypeError);
  });
});
