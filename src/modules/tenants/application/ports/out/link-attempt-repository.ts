// Intentos de vincular un paciente, por cuenta. Guarda solo la cuenta y el momento: nunca documentos, códigos ni
// clínica.
export interface LinkAttemptRepository {
  // Reserva un intento ANTES de evaluar el código: en una transacción serializada por cuenta, borra los de esa cuenta
  // anteriores a `purgeBefore`, cuenta los de la ventana y, si todavía no llegó al límite, inserta uno nuevo.
  // Devuelve false (y no inserta nada) si la cuenta ya está al límite. Reservar antes de evaluar es lo que impide
  // que una ráfaga de pedidos simultáneos supere el límite; una vinculación exitosa borra los intentos de la cuenta.
  reserve(input: { userId: string; now: Date; windowStart: Date; purgeBefore: Date }): Promise<boolean>;
}
