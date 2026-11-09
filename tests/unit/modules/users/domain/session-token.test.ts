import { describe, expect, it } from "vitest";

import {
  generateSessionToken,
  hashSessionToken,
  isWellFormedSessionToken,
} from "@/modules/users/domain/session-token";

describe("session-token", () => {
  it("genera identificadores distintos con la forma esperada", () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).not.toBe(second);
    expect(isWellFormedSessionToken(first)).toBe(true);
  });

  it("calcula un hash SHA-256 de 64 caracteres, estable y distinto del identificador", () => {
    const token = generateSessionToken();
    const hash = hashSessionToken(token);

    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hashSessionToken(token)).toBe(hash);
    expect(hash).not.toContain(token);
  });

  it("calcula un hash conocido", () => {
    expect(hashSessionToken("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it.each([undefined, null, 42, "", "corto", "a".repeat(44), `${"a".repeat(42)}!`])(
    "descarta un valor sin la forma de un identificador: %s",
    (value) => {
      expect(isWellFormedSessionToken(value)).toBe(false);
    },
  );
});
