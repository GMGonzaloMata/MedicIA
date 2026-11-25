"use server";

import { revalidatePath } from "next/cache";

import { getTenantsModule } from "@/modules/tenants/composition";

import { CLINIC_MESSAGES } from "../_lib/clinic-messages";
import {
  authorizeClinicAdmin,
  errorState,
  readText,
  unexpectedErrorState,
  type ClinicActionState,
} from "../_lib/action-support";

export async function registerPatientAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  try {
    const result = await getTenantsModule().registerPatient({
      actor: authorization.actor,
      documentType: readText(formData, "documentType"),
      documentNumber: readText(formData, "documentNumber"),
    });

    if (result.ok) {
      revalidatePath("/clinic/patients");

      return { status: "success", message: CLINIC_MESSAGES.patientRegistered, linkCode: result.linkCode };
    }

    switch (result.code) {
      case "DUPLICATE_PATIENT":
        return errorState(CLINIC_MESSAGES.duplicatePatient);
      case "NOT_FOUND":
        return errorState(CLINIC_MESSAGES.forbidden);
      case "INVALID_INPUT":
        return errorState(CLINIC_MESSAGES.invalidInput);
    }
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
