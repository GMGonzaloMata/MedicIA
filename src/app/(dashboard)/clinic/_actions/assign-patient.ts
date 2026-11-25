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

export async function assignPatientAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const authorization = await authorizeClinicAdmin();

  if ("state" in authorization) {
    return authorization.state;
  }

  const patientId = readId(formData, "patientId");
  const membershipId = readId(formData, "membershipId");

  if (patientId === null || membershipId === null) {
    return errorState(CLINIC_MESSAGES.notFound);
  }

  try {
    const result = await getTenantsModule().assignPatient({ actor: authorization.actor, patientId, membershipId });

    if (result.ok) {
      revalidatePath("/clinic/patients");

      return successState(CLINIC_MESSAGES.patientAssigned);
    }

    switch (result.code) {
      case "NOT_A_DOCTOR":
        return errorState(CLINIC_MESSAGES.notADoctor);
      case "DOCTOR_DEACTIVATED":
        return errorState(CLINIC_MESSAGES.doctorDeactivated);
      case "ALREADY_ASSIGNED":
        return errorState(CLINIC_MESSAGES.alreadyAssigned);
      case "NOT_FOUND":
        return errorState(CLINIC_MESSAGES.notFound);
    }
  } catch (error) {
    return unexpectedErrorState(error);
  }
}
