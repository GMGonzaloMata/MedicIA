import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";

// Responde igual exista o no la cuenta, o esté o no verificada.
export function createResendConfirmationCode({ identity }: { identity: IdentityProvider }) {
  return async (input: { email: string }): Promise<void> => {
    await identity.resendConfirmationCode({ email: normalizeEmail(input.email) });
  };
}
