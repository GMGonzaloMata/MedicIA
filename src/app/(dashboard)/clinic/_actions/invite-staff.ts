"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getTenantsModule } from "@/modules/tenants/composition";

import { CLINIC_MESSAGES } from "../_lib/clinic-messages";
import {
  authorizeClinicAdmin,
  errorState,
  readText,
  successState,
  unexpectedErrorState,
  type ClinicActionState,
} from "../_lib/action-support";

const inviteSchema = z.object({
  email: z.string().trim().min(1).max(254),
  specialty: z.string().trim().max(100),
  licenseNumber: z.string().trim().max(40),
});

export async function inviteStaffAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const parsed = inviteSchema.safeParse({
    email: readText(formData, "email"),
    specialty: readText(formData, "specialty"),
    licenseNumber: readText(formData, "licenseNumber"),
  });

  if (!parsed.success) {
    return errorState(CLINIC_MESSAGES.invalidInput);
  }

  const roles = {
    isClinicAdmin: formData.get("isClinicAdmin") === "on",
    isDoctor: formData.get("isDoctor") === "on",
  };

  try {
    const result = await getTenantsModule().inviteStaff({
      actor: authorization.actor,
      email: parsed.data.email,
      roles,
      doctor: roles.isDoctor
        ? { specialty: parsed.data.specialty, licenseNumber: parsed.data.licenseNumber }
        : null,
    });

    if (result.ok) {
      revalidatePath("/clinic/staff");

      return successState(CLINIC_MESSAGES.invitationSent);
    }

    switch (result.code) {
      case "ALREADY_MEMBER":
        return errorState(CLINIC_MESSAGES.alreadyMember);
      case "MEMBER_DEACTIVATED":
        return errorState(CLINIC_MESSAGES.memberDeactivated);
      case "LICENSE_IN_USE":
        return errorState(CLINIC_MESSAGES.licenseInUse);
      case "MAIL_UNAVAILABLE":
        // La invitación quedó creada: se ve en la lista para reenviarla.
        revalidatePath("/clinic/staff");

        return errorState(CLINIC_MESSAGES.mailUnavailable);
      case "NOT_FOUND":
        return errorState(CLINIC_MESSAGES.forbidden);
      case "INVALID_INPUT":
        return errorState(CLINIC_MESSAGES.invalidInput);
    }
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
