import { beforeEach, describe, expect, it } from "vitest";

import { createListAvailableClinics } from "@/modules/users/application/use-cases/list-available-clinics";
import { createResolveCurrentSession } from "@/modules/users/application/use-cases/resolve-current-session";
import { createSelectActiveClinic } from "@/modules/users/application/use-cases/select-active-clinic";
import { createSignIn } from "@/modules/users/application/use-cases/sign-in";
import type { AvailableClinic } from "@/modules/users/domain/available-clinic";
import { ClinicUnavailableError } from "@/modules/users/domain/clinic-errors";
import { generateSessionToken, hashSessionToken } from "@/modules/users/domain/session-token";
import {
  FAKE_VERIFICATION_CODE,
  createInMemoryIdentityProvider,
} from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { InMemoryClinicAccessRepository } from "../../../../support/in-memory/in-memory-clinic-access-repository";
import { InMemorySessionRepository } from "../../../../support/in-memory/in-memory-session-repository";
import { InMemoryUserRepository } from "../../../../support/in-memory/in-memory-user-repository";

const NOW = new Date("2026-11-09T10:00:00.000Z");
const OWNER = { id: "user-1", email: "persona@example.com", fullName: "Persona Uno", isPlatformAdmin: false };

const staffClinic: AvailableClinic = {
  kind: "STAFF",
  relationshipId: "membership-1",
  tenantName: "Clínica Norte",
  isClinicAdmin: true,
  isDoctor: false,
};
const patientClinic: AvailableClinic = { kind: "PATIENT", relationshipId: "patient-1", tenantName: "Clínica Sur" };

let sessions: InMemorySessionRepository;
let clinicAccess: InMemoryClinicAccessRepository;
let token: string;

beforeEach(async () => {
  sessions = new InMemorySessionRepository();
  clinicAccess = new InMemoryClinicAccessRepository();
  sessions.addUser(OWNER, new Date(0));
  token = generateSessionToken();
  await sessions.create({
    userId: OWNER.id,
    tokenHash: hashSessionToken(token),
    now: NOW,
    expiresAt: new Date(NOW.getTime() + 60 * 60 * 1000),
  });
});

function newSelectActiveClinic() {
  const resolveCurrentSession = createResolveCurrentSession({ sessions, now: () => NOW });

  return createSelectActiveClinic({ resolveCurrentSession, clinicAccess, sessions });
}

describe("listAvailableClinics", () => {
  it("devuelve los vínculos de la persona con su nombre y tipo", async () => {
    clinicAccess.grant(OWNER.id, staffClinic);
    clinicAccess.grant(OWNER.id, patientClinic);
    clinicAccess.grant("otra-persona", { kind: "PATIENT", relationshipId: "patient-9", tenantName: "Ajena" });

    const clinics = await createListAvailableClinics({ clinicAccess })(OWNER.id);

    expect(clinics).toEqual([staffClinic, patientClinic]);
  });

  it("devuelve una lista vacía si no tiene ninguna", async () => {
    expect(await createListAvailableClinics({ clinicAccess })(OWNER.id)).toEqual([]);
  });
});

describe("selectActiveClinic", () => {
  it("activa un vínculo disponible en la sesión", async () => {
    clinicAccess.grant(OWNER.id, staffClinic);

    await newSelectActiveClinic()({ token, kind: "STAFF", relationshipId: "membership-1" });

    expect(sessions.rows[0].active).toEqual({ kind: "STAFF", relationshipId: "membership-1" });
  });

  it("al cambiar de clínica deja solo la nueva", async () => {
    clinicAccess.grant(OWNER.id, staffClinic);
    clinicAccess.grant(OWNER.id, patientClinic);
    const select = newSelectActiveClinic();

    await select({ token, kind: "STAFF", relationshipId: "membership-1" });
    await select({ token, kind: "PATIENT", relationshipId: "patient-1" });

    expect(sessions.rows[0].active).toEqual({ kind: "PATIENT", relationshipId: "patient-1" });
  });

  it.each([
    { case: "un vínculo ajeno", kind: "STAFF" as const, relationshipId: "membership-ajena" },
    { case: "un vínculo inexistente", kind: "PATIENT" as const, relationshipId: "no-existe" },
    { case: "un identificador del otro tipo", kind: "PATIENT" as const, relationshipId: "membership-1" },
  ])("rechaza $case con el mismo error y no cambia la sesión", async ({ kind, relationshipId }) => {
    clinicAccess.grant(OWNER.id, staffClinic);
    clinicAccess.grant("otra-persona", { ...staffClinic, relationshipId: "membership-ajena" });

    await expect(newSelectActiveClinic()({ token, kind, relationshipId })).rejects.toBeInstanceOf(
      ClinicUnavailableError,
    );

    expect(sessions.rows[0].active).toBeNull();
  });

  it("rechaza con el mismo error si la sesión no es vigente", async () => {
    clinicAccess.grant(OWNER.id, staffClinic);

    for (const invalidToken of [null, "no-es-un-token", generateSessionToken()]) {
      await expect(
        newSelectActiveClinic()({ token: invalidToken, kind: "STAFF", relationshipId: "membership-1" }),
      ).rejects.toBeInstanceOf(ClinicUnavailableError);
    }

    expect(sessions.rows[0].active).toBeNull();
  });
});

describe("signIn: siguiente paso", () => {
  const EMAIL = "ingreso@example.com";
  const PASSWORD = "Contraseña-larga-123";

  async function signInWith(grants: AvailableClinic[]) {
    const identity = createInMemoryIdentityProvider({});
    const users = new InMemoryUserRepository();
    const signInSessions = new InMemorySessionRepository();

    await identity.signUp({ email: EMAIL, fullName: "Persona Dos" });
    await identity.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE, password: PASSWORD });

    // El identificador de la cuenta lo asigna el repositorio al primer ingreso, así que se
    // crea antes para poder cargar los vínculos de esa misma cuenta.
    const user = await users.upsertFromIdentity({
      subject: (await identity.signIn({ email: EMAIL, password: PASSWORD })).subject,
      email: EMAIL,
      fullName: "Persona Dos",
      now: NOW,
    });
    const access = new InMemoryClinicAccessRepository();
    grants.forEach((clinic) => access.grant(user.id, clinic));

    const result = await createSignIn({
      identity,
      users,
      sessions: signInSessions,
      clinicAccess: access,
      now: () => NOW,
    })({ email: EMAIL, password: PASSWORD });

    return { result, rows: signInSessions.rows };
  }

  it("sin clínicas disponibles lleva a la pantalla de sin acceso", async () => {
    const { result, rows } = await signInWith([]);

    expect(result.nextStep).toBe("NO_ACCESS");
    expect(rows[0].active).toBeNull();
  });

  it("con una sola clínica la activa sin pedir elegir", async () => {
    const { result, rows } = await signInWith([patientClinic]);

    expect(result.nextStep).toBe("HOME");
    expect(rows[0].active).toEqual({ kind: "PATIENT", relationshipId: "patient-1" });
  });

  it("con varias clínicas pide elegir y no activa ninguna", async () => {
    const { result, rows } = await signInWith([staffClinic, patientClinic]);

    expect(result.nextStep).toBe("SELECT_CLINIC");
    expect(rows[0].active).toBeNull();
  });
});
