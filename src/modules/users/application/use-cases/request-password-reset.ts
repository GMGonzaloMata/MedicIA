import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";

// Responde igual exista o no la cuenta, para no revelar qué correos están registrados.
export function createRequestPasswordReset({ identity }: { identity: IdentityProvider }) {
  return async (input: { email: string }): Promise<void> => {
    await identity.requestPasswordReset({ email: normalizeEmail(input.email) });
  };
}
