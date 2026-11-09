import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE_NAME } from "@/shared/constants/session-cookie";
import { buildSignInRedirectPath, isProtectedPath } from "@/shared/utils/route-access";

// Comprobación optimista: solo mira si la ruta es protegida y si hay cookie de sesión. No consulta
// la base de datos ni valida la sesión. La validación real, que revisa la sesión y el vínculo con la
// clínica, la hace `getAccessContext` en cada pantalla, acción y Route Handler: el `proxy` nunca
// es la defensa, y un cambio del `matcher` o de ruta de una acción puede dejarla fuera de su alcance.
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!isProtectedPath(pathname) || request.cookies.has(SESSION_COOKIE_NAME)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL(buildSignInRedirectPath(pathname, search), request.url));
}

// Excluye los recursos estáticos y los archivos con extensión (íconos, imágenes).
export const config = {
  matcher: ["/((?!_next/static|_next/image|.*\\..*).*)"],
};
