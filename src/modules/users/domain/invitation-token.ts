import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
// 32 bytes en base64url ocupan 43 caracteres.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// El token viaja solo en el correo (y en una cookie corta). La base guarda su hash: una copia de la base no
// permite reconstruir un link vigente. Con 256 bits de entropía alcanza un hash rápido.
export function generateInvitationToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// El token llega de la URL y de una cookie, que son datos externos: se descarta lo que no tenga la forma de uno
// propio antes de consultar la base.
export function isWellFormedInvitationToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
