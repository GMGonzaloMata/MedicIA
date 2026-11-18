"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { requestConfiguredIntegratedAnalysis } from "@/modules/analyses/composition";
import { isAnalysisInProgressError, isAnalysisNotFoundError, ModelInferenceError } from "@/modules/analyses/domain/analysis-errors";
import type { UnifiedReportPublication } from "@/modules/analyses/domain/unified-report";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { ANALYSIS_FAILURE_MESSAGES, ANALYSIS_MESSAGES } from "../_lib/analysis-messages";

export type IntegratedAnalysisState =
  | { ok: true; report: UnifiedReportPublication }
  | { ok: false; code: string; message: string };

export async function requestIntegratedAnalysisAction(studyId: unknown): Promise<IntegratedAnalysisState> {
  const access = await requireClinicContextForAction();
  const actor = access.isAuthorized ? toStudyActor(access.context) : null;
  const parsed = z.uuid().safeParse(studyId);
  if (!actor || !parsed.success) return { ok: false, code: "NOT_FOUND", message: ANALYSIS_MESSAGES.forbidden };

  try {
    const { analysis, run } = await requestConfiguredIntegratedAnalysis({ actor, studyId: parsed.data, capability: "ECG_UNIFIED_V1" });
    // El caso de uso ya autorizó estudio y clínica. Nunca se ejecuta durante una consulta o un render.
    after(run);
    revalidatePath(`/studies/${parsed.data}`);
    return { ok: true, report: analysis };
  } catch (error) {
    if (isAnalysisNotFoundError(error)) return { ok: false, code: "NOT_FOUND", message: ANALYSIS_MESSAGES.forbidden };
    if (isAnalysisInProgressError(error)) return { ok: false, code: "IN_PROGRESS", message: "Ya hay un análisis en curso para este estudio." };
    if (error instanceof ModelInferenceError) return { ok: false, code: error.code, message: ANALYSIS_FAILURE_MESSAGES[error.code] };
    return { ok: false, code: "UNAVAILABLE", message: ANALYSIS_MESSAGES.requestUnavailable };
  }
}
