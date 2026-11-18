import "server-only";

import { randomUUID } from "node:crypto";

import { getStudiesModule } from "@/modules/studies/composition";

import type { IntegratedStudySource, StudyAuthorization, StudyModelInput } from "./application/ports/out/study-source";
import type { RawEcgInference } from "./application/ports/out/raw-ecg-inference";
import { createRequestIntegratedAnalysis } from "./application/use-cases/request-integrated-analysis";
import { ModelInferenceError } from "./domain/analysis-errors";
import { createGetAnalysis } from "./application/use-cases/get-analysis";
import { createGetIntegratedAnalysis } from "./application/use-cases/get-integrated-analysis";
import { createHasAnalysisInProgress } from "./application/use-cases/has-analysis-in-progress";
import { createListAnalyses } from "./application/use-cases/list-analyses";
import { createRequestAnalysis } from "./application/use-cases/request-analysis";
import { createModelInference } from "./infrastructure/adapters/create-model-inference";
import { createStudySource } from "./infrastructure/adapters/study-source";
import { prismaAnalysisRepository } from "./infrastructure/repositories/prisma-analysis-repository";

// Conexión explícita y perezosa: construir el puerto no activa storage, extractor ni modelos.
export function createPdfAnalysisStudySource(): IntegratedStudySource {
  return {
    authorize: (input) => getStudiesModule().authorizeStudy(input),
    readExtraction: (input) => getStudiesModule().readStudyExtraction(input),
  };
}

// No se añade al singleton legacy ni a una Server Action. Exige capacidades/preparación y fuente explícitas.
export function createIntegratedAnalysesModule({ studySource, rawEcgInference }: {
  studySource: IntegratedStudySource;
  rawEcgInference: RawEcgInference;
}): { requestIntegratedAnalysis: ReturnType<typeof createRequestIntegratedAnalysis> } {
  return {
    requestIntegratedAnalysis: createRequestIntegratedAnalysis({
      analyses: prismaAnalysisRepository, studySource, rawEcgInference, now: () => new Date(), generateId: randomUUID,
    }),
  };
}

type RequestIntegratedAnalysis = ReturnType<typeof createRequestIntegratedAnalysis>;

// Configuración diferida al pedido autorizado, independiente del singleton/modelo legacy y de las consultas.
export async function requestConfiguredIntegratedAnalysis(input: Parameters<RequestIntegratedAnalysis>[0]): ReturnType<RequestIntegratedAnalysis> {
  const { createRawEcgInference } = await import("./infrastructure/adapters/create-raw-ecg-inference");
  const rawEcgInference = createRawEcgInference();
  if (!rawEcgInference) throw new ModelInferenceError("MODEL_UNAVAILABLE");
  return createIntegratedAnalysesModule({ studySource: createPdfAnalysisStudySource(), rawEcgInference }).requestIntegratedAnalysis(input);
}

// La consulta sigue disponible aunque el servicio de inferencia esté apagado o deje de estar configurado.
export function createIntegratedReportQuery(): ReturnType<typeof createGetIntegratedAnalysis> {
  return createGetIntegratedAnalysis({
    analyses: prismaAnalysisRepository,
    studySource: createPdfAnalysisStudySource(),
    now: () => new Date(),
  });
}

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
