import { describe, expect, it } from "vitest";

import { nodeSecretGenerator } from "@/modules/tenants/infrastructure/adapters/node-secret-generator";

describe("generador de secretos de Node", () => {
  it("genera tokens base64url de 32 bytes, distintos en cada llamada", () => {
    const first = nodeSecretGenerator.generateToken();
    const second = nodeSecretGenerator.generateToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).not.toBe(first);
  });

  it("calcula un SHA-256 hexadecimal estable", () => {
    expect(nodeSecretGenerator.hash("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(nodeSecretGenerator.hash("abc")).toBe(nodeSecretGenerator.hash("abc"));
  });

  it("no devuelve el valor en claro dentro del resumen", () => {
    const token = nodeSecretGenerator.generateToken();

    expect(nodeSecretGenerator.hash(token)).not.toContain(token);
  });
});
