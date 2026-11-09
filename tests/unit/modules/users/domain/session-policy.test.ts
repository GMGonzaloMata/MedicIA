import { describe, expect, it } from "vitest";

import {
  ACTIVITY_WRITE_INTERVAL_MS,
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  evaluateSession,
  shouldRecordActivity,
} from "@/modules/users/domain/session-policy";

const START = new Date("2026-11-09T10:00:00.000Z");

function at(offsetMs: number): Date {
  return new Date(START.getTime() + offsetMs);
}

function sessionStartedAtStart(overrides: { lastActivityOffsetMs?: number; revoked?: boolean } = {}) {
  return {
    createdAt: START,
    lastActivityAt: at(overrides.lastActivityOffsetMs ?? 0),
    expiresAt: at(SESSION_ABSOLUTE_TIMEOUT_MS),
    revokedAt: overrides.revoked ? at(1) : null,
  };
}

describe("evaluateSession", () => {
  it("sigue vigente un milisegundo antes de la inactividad máxima", () => {
    const state = evaluateSession({
      session: sessionStartedAtStart(),
      sessionsValidFrom: START,
      now: at(SESSION_IDLE_TIMEOUT_MS - 1),
    });

    expect(state).toBe("CURRENT");
  });

  it("vence por inactividad al cumplirse los 30 minutos", () => {
    const state = evaluateSession({
      session: sessionStartedAtStart(),
      sessionsValidFrom: START,
      now: at(SESSION_IDLE_TIMEOUT_MS),
    });

    expect(state).toBe("IDLE");
  });

  it("mide la inactividad desde la última actividad", () => {
    const lastActivityOffsetMs = 2 * 60 * 60 * 1000;
    const session = sessionStartedAtStart({ lastActivityOffsetMs });

    expect(
      evaluateSession({
        session,
        sessionsValidFrom: START,
        now: at(lastActivityOffsetMs + SESSION_IDLE_TIMEOUT_MS - 1),
      }),
    ).toBe("CURRENT");
  });

  it("vence por tiempo absoluto aunque haya actividad reciente", () => {
    const lastActivityOffsetMs = SESSION_ABSOLUTE_TIMEOUT_MS - 1000;
    const session = sessionStartedAtStart({ lastActivityOffsetMs });

    expect(
      evaluateSession({ session, sessionsValidFrom: START, now: at(SESSION_ABSOLUTE_TIMEOUT_MS - 1) }),
    ).toBe("CURRENT");
    expect(
      evaluateSession({ session, sessionsValidFrom: START, now: at(SESSION_ABSOLUTE_TIMEOUT_MS) }),
    ).toBe("EXPIRED");
  });

  it("no es vigente si fue revocada", () => {
    const state = evaluateSession({
      session: sessionStartedAtStart({ revoked: true }),
      sessionsValidFrom: START,
      now: at(1000),
    });

    expect(state).toBe("REVOKED");
  });

  it("no es vigente si es anterior al último cambio de contraseña", () => {
    const state = evaluateSession({
      session: sessionStartedAtStart(),
      sessionsValidFrom: at(1),
      now: at(1000),
    });

    expect(state).toBe("INVALIDATED_BY_PASSWORD_CHANGE");
  });

  it("es vigente si se creó en el mismo instante que la fecha de validez", () => {
    const state = evaluateSession({
      session: sessionStartedAtStart(),
      sessionsValidFrom: START,
      now: at(1000),
    });

    expect(state).toBe("CURRENT");
  });
});

describe("shouldRecordActivity", () => {
  it("no registra actividad antes de un minuto", () => {
    expect(shouldRecordActivity({ lastActivityAt: START, now: at(ACTIVITY_WRITE_INTERVAL_MS - 1) })).toBe(
      false,
    );
  });

  it("registra actividad al cumplirse el minuto", () => {
    expect(shouldRecordActivity({ lastActivityAt: START, now: at(ACTIVITY_WRITE_INTERVAL_MS) })).toBe(
      true,
    );
  });
});
