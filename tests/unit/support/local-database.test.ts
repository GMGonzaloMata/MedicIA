import { describe, expect, it } from "vitest";

import { assertLocalDatabaseUrl } from "../../support/local-database";

describe("assertLocalDatabaseUrl", () => {
  it("acepta una base en localhost o en 127.0.0.1", () => {
    const local = "postgresql://medicia:medicia@localhost:5433/medicia";
    const loopback = "postgresql://medicia:medicia@127.0.0.1:5433/medicia";

    expect(assertLocalDatabaseUrl(local)).toBe(local);
    expect(assertLocalDatabaseUrl(loopback)).toBe(loopback);
  });

  it("rechaza una base en un servidor remoto", () => {
    expect(() =>
      assertLocalDatabaseUrl("postgresql://user:secret@db.example.com:5432/medicia"),
    ).toThrow("solo corren contra una base local");
  });

  it("rechaza una URL local que redirige al servidor con el parámetro host", () => {
    expect(() =>
      assertLocalDatabaseUrl("postgresql://user:secret@localhost:5432/medicia?host=db.example.com"),
    ).toThrow("parámetros host u hostaddr");
    expect(() =>
      assertLocalDatabaseUrl("postgresql://user:secret@localhost:5432/medicia?hostaddr=10.0.0.5"),
    ).toThrow("parámetros host u hostaddr");
  });

  it("rechaza una variable ausente o una URL inválida", () => {
    expect(() => assertLocalDatabaseUrl(undefined)).toThrow("Falta DATABASE_URL");
    expect(() => assertLocalDatabaseUrl("no es una url")).toThrow("no es una URL válida");
  });

  it("no incluye la contraseña en los mensajes de error", () => {
    try {
      assertLocalDatabaseUrl("postgresql://user:secret@db.example.com:5432/medicia");
    } catch (error) {
      expect(error instanceof Error ? error.message : "").not.toContain("secret");
    }
  });
});
