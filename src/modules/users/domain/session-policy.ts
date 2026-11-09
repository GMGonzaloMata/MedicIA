const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Vencimiento de la sesión (spec FR-012). El absoluto se guarda en cada fila al crearla,
// de modo que cambiar estas constantes no altera las sesiones ya abiertas.
export const SESSION_IDLE_TIMEOUT_MS = 30 * MINUTE_MS;
export const SESSION_ABSOLUTE_TIMEOUT_MS = 12 * HOUR_MS;

// La última actividad se escribe como máximo una vez por minuto, para no tocar la base en cada solicitud.
export const ACTIVITY_WRITE_INTERVAL_MS = MINUTE_MS;

export type SessionState =
  | "CURRENT"
  | "REVOKED"
  | "INVALIDATED_BY_PASSWORD_CHANGE"
  | "EXPIRED"
  | "IDLE";

export interface SessionTimes {
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface EvaluateSessionInput {
  session: SessionTimes;
  // Fecha desde la cual son válidas las sesiones de la cuenta; se adelanta al cambiar la contraseña.
  sessionsValidFrom: Date;
  now: Date;
}

// Una sesión sigue vigente mientras no esté revocada, no sea anterior al último cambio de contraseña
// y no haya superado ni el tiempo absoluto ni el de inactividad.
export function evaluateSession({ session, sessionsValidFrom, now }: EvaluateSessionInput): SessionState {
  if (session.revokedAt !== null) {
    return "REVOKED";
  }

  if (session.createdAt.getTime() < sessionsValidFrom.getTime()) {
    return "INVALIDATED_BY_PASSWORD_CHANGE";
  }

  if (now.getTime() >= session.expiresAt.getTime()) {
    return "EXPIRED";
  }

  if (now.getTime() - session.lastActivityAt.getTime() >= SESSION_IDLE_TIMEOUT_MS) {
    return "IDLE";
  }

  return "CURRENT";
}

export function shouldRecordActivity({
  lastActivityAt,
  now,
}: {
  lastActivityAt: Date;
  now: Date;
}): boolean {
  return now.getTime() - lastActivityAt.getTime() >= ACTIVITY_WRITE_INTERVAL_MS;
}
