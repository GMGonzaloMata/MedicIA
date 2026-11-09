import { beforeEach, describe, expect, it } from "vitest";

import { toActiveClinic } from "@/modules/users/domain/active-relationship";
import {
  SESSION_ABSOLUTE_TIMEOUT_MS,
  SESSION_IDLE_TIMEOUT_MS,
  evaluateSession,
} from "@/modules/users/domain/session-policy";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";
import { prismaUserRepository } from "@/modules/users/infrastructure/repositories/prisma-user-repository";

import {
  createDoctorMembership,
  createLinkedPatient,
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

// Resuelve una sesión como lo hace el caso de uso: estado de la sesión y clínica activa vigente.
async function resolve(tokenHash: string, now: Date = new Date()) {
  const resolved = await prismaSessionRepository.findByTokenHash(tokenHash);

  if (!resolved) {
    return { found: false as const };
  }

  return {
    found: true as const,
    state: evaluateSession({
      session: resolved.session,
      sessionsValidFrom: resolved.sessionsValidFrom,
      now,
    }),
    clinic: toActiveClinic(resolved.activeRelationship),
  };
}

describe("Revalidación del vínculo activo (SC-002)", () => {
  it("deja de resolver la clínica cuando se suspende", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const membership = await createStaffMembership({ tenantId: tenant.id, userId: user.id });
    const session = await createSession({ userId: user.id, activeStaffMembershipId: membership.id });

    expect((await resolve(session.tokenHash)).clinic?.tenantId).toBe(tenant.id);

    await prismaClient.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

    expect((await resolve(session.tokenHash)).clinic).toBeNull();

    await prismaClient.tenant.update({ where: { id: tenant.id }, data: { status: "ACTIVE" } });

    expect((await resolve(session.tokenHash)).clinic?.tenantId).toBe(tenant.id);
  });

  it("deja de resolver la clínica cuando se desactiva la membresía", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const membership = await createDoctorMembership({ tenantId: tenant.id, userId: user.id });
    const session = await createSession({ userId: user.id, activeStaffMembershipId: membership.id });

    const before = await resolve(session.tokenHash);
    expect(before.clinic?.relationship).toEqual({
      kind: "STAFF",
      membershipId: membership.id,
      isClinicAdmin: false,
      isDoctor: true,
    });

    await prismaClient.staffMembership.update({
      where: { id: membership.id },
      data: { status: "DEACTIVATED" },
    });

    expect((await resolve(session.tokenHash)).clinic).toBeNull();
  });

  it("deja de resolver la clínica cuando se revoca al paciente", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const patient = await createLinkedPatient({ tenantId: tenant.id, userId: user.id });
    const session = await createSession({ userId: user.id, activePatientId: patient.id });

    expect((await resolve(session.tokenHash)).clinic?.relationship).toEqual({
      kind: "PATIENT",
      patientId: patient.id,
    });

    await prismaClient.patient.update({
      where: { id: patient.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    expect((await resolve(session.tokenHash)).clinic).toBeNull();
  });

  it("sigue vigente la sesión aunque no tenga clínica activa", async () => {
    const user = await createUser();
    const session = await createSession({ userId: user.id });

    expect(await resolve(session.tokenHash)).toMatchObject({ state: "CURRENT", clinic: null });
  });

  it("no encuentra un identificador desconocido", async () => {
    expect(await resolve("0".repeat(64))).toEqual({ found: false });
  });
});

describe("Vigencia de la sesión", () => {
  it("vence por inactividad y por tiempo absoluto", async () => {
    // Las sesiones de esta prueba son del pasado: la cuenta no debe invalidarlas por su fecha de alta.
    const user = await createUser({ sessionsValidFrom: new Date(0) });
    const now = new Date();
    const idle = await createSession({
      userId: user.id,
      createdAt: new Date(now.getTime() - 2 * SESSION_IDLE_TIMEOUT_MS),
      lastActivityAt: new Date(now.getTime() - SESSION_IDLE_TIMEOUT_MS - MINUTE_MS),
      expiresAt: new Date(now.getTime() + MINUTE_MS),
    });
    const expired = await createSession({
      userId: user.id,
      createdAt: new Date(now.getTime() - SESSION_ABSOLUTE_TIMEOUT_MS - MINUTE_MS),
      lastActivityAt: new Date(now.getTime() - MINUTE_MS),
      expiresAt: new Date(now.getTime() - 1),
    });

    expect(await resolve(idle.tokenHash, now)).toMatchObject({ state: "IDLE" });
    expect(await resolve(expired.tokenHash, now)).toMatchObject({ state: "EXPIRED" });
  });

  it("no es vigente una sesión revocada", async () => {
    const user = await createUser();
    const session = await createSession({ userId: user.id });
    await prismaClient.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });

    expect(await resolve(session.tokenHash, new Date(Date.now() + 1000))).toMatchObject({
      state: "REVOKED",
    });
  });

  it("invalida las sesiones anteriores a sessionsValidFrom y no las posteriores (SC-005)", async () => {
    const user = await createUser();
    const before = await createSession({ userId: user.id });
    const changedPasswordAt = new Date(Date.now() + 1000);
    await prismaClient.user.update({ where: { id: user.id }, data: { sessionsValidFrom: changedPasswordAt } });
    const after = await createSession({
      userId: user.id,
      createdAt: changedPasswordAt,
      lastActivityAt: changedPasswordAt,
      expiresAt: new Date(changedPasswordAt.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
    });

    const now = new Date(changedPasswordAt.getTime() + 1000);

    expect(await resolve(before.tokenHash, now)).toMatchObject({
      state: "INVALIDATED_BY_PASSWORD_CHANGE",
    });
    expect(await resolve(after.tokenHash, now)).toMatchObject({ state: "CURRENT" });
  });

  it("es vigente la sesión del primer ingreso de una cuenta recién creada", async () => {
    const now = new Date();
    const user = await prismaUserRepository.upsertFromIdentity({
      subject: "sub-primer-ingreso",
      email: "primero@example.com",
      fullName: "Primera Persona",
      now,
    });
    const session = await prismaSessionRepository.create({
      userId: user.id,
      tokenHash: "b".repeat(64),
      now,
      expiresAt: new Date(now.getTime() + SESSION_ABSOLUTE_TIMEOUT_MS),
    });

    expect(session.id).toBeTruthy();
    expect(await resolve("b".repeat(64), now)).toMatchObject({ state: "CURRENT" });
  });
});

describe("Una sesión solo apunta a vínculos de su propia cuenta (SC-003)", () => {
  it("rechaza la membresía de otra cuenta", async () => {
    const [tenant, owner, other] = await Promise.all([createTenant(), createUser(), createUser()]);
    const foreignMembership = await createStaffMembership({ tenantId: tenant.id, userId: other.id });

    await expectRejectedBy(
      createSession({ userId: owner.id, activeStaffMembershipId: foreignMembership.id }),
      "sessions_user_id_active_staff_membership_id_fkey",
    );
  });

  it("rechaza el registro de paciente de otra cuenta", async () => {
    const [tenant, owner, other] = await Promise.all([createTenant(), createUser(), createUser()]);
    const foreignPatient = await createLinkedPatient({ tenantId: tenant.id, userId: other.id });

    await expectRejectedBy(
      createSession({ userId: owner.id, activePatientId: foreignPatient.id }),
      "sessions_user_id_active_patient_id_fkey",
    );
  });

  it("rechaza tener a la vez un vínculo de personal y uno de paciente", async () => {
    const [tenantA, tenantB, user] = await Promise.all([createTenant(), createTenant(), createUser()]);
    const membership = await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    const patient = await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });

    await expectRejectedBy(
      createSession({
        userId: user.id,
        activeStaffMembershipId: membership.id,
        activePatientId: patient.id,
      }),
      "sessions_single_active_context",
    );
  });

  it("resuelve solo la clínica del vínculo activo aunque la persona pertenezca a otra", async () => {
    const [tenantA, tenantB, user] = await Promise.all([createTenant(), createTenant(), createUser()]);
    const membershipA = await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });
    const session = await createSession({ userId: user.id, activeStaffMembershipId: membershipA.id });

    const result = await resolve(session.tokenHash);

    expect(result.clinic?.tenantId).toBe(tenantA.id);
    expect(result.clinic?.tenantId).not.toBe(tenantB.id);
  });

  it("mantiene independientes las clínicas activas de dos sesiones de la misma cuenta", async () => {
    const [tenantA, tenantB, user] = await Promise.all([createTenant(), createTenant(), createUser()]);
    const membershipA = await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    const patientB = await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });
    const first = await createSession({ userId: user.id, activeStaffMembershipId: membershipA.id });
    const second = await createSession({ userId: user.id, activePatientId: patientB.id });

    expect((await resolve(first.tokenHash)).clinic?.tenantId).toBe(tenantA.id);
    expect((await resolve(second.tokenHash)).clinic?.tenantId).toBe(tenantB.id);
  });
});
