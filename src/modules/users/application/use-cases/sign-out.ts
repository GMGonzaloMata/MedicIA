import { hashSessionToken, isWellFormedSessionToken } from "../../domain/session-token";
import type { SessionRepository } from "../ports/out/session-repository";

interface SignOutDependencies {
  sessions: SessionRepository;
  now: () => Date;
}

// Revoca la sesión de la cookie. No falla si no hay cookie, tiene forma inválida, la sesión no
// existe o ya estaba revocada: cerrar sesión siempre debe poder completarse.
export function createSignOut({ sessions, now }: SignOutDependencies) {
  return async (token: string | null): Promise<void> => {
    if (!isWellFormedSessionToken(token)) {
      return;
    }

    await sessions.revokeByTokenHash({ tokenHash: hashSessionToken(token), now: now() });
  };
}
