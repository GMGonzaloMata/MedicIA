"use server";

import { redirect } from "next/navigation";

import { getUsersModule } from "@/modules/users/composition";
import { confirmAccountSchema } from "@/modules/users/application/validation/account-form-schemas";

import { failureState, invalidFormState, readText, type AuthFormState } from "./form-state";

export async function confirmAccount(
  previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    email: readText(formData, "email"),
    code: readText(formData, "code"),
    password: readText(formData, "password"),
    passwordConfirmation: readText(formData, "passwordConfirmation"),
  };
  const values = { email: input.email };
  const parsed = confirmAccountSchema.safeParse(input);

  if (!parsed.success) {
    return invalidFormState(parsed.error, values);
  }

  try {
    await getUsersModule().confirmAccount(parsed.data);
  } catch (error) {
    return failureState(error, { passwordField: "password", values });
  }

  // `redirect` lanza una excepción, así que se llama fuera del `try`.
  redirect("/sign-in?notice=verified");
}
