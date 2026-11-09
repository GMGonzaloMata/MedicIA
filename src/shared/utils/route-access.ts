import { getSafeRedirectPath } from "./safe-redirect";

const SIGN_IN_PATH = "/sign-in";

// Pantallas del grupo (auth): se pueden abrir sin sesión. Todo lo demás es protegido.
const PUBLIC_PATHS = [SIGN_IN_PATH, "/sign-up", "/verify-email", "/forgot-password", "/reset-password"];

function isSameOrNested(pathname: string, publicPath: string): boolean {
  return pathname === publicPath || pathname.startsWith(`${publicPath}/`);
}

// Decide si una ruta exige sesión. Es la decisión optimista del `proxy`: solo mira la ruta.
export function isProtectedPath(pathname: string): boolean {
  return !PUBLIC_PATHS.some((publicPath) => isSameOrNested(pathname, publicPath));
}

// Arma el destino al que se lleva a quien no tiene sesión: la pantalla de ingreso con la ruta
// original en `next`, siempre que sea una ruta interna.
export function buildSignInRedirectPath(pathname: string, search: string): string {
  const next = getSafeRedirectPath(`${pathname}${search}`);

  return `${SIGN_IN_PATH}?next=${encodeURIComponent(next)}`;
}
