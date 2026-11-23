"use server";

import { revalidatePath } from "next/cache";

import { getTenantsModule } from "@/modules/tenants/composition";

import { CLINIC_MESSAGES } from "../_lib/clinic-messages";
import {
  authorizeClinicAdmin,
  errorState,
  readId,
  unexpectedErrorState,
  type ClinicActionState,
} from "../_lib/action-support";

export async function regenerateLinkCodeAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const patientId = readId(formData, "patientId");

  if (patientId === null) {
    return errorState(CLINIC_MESSAGES.notFound);
  }

  try {
    const result = await getTenantsModule().regeneratePatientLinkCode({ actor: authorization.actor, patientId });

    if (result.ok) {
      revalidatePath("/clinic/patients");

      return { status: "success", message: CLINIC_MESSAGES.codeRegenerated, linkCode: result.linkCode };
    }

    return errorState(result.code === "ALREADY_LINKED" ? CLINIC_MESSAGES.alreadyLinked : CLINIC_MESSAGES.notFound);
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
