import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 120;
export const VERIFICATION_CODE_LENGTH = 6;

// Ayuda que se muestra junto a los campos de contraseña nueva, antes de enviar el formulario.
export const PASSWORD_POLICY_HINT = `Entre ${PASSWORD_MIN_LENGTH} y ${PASSWORD_MAX_LENGTH} caracteres.`;

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
  .min(PASSWORD_MIN_LENGTH, { error: `La contraseña debe tener ${PASSWORD_POLICY_HINT.toLowerCase()}` })
  .max(PASSWORD_MAX_LENGTH, { error: `La contraseña debe tener ${PASSWORD_POLICY_HINT.toLowerCase()}` })
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

export const confirmAccountSchema = z.object({
  email: emailField,
  code: verificationCodeField,
  password: newPasswordField,
});

export const resendConfirmationCodeSchema = z.object({ email: emailField });

export const signInSchema = z.object({
  email: emailField,
  password: existingPasswordField,
});

export const requestPasswordResetSchema = z.object({ email: emailField });

export const resetPasswordSchema = z.object({
  email: emailField,
  code: verificationCodeField,
  newPassword: newPasswordField,
});
