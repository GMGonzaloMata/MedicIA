import { createHash, randomBytes } from "node:crypto";

const TOKEN_BYTES = 32;
// 32 bytes en base64url ocupan 43 caracteres.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

// El identificador viaja en la cookie. La base solo guarda su hash, así que una copia de la base
// no sirve para suplantar una sesión.
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// La cookie es un dato externo: se descarta lo que no tenga la forma de un identificador propio
// antes de consultar la base.
export function isWellFormedSessionToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}
