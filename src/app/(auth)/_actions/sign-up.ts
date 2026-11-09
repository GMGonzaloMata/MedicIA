"use server";

import { getUsersModule } from "@/modules/users/composition";
import { signUpSchema } from "@/modules/users/application/validation/account-form-schemas";

import { AUTH_MESSAGES } from "../../_lib/auth-messages";
import { failureState, invalidFormState, readText, type AuthFormState } from "./form-state";

export async function signUp(
  previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const input = {
    fullName: readText(formData, "fullName"),
    email: readText(formData, "email"),
    password: readText(formData, "password"),
  };
  const values = { email: input.email, fullName: input.fullName };
  const parsed = signUpSchema.safeParse(input);

  if (!parsed.success) {
    return invalidFormState(parsed.error, values);
  }

  try {
    await getUsersModule().registerAccount(parsed.data);
  } catch (error) {
    return failureState(error, { passwordField: "password", values });
  }

  // Siempre el mismo mensaje, exista o no el correo.
  return {
    status: "success",
    message: AUTH_MESSAGES.registration,
    values: { email: parsed.data.email },
  };
}
