import { beforeEach, describe, expect, it, vi } from "vitest";

import { createRequestPasswordReset } from "@/modules/users/application/use-cases/request-password-reset";
import { createResetPassword } from "@/modules/users/application/use-cases/reset-password";
import { createSignOut } from "@/modules/users/application/use-cases/sign-out";
import { generateSessionToken, hashSessionToken } from "@/modules/users/domain/session-token";
import {
  FAKE_VERIFICATION_CODE,
  createInMemoryIdentityProvider,
} from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { InMemorySessionRepository } from "../../../../support/in-memory/in-memory-session-repository";
import { InMemoryUserRepository } from "../../../../support/in-memory/in-memory-user-repository";

const NOW = new Date("2026-11-09T10:00:00.000Z");
const EMAIL = "persona@example.com";
const OLD_PASSWORD = "contraseña-larga-123";
const NEW_PASSWORD = "otra-contraseña-456";

describe("signOut", () => {
  let sessions: InMemorySessionRepository;
  let token: string;

  beforeEach(async () => {
    sessions = new InMemorySessionRepository();
    token = generateSessionToken();
    await sessions.create({
      userId: "user-1",
      tokenHash: hashSessionToken(token),
      now: NOW,
      expiresAt: new Date(NOW.getTime() + 60_000),
    });
  });

  it("revoca la sesión de la cookie", async () => {
    await createSignOut({ sessions, now: () => NOW })(token);

    expect(sessions.rows[0].revokedAt).toEqual(NOW);
  });

  it("no falla si la sesión ya estaba revocada, no existe, o no hay cookie válida", async () => {
    const signOut = createSignOut({ sessions, now: () => NOW });

    await signOut(token);
    await expect(signOut(token)).resolves.toBeUndefined();
    await expect(signOut(generateSessionToken())).resolves.toBeUndefined();
    await expect(signOut("no-es-un-token")).resolves.toBeUndefined();
    await expect(signOut(null)).resolves.toBeUndefined();
  });
});

describe("requestPasswordReset", () => {
  it("responde igual exista o no la cuenta", async () => {
    const identity = createInMemoryIdentityProvider({});
    await identity.signUp({ email: EMAIL, password: OLD_PASSWORD, fullName: "Persona" });
    await identity.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });
    const request = createRequestPasswordReset({ identity });

    const existing = await request({ email: " Persona@Example.com " });
    const missing = await request({ email: "nadie@example.com" });

    expect(existing).toBeUndefined();
    expect(missing).toBeUndefined();
  });
});

describe("resetPassword", () => {
  let identity: ReturnType<typeof createInMemoryIdentityProvider>;
  let users: InMemoryUserRepository;

  beforeEach(async () => {
    identity = createInMemoryIdentityProvider({});
    users = new InMemoryUserRepository();
    await identity.signUp({ email: EMAIL, password: OLD_PASSWORD, fullName: "Persona" });
    await identity.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });
    await users.upsertFromIdentity({
      subject: "sub-1",
      email: EMAIL,
      fullName: "Persona",
      now: new Date(NOW.getTime() - 60_000),
    });
  });

  it("cambia la contraseña e invalida las sesiones anteriores", async () => {
    await createResetPassword({ identity, users, now: () => NOW })({
      email: "Persona@Example.com",
      code: FAKE_VERIFICATION_CODE,
      newPassword: NEW_PASSWORD,
    });

    expect(users.sessionsValidFromOf(EMAIL)).toEqual(NOW);
    await expect(identity.signIn({ email: EMAIL, password: NEW_PASSWORD })).resolves.toBeDefined();
    await expect(identity.signIn({ email: EMAIL, password: OLD_PASSWORD })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
  });

  it("no invalida nada si el proveedor rechazó el cambio", async () => {
    const before = users.sessionsValidFromOf(EMAIL);

    await expect(
      createResetPassword({ identity, users, now: () => NOW })({
        email: EMAIL,
        code: "999999",
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "INVALID_CODE" });

    expect(users.sessionsValidFromOf(EMAIL)).toEqual(before);
    await expect(identity.signIn({ email: EMAIL, password: OLD_PASSWORD })).resolves.toBeDefined();
  });

  it("si la base falla después del cambio, registra solo el nombre del error y lo informa", async () => {
    const failing = Object.assign(Object.create(users) as InMemoryUserRepository, {
      invalidateSessionsByEmail: () => Promise.reject(new TypeError(`fallo con ${EMAIL}`)),
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      createResetPassword({ identity, users: failing, now: () => NOW })({
        email: EMAIL,
        code: FAKE_VERIFICATION_CODE,
        newPassword: NEW_PASSWORD,
      }),
    ).rejects.toBeInstanceOf(TypeError);

    expect(logged).toHaveBeenCalledOnce();
    expect(String(logged.mock.calls[0][0])).toContain("TypeError");
    expect(String(logged.mock.calls[0][0])).not.toContain(EMAIL);
  });
});
