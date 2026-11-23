import { createHash, randomBytes } from "node:crypto";

import type { SecretGenerator } from "../../application/ports/out/secret-generator";

const TOKEN_BYTES = 32;

export const nodeSecretGenerator: SecretGenerator = {
  generateToken() {
    return randomBytes(TOKEN_BYTES).toString("base64url");
  },

  hash(value) {
    return createHash("sha256").update(value).digest("hex");
  },
};
