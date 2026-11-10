"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getStudiesModule } from "@/modules/studies/composition";
import { MAX_UPLOAD_BYTES } from "@/modules/studies/domain/ecg-study";
import {
  StudyForbiddenError,
  StudyNotFoundError,
  StudyRejectedError,
  describeRejection,
} from "@/modules/studies/domain/study-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import { STUDY_MESSAGES } from "../_lib/study-messages";

export type UploadStudyState =
  | { ok: true; number: number }
  | { ok: false; code: string; message: string }
  | undefined;

function failure(code: string, message: string): UploadStudyState {
  return { ok: false, code, message };
}

// Sube un estudio a nombre de un paciente. No tiene lógica de negocio: resuelve quién es la persona desde la
// sesión, lee los bytes (nunca el nombre del archivo) y delega en el caso de uso. `tenantId` y el usuario
// salen siempre del contexto de acceso; el único identificador que acepta del cliente es `patientId`, y solo
// de un médico.
export async function uploadStudyAction(
  previousState: UploadStudyState,
  formData: FormData,
): Promise<UploadStudyState> {
  // La acción se puede invocar con un POST directo: comprueba la sesión por su cuenta.
  const access = await requireClinicContextForAction();
  const actor = access.isAuthorized ? toStudyActor(access.context) : null;

  if (!actor) {
    return failure("FORBIDDEN", STUDY_MESSAGES.forbidden);
  }

  let patientId: string;

  if (actor.kind === "PATIENT") {
    patientId = actor.patientId;
  } else {
    const parsed = z.uuid().safeParse(formData.get("patientId"));

    if (!parsed.success) {
      return failure("FORBIDDEN", STUDY_MESSAGES.forbidden);
    }
    patientId = parsed.data;
  }

  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return failure("FILE_MISSING", describeRejection("FILE_MISSING"));
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return failure("FILE_TOO_LARGE", describeRejection("FILE_TOO_LARGE"));
  }

  const type = formData.get("type");

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { number } = await getStudiesModule().uploadStudy({
      actor,
      patientId,
      type: typeof type === "string" ? type : "",
      bytes,
    });

    revalidatePath("/studies");
    revalidatePath("/patients", "layout");

    return { ok: true, number };
  } catch (error) {
    if (error instanceof StudyRejectedError) {
      return failure(error.code, error.message);
    }

    if (error instanceof StudyForbiddenError) {
      return failure("FORBIDDEN", STUDY_MESSAGES.forbidden);
    }

    if (error instanceof StudyNotFoundError) {
      return failure("NOT_FOUND", error.message);
    }

    console.error(`[estudios] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

    return failure("UNAVAILABLE", STUDY_MESSAGES.uploadUnavailable);
  }
}
