import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { evaluateSession } from "@/modules/users/domain/session-policy";
import { prismaClinicAccessRepository } from "@/modules/users/infrastructure/repositories/prisma-clinic-access-repository";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";
import { prismaUserRepository } from "@/modules/users/infrastructure/repositories/prisma-user-repository";

import {
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createSession,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const MINUTE_MS = 60 * 1000;

describe("Clínicas disponibles (FR-017)", () => {
  it("incluye solo vínculos vigentes en clínicas activas", async () => {
    const user = await createUser();
    const [active, suspended, deactivated, linked, revoked, pending, other] = await Promise.all([
      createTenant({ name: "B Activa" }),
      createTenant({ name: "Suspendida", status: "SUSPENDED" }),
      createTenant({ name: "Desactivada" }),
      createTenant({ name: "A Paciente" }),
      createTenant({ name: "Revocada" }),
      createTenant({ name: "Pendiente" }),
      createTenant({ name: "De otra persona" }),
    ]);
    const otherUser = await createUser();

    await createDoctorMembership({ tenantId: active.id, userId: user.id });
    await createStaffMembership({ tenantId: suspended.id, userId: user.id });
    await createStaffMembership({ tenantId: deactivated.id, userId: user.id, status: "DEACTIVATED" });
    await createLinkedPatient({ tenantId: linked.id, userId: user.id });
    await createLinkedPatient({
      tenantId: revoked.id,
      userId: user.id,
      status: "REVOKED",
      revokedAt: new Date(),
    });
    await createPatient({ tenantId: pending.id });
    await createStaffMembership({ tenantId: other.id, userId: otherUser.id });

    const clinics = await prismaClinicAccessRepository.listAvailableClinics(user.id);

    expect(clinics.map((clinic) => [clinic.kind, clinic.tenantName])).toEqual([
      ["PATIENT", "A Paciente"],
      ["STAFF", "B Activa"],
    ]);
  });

  it("devuelve la clínica solo si el vínculo es de esa persona y está vigente", async () => {
    const [tenant, suspended, user, other] = await Promise.all([
      createTenant({ name: "Clínica" }),
      createTenant({ name: "Suspendida", status: "SUSPENDED" }),
      createUser(),
      createUser(),
    ]);
    const membership = await createStaffMembership({ tenantId: tenant.id, userId: user.id });
    const foreign = await createStaffMembership({ tenantId: tenant.id, userId: other.id });
    const inSuspended = await createStaffMembership({ tenantId: suspended.id, userId: user.id });
    const patient = await createLinkedPatient({ tenantId: tenant.id, userId: user.id });

    const find = (kind: "STAFF" | "PATIENT", relationshipId: string) =>
      prismaClinicAccessRepository.findAvailableClinic({ userId: user.id, kind, relationshipId });

    expect(await find("STAFF", membership.id)).toMatchObject({ kind: "STAFF", tenantName: "Clínica" });
    expect(await find("PATIENT", patient.id)).toMatchObject({ kind: "PATIENT", tenantName: "Clínica" });
    expect(await find("STAFF", foreign.id)).toBeNull();
    expect(await find("STAFF", inSuspended.id)).toBeNull();
    expect(await find("STAFF", randomUUID())).toBeNull();
    // Un identificador de paciente no sirve como vínculo de personal, ni al revés.
    expect(await find("STAFF", patient.id)).toBeNull();
    expect(await find("PATIENT", membership.id)).toBeNull();
  });
});

describe("Clínica activa de la sesión (FR-020, FR-022)", () => {
  it("activa un vínculo y limpia el otro al cambiar de clínica", async () => {
    const [tenantA, tenantB, user] = await Promise.all([createTenant(), createTenant(), createUser()]);
    const membership = await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    const patient = await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });
    const session = await createSession({ userId: user.id });

    await prismaSessionRepository.setActiveRelationship({
      sessionId: session.id,
      userId: user.id,
      kind: "STAFF",
      relationshipId: membership.id,
    });
    expect(await prismaClient.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      activeStaffMembershipId: membership.id,
      activePatientId: null,
    });

    await prismaSessionRepository.setActiveRelationship({
      sessionId: session.id,
      userId: user.id,
      kind: "PATIENT",
      relationshipId: patient.id,
    });
    expect(await prismaClient.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      activeStaffMembershipId: null,
      activePatientId: patient.id,
    });
  });

  it("rechaza activar un vínculo de otra cuenta y deja la sesión como estaba", async () => {
    const [tenant, user, other] = await Promise.all([createTenant(), createUser(), createUser()]);
    const foreign = await createStaffMembership({ tenantId: tenant.id, userId: other.id });
    const session = await createSession({ userId: user.id });

    await expectRejectedBy(
      prismaSessionRepository.setActiveRelationship({
        sessionId: session.id,
        userId: user.id,
        kind: "STAFF",
        relationshipId: foreign.id,
      }),
      "sessions_user_id_active_staff_membership_id_fkey",
    );
    expect(
      (await prismaClient.session.findUniqueOrThrow({ where: { id: session.id } })).activeStaffMembershipId,
    ).toBeNull();
  });

  it("no modifica la sesión de otra cuenta", async () => {
    const [user, other] = await Promise.all([createUser(), createUser()]);
    const session = await createSession({ userId: other.id });

    await expect(
      prismaSessionRepository.setActiveRelationship({
        sessionId: session.id,
        userId: user.id,
        kind: "STAFF",
        relationshipId: randomUUID(),
      }),
    ).rejects.toThrow();
  });
});

describe("Actividad, cierre y cambio de contraseña", () => {
  it("registra la actividad sin retroceder a una hora anterior", async () => {
    const user = await createUser();
    const session = await createSession({ userId: user.id });
    const later = new Date(session.lastActivityAt.getTime() + 5 * MINUTE_MS);

    await prismaSessionRepository.recordActivity({ sessionId: session.id, now: later });
    await prismaSessionRepository.recordActivity({
      sessionId: session.id,
      now: new Date(later.getTime() - MINUTE_MS),
    });

    expect((await prismaClient.session.findUniqueOrThrow({ where: { id: session.id } })).lastActivityAt).toEqual(
      later,
    );
  });

  it("al cerrar la sesión completa revokedAt, conserva la fila y no toca otra sesión de la cuenta", async () => {
    const user = await createUser();
    const closed = await createSession({ userId: user.id });
    const open = await createSession({ userId: user.id });
    const closedAt = new Date(closed.createdAt.getTime() + MINUTE_MS);

    await prismaSessionRepository.revokeByTokenHash({ tokenHash: closed.tokenHash, now: closedAt });
    await prismaSessionRepository.revokeByTokenHash({
      tokenHash: closed.tokenHash,
      now: new Date(closedAt.getTime() + MINUTE_MS),
    });

    expect((await prismaClient.session.findUniqueOrThrow({ where: { id: closed.id } })).revokedAt).toEqual(
      closedAt,
    );
    expect((await prismaClient.session.findUniqueOrThrow({ where: { id: open.id } })).revokedAt).toBeNull();
    await expect(
      prismaSessionRepository.revokeByTokenHash({ tokenHash: "f".repeat(64), now: closedAt }),
    ).resolves.toBeUndefined();
  });

  it("invalida todas las sesiones anteriores al cambio de contraseña y no las posteriores", async () => {
    const user = await createUser({ email: "persona@example.com" });
    const first = await createSession({ userId: user.id });
    const second = await createSession({ userId: user.id });
    const changedAt = new Date(Math.max(first.createdAt.getTime(), second.createdAt.getTime()) + MINUTE_MS);

    await prismaUserRepository.invalidateSessionsByEmail({ email: "Persona@Example.com", now: changedAt });
    const third = await createSession({ userId: user.id, createdAt: changedAt, lastActivityAt: changedAt });
    const now = new Date(changedAt.getTime() + MINUTE_MS);

    const stateOf = async (tokenHash: string) => {
      const resolved = await prismaSessionRepository.findByTokenHash(tokenHash);

      return resolved
        ? evaluateSession({ session: resolved.session, sessionsValidFrom: resolved.sessionsValidFrom, now })
        : null;
    };

    expect(await stateOf(first.tokenHash)).toBe("INVALIDATED_BY_PASSWORD_CHANGE");
    expect(await stateOf(second.tokenHash)).toBe("INVALIDATED_BY_PASSWORD_CHANGE");
    expect(await stateOf(third.tokenHash)).toBe("CURRENT");
  });

  it("no hace nada si el correo no tiene cuenta propia y nunca retrocede la fecha", async () => {
    const user = await createUser({ email: "persona@example.com" });
    const later = new Date(Date.now() + 10 * MINUTE_MS);
    await prismaUserRepository.invalidateSessionsByEmail({ email: "persona@example.com", now: later });

    await expect(
      prismaUserRepository.invalidateSessionsByEmail({ email: "nadie@example.com", now: later }),
    ).resolves.toBeUndefined();
    await prismaUserRepository.invalidateSessionsByEmail({
      email: "persona@example.com",
      now: new Date(later.getTime() - 5 * MINUTE_MS),
    });

    expect((await prismaClient.user.findUniqueOrThrow({ where: { id: user.id } })).sessionsValidFrom).toEqual(
      later,
    );
  });
});
