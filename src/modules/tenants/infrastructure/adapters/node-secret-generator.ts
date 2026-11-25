import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { SecretGenerator } from "../../application/ports/out/secret-generator";
import { LINK_CODE_ALPHABET, LINK_CODE_LENGTH, type NormalizedLinkCode } from "../../domain/patient-link-code";

const TOKEN_BYTES = 32;
const BYTE_RANGE = 256;
// Mayor múltiplo del alfabeto que cabe en un byte: los bytes por encima se descartan para que ningún símbolo
// salga con más frecuencia que otro (con 256 % 31 ≠ 0, usar el resto sesgaría el código).
const UNBIASED_LIMIT = BYTE_RANGE - (BYTE_RANGE % LINK_CODE_ALPHABET.length);

function randomLinkCode(): string {
  let code = "";

  while (code.length < LINK_CODE_LENGTH) {
    for (const byte of randomBytes(LINK_CODE_LENGTH * 2)) {
      if (byte < UNBIASED_LIMIT && code.length < LINK_CODE_LENGTH) {
        code += LINK_CODE_ALPHABET[byte % LINK_CODE_ALPHABET.length];
      }
    }
  }

  return code;
}

export const nodeSecretGenerator: SecretGenerator = {
  generateToken() {
    return randomBytes(TOKEN_BYTES).toString("base64url");
  },

  generateLinkCode() {
    return randomLinkCode() as NormalizedLinkCode;
  },

  hash(value) {
    return createHash("sha256").update(value).digest("hex");
  },
};
