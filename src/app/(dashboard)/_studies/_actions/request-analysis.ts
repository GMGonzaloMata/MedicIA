"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";

import { getAnalysesModule } from "@/modules/analyses/composition";
import { AnalysisInProgressError, AnalysisNotFoundError } from "@/modules/analyses/domain/analysis-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { ANALYSIS_MESSAGES } from "../_lib/analysis-messages";

export type RequestAnalysisState = { ok: true } | { ok: false; code: string; message: string } | undefined;

function failure(code: string, message: string): RequestAnalysisState {
  return { ok: false, code, message };
}

// Pide un análisis de un estudio. Sin lógica de negocio: valida el identificador, resuelve quién es la persona desde
// la sesión, delega en el caso de uso y entrega la ejecución del modelo a `after()`, que corre cuando ya se respondió.
export async function requestAnalysisAction(
  previousState: RequestAnalysisState,
  formData: FormData,
): Promise<RequestAnalysisState> {
  // La acción se puede invocar con un POST directo: comprueba la sesión por su cuenta.
  const access = await requireClinicContextForAction();
  const actor = access.isAuthorized ? toStudyActor(access.context) : null;

  if (!actor) {
    return failure("FORBIDDEN", ANALYSIS_MESSAGES.forbidden);
  }

  const studyId = z.uuid().safeParse(formData.get("studyId"));

  // Un identificador mal formado se ve igual que un estudio ajeno o inexistente.
  if (!studyId.success) {
    return failure("NOT_FOUND", ANALYSIS_MESSAGES.forbidden);
  }

  try {
    const { run } = await getAnalysesModule().requestAnalysis({ actor, studyId: studyId.data });

    if (run) {
      after(run);
    }

    revalidatePath(`/studies/${studyId.data}`);

    return { ok: true };
  } catch (error) {
    if (error instanceof AnalysisNotFoundError) {
      return failure("NOT_FOUND", ANALYSIS_MESSAGES.forbidden);
    }

    if (error instanceof AnalysisInProgressError) {
      return failure("IN_PROGRESS", error.message);
    }

    console.error(`[análisis] error inesperado al pedir: ${error instanceof Error ? error.name : "UnknownError"}`);

    return failure("UNAVAILABLE", ANALYSIS_MESSAGES.requestUnavailable);
  }
}
