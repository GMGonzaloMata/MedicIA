"use server";

import { revalidatePath } from "next/cache";

import { getTenantsModule } from "@/modules/tenants/composition";

import { CLINIC_MESSAGES } from "../_lib/clinic-messages";
import {
  authorizeClinicAdmin,
  errorState,
  readId,
  successState,
  unexpectedErrorState,
  type ClinicActionState,
} from "../_lib/action-support";

export async function endAssignmentAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const assignmentId = readId(formData, "assignmentId");

  if (assignmentId === null) {
    return errorState(CLINIC_MESSAGES.notFound);
  }

  try {
    const result = await getTenantsModule().endAssignment({ actor: authorization.actor, assignmentId });

    if (result.ok) {
      revalidatePath("/clinic/patients");

      return successState(CLINIC_MESSAGES.assignmentEnded);
    }

    return errorState(result.code === "ALREADY_ENDED" ? CLINIC_MESSAGES.alreadyEnded : CLINIC_MESSAGES.notFound);
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
