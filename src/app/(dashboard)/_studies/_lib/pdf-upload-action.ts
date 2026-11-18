import "server-only";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { PdfExtractionError } from "@/modules/studies/application/ports/out/pdf-extraction";
import type { UploadPdfStudyInput } from "@/modules/studies/application/use-cases/upload-pdf-study";
import { MAX_PDF_BYTES } from "@/modules/studies/domain/pdf-study-format";
import { StudyForbiddenError, StudyRejectedError, describeRejection } from "@/modules/studies/domain/study-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toStudyActor } from "../../../_lib/study-actor";
import type { UploadStudyState } from "../_actions/upload-study";
import { STUDY_MESSAGES } from "./study-messages";

type UploadPdfStudy = (input: UploadPdfStudyInput) => Promise<{ studyId: string; number: number }>;

// La dependencia queda capturada solo en servidor, nunca en argumentos de la Server Action.
// null es una capacidad no habilitada: no lee bytes, construye infraestructura ni selecciona un fake.
export function createPdfUploadAction(upload: UploadPdfStudy | null) {
  return async (_previous: UploadStudyState, formData: FormData): Promise<UploadStudyState> => {
    const access = await requireClinicContextForAction();
    const actor = access.isAuthorized ? toStudyActor(access.context) : null;
    if (!actor) return { ok: false, code: "FORBIDDEN", message: STUDY_MESSAGES.forbidden };

    const patient = actor.kind === "PATIENT" ? actor.patientId : formData.get("patientId");
    const parsedPatient = z.uuid().safeParse(patient);
    if (!parsedPatient.success) return { ok: false, code: "FORBIDDEN", message: STUDY_MESSAGES.forbidden };

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, code: "FILE_MISSING", message: describeRejection("FILE_MISSING") };
    }
    if (file.size > MAX_PDF_BYTES) {
      return { ok: false, code: "FILE_TOO_LARGE", message: describeRejection("FILE_TOO_LARGE") };
    }
    if (formData.get("type") !== "ECG") {
      return { ok: false, code: "TYPE_UNSUPPORTED", message: describeRejection("TYPE_UNSUPPORTED") };
    }
    if (!upload) {
      const error = new PdfExtractionError("PDF_EXTRACTION_UNAVAILABLE");
      return { ok: false, code: error.code, message: error.message };
    }

    try {
      const { number } = await upload({
        actor,
        patientId: parsedPatient.data,
        type: "ECG",
        readBytes: async () => new Uint8Array(await file.arrayBuffer()),
        signal: AbortSignal.timeout(20_000),
      });
      revalidatePath("/studies");
      revalidatePath("/patients", "layout");
      return { ok: true, number };
    } catch (error) {
      if (error instanceof PdfExtractionError) {
        const fixed = new PdfExtractionError(error.code);
        return { ok: false, code: fixed.code, message: fixed.message };
      }
      if (error instanceof StudyRejectedError) return { ok: false, code: error.code, message: error.message };
      if (error instanceof StudyForbiddenError) return { ok: false, code: "FORBIDDEN", message: STUDY_MESSAGES.forbidden };
      // No se registra ni serializa el error arbitrario del lector/servicio.
      return { ok: false, code: "UNAVAILABLE", message: STUDY_MESSAGES.uploadUnavailable };
    }
  };
}
