"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireClinicContextForAction } from "@/app/_lib/access";
import { toClinicUserActor } from "@/app/_lib/clinic-user-actor";
import { enrollMemberSchema } from "@/modules/users/application/validation/clinic-user-form-schemas";
import { getUsersModule } from "@/modules/users/composition";
import { canInvite } from "@/modules/users/domain/invitation-access";

import { USER_MESSAGES } from "../_lib/user-messages";

export interface EnrollFormState {
  status: "error" | "success" | "mail-failed";
  message?: string;
  fieldErrors?: Record<string, string[]>;
  values?: Record<string, string>;
  retryTarget?: { kind: "STAFF"; membershipId: string } | { kind: "PATIENT"; patientId: string };
}

const conflictMessages = {
  ALREADY_STAFF: USER_MESSAGES.alreadyStaff,
  ALREADY_PATIENT: USER_MESSAGES.alreadyPatient,
  MEMBERSHIP_DEACTIVATED: USER_MESSAGES.membershipDeactivated,
  ROLE_CHANGE_NOT_SUPPORTED: USER_MESSAGES.roleChangeNotSupported,
  DOCUMENT_IN_USE: USER_MESSAGES.documentInUse,
  LICENSE_IN_USE: USER_MESSAGES.licenseInUse,
};

function read(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value : "";
}

export async function enrollMember(previousState: EnrollFormState | undefined, formData: FormData): Promise<EnrollFormState> {
  void previousState;
  const access = await requireClinicContextForAction();
  if (!access.isAuthorized) {
    if (access.reason === "anonymous") redirect("/sign-in");
    return { status: "error", message: USER_MESSAGES.forbiddenAction };
  }
  const actor = toClinicUserActor(access.context);
  if (!actor) return { status: "error", message: USER_MESSAGES.forbiddenAction };

  const values = Object.fromEntries(
    ["kind", "email", "fullName", "documentType", "documentNumber", "licenseNumber", "specialty"]
      .map((key) => [key, read(formData, key)]),
  );
  if ((values.kind === "DOCTOR" || values.kind === "PATIENT") && !canInvite(actor, values.kind)) {
    return { status: "error", message: USER_MESSAGES.forbiddenAction };
  }
  const candidate = values.kind === "DOCTOR"
    ? { kind: values.kind, email: values.email, fullName: values.fullName,
        licenseNumber: values.licenseNumber, specialty: values.specialty }
    : { kind: values.kind, email: values.email, fullName: values.fullName,
        documentType: values.documentType, documentNumber: values.documentNumber };
  const parsed = enrollMemberSchema.safeParse(candidate);
  if (!parsed.success) return { status: "error", message: USER_MESSAGES.invalidInput,
    fieldErrors: z.flattenError(parsed.error).fieldErrors, values };

  try {
    const result = await getUsersModule().enrollMember({ actor, ...parsed.data });
    if (result.status === "FORBIDDEN") return { status: "error", message: USER_MESSAGES.forbiddenAction, values };
    if (result.status === "INVALID_INPUT") return { status: "error", message: USER_MESSAGES.invalidInput,
      fieldErrors: result.fieldErrors, values };
    if (result.status === "UNAVAILABLE") return { status: "error", message: USER_MESSAGES.unavailable, values };
    if (result.status === "CONFLICT") return { status: "error", message: conflictMessages[result.reason], values };
    if (result.status === "ALREADY_MEMBER") return { status: "success", message: USER_MESSAGES.alreadyMember };
    revalidatePath("/users");
    const message = `${USER_MESSAGES.enrolled}${result.assignedToDoctor ? " El paciente quedó asignado a vos." : ""}`;
    if (result.mail === "FAILED") return { status: "mail-failed",
      message: `${message} ${USER_MESSAGES.accessMailFailed}`,
      retryTarget: result.kind === "DOCTOR"
        ? { kind: "STAFF", membershipId: result.relationshipId }
        : { kind: "PATIENT", patientId: result.relationshipId },
    };
    return { status: "success", message };
  } catch (error) {
    console.error(`[usuarios] error inesperado al dar de alta (${error instanceof Error ? error.name : "UnknownError"})`);
    return { status: "error", message: USER_MESSAGES.unavailable, values };
  }
}
