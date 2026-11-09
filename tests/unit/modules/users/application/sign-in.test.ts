import { beforeEach, describe, expect, it } from "vitest";

import { createSignIn } from "@/modules/users/application/use-cases/sign-in";
import { AccountConflictError, IdentityError } from "@/modules/users/domain/identity-errors";
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  evaluateSession,
} from "@/modules/users/domain/session-policy";
import { hashSessionToken, isWellFormedSessionToken } from "@/modules/users/domain/session-token";
import {
  FAKE_VERIFICATION_CODE,
  createInMemoryIdentityProvider,
  fakeSubjectForEmail,
} from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { InMemoryClinicAccessRepository } from "../../../../support/in-memory/in-memory-clinic-access-repository";
import { InMemorySessionRepository } from "../../../../support/in-memory/in-memory-session-repository";
import { InMemoryUserRepository } from "../../../../support/in-memory/in-memory-user-repository";

const EMAIL = "persona@example.com";
const PASSWORD = "contraseña-larga-123";
const STARTED_AT = new Date("2026-11-09T10:00:00.000Z");

let identity: ReturnType<typeof createInMemoryIdentityProvider>;
let users: InMemoryUserRepository;
let sessions: InMemorySessionRepository;
let clinicAccess: InMemoryClinicAccessRepository;

beforeEach(async () => {
  identity = createInMemoryIdentityProvider({});
  users = new InMemoryUserRepository();
  sessions = new InMemorySessionRepository();
  clinicAccess = new InMemoryClinicAccessRepository();

  await identity.signUp({ email: EMAIL, fullName: "Persona Uno" });
  await identity.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });
});

function newSignIn() {
  return createSignIn({ identity, users, sessions, clinicAccess, now: () => STARTED_AT });
}

describe("signIn", () => {
  it("crea la cuenta propia en el primer ingreso y abre una sesión sin clínica activa", async () => {
    const result = await newSignIn()({ email: " Persona@Example.com ", password: PASSWORD });

    expect(users.users).toHaveLength(1);
    expect(users.users[0]).toMatchObject({
      subject: fakeSubjectForEmail(EMAIL),
      user: { email: EMAIL, fullName: "Persona Uno", isPlatformAdmin: false },
    });
    expect(sessions.rows).toHaveLength(1);
    expect(sessions.rows[0]).toMatchObject({
      userId: users.users[0].user.id,
      createdAt: STARTED_AT,
      lastActivityAt: STARTED_AT,
      revokedAt: null,
      active: null,
    });
    expect(sessions.rows[0].expiresAt).toEqual(new Date(STARTED_AT.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS));
    expect(result.expiresAt).toEqual(sessions.rows[0].expiresAt);
  });

  it("guarda solo el hash del identificador que entrega", async () => {
    const result = await newSignIn()({ email: EMAIL, password: PASSWORD });

    expect(isWellFormedSessionToken(result.token)).toBe(true);
    expect(sessions.rows[0].tokenHash).toBe(hashSessionToken(result.token));
    expect(JSON.stringify(sessions.rows)).not.toContain(result.token);
  });

  it("entrega un identificador distinto en cada ingreso y reutiliza la cuenta", async () => {
    const first = await newSignIn()({ email: EMAIL, password: PASSWORD });
    const second = await newSignIn()({ email: EMAIL, password: PASSWORD });

    expect(second.token).not.toBe(first.token);
    expect(users.users).toHaveLength(1);
    expect(sessions.rows).toHaveLength(2);
  });

  it("la sesión del primer ingreso es vigente de inmediato", async () => {
    await newSignIn()({ email: EMAIL, password: PASSWORD });

    const state = evaluateSession({
      session: sessions.rows[0],
      sessionsValidFrom: users.sessionsValidFromOf(EMAIL) ?? new Date(NaN),
      now: STARTED_AT,
    });

    expect(state).toBe("CURRENT");
    expect(users.sessionsValidFromOf(EMAIL)).toEqual(STARTED_AT);
  });

  it("no crea cuenta ni sesión con credenciales incorrectas", async () => {
    await expect(newSignIn()({ email: EMAIL, password: "equivocada-123456" })).rejects.toMatchObject({
      code: "INVALID_CREDENTIALS",
    });
    await expect(newSignIn()({ email: "nadie@example.com", password: PASSWORD })).rejects.toBeInstanceOf(
      IdentityError,
    );

    expect(users.users).toHaveLength(0);
    expect(sessions.rows).toHaveLength(0);
  });

  it("no abre sesión si el correo ya pertenece a otra cuenta propia", async () => {
    await users.upsertFromIdentity({ subject: "otro-sub", email: EMAIL, fullName: "Otra", now: STARTED_AT });

    await expect(newSignIn()({ email: EMAIL, password: PASSWORD })).rejects.toBeInstanceOf(AccountConflictError);

    expect(sessions.rows).toHaveLength(0);
  });
});
