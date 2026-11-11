import { vi } from "vitest";

import type { ModelInference, ModelPrediction } from "@/modules/analyses/application/ports/out/model-inference";
import type { StudyModelInput, StudySource } from "@/modules/analyses/application/ports/out/study-source";
import type { AnalysisActor } from "@/modules/analyses/domain/analysis";
import { FINDING_KEYS, type Probabilities } from "@/modules/analyses/domain/findings";

import { syntheticTabular, syntheticWaveform } from "./npz-builder";

export const TENANT = "tenant-a";
export const STUDY_ID = "study-1";

export const patient: AnalysisActor = {
  kind: "PATIENT",
  tenantId: TENANT,
  userId: "user-p1",
  patientId: "patient-1",
};
export const doctor: AnalysisActor = {
  kind: "DOCTOR",
  tenantId: TENANT,
  userId: "user-m1",
  membershipId: "membership-1",
};
export const otherPatient: AnalysisActor = {
  kind: "PATIENT",
  tenantId: TENANT,
  userId: "user-p2",
  patientId: "patient-2",
};
export const otherDoctor: AnalysisActor = {
  kind: "DOCTOR",
  tenantId: TENANT,
  userId: "user-m2",
  membershipId: "membership-2",
};

// Probabilidades distintas y reconocibles: 0,05; 0,10; … ; 0,60.
export function sampleProbabilities(): Probabilities {
  return Object.fromEntries(FINDING_KEYS.map((key, index) => [key, (index + 1) / 20])) as Probabilities;
}

export function samplePrediction(): ModelPrediction {
  return {
    modelName: "modelo-de-prueba",
    modelVersion: "1.2.3",
    probabilities: sampleProbabilities(),
  };
}

// Estudio `study-1`: lo ven el paciente `user-p1` y el médico `user-m1`; cualquier otro actor no tiene acceso.
export function createStudySourceStub(input: StudyModelInput | null = null) {
  const modelInput: StudyModelInput = input ?? {
    status: "READY",
    waveform: syntheticWaveform(),
    tabular: syntheticTabular(),
  };
  const hasAccess = (actor: AnalysisActor, studyId: string) =>
    studyId === STUDY_ID && actor.tenantId === TENANT && (actor.userId === "user-p1" || actor.userId === "user-m1");

  const source = {
    authorize: vi.fn<StudySource["authorize"]>(async ({ actor, studyId }) =>
      hasAccess(actor, studyId) ? { status: "ALLOWED", studyId, patientId: "patient-1" } : { status: "NO_ACCESS" },
    ),
    readModelInput: vi.fn<StudySource["readModelInput"]>(async ({ actor, studyId }) =>
      hasAccess(actor, studyId) ? modelInput : { status: "NO_ACCESS" },
    ),
  };

  return source;
}

export function createModelStub(behavior: () => Promise<ModelPrediction> = async () => samplePrediction()) {
  return { predict: vi.fn<ModelInference["predict"]>(behavior) };
}
