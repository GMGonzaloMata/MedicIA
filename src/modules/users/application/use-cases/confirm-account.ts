import { normalizeEmail } from "../../domain/email";
import type { IdentityProvider } from "../ports/out/identity-provider";

export interface ConfirmAccountInput {
  email: string;
  code: string;
}

export function createConfirmAccount({ identity }: { identity: IdentityProvider }) {
  return async (input: ConfirmAccountInput): Promise<void> => {
    await identity.confirmSignUp({ email: normalizeEmail(input.email), code: input.code.trim() });
  };
}
