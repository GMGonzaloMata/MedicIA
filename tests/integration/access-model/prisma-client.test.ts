import { afterEach, describe, expect, it, vi } from "vitest";

const CLIENT_MODULE = "@/infrastructure/database/prisma-client";

type GlobalWithClient = { prismaClient?: unknown };
// Se declara solo la propiedad que el módulo guarda en `globalThis`.
const globalWithClient = globalThis as unknown as GlobalWithClient;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Cliente compartido de Prisma", () => {
  it("reutiliza la misma instancia aunque el módulo se cargue de nuevo", async () => {
    const { prismaClient: first } = await import(CLIENT_MODULE);
    vi.resetModules();
    const { prismaClient: second } = await import(CLIENT_MODULE);

    expect(second).toBe(first);
  });

  it("se conecta a la base y responde una consulta", async () => {
    const { prismaClient } = await import(CLIENT_MODULE);

    const rows = await prismaClient.$queryRaw<{ answer: number }[]>`SELECT 1 AS answer`;

    expect(rows[0]?.answer).toBe(1);
  });

  it("falla con un mensaje claro si falta DATABASE_URL", async () => {
    const saved = globalWithClient.prismaClient;
    Reflect.deleteProperty(globalWithClient, "prismaClient");
    vi.stubEnv("DATABASE_URL", "");
    vi.resetModules();

    try {
      await expect(import(CLIENT_MODULE)).rejects.toThrow("Falta la variable de entorno DATABASE_URL");
    } finally {
      globalWithClient.prismaClient = saved;
    }
  });
});
