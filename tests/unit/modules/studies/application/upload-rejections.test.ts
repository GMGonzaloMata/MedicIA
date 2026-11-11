import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import { STORED_STUDY_BYTES } from "@/modules/studies/domain/stored-study-format";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyRejectedError } from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";
import {
  TABULAR_VALUES,
  WAVEFORM_SHAPE,
  WAVEFORM_VALUES,
  buildNpy,
  buildNpz,
  buildZip,
  syntheticTabular,
  syntheticWaveform,
} from "../../../../support/npz-builder";

const actor: StudyActor = { kind: "PATIENT", tenantId: "tenant-a", userId: "user-p1", patientId: "patient-1" };

function setup() {
  const studies = new InMemoryStudyRepository();
  const storage = createInMemoryStudyFileStorage(new Map());
  let counter = 0;
  const upload = createUploadStudy({
    studies,
    storage,
    reader: createNpzStudyFileReader(),
    directory: new InMemoryPatientDirectory(),
    generateId: () => `study-${(counter += 1)}`,
  });

  return { studies, storage, upload };
}

const send = (upload: ReturnType<typeof setup>["upload"], bytes: Uint8Array) =>
  upload({ actor, patientId: "patient-1", type: "ECG", bytes });

function tabularWith(index: number, value: number): Float32Array {
  const values = syntheticTabular();
  values[index] = value;

  return values;
}

const nanWaveform = () => {
  const values = syntheticWaveform();
  values[10] = Number.NaN;

  return values;
};

// Los defectos de `quickstart.md` §1, armados con el constructor de pruebas.
const DEFECTS: { name: string; bytes: () => Uint8Array; code: string }[] = [
  {
    name: "sin-tabular",
    bytes: () =>
      buildZip([
        { name: "waveform.npy", data: buildNpy({ shape: WAVEFORM_SHAPE, values: syntheticWaveform() }), method: 0 },
      ]),
    code: "FIELD_MISSING",
  },
  {
    name: "forma-incorrecta",
    bytes: () => buildNpz({ waveform: { shape: [1, 2500, 11], values: new Float32Array(2500 * 11) } }),
    code: "FIELD_SHAPE",
  },
  {
    name: "con-nan",
    bytes: () => buildNpz({ waveform: { shape: WAVEFORM_SHAPE, values: nanWaveform() } }),
    code: "VALUE_NOT_FINITE",
  },
  {
    name: "sexo-2",
    bytes: () => buildNpz({ tabular: { shape: [TABULAR_VALUES], values: tabularWith(0, 2) } }),
    code: "SEX_INVALID",
  },
  {
    name: "sin-estandarizar",
    bytes: () => buildNpz({ tabular: { shape: [TABULAR_VALUES], values: tabularWith(1, 450) } }),
    code: "VALUE_OUT_OF_RANGE",
  },
  {
    name: "con-objetos",
    bytes: () => buildNpz({ tabular: buildNpy({ descr: "|O", shape: [TABULAR_VALUES] }) }),
    code: "FIELD_TYPE",
  },
  { name: "no es un npz", bytes: () => Uint8Array.from([1, 2, 3, 4]), code: "NOT_NPZ" },
  { name: "grande", bytes: () => new Uint8Array(2 * 1024 * 1024 + 1), code: "FILE_TOO_LARGE" },
];

describe("rechazos de archivos inválidos", () => {
  let errors: MockInstance<typeof console.error>;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    errors.mockRestore();
  });

  it.each(DEFECTS)("$name se rechaza con $code sin dejar rastro y sin consumir número", async ({ bytes, code }) => {
    const { studies, storage, upload } = setup();

    await expect(send(upload, bytes())).rejects.toMatchObject({ name: "StudyRejectedError", code });
    expect(await storage.list("studies/")).toHaveLength(0);
    expect(studies.all()).toHaveLength(0);

    const next = await send(upload, new Uint8Array(buildNpz()));
    expect(next.number).toBe(1);
  });

  it("un rechazo es un StudyRejectedError con mensaje, sin valores del archivo", async () => {
    const { upload } = setup();
    const error = await send(upload, new Uint8Array(buildNpz({ tabular: { shape: [TABULAR_VALUES], values: tabularWith(1, 450) } }))).catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(StudyRejectedError);
    expect((error as Error).message).not.toContain("450");
  });

  it("con campos extra se acepta y el objeto guardado mide siempre lo mismo", async () => {
    const { storage, upload } = setup();
    const extra = buildNpy({ shape: [WAVEFORM_VALUES], values: syntheticWaveform() });
    const bytes = new Uint8Array(buildNpz({ extraEntries: [{ name: "extra.npy", data: extra, method: 0 }] }));

    const { studyId } = await send(upload, bytes);

    expect(storage.read(`studies/tenant-a/${studyId}.ecg1`)?.byteLength).toBe(STORED_STUDY_BYTES);
  });
});
