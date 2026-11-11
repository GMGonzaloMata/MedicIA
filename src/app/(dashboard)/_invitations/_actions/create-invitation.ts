"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { createInvitationSchema } from "@/modules/users/application/validation/invitation-form-schemas";
import { getUsersModule } from "@/modules/users/composition";
import { isInvitationForbiddenError } from "@/modules/users/domain/invitation-errors";

import { requireClinicContextForAction } from "../../../_lib/access";
import { toInvitationActor } from "../../../_lib/invitation-actor";
import { INVITATION_MESSAGES, createConflictMessage, sentMessage } from "../_lib/invitation-messages";

export interface InviteFormState {
  // `send-failed`: la invitación quedó guardada pero el correo no salió; la pantalla ofrece reintentar.
  status: "error" | "success" | "send-failed";
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: { kind?: string; email?: string; licenseNumber?: string; documentType?: string; documentNumber?: string };
}

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

// Genera la invitación y envía el correo. Se puede invocar con un POST directo: resuelve la sesión y el actor por su
// cuenta y nunca acepta una clínica del formulario; el `tenantId` sale de la sesión.
export async function createInvitation(
  previousState: InviteFormState | undefined,
  formData: FormData,
): Promise<InviteFormState> {
  const access = await requireClinicContextForAction();

  if (!access.isAuthorized) {
    if (access.reason === "anonymous") {
      redirect("/sign-in");
    }

    return { status: "error", message: INVITATION_MESSAGES.forbidden };
  }

  const actor = toInvitationActor(access.context);
  const values = {
    kind: readText(formData, "kind"),
    email: readText(formData, "email"),
    licenseNumber: readText(formData, "licenseNumber"),
    documentType: readText(formData, "documentType"),
    documentNumber: readText(formData, "documentNumber"),
  };

  if (!actor) {
    return { status: "error", message: INVITATION_MESSAGES.forbidden, values };
  }

  // Solo se pasan los campos del tipo elegido: el esquema rechaza los que sobran.
  const parsed = createInvitationSchema.safeParse(
    values.kind === "DOCTOR"
      ? { kind: values.kind, email: values.email, licenseNumber: values.licenseNumber }
      : { kind: values.kind, email: values.email, documentType: values.documentType, documentNumber: values.documentNumber },
  );

  if (!parsed.success) {
    return { status: "error", fieldErrors: z.flattenError(parsed.error).fieldErrors, values };
  }

  try {
    const result = await getUsersModule().createInvitation({
      actor,
      kind: parsed.data.kind,
      email: parsed.data.email,
      ...(parsed.data.kind === "DOCTOR"
        ? { licenseNumber: parsed.data.licenseNumber }
        : { documentType: parsed.data.documentType, documentNumber: parsed.data.documentNumber }),
    });

    revalidatePath("/invitations");

    if (result.status === "CONFLICT") {
      return { status: "error", message: createConflictMessage(result.reason), values };
    }

    if (result.status === "SEND_FAILED") {
      return { status: "send-failed", message: INVITATION_MESSAGES.sendFailed, values };
    }

    // La confirmación nombra el correo y nunca muestra el link (FR-035). El formulario queda vacío.
    return { status: "success", message: sentMessage(result.invitation.email) };
  } catch (error) {
    if (isInvitationForbiddenError(error)) {
      return { status: "error", message: INVITATION_MESSAGES.forbidden, values };
    }

    console.error(`[invitaciones] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

    return { status: "error", message: INVITATION_MESSAGES.unexpectedInvite, values };
  }
}
