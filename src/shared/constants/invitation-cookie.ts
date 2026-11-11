// Cookie con el token de la invitación que la persona abrió, para retomarla después de registrarse o ingresar. Vive en
// `shared` porque la usan el código de la aplicación y las pruebas.
export const INVITATION_COOKIE_NAME = "medicia_invitation";

// La invitación se retoma en la misma sesión de trabajo: 2 horas alcanzan para registrarse y verificar el correo.
export const INVITATION_COOKIE_MAX_AGE_SECONDS = 2 * 60 * 60;
