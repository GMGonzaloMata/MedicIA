import { describe, expect, it } from "vitest";

import { normalizeProof, proofMatches } from "@/modules/users/domain/invitation-proof";

describe("normalización del documento y la matrícula", () => {
  it.each([
    ["12.345.678", "12345678"],
    [" 12 345 678 ", "12345678"],
    ["mn 123", "MN123"],
    ["MN-123", "MN123"],
    ["ab-12.34 cd", "AB1234CD"],
  ])("%s queda como %s", (value, expected) => {
    expect(normalizeProof(value)).toBe(expected);
  });

  it("unifica los dígitos de ancho completo con los comunes", () => {
    expect(normalizeProof("１２３４５６７８")).toBe("12345678");
  });
});

describe("comparación del documento y la matrícula", () => {
  it("coincide ignorando espacios, puntos, guiones y mayúsculas", () => {
    expect(proofMatches("12345678", "12.345.678")).toBe(true);
    expect(proofMatches("MN123", "mn 123")).toBe(true);
    expect(proofMatches("MN-123", "MN123")).toBe(true);
  });

  it("no coincide con un dato distinto", () => {
    expect(proofMatches("12345678", "12345679")).toBe(false);
    expect(proofMatches("MN123", "MN124")).toBe(false);
  });

  it("no lanza con datos de distinta longitud y no coincide", () => {
    expect(proofMatches("12345678", "1234567")).toBe(false);
    expect(proofMatches("12345678", "123456789")).toBe(false);
  });

  it("un dato vacío, o que queda vacío al normalizar, nunca coincide", () => {
    expect(proofMatches("12345678", "")).toBe(false);
    expect(proofMatches("12345678", " . - ")).toBe(false);
    expect(proofMatches("", "")).toBe(false);
    expect(proofMatches(" - ", " - ")).toBe(false);
  });
});
