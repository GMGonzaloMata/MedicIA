import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";

export interface RegisterAccountInput {
  email: string;
  fullName: string;
}

// Responde igual exista o no la cuenta: el proveedor absorbe el correo repetido (spec FR-005).
export function createRegisterAccount({ identity }: { identity: IdentityProvider }) {
  return async (input: RegisterAccountInput): Promise<void> => {
    await identity.signUp({
      email: normalizeEmail(input.email),
      fullName: input.fullName.trim(),
    });
  };
}
