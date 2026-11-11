// Contrato con el servicio de identidad (specs/002-ingreso-sesion/contracts/identity-provider.md).
// Todas las operaciones reciben el correo ya normalizado. Ninguna devuelve tokens, contraseñas ni
// códigos, y todas fallan con un `IdentityError` de código cerrado.

export interface VerifiedIdentity {
  subject: string;
  email: string;
  fullName: string;
}

export interface IdentityProvider {
  // Responde igual exista o no la cuenta, para no revelar si un correo ya está registrado. No recibe
  // contraseña: la define quien demuestra tener el correo, al confirmar (R18).
  signUp(input: { email: string; fullName: string }): Promise<void>;
  // Verifica el correo con el código y fija `password` como contraseña definitiva.
  confirmSignUp(input: { email: string; code: string; password: string }): Promise<void>;
  // Responde igual exista o no la cuenta.
  resendConfirmationCode(input: { email: string }): Promise<void>;
  // Alta directa de una persona por la clínica (spec 010, R1). Crea la cuenta como un registro propio, con una
  // contraseña provisional que nadie conoce, y hace que el servicio le envíe el código de verificación: la persona define
  // su contraseña al confirmar. Si la cuenta ya existía no falla: reenvía el código si estaba sin verificar y devuelve
  // el `subject` y el nombre que ya tenía, sin cambiar su contraseña ni su nombre. Nunca devuelve contraseñas ni códigos.
  provisionAccount(input: { email: string; fullName: string }): Promise<{ subject: string; fullName: string }>;
  // Devuelve solo los datos de un token de identidad ya validado.
  signIn(input: { email: string; password: string }): Promise<VerifiedIdentity>;
  // Responde igual exista o no la cuenta.
  requestPasswordReset(input: { email: string }): Promise<void>;
  confirmPasswordReset(input: { email: string; code: string; newPassword: string }): Promise<void>;
}
