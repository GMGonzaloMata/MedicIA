import "server-only";

import { getStudiesModule } from "@/modules/studies/composition";

import type { StudyAuthorization, StudyModelInput } from "./application/ports/out/study-source";
import { createGetAnalysis } from "./application/use-cases/get-analysis";
import { createHasAnalysisInProgress } from "./application/use-cases/has-analysis-in-progress";
import { createListAnalyses } from "./application/use-cases/list-analyses";
import { createRequestAnalysis } from "./application/use-cases/request-analysis";
import { createModelInference } from "./infrastructure/adapters/create-model-inference";
import { createStudySource } from "./infrastructure/adapters/study-source";
import { prismaAnalysisRepository } from "./infrastructure/repositories/prisma-analysis-repository";

function buildAnalysesModule() {
  // Cada composición usa a la otra solo dentro de estas funciones, que se ejecutan después de armar los módulos,
  // nunca al evaluarlos (la regla de límites entre módulos solo permite conectarlos por `composition.ts`).
  const studySource = createStudySource({
    authorizeStudy: (input): Promise<StudyAuthorization> => getStudiesModule().authorizeStudy(input),
    readStudyModelInput: (input): Promise<StudyModelInput> => getStudiesModule().readStudyModelInput(input),
  });
  const modelInference = createModelInference(process.env);
  const now = () => new Date();

  return {
    requestAnalysis: createRequestAnalysis({
      analyses: prismaAnalysisRepository,
      studySource,
      modelInference,
      now,
    }),
    listAnalyses: createListAnalyses({
      analyses: prismaAnalysisRepository,
      studySource,
      now,
    }),
    getAnalysis: createGetAnalysis({
      analyses: prismaAnalysisRepository,
      studySource,
    }),
    hasAnalysisInProgress: createHasAnalysisInProgress({
      analyses: prismaAnalysisRepository,
      now,
    }),
  };
}

type AnalysesModule = ReturnType<typeof buildAnalysesModule>;

// Se arma la primera vez que se usa y se guarda en `globalThis`, como el módulo de estudios.
const globalForAnalyses = globalThis as unknown as {
  analysesModule?: AnalysesModule;
};

export function getAnalysesModule(): AnalysesModule {
  globalForAnalyses.analysesModule ??= buildAnalysesModule();

  return globalForAnalyses.analysesModule;
}
