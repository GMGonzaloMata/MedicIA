import {
  ANALYSIS_MODEL_TIMEOUT_MS,
  ANALYSIS_STALE_AFTER_MS,
  toSummary,
  type AnalysisActor,
  type AnalysisFailureCode,
  type AnalysisSummary,
} from "../../domain/analysis";
import { AnalysisNotFoundError, ModelInferenceError } from "../../domain/analysis-errors";
import { parseProbabilities } from "../../domain/findings";
import type { AnalysisRepository } from "../ports/out/analysis-repository";
import type { ModelInference } from "../ports/out/model-inference";
import type { StudySource } from "../ports/out/study-source";

interface RequestAnalysisDependencies {
  analyses: AnalysisRepository;
  studySource: StudySource;
  modelInference: ModelInference;
  now: () => Date;
}

export interface RequestAnalysisResult {
  analysis: AnalysisSummary;
  // Ejecuta el análisis en segundo plano (la acción de servidor la entrega a `after()`). Nunca lanza. Es `null` si el
  // análisis ya quedó registrado como fallido y no hay nada que ejecutar.
  run: (() => Promise<void>) | null;
}

function failureCodeOf(error: unknown): AnalysisFailureCode {
  return error instanceof ModelInferenceError ? error.code : "INTERNAL";
}

// Pide un análisis de un estudio (specs/008-analisis-estudio-ecg/contracts/analysis-use-cases.md). El acceso se evalúa
// al pedir; la ejecución en segundo plano no lo reevalúa. En los registros solo van el identificador del análisis y
// el código de falla, nunca probabilidades ni valores del estudio.
export function createRequestAnalysis({ analyses, studySource, modelInference, now }: RequestAnalysisDependencies) {
  return async ({ actor, studyId }: { actor: AnalysisActor; studyId: string }): Promise<RequestAnalysisResult> => {
    const authorization = await studySource.authorize({ actor, studyId });

    if (authorization.status === "NO_ACCESS") {
      throw new AnalysisNotFoundError();
    }

    const requestedAt = now();

    await analyses.failStale({
      tenantId: actor.tenantId,
      studyId,
      olderThan: new Date(requestedAt.getTime() - ANALYSIS_STALE_AFTER_MS),
      finishedAt: requestedAt,
    });

    const input = await studySource.readModelInput({ actor, studyId });

    if (input.status === "NO_ACCESS") {
      throw new AnalysisNotFoundError();
    }

    if (input.status === "FILE_UNAVAILABLE") {
      const failed = await analyses.insertFailed({
        tenantId: actor.tenantId,
        studyId,
        requestedByUserId: actor.userId,
        failureCode: "STUDY_FILE_UNAVAILABLE",
        finishedAt: requestedAt,
      });

      return { analysis: toSummary(failed), run: null };
    }

    const pending = await analyses.insertPending({
      tenantId: actor.tenantId,
      studyId,
      requestedByUserId: actor.userId,
    });
    const scope = { tenantId: actor.tenantId, studyId, analysisId: pending.id };

    const run = async (): Promise<void> => {
      try {
        // Si venció o se eliminó el estudio mientras esperaba, no hay nada que hacer.
        if (!(await analyses.claim({ ...scope, startedAt: now() }))) {
          return;
        }

        const prediction = await modelInference.predict({
          waveform: input.waveform,
          tabular: input.tabular,
          signal: AbortSignal.timeout(ANALYSIS_MODEL_TIMEOUT_MS),
        });

        await analyses.complete({
          ...scope,
          modelName: prediction.modelName,
          modelVersion: prediction.modelVersion,
          probabilities: parseProbabilities(prediction.probabilities),
          finishedAt: now(),
        });
      } catch (error) {
        const failureCode = failureCodeOf(error);

        console.error(`[análisis] falló (${failureCode}) id=${pending.id}`);

        try {
          await analyses.fail({ ...scope, failureCode, finishedAt: now() });
        } catch {
          console.error(`[análisis] no se pudo registrar la falla id=${pending.id}`);
        }
      }
    };

    return { analysis: toSummary(pending), run };
  };
}
