"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getStudiesModule } from "@/modules/studies/composition";
import {
  StudyForbiddenError,
  StudyInUseError,
  StudyNotFoundError,
} from "@/modules/studies/domain/study-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { STUDY_MESSAGES } from "../_lib/study-messages";

export type DeleteStudyState =
  | { ok: true; warning?: string }
  | { ok: false; code: string; message: string }
  | undefined;

function failure(code: string, message: string): DeleteStudyState {
  return { ok: false, code, message };
}

// Elimina un estudio. Sin lógica de negocio: valida el identificador, resuelve quién es la persona desde la
// sesión y delega en el caso de uso. La clave del archivo la recupera el caso de uso de la base, nunca del
// formulario.
export async function deleteStudyAction(
  previousState: DeleteStudyState,
  formData: FormData,
): Promise<DeleteStudyState> {
  // La acción se puede invocar con un POST directo: comprueba la sesión por su cuenta.
  const access = await requireClinicContextForAction();
  const actor = access.isAuthorized ? toStudyActor(access.context) : null;

  if (!actor) {
    return failure("FORBIDDEN", STUDY_MESSAGES.deleteForbidden);
  }

  const studyId = z.uuid().safeParse(formData.get("studyId"));

  if (!studyId.success) {
    return failure("NOT_FOUND", STUDY_MESSAGES.deleteNotFound);
  }

  try {
    const { fileLeftBehind } = await getStudiesModule().deleteStudy({ actor, studyId: studyId.data });

    revalidatePath("/studies");
    revalidatePath("/patients", "layout");

    return fileLeftBehind ? { ok: true, warning: STUDY_MESSAGES.fileLeftBehind } : { ok: true };
  } catch (error) {
    if (error instanceof StudyNotFoundError) {
      return failure("NOT_FOUND", STUDY_MESSAGES.deleteNotFound);
    }

    if (error instanceof StudyForbiddenError) {
      return failure("FORBIDDEN", STUDY_MESSAGES.deleteForbidden);
    }

    if (error instanceof StudyInUseError) {
      return failure("IN_USE", error.message);
    }

    console.error(`[estudios] error inesperado al eliminar: ${error instanceof Error ? error.name : "UnknownError"}`);

    return failure("UNAVAILABLE", STUDY_MESSAGES.deleteUnavailable);
  }
}
