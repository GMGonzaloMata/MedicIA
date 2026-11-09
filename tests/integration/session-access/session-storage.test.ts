import { beforeEach, describe, expect, it } from "vitest";

import { AccountConflictError } from "@/modules/users/domain/identity-errors";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";
import { prismaUserRepository } from "@/modules/users/infrastructure/repositories/prisma-user-repository";

import { createSession, createUser, prismaClient, resetDatabase } from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const HOUR_MS = 60 * 60 * 1000;

describe("Reglas de la tabla de sesiones", () => {
  it("rechaza un identificador repetido", async () => {
    const user = await createUser();
    const session = await createSession({ userId: user.id });

    await expectRejectedBy(
      createSession({ userId: user.id, tokenHash: session.tokenHash }),
      "sessions_token_hash_key",
    );
  });

  it("rechaza un hash que no tiene 64 caracteres", async () => {
    const user = await createUser();

    await expectRejectedBy(
      createSession({ userId: user.id, tokenHash: "demasiado-corto" }),
      "sessions_token_hash_length",
    );
  });

  it("rechaza un vencimiento que no es posterior al inicio", async () => {
    const user = await createUser();
    const startedAt = new Date();

    await expectRejectedBy(
      createSession({ userId: user.id, createdAt: startedAt, expiresAt: startedAt }),
      "sessions_expires_after_created",
    );
  });

  it("rechaza una última actividad anterior al inicio", async () => {
    const user = await createUser();
    const startedAt = new Date();

    await expectRejectedBy(
      createSession({
        userId: user.id,
        createdAt: startedAt,
        lastActivityAt: new Date(startedAt.getTime() - HOUR_MS),
      }),
      "sessions_activity_after_created",
    );
  });

  it("rechaza una revocación anterior al inicio", async () => {
    const user = await createUser();
    const startedAt = new Date();

    await expectRejectedBy(
      createSession({
        userId: user.id,
        createdAt: startedAt,
        revokedAt: new Date(startedAt.getTime() - HOUR_MS),
      }),
      "sessions_revoked_after_created",
    );
  });

  it("guarda el hash y ninguna otra forma del identificador", async () => {
    const user = await createUser();
    const now = new Date();
    const tokenHash = "a".repeat(64);

    const created = await prismaSessionRepository.create({
      userId: user.id,
      tokenHash,
      now,
      expiresAt: new Date(now.getTime() + 12 * HOUR_MS),
    });
    const stored = await prismaClient.session.findUniqueOrThrow({ where: { id: created.id } });

    expect(stored.tokenHash).toBe(tokenHash);
    expect(stored.createdAt).toEqual(now);
    expect(stored.lastActivityAt).toEqual(now);
    expect(stored.revokedAt).toBeNull();
    expect(stored.activeStaffMembershipId).toBeNull();
    expect(stored.activePatientId).toBeNull();
  });
});

describe("Cuenta propia del primer ingreso", () => {
  const identity = { subject: "sub-primera-vez", email: "Persona@Example.com", fullName: "Persona Uno" };

  it("crea la cuenta con el correo en minúsculas y la reutiliza en el segundo ingreso", async () => {
    const now = new Date();

    const first = await prismaUserRepository.upsertFromIdentity({ ...identity, now });
    const second = await prismaUserRepository.upsertFromIdentity({
      ...identity,
      fullName: "Otro nombre",
      now,
    });

    expect(first.email).toBe("persona@example.com");
    expect(second.id).toBe(first.id);
    expect(second.fullName).toBe("Persona Uno");
    expect(await prismaClient.user.count()).toBe(1);
  });

  it("fija sessionsValidFrom con la hora recibida, para que la primera sesión sea vigente", async () => {
    const now = new Date();

    const user = await prismaUserRepository.upsertFromIdentity({ ...identity, now });
    const stored = await prismaClient.user.findUniqueOrThrow({ where: { id: user.id } });

    expect(stored.sessionsValidFrom).toEqual(now);
  });

  it("rechaza un correo que ya pertenece a otra cuenta, sin crear nada", async () => {
    await createUser({ cognitoSub: "sub-otra-cuenta", email: "persona@example.com" });

    await expect(
      prismaUserRepository.upsertFromIdentity({ ...identity, now: new Date() }),
    ).rejects.toBeInstanceOf(AccountConflictError);
    expect(await prismaClient.user.count()).toBe(1);
  });

  it("resuelve dos ingresos simultáneos de la misma persona con una sola cuenta", async () => {
    const now = new Date();

    const [first, second] = await Promise.all([
      prismaUserRepository.upsertFromIdentity({ ...identity, now }),
      prismaUserRepository.upsertFromIdentity({ ...identity, now }),
    ]);

    expect(second.id).toBe(first.id);
    expect(await prismaClient.user.count()).toBe(1);
  });
});
