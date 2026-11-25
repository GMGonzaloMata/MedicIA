"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { getTenantsModule } from "@/modules/tenants/composition";
import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../../../_lib/access";
import { readSessionToken } from "../../../../_lib/session-cookie";
import { CLINIC_MESSAGES } from "../../../clinic/_lib/clinic-messages";
import {
  errorState,
  readText,
  unexpectedErrorState,
  type ClinicActionState,
} from "../../../clinic/_lib/action-support";

// Acepta la invitación con la cuenta de la sesión. Sirve a quien todavía no tiene clínica, así que usa el contexto
// de acceso y no exige una clínica activa. La persona sale de la sesión; del formulario solo viene el token.
export async function acceptInvitationAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const token = readText(formData, "token");

  try {
    const result = await getTenantsModule().acceptStaffInvitation({
      token,
      user: { id: context.user.id, email: context.user.email },
    });

    if (!result.ok) {
      return errorState(CLINIC_MESSAGES.invitationInvalid);
    }

    // Deja activa la clínica nueva para que la persona entre directo a trabajar.
    await getUsersModule().selectActiveClinic({
      token: await readSessionToken(),
      kind: "STAFF",
      relationshipId: result.membershipId,
    });
  } catch (error) {
    return unexpectedErrorState(error);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
