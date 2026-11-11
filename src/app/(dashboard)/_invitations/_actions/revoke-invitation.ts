"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { invitationIdSchema } from "@/modules/users/application/validation/invitation-form-schemas";
import { getUsersModule } from "@/modules/users/composition";
import { isInvitationForbiddenError, isInvitationNotFoundError } from "@/modules/users/domain/invitation-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toInvitationActor } from "../../../_lib/invitation-actor";
import { INVITATION_MESSAGES } from "../_lib/invitation-messages";

export type RevokeInvitationState = { ok: true } | { ok: false; message: string } | undefined;

// Revoca una invitación pendiente. Se puede invocar con un POST directo: resuelve la sesión y el actor por su cuenta, y
// nunca acepta una clínica del formulario; el `tenantId` sale de la sesión.
export async function revokeInvitation(
  previousState: RevokeInvitationState,
  formData: FormData,
): Promise<RevokeInvitationState> {
  const access = await requireClinicContextForAction();

  if (!access.isAuthorized) {
    if (access.reason === "anonymous") {
      redirect("/sign-in");
    }

    return { ok: false, message: INVITATION_MESSAGES.forbidden };
  }

  const actor = toInvitationActor(access.context);
  const invitationId = invitationIdSchema.safeParse(formData.get("invitationId"));

  if (!actor) {
    return { ok: false, message: INVITATION_MESSAGES.forbidden };
  }

  if (!invitationId.success) {
    return { ok: false, message: INVITATION_MESSAGES.revokeNotFound };
  }

  try {
    await getUsersModule().revokeInvitation({ actor, invitationId: invitationId.data });
  } catch (error) {
    if (isInvitationNotFoundError(error)) {
      // Ya no estaba pendiente: la lista se actualiza y la fila desaparece.
      revalidatePath("/invitations");

      return { ok: false, message: INVITATION_MESSAGES.revokeNotFound };
    }

    if (isInvitationForbiddenError(error)) {
      return { ok: false, message: INVITATION_MESSAGES.forbidden };
    }

    console.error(`[invitaciones] error inesperado al revocar: ${error instanceof Error ? error.name : "UnknownError"}`);

    return { ok: false, message: INVITATION_MESSAGES.unexpectedRevoke };
  }

  revalidatePath("/invitations");

  return { ok: true };
}
