"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { requireClinicContextForAction } from "@/app/_lib/access";
import { toClinicUserActor } from "@/app/_lib/clinic-user-actor";
import { resendTargetSchema } from "@/modules/users/application/validation/clinic-user-form-schemas";
import { getUsersModule } from "@/modules/users/composition";

import { USER_MESSAGES } from "../_lib/user-messages";

export interface ResendActionState { status: "success" | "error"; message: string }

export async function resendAccess(previousState: ResendActionState | undefined, formData: FormData): Promise<ResendActionState> {
  void previousState;
  const access = await requireClinicContextForAction();
  if (!access.isAuthorized) {
    if (access.reason === "anonymous") redirect("/sign-in");
    return { status: "error", message: USER_MESSAGES.forbiddenAction };
  }
  const actor = toClinicUserActor(access.context);
  if (!actor) return { status: "error", message: USER_MESSAGES.forbiddenAction };
  const candidate = formData.get("kind") === "STAFF"
    ? { kind: "STAFF", membershipId: formData.get("membershipId") }
    : { kind: formData.get("kind"), patientId: formData.get("patientId") };
  const parsed = resendTargetSchema.safeParse(candidate);
  if (!parsed.success) return { status: "error", message: USER_MESSAGES.invalidInput };
  if (!actor.isClinicAdmin && !(actor.isDoctor && parsed.data.kind === "PATIENT")) {
    return { status: "error", message: USER_MESSAGES.forbiddenAction };
  }

  try {
    const result = await getUsersModule().resendAccess({ actor, target: parsed.data });
    if (result.status === "SENT") {
      revalidatePath("/users");
      return { status: "success", message: USER_MESSAGES.accessSent };
    }
    const message = {
      FORBIDDEN: USER_MESSAGES.forbiddenAction,
      NOT_FOUND: USER_MESSAGES.notFound,
      NOT_ELIGIBLE: USER_MESSAGES.accessNotEligible,
      MAIL_FAILED: USER_MESSAGES.accessMailFailed,
    }[result.status];
    return { status: "error", message };
  } catch (error) {
    console.error(`[usuarios] error inesperado al reenviar acceso (${error instanceof Error ? error.name : "UnknownError"})`);
    return { status: "error", message: USER_MESSAGES.unavailable };
  }
}
