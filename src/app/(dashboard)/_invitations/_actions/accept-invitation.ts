"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { acceptInvitationSchema } from "@/modules/users/application/validation/invitation-form-schemas";
import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../../_lib/access";
import { clearInvitationCookie, readInvitationToken } from "../../../_lib/invitation-cookie";
import { readSessionToken } from "../../../_lib/session-cookie";
import {
  INVITATION_MESSAGES,
  acceptConflictMessage,
  alreadyMemberMessage,
  attemptsLeftMessage,
} from "../_lib/invitation-messages";

export interface AcceptFormState {
  // `finished`: el link ya no sirve (se consumió, se invalidó o no era válido). La pantalla oculta el formulario.
  // `already-member`: no hay nada que completar.
  status: "error" | "finished" | "already-member";
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
}

// Solo los campos que el formulario mandó: los del tipo de invitación que se está aceptando.
function readOptionalText(formData: FormData, name: string): string | undefined {
  const value = formData.get(name);

  return typeof value === "string" ? value : undefined;
}

function readProof(formData: FormData) {
  return Object.fromEntries(
    Object.entries({
      documentType: readOptionalText(formData, "documentType"),
      documentNumber: readOptionalText(formData, "documentNumber"),
      licenseNumber: readOptionalText(formData, "licenseNumber"),
      specialty: readOptionalText(formData, "specialty"),
    }).filter(([, value]) => value !== undefined),
  );
}

// Activa el vínculo recién creado en la sesión. Si no se puede, la persona lo elige en la pantalla de clínicas,
// donde ya aparece.
async function activateRelationship(kind: "STAFF" | "PATIENT", relationshipId: string): Promise<boolean> {
  try {
    await getUsersModule().selectActiveClinic({ token: await readSessionToken(), kind, relationshipId });

    return true;
  } catch (error) {
    console.error(`[invitaciones] no se activó la clínica: ${error instanceof Error ? error.name : "UnknownError"}`);

    return false;
  }
}

// Acepta la invitación de la cookie con la cuenta de la sesión. El token sale de la cookie y nunca del formulario;
// la acción se puede invocar con un POST directo, así que comprueba la sesión por su cuenta.
export async function acceptInvitation(
  previousState: AcceptFormState | undefined,
  formData: FormData,
): Promise<AcceptFormState> {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const token = await readInvitationToken();

  if (!token) {
    return { status: "finished", message: INVITATION_MESSAGES.invalidLink };
  }

  const proof = acceptInvitationSchema.safeParse(readProof(formData));

  if (!proof.success) {
    return { status: "error", fieldErrors: z.flattenError(proof.error).fieldErrors };
  }

  let result: Awaited<ReturnType<ReturnType<typeof getUsersModule>["acceptInvitation"]>>;

  try {
    result = await getUsersModule().acceptInvitation({
      token,
      account: { id: context.user.id, email: context.user.email, fullName: context.user.fullName },
      proof: proof.data,
    });
  } catch (error) {
    console.error(`[invitaciones] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

    return { status: "error", message: INVITATION_MESSAGES.unexpected };
  }

  switch (result.status) {
    case "ACCEPTED": {
      await clearInvitationCookie();
      const isActive = await activateRelationship(result.relationshipKind, result.relationshipId);

      // El encabezado muestra la clínica activa: sin esto el router conservaría el layout anterior.
      revalidatePath("/", "layout");
      redirect(isActive ? "/" : "/select-clinic");
    }

    case "ALREADY_MEMBER":
      await clearInvitationCookie();

      return { status: "already-member", message: alreadyMemberMessage(result.tenantName) };

    case "PROOF_MISMATCH":
      if (result.attemptsLeft <= 0) {
        await clearInvitationCookie();

        return { status: "finished", message: INVITATION_MESSAGES.attemptsExhausted };
      }

      return { status: "error", message: attemptsLeftMessage(result.attemptsLeft) };

    case "CONFLICT":
      return { status: "error", message: acceptConflictMessage(result.reason) };

    case "INVALID":
      await clearInvitationCookie();

      return { status: "finished", message: INVITATION_MESSAGES.invalidLink };
  }
}
