import type { LinkAttemptRepository } from "@/modules/tenants/application/ports/out/link-attempt-repository";

// Intentos fallidos de una sola cuenta en memoria: el caso de uso no mezcla cuentas, así que alcanza con una lista de
// momentos. Se comparte con el padrón de pacientes, porque una vinculación exitosa borra los intentos de la cuenta.
export function createInMemoryLinkAttemptRepository(attempts: Date[] = []): LinkAttemptRepository & { attempts: Date[] } {
  return {
    attempts,

    async countFailuresSince({ since }) {
      return attempts.filter((attempt) => attempt.getTime() >= since.getTime()).length;
    },

    async recordFailure({ now, purgeBefore }) {
      const kept = attempts.filter((attempt) => attempt.getTime() >= purgeBefore.getTime());
      attempts.splice(0, attempts.length, ...kept, now);
    },
  };
}
