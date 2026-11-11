import { NextResponse, type NextRequest } from "next/server";

import { isWellFormedInvitationToken } from "@/modules/users/domain/invitation-token";

import { setInvitationCookie } from "../../_lib/invitation-cookie";

// Entrada pública del link del correo. Solo guarda el token en una cookie y lleva a `/invitation`, donde se pide
// ingresar o crear la cuenta. No cambia ningún estado y no consulta nada: con un token válido o inventado la
// respuesta visible es la misma, así que no sirve para descubrir qué links existen (specs/009, FR-024).
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
  const { token } = await context.params;

  if (isWellFormedInvitationToken(token)) {
    await setInvitationCookie(token);
  }

  const response = NextResponse.redirect(new URL("/invitation", request.url));

  // El token viaja en la dirección: que no salga en el encabezado de referencia ni quede en cachés.
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Cache-Control", "no-store");

  return response;
}
