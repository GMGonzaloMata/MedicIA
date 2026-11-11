import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import { TABULAR_VALUES, buildNpz, syntheticTabular } from "../../../../support/npz-builder";

const actor: StudyActor = { kind: "PATIENT", tenantId: "tenant-a", userId: "user-p1", patientId: "patient-1" };

// Valores reconocibles que no deben aparecer en ningún registro.
const SECRET_VALUE = "987654.321";
const SECRET_FILE_NAME = "ecg-de-juan-perez.npz";

describe("los registros no llevan datos del estudio (SC-006)", () => {
  let errors: MockInstance<typeof console.error>;
  let logs: MockInstance<typeof console.log>;
  let warnings: MockInstance<typeof console.warn>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logs = vi.spyOn(console, "log").mockImplementation(() => undefined);
    warnings = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ninguna línea contiene valores, el nombre del archivo ni el mensaje original de un error externo", async () => {
    const studies = new InMemoryStudyRepository();
    const storage = createInMemoryStudyFileStorage(new Map());
    const failingReader = {
      read: vi.fn(() => {
        throw new Error(`zlib rechazó ${SECRET_FILE_NAME} con ${SECRET_VALUE}`);
      }),
    };
    let counter = 0;
    const dependencies = {
      studies,
      storage,
      directory: new InMemoryPatientDirectory(),
      generateId: () => `study-${(counter += 1)}`,
    };
    const upload = createUploadStudy({ ...dependencies, reader: createNpzStudyFileReader() });
    const valid = new Uint8Array(buildNpz());
    const outOfRange = syntheticTabular();
    outOfRange[1] = Number(SECRET_VALUE);

    // Cargas válidas e inválidas.
    await upload({ actor, patientId: "patient-1", type: "ECG", bytes: valid });
    await upload({
      actor,
      patientId: "patient-1",
      type: "ECG",
      bytes: new Uint8Array(buildNpz({ tabular: { shape: [TABULAR_VALUES], values: outOfRange } })),
    }).catch(() => undefined);
    await upload({ actor, patientId: "patient-1", type: "ECG", bytes: Uint8Array.from([1, 2, 3]) }).catch(
      () => undefined,
    );

    // Falla del almacenamiento y de la base, con y sin compensación.
    storage.failNextPut = true;
    await upload({ actor, patientId: "patient-1", type: "ECG", bytes: valid }).catch(() => undefined);
    studies.failNextInsert = true;
    await upload({ actor, patientId: "patient-1", type: "ECG", bytes: valid }).catch(() => undefined);
    studies.failNextInsert = true;
    storage.failNextDelete = true;
    await upload({ actor, patientId: "patient-1", type: "ECG", bytes: valid }).catch(() => undefined);

    // Un error inesperado del lector (por ejemplo, de zlib) con datos en su mensaje.
    await createUploadStudy({ ...dependencies, reader: failingReader })({
      actor,
      patientId: "patient-1",
      type: "ECG",
      bytes: valid,
    }).catch(() => undefined);

    const lines = [...errors.mock.calls, ...logs.mock.calls, ...warnings.mock.calls]
      .map((call: unknown[]) => call.map(String).join(" "))
      .join("\n");

    expect(lines).toContain("study-");
    expect(lines).not.toContain(SECRET_VALUE);
    expect(lines).not.toContain(SECRET_FILE_NAME);
    expect(lines).not.toContain("falla simulada");
    expect(lines).not.toContain("zlib rechazó");
  });
});
