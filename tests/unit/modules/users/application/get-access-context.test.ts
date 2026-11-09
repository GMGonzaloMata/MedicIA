import { beforeEach, describe, expect, it, vi } from "vitest";

import { createGetAccessContext } from "@/modules/users/application/use-cases/get-access-context";
import { createResolveCurrentSession } from "@/modules/users/application/use-cases/resolve-current-session";
import type { AccessUser } from "@/modules/users/domain/access-context";
import type { StoredRelationship } from "@/modules/users/domain/active-relationship";
import {
  ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
} from "@/modules/users/domain/session-policy";
import { generateSessionToken, hashSessionToken } from "@/modules/users/domain/session-token";

import { InMemorySessionRepository } from "../../../../support/in-memory/in-memory-session-repository";

const STARTED_AT = new Date("2026-11-09T10:00:00.000Z");
const USER: AccessUser = { id: "user-1", email: "persona@example.com", fullName: "Persona Uno", isPlatformAdmin: false };

const STAFF: StoredRelationship = {
  kind: "STAFF",
  membershipId: "membership-1",
  isClinicAdmin: false,
  isDoctor: true,
  membershipStatus: "ACTIVE",
  tenantId: "tenant-1",
  tenantName: "Clínica Norte",
  tenantStatus: "ACTIVE",
};

const PATIENT: StoredRelationship = {
  kind: "PATIENT",
  patientId: "patient-1",
  patientStatus: "LINKED",
  tenantId: "tenant-2",
  tenantName: "Clínica Sur",
  tenantStatus: "ACTIVE",
};

let sessions: InMemorySessionRepository;
let currentTime: Date;
let token: string;

beforeEach(async () => {
  sessions = new InMemorySessionRepository();
  sessions.addUser(USER, STARTED_AT);
  sessions.addRelationship(STAFF);
  sessions.addRelationship(PATIENT);
  currentTime = STARTED_AT;
  token = generateSessionToken();
  await sessions.create({
    userId: USER.id,
    tokenHash: hashSessionToken(token),
    now: STARTED_AT,
    expiresAt: new Date(STARTED_AT.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
  });
});

function newGetAccessContext() {
  const resolveCurrentSession = createResolveCurrentSession({ sessions, now: () => currentTime });

  return createGetAccessContext({ resolveCurrentSession });
}

function later(offsetMs: number) {
  currentTime = new Date(STARTED_AT.getTime() + offsetMs);
}

describe("getAccessContext: sin sesión vigente", () => {
  it("es anónimo sin cookie, con una forma inválida o con un identificador desconocido", async () => {
    const findByTokenHash = vi.spyOn(sessions, "findByTokenHash");
    const getAccessContext = newGetAccessContext();

    expect(await getAccessContext(null)).toEqual({ status: "anonymous" });
    expect(await getAccessContext("corto")).toEqual({ status: "anonymous" });
    expect(findByTokenHash).not.toHaveBeenCalled();

    expect(await getAccessContext(generateSessionToken())).toEqual({ status: "anonymous" });
    expect(findByTokenHash).toHaveBeenCalledOnce();
  });

  it("es anónimo si la sesión fue revocada", async () => {
    await sessions.revokeByTokenHash({ tokenHash: hashSessionToken(token), now: STARTED_AT });

    expect(await newGetAccessContext()(token)).toEqual({ status: "anonymous" });
  });

  it("es anónimo al cumplirse la inactividad máxima", async () => {
    later(SESSION_IDLE_TIMEOUT_MS - 1);
    expect((await newGetAccessContext()(token)).status).toBe("no-clinic");

    later(SESSION_IDLE_TIMEOUT_MS * 2);
    expect(await newGetAccessContext()(token)).toEqual({ status: "anonymous" });
  });

  it("es anónimo al cumplirse el tiempo absoluto aunque haya actividad reciente", async () => {
    sessions.rows[0].lastActivityAt = new Date(STARTED_AT.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS - 1000);

    later(SESSION_ABSOLUTE_TIMEOUT_MS);

    expect(await newGetAccessContext()(token)).toEqual({ status: "anonymous" });
  });

  it("es anónimo si la sesión es anterior al último cambio de contraseña", async () => {
    sessions.addUser(USER, new Date(STARTED_AT.getTime() + 1));

    expect(await newGetAccessContext()(token)).toEqual({ status: "anonymous" });
  });

  it("no registra actividad de una sesión que no es vigente", async () => {
    const recordActivity = vi.spyOn(sessions, "recordActivity");
    await sessions.revokeByTokenHash({ tokenHash: hashSessionToken(token), now: STARTED_AT });
    later(ACTIVITY_WRITE_INTERVAL_MS * 2);

    await newGetAccessContext()(token);

    expect(recordActivity).not.toHaveBeenCalled();
  });
});

describe("getAccessContext: con sesión vigente", () => {
  it("sin vínculo activo devuelve no-clinic con los datos mínimos de la cuenta", async () => {
    const context = await newGetAccessContext()(token);

    expect(context).toEqual({ status: "no-clinic", user: USER });
  });

  it("con una membresía activa devuelve la clínica y los roles", async () => {
    sessions.rows[0].active = { kind: "STAFF", relationshipId: "membership-1" };

    expect(await newGetAccessContext()(token)).toEqual({
      status: "ready",
      user: USER,
      clinic: {
        tenantId: "tenant-1",
        tenantName: "Clínica Norte",
        relationship: { kind: "STAFF", membershipId: "membership-1", isClinicAdmin: false, isDoctor: true },
      },
    });
  });

  it("con un paciente vinculado devuelve la clínica del paciente, no la de otros vínculos", async () => {
    sessions.rows[0].active = { kind: "PATIENT", relationshipId: "patient-1" };

    const context = await newGetAccessContext()(token);

    expect(context).toMatchObject({
      status: "ready",
      clinic: { tenantId: "tenant-2", relationship: { kind: "PATIENT", patientId: "patient-1" } },
    });
  });

  it("devuelve no-clinic cuando el vínculo activo dejó de estar vigente", async () => {
    sessions.rows[0].active = { kind: "STAFF", relationshipId: "membership-1" };
    sessions.addRelationship({ ...STAFF, tenantStatus: "SUSPENDED" });
    expect((await newGetAccessContext()(token)).status).toBe("no-clinic");

    sessions.addRelationship({ ...STAFF, membershipStatus: "DEACTIVATED" });
    expect((await newGetAccessContext()(token)).status).toBe("no-clinic");

    sessions.rows[0].active = { kind: "PATIENT", relationshipId: "patient-1" };
    sessions.addRelationship({ ...PATIENT, patientStatus: "REVOKED" });
    expect((await newGetAccessContext()(token)).status).toBe("no-clinic");
  });

  it("no expone campos de la sesión ni de la cuenta fuera de los previstos", async () => {
    sessions.rows[0].active = { kind: "STAFF", relationshipId: "membership-1" };

    const context = await newGetAccessContext()(token);
    const serialized = JSON.stringify(context);

    expect(Object.keys(context).sort()).toEqual(["clinic", "status", "user"]);
    expect(serialized).not.toContain(hashSessionToken(token));
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain("sessionsValidFrom");
  });
});

describe("registro de actividad", () => {
  it("no escribe antes de un minuto y escribe al cumplirse", async () => {
    const recordActivity = vi.spyOn(sessions, "recordActivity");
    const getAccessContext = newGetAccessContext();

    later(ACTIVITY_WRITE_INTERVAL_MS - 1);
    await getAccessContext(token);
    expect(recordActivity).not.toHaveBeenCalled();

    later(ACTIVITY_WRITE_INTERVAL_MS);
    await getAccessContext(token);
    expect(recordActivity).toHaveBeenCalledWith({ sessionId: sessions.rows[0].id, now: currentTime });
    expect(sessions.rows[0].lastActivityAt).toEqual(currentTime);
  });
});
