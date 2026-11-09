import { z } from "zod";

import { AccountConflictError, IdentityError } from "@/modules/users/domain/identity-errors";

import { AUTH_MESSAGES } from "../../_lib/auth-messages";

// Estado que devuelven las acciones de los formularios de acceso. Nunca incluye la contraseña:
// React vacía los campos al terminar la acción y solo se conservan el correo y el nombre.
export interface AuthFormState {
  status: "error" | "success";
  message?: string;
  fieldErrors?: Partial<Record<string, string[]>>;
  values?: { email?: string; fullName?: string };
}

export function readText(formData: FormData, name: string): string {
  const value = formData.get(name);

  return typeof value === "string" ? value : "";
}

export function invalidFormState(
  error: z.ZodError,
  values: AuthFormState["values"],
): AuthFormState {
  return { status: "error", fieldErrors: z.flattenError(error).fieldErrors, values };
}

// Traduce un error de los casos de uso a uno de los mensajes cerrados. Los errores desconocidos
// se registran solo por nombre y se muestran como un fallo del servicio.
export function failureState(
  error: unknown,
  { passwordField, values }: { passwordField: string; values: AuthFormState["values"] },
): AuthFormState {
  if (error instanceof IdentityError) {
    switch (error.code) {
      case "INVALID_PASSWORD":
        return {
          status: "error",
          fieldErrors: { [passwordField]: ["La contraseña no cumple la política: entre 12 y 128 caracteres."] },
          values,
        };
      case "INVALID_CODE":
        return { status: "error", message: AUTH_MESSAGES.invalidCode, values };
      case "INVALID_CREDENTIALS":
        return { status: "error", message: AUTH_MESSAGES.invalidCredentials, values };
      case "UNAVAILABLE":
        return { status: "error", message: AUTH_MESSAGES.unavailable, values };
    }
  }

  if (error instanceof AccountConflictError) {
    return { status: "error", message: AUTH_MESSAGES.invalidCredentials, values };
  }

  console.error(`[acceso] error inesperado: ${error instanceof Error ? error.name : "UnknownError"}`);

  return { status: "error", message: AUTH_MESSAGES.unavailable, values };
}
