"use server";

import { getUsersModule } from "@/modules/users/composition";
import { requestPasswordResetSchema } from "@/modules/users/application/validation/account-form-schemas";

import { AUTH_MESSAGES } from "../../_lib/auth-messages";
import { failureState, invalidFormState, readText, type AuthFormState } from "./form-state";

export async function requestPasswordReset(
  previousState: AuthFormState | undefined,
  formData: FormData,
): Promise<AuthFormState> {
  const values = { email: readText(formData, "email") };
  const parsed = requestPasswordResetSchema.safeParse(values);

  if (!parsed.success) {
    return invalidFormState(parsed.error, values);
  }

  try {
    await getUsersModule().requestPasswordReset(parsed.data);
  } catch (error) {
    return failureState(error, { passwordField: "password", values });
  }

  // Siempre el mismo mensaje, exista o no la cuenta.
  return { status: "success", message: AUTH_MESSAGES.passwordReset, values: { email: parsed.data.email } };
}
