import type { SecretGenerator } from "@/modules/tenants/application/ports/out/secret-generator";

// Secretos predecibles para las pruebas: «token-1», «token-2»… y un hash legible que no necesita calcularse.
export function createDeterministicSecretGenerator(): SecretGenerator & { issuedTokens: string[] } {
  let tokenCount = 0;
  const issuedTokens: string[] = [];

  return {
    issuedTokens,

    generateToken() {
      tokenCount += 1;
      const token = `token-${tokenCount}`;
      issuedTokens.push(token);

      return token;
    },

    hash(value) {
      return `hash:${value}`;
    },
  };
}
