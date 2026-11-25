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

export async function deactivateMemberAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const membershipId = readId(formData, "membershipId");

  if (membershipId === null) {
    return errorState(CLINIC_MESSAGES.notFound);
  }

  try {
    const result = await getTenantsModule().deactivateMember({ actor: authorization.actor, membershipId });

    if (result.ok) {
      revalidatePath("/clinic/staff");
      revalidatePath("/clinic/patients");

      return successState(CLINIC_MESSAGES.memberDeactivatedDone);
    }

    switch (result.code) {
      case "LAST_ADMIN":
        return errorState(CLINIC_MESSAGES.lastAdmin);
      case "ALREADY_DEACTIVATED":
        return errorState(CLINIC_MESSAGES.alreadyDeactivated);
      case "NOT_FOUND":
        return errorState(CLINIC_MESSAGES.notFound);
    }
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
