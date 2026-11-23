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

export async function revokeInvitationAction(
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
    const result = await getTenantsModule().revokeInvitation({ actor: authorization.actor, invitationId });

    if (!result.ok) {
      return errorState(CLINIC_MESSAGES.notFound);
    }

    revalidatePath("/clinic/staff");

    return successState(CLINIC_MESSAGES.invitationRevoked);
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
