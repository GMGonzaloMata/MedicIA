import type { ResolvedSession } from "../../domain/active-relationship";
import { evaluateSession, shouldRecordActivity } from "../../domain/session-policy";
import { hashSessionToken, isWellFormedSessionToken } from "../../domain/session-token";
import type { SessionRepository } from "../ports/out/session-repository";

interface ResolveCurrentSessionDependencies {
  sessions: SessionRepository;
  now: () => Date;
}

// Busca la sesión por el hash del identificador de la cookie y devuelve la sesión solo si sigue
// vigente: no revocada, no vencida ni inactiva, y no anterior al último cambio de contraseña.
// Cualquier otro caso (sin cookie, forma inválida, desconocida o no vigente) devuelve null, sin distinguirlos.
// Una sesión vigente cuenta como actividad, que se guarda como máximo una vez por minuto.
export function createResolveCurrentSession({ sessions, now }: ResolveCurrentSessionDependencies) {
  return async (token: string | null): Promise<ResolvedSession | null> => {
    if (!isWellFormedSessionToken(token)) {
      return null;
    }

    const resolved = await sessions.findByTokenHash(hashSessionToken(token));

    if (!resolved) {
      return null;
    }

    const currentTime = now();
    const state = evaluateSession({
      session: resolved.session,
      sessionsValidFrom: resolved.sessionsValidFrom,
      now: currentTime,
    });

    if (state !== "CURRENT") {
      return null;
    }

    if (shouldRecordActivity({ lastActivityAt: resolved.session.lastActivityAt, now: currentTime })) {
      await sessions.recordActivity({ sessionId: resolved.session.id, now: currentTime });
    }

    return resolved;
  };
}
