"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getTenantsModule } from "@/modules/tenants/composition";
import { getUsersModule } from "@/modules/users/composition";

import { getAccessContext } from "../../../_lib/access";
import { readSessionToken } from "../../../_lib/session-cookie";
import { errorState, readText, unexpectedErrorState, type ClinicActionState } from "../../clinic/_lib/action-support";
import { CLINIC_MESSAGES } from "../../clinic/_lib/clinic-messages";

const linkSchema = z.object({
  documentType: z.string().min(1).max(20),
  documentNumber: z.string().trim().min(1).max(30),
  code: z.string().trim().min(1).max(20),
});

// Vincula la cuenta de la sesión con el registro que la clínica creó. Sirve a quien todavía no tiene clínica, así que
// usa el contexto de acceso y no exige una clínica activa. La persona sale de la sesión, nunca del formulario, y la
// clínica sale del registro encontrado por documento y código.
export async function linkPatientAction(
  previousState: ClinicActionState | undefined,
  formData: FormData,
): Promise<ClinicActionState> {
  const context = await getAccessContext();

  if (context.status === "anonymous") {
    redirect("/sign-in");
  }

  const parsed = linkSchema.safeParse({
    documentType: readText(formData, "documentType"),
    documentNumber: readText(formData, "documentNumber"),
    code: readText(formData, "code"),
  });

  if (!parsed.success) {
    return errorState(CLINIC_MESSAGES.invalidInput);
  }

  try {
    const result = await getTenantsModule().linkPatientAccount({
      user: { id: context.user.id, fullName: context.user.fullName },
      ...parsed.data,
    });

    if (!result.ok) {
      // Un único mensaje para todo fallo de verificación: no revela cuál dato estaba mal.
      switch (result.code) {
        case "TOO_MANY_ATTEMPTS":
          return errorState(CLINIC_MESSAGES.tooManyAttempts);
        case "INVALID_INPUT":
          return errorState(CLINIC_MESSAGES.invalidInput);
        case "LINK_FAILED":
          return errorState(CLINIC_MESSAGES.linkFailed);
      }
    }

    // Deja activa la clínica nueva para que la persona entre directo a ver sus datos.
    await getUsersModule().selectActiveClinic({
      token: await readSessionToken(),
      kind: "PATIENT",
      relationshipId: result.patientId,
    });
  } catch (error) {
    return unexpectedErrorState(error);
  }

  revalidatePath("/", "layout");
  redirect("/");
}
