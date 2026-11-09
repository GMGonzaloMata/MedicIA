import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";

export interface ConfirmAccountInput {
  email: string;
  code: string;
  // La contraseña la elige quien demuestra tener el correo (R18).
  password: string;
}

export function createConfirmAccount({ identity }: { identity: IdentityProvider }) {
  return async (input: ConfirmAccountInput): Promise<void> => {
    await identity.confirmSignUp({
      email: normalizeEmail(input.email),
      code: input.code.trim(),
      password: input.password,
    });
  };
}
