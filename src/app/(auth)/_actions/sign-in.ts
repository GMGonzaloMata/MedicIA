"use server";

import { redirect } from "next/navigation";

import { getUsersModule } from "@/modules/users/composition";
import { signInSchema } from "@/modules/users/application/validation/account-form-schemas";
import { getSafeRedirectPath } from "@/shared/utils/safe-redirect";

import { setSessionCookie } from "../../_lib/session-cookie";
import { failureState, invalidFormState, readText, type AuthFormState } from "./form-state";

export async function signIn(
  previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const input = { email: readText(formData, "email"), password: readText(formData, "password") };
  const values = { email: input.email };
  const parsed = signInSchema.safeParse(input);

  if (!parsed.success) {
    return invalidFormState(parsed.error, values);
  }

  let session: Awaited<ReturnType<ReturnType<typeof getUsersModule>["signIn"]>>;

  try {
    session = await getUsersModule().signIn(parsed.data);
  } catch (error) {
    // Cualquier fallo de credenciales muestra el mismo mensaje (spec FR-009).
    return failureState(error, { passwordField: "password", values });
  }

  await setSessionCookie(session.token, session.expiresAt);

  if (session.nextStep === "NO_ACCESS") {
    redirect("/no-access");
  }

  if (session.nextStep === "SELECT_CLINIC") {
    redirect("/select-clinic");
  }

  // El destino viene de la URL: solo se acepta una ruta interna (spec FR-013). Se usa solo si ya
  // hay una clínica activa; si no, la persona primero debe elegir una.
  redirect(getSafeRedirectPath(formData.get("next")));
}
