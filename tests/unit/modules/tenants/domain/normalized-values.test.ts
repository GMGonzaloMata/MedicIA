import { describe, expect, it } from "vitest";

import {
  isDocumentType,
  normalizeDocument,
  normalizeEmail,
} from "@/modules/tenants/domain/normalized-values";

describe("normalizeEmail", () => {
  it("pasa a minúsculas y quita espacios de los bordes", () => {
    expect(normalizeEmail("  Ana@Clinica.COM ")).toBe("ana@clinica.com");
  });

  it("devuelve el mismo valor para el mismo correo escrito distinto", () => {
    expect(normalizeEmail("ANA@clinica.com")).toBe(normalizeEmail("ana@CLINICA.com"));
  });

  it.each(["", "sin-arroba", "a@b", "a b@c.com", "@c.com", "a@.com"])("rechaza %j", (raw) => {
    expect(normalizeEmail(raw)).toBeNull();
  });

  it("rechaza un correo más largo que el máximo", () => {
    expect(normalizeEmail(`${"a".repeat(250)}@x.com`)).toBeNull();
  });
});

describe("normalizeDocument", () => {
  it("quita puntos, guiones y espacios y pasa a mayúsculas", () => {
    expect(normalizeDocument("12.345.678")).toBe("12345678");
    expect(normalizeDocument(" ab-123 456 ")).toBe("AB123456");
  });

  it("trata igual al documento escrito con y sin separadores", () => {
    expect(normalizeDocument("30.111.222")).toBe(normalizeDocument("30111222"));
  });

  it.each(["", "123", "12 3", "a".repeat(21), "12345$678", "12/345"])("rechaza %j", (raw) => {
    expect(normalizeDocument(raw)).toBeNull();
  });
});

describe("isDocumentType", () => {
  it("acepta solo los tipos del modelo de datos", () => {
    expect(isDocumentType("DNI")).toBe(true);
    expect(isDocumentType("PASSPORT")).toBe(true);
    expect(isDocumentType("OTHER")).toBe(true);
    expect(isDocumentType("dni")).toBe(false);
    expect(isDocumentType(undefined)).toBe(false);
  });
});
