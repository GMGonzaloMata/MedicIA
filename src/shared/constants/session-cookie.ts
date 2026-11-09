// Nombre de la cookie con el identificador opaco de la sesión. Vive en `shared` porque lo usan
// tanto el código de la aplicación como el `proxy`, que no puede cargar módulos solo de servidor.
export const SESSION_COOKIE_NAME = "medicia-session";
