import type { SecretGenerator } from "@/modules/tenants/application/ports/out/secret-generator";
import { normalizeLinkCode } from "@/modules/tenants/domain/patient-link-code";

const CODE_ALPHABET_HEAD = "AAAAAAAA";

// Secretos predecibles para las pruebas: «token-1», «token-2»… y un hash legible que no necesita calcularse. Los
// códigos de vinculación son «AAAAAAAA22», «AAAAAAAA23»…: válidos para el alfabeto y fáciles de adivinar en un test.
export function createDeterministicSecretGenerator(): SecretGenerator & {
  issuedTokens: string[];
  issuedLinkCodes: string[];
} {
  let tokenCount = 0;
  let codeCount = 0;
  const issuedTokens: string[] = [];
  const issuedLinkCodes: string[] = [];

  return {
    issuedTokens,
    issuedLinkCodes,

    generateToken() {
      tokenCount += 1;
      const token = `token-${tokenCount}`;
      issuedTokens.push(token);

      return token;
    },

    generateLinkCode() {
      codeCount += 1;
      // Los dos últimos símbolos cuentan en el alfabeto (23, 24, …): nunca salen símbolos que no existan.
      const suffix = `${2 + Math.floor(codeCount / 8)}${2 + (codeCount % 8)}`;
      const code = normalizeLinkCode(`${CODE_ALPHABET_HEAD}${suffix}`);

      if (code === null) {
        throw new Error("Código de prueba inválido.");
      }

      issuedLinkCodes.push(code);

      return code;
    },

    hash(value) {
      return `hash:${value}`;
    },
  };
}
