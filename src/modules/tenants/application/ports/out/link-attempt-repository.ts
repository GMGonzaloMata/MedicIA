// Intentos fallidos de vincular un paciente, por cuenta. Guarda solo la cuenta y el momento: nunca documentos,
// códigos ni clínica.
export interface LinkAttemptRepository {
  // Cuántos intentos fallidos tuvo la cuenta desde ese momento.
  countFailuresSince(input: { userId: string; since: Date }): Promise<number>;

  // Registra un intento fallido y borra los de esa cuenta anteriores a `purgeBefore`.
  recordFailure(input: { userId: string; now: Date; purgeBefore: Date }): Promise<void>;
}
