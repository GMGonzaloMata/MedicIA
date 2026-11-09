"use server";

import { redirect } from "next/navigation";

import { getUsersModule } from "@/modules/users/composition";
import { resetPasswordSchema } from "@/modules/users/application/validation/account-form-schemas";

import { failureState, invalidFormState, readText, type AuthFormState } from "./form-state";

export async function resetPassword(
  previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    email: readText(formData, "email"),
    code: readText(formData, "code"),
    newPassword: readText(formData, "newPassword"),
    newPasswordConfirmation: readText(formData, "newPasswordConfirmation"),
  };
  const values = { email: input.email };
  const parsed = resetPasswordSchema.safeParse(input);

  if (!parsed.success) {
    return invalidFormState(parsed.error, values);
  }

  try {
    await getUsersModule().resetPassword(parsed.data);
  } catch (error) {
    return failureState(error, { passwordField: "newPassword", values });
  }

  // `redirect` lanza una excepción, así que se llama fuera del `try`.
  redirect("/sign-in?notice=password-changed");
}
