import type { StudyAuthorization, StudyModelInput, StudySource } from "../../application/ports/out/study-source";
import type { AnalysisActor } from "../../domain/analysis";

interface StudySourceFunctions {
  authorizeStudy: (input: { actor: AnalysisActor; studyId: string }) => Promise<StudyAuthorization>;
  readStudyModelInput: (input: { actor: AnalysisActor; studyId: string }) => Promise<StudyModelInput>;
}

// Implementa el puerto con las funciones del módulo de estudios que entrega la composición. Este archivo no
// importa nada de `studies`: la regla de límites de `eslint.config.mjs` lo prohíbe.
export function createStudySource({ authorizeStudy, readStudyModelInput }: StudySourceFunctions): StudySource {
  return {
    authorize: (input) => authorizeStudy(input),
    readModelInput: (input) => readStudyModelInput(input),
  };
}
