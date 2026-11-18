"use server";

import { redirect } from "next/navigation";

import { uploadConfiguredPdfStudy } from "@/modules/studies/composition";

import type { UploadStudyState } from "./upload-study";
import { createPdfUploadAction } from "../_lib/pdf-upload-action";

export async function uploadPdfStudyAction(previous: UploadStudyState, formData: FormData): Promise<UploadStudyState> {
  let studyId: string | undefined;
  // El helper autentica/valida antes de entrar en composición; el caso de uso autoriza antes de leer bytes.
  const result = await createPdfUploadAction(async (input) => {
    const saved = await uploadConfiguredPdfStudy(input);
    studyId = saved.studyId;
    return saved;
  })(previous, formData);

  // redirect lanza control de flujo de Next: queda fuera del catch del helper, solo tras éxito persistido.
  if (result?.ok && studyId) redirect(`/studies/${studyId}`);
  return result;
}
