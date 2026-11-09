// Mensajes cerrados de las pantallas de acceso (specs/002-ingreso-sesion/contracts/screens-and-actions.md).
// Ningún error de AWS ni de la base llega a la persona: siempre se muestra uno de estos textos.
export const AUTH_MESSAGES = {
  invalidCredentials: "El correo o la contraseña no son correctos.",
  invalidCode: "El código no es correcto o ya venció.",
  registration: "Si el correo puede registrarse, te enviamos un código de verificación.",
  passwordReset: "Si existe una cuenta con ese correo, te enviamos un código para restablecer la contraseña.",
  unavailable: "No pudimos completar la operación. Intentá de nuevo en unos minutos.",
  clinicUnavailable: "No podés usar esa clínica en este momento.",
} as const;

// Avisos que la pantalla de ingreso muestra tras otra operación. Es una lista cerrada: el valor
// llega por la URL y solo se muestra si coincide con una de estas claves.
export const SIGN_IN_NOTICES = {
  verified: "Tu cuenta quedó verificada. Ya podés ingresar.",
  "password-changed": "Cambiaste tu contraseña. Ingresá con la nueva.",
} as const;

export type SignInNoticeKey = keyof typeof SIGN_IN_NOTICES;

export function isSignInNoticeKey(value: unknown): value is SignInNoticeKey {
  return typeof value === "string" && Object.hasOwn(SIGN_IN_NOTICES, value);
}
