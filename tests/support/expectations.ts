import { expect } from "vitest";

// Comprueba que la base rechazó la operación y que lo hizo por la regla esperada.
// El mensaje de Prisma incluye el nombre de la restricción violada, así una prueba
// no puede pasar por un motivo equivocado (por ejemplo, otro campo inválido).
export async function expectRejectedBy(
  operation: PromiseLike<unknown>,
  expectedText: string,
): Promise<void> {
  let failure: unknown;

  try {
    await operation;
  } catch (error) {
    failure = error;
  }

  expect(failure, "la base debía rechazar la operación").toBeDefined();
  expect(failure instanceof Error ? failure.message : String(failure)).toContain(expectedText);
}
