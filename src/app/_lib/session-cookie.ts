import "server-only";

import { cookies } from "next/headers";

import { isWellFormedSessionToken } from "@/modules/users/domain/session-token";
import { SESSION_COOKIE_NAME } from "@/shared/constants/session-cookie";

const MILLISECONDS_PER_SECOND = 1000;

// La cookie solo lleva el identificador opaco de la sesión. Quién es la persona y a qué clínica
// pertenece lo decide el servidor en cada solicitud; la vigencia real también.
// Solo se puede escribir desde una Server Action o un Route Handler, nunca durante el render.
export async function setSessionCookie(token: string, expiresAt: Date): Promise<void> {
  const secondsLeft = Math.floor((expiresAt.getTime() - Date.now()) / MILLISECONDS_PER_SECOND);

  (await cookies()).set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.max(0, secondsLeft),
  });
}

// Devuelve el identificador solo si tiene la forma esperada; una cookie manipulada se trata como ausente.
export async function readSessionToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE_NAME)?.value;

  return isWellFormedSessionToken(value) ? value : null;
}

export async function clearSessionCookie(): Promise<void> {
  (await cookies()).delete(SESSION_COOKIE_NAME);
}
