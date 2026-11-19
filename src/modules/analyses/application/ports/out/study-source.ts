import type { AnalysisActor } from "../../../domain/analysis";
import type { RawEcgExtraction } from "./raw-ecg-inference";

export type StudyAuthorization = { status: "ALLOWED"; studyId: string; patientId: string } | { status: "NO_ACCESS" };

export type StudyModelInput =
  | { status: "READY"; waveform: Float32Array; tabular: Float32Array }
  | { status: "FILE_UNAVAILABLE" }
  | { status: "NO_ACCESS" };

// Puerto hacia el módulo de estudios. Lo implementa un adaptador al que la composición le entrega las funciones de
// `studies`; este módulo no importa nada de ese.
export interface StudySource {
  authorize(input: { actor: AnalysisActor; studyId: string }): Promise<StudyAuthorization>;
  readModelInput(input: { actor: AnalysisActor; studyId: string }): Promise<StudyModelInput>;
}

export type StudyExtraction =
  | { status: "READY"; extraction: RawEcgExtraction }
  | { status: "FILE_UNAVAILABLE" | "UNSUPPORTED_FORMAT" | "NO_ACCESS" };

// Extensión separada: los adaptadores/fakes legacy conservan exactamente sus obligaciones.
export interface IntegratedStudySource extends Pick<StudySource, "authorize"> {
  readExtraction(input: { actor: AnalysisActor; studyId: string }): Promise<StudyExtraction>;
}
