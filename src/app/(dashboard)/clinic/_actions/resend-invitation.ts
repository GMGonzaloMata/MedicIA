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

export async function resendInvitationAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const invitationId = readId(formData, "invitationId");

  if (invitationId === null) {
    return errorState(CLINIC_MESSAGES.notFound);
  }

  try {
    const result = await getTenantsModule().resendInvitation({ actor: authorization.actor, invitationId });

    if (result.ok) {
      revalidatePath("/clinic/staff");

      return successState(CLINIC_MESSAGES.invitationSent);
    }

    if (result.code === "MAIL_UNAVAILABLE") {
      revalidatePath("/clinic/staff");

      return errorState(CLINIC_MESSAGES.mailUnavailable);
    }

    return errorState(CLINIC_MESSAGES.notFound);
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
