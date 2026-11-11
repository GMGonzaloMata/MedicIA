import "server-only";

import { cookies } from "next/headers";

import { isWellFormedInvitationToken } from "@/modules/users/domain/invitation-token";
import {
  INVITATION_COOKIE_MAX_AGE_SECONDS,
  INVITATION_COOKIE_NAME,
} from "@/shared/constants/invitation-cookie";

// La cookie solo lleva el token de la invitación. Si sirve, para quién y por cuánto lo decide el servidor al
// mostrarla y al aceptarla. Solo se puede escribir desde una Server Action o un Route Handler, nunca durante el render.
export async function setInvitationCookie(token: string): Promise<void> {
  (await cookies()).set(INVITATION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: INVITATION_COOKIE_MAX_AGE_SECONDS,
  });
}

// Devuelve el token solo si tiene la forma esperada; una cookie manipulada se trata como ausente.
export async function readInvitationToken(): Promise<string | null> {
  const value = (await cookies()).get(INVITATION_COOKIE_NAME)?.value;

  return isWellFormedInvitationToken(value) ? value : null;
}

export async function clearInvitationCookie(): Promise<void> {
  (await cookies()).delete(INVITATION_COOKIE_NAME);
}
