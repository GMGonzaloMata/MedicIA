import { z } from "zod";

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  PASSWORD_POLICY_HINT,
  meetsPasswordPolicy,
} from "../../domain/password-policy";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, PASSWORD_POLICY_HINT };
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 120;
export const VERIFICATION_CODE_LENGTH = 6;

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email({ error: "Ingresá un correo válido." }));

const fullNameField = z
  .string()
  .trim()
  .min(FULL_NAME_MIN_LENGTH, { error: `El nombre debe tener al menos ${FULL_NAME_MIN_LENGTH} caracteres.` })
  .max(FULL_NAME_MAX_LENGTH, { error: `El nombre no puede superar los ${FULL_NAME_MAX_LENGTH} caracteres.` });

// La política se aplica al elegir una contraseña, no al ingresar con una existente.
const newPasswordField = z
  .string()
  // Una sola regla para toda la política, para que una contraseña que incumple varias partes
  // muestre el mensaje una vez y no repetido.
  .refine(meetsPasswordPolicy, { error: `La contraseña debe tener ${PASSWORD_POLICY_HINT.toLowerCase()}` })
  // Cognito rechaza espacios al inicio o al final, y lo haría después de consumir el código (R18).
  .refine((value) => value === value.trim(), {
    error: "La contraseña no puede empezar ni terminar con espacios.",
  });

const existingPasswordField = z
  .string()
  .min(1, { error: "Ingresá tu contraseña." })
  .max(PASSWORD_MAX_LENGTH, { error: "La contraseña no es correcta." });

const verificationCodeField = z
  .string()
  .trim()
  .regex(new RegExp(`^\\d{${VERIFICATION_CODE_LENGTH}}$`), {
    error: `El código tiene ${VERIFICATION_CODE_LENGTH} dígitos.`,
  });

export const signUpSchema = z.object({
  fullName: fullNameField,
  email: emailField,
});

export const PASSWORDS_MISMATCH_MESSAGE = "Las contraseñas no coinciden.";

export const confirmAccountSchema = z
  .object({
    email: emailField,
    code: verificationCodeField,
    password: newPasswordField,
    passwordConfirmation: z.string(),
  })
  .refine((input) => input.password === input.passwordConfirmation, {
    path: ["passwordConfirmation"],
    error: PASSWORDS_MISMATCH_MESSAGE,
  });

export const resendConfirmationCodeSchema = z.object({ email: emailField });

export const signInSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

export const requestPasswordResetSchema = z.object({ email: emailField });

export const resetPasswordSchema = z
  .object({
    email: emailField,
    code: verificationCodeField,
    newPassword: newPasswordField,
    newPasswordConfirmation: z.string(),
  })
  .refine((input) => input.newPassword === input.newPasswordConfirmation, {
    path: ["newPasswordConfirmation"],
    error: PASSWORDS_MISMATCH_MESSAGE,
  });
