const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// Límite por cuenta: con 10 intentos en los últimos 15 minutos se rechaza sin evaluar el código. El intento se
// reserva antes de evaluar; las vinculaciones exitosas lo borran, pero un código correcto rechazado sigue contando.
export const LINK_ATTEMPT_LIMIT = 10;
export const LINK_ATTEMPT_WINDOW_MS = 15 * MINUTE_MS;
// Los intentos más viejos que esto se borran al registrar uno nuevo: no se acumulan datos de más.
export const LINK_ATTEMPT_RETENTION_MS = 24 * HOUR_MS;

export function linkAttemptWindowStart(now: Date): Date {
  return new Date(now.getTime() - LINK_ATTEMPT_WINDOW_MS);
}

export function linkAttemptRetentionStart(now: Date): Date {
  return new Date(now.getTime() - LINK_ATTEMPT_RETENTION_MS);
}

export function isOverAttemptLimit(recentFailures: number): boolean {
  return recentFailures >= LINK_ATTEMPT_LIMIT;
}
