"use server";

import { z } from "zod";

import { createIntegratedReportQuery } from "@/modules/analyses/composition";
import { isAnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { ANALYSIS_MESSAGES } from "../_lib/analysis-messages";
import type { IntegratedAnalysisState } from "./request-integrated-analysis";

export async function getIntegratedAnalysisAction(studyId: unknown, analysisId: unknown): Promise<IntegratedAnalysisState> {
  const access = await requireClinicContextForAction();
  const actor = access.isAuthorized ? toStudyActor(access.context) : null;
  const study = z.uuid().safeParse(studyId);
  const analysis = z.uuid().safeParse(analysisId);
  if (!actor || !study.success || !analysis.success) return { ok: false, code: "NOT_FOUND", message: ANALYSIS_MESSAGES.forbidden };

  try {
    const report = await createIntegratedReportQuery()({ actor, studyId: study.data, analysisId: analysis.data });
    return { ok: true, report };
  } catch (error) {
    if (isAnalysisNotFoundError(error)) return { ok: false, code: "NOT_FOUND", message: ANALYSIS_MESSAGES.forbidden };
    return { ok: false, code: "UNAVAILABLE", message: ANALYSIS_MESSAGES.notAvailable };
  }
}
