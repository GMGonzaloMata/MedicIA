import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createListAvailableClinics } from "@/modules/users/application/use-cases/list-available-clinics";
import { createResolveCurrentSession } from "@/modules/users/application/use-cases/resolve-current-session";
import { createSelectActiveClinic } from "@/modules/users/application/use-cases/select-active-clinic";
import { ClinicUnavailableError } from "@/modules/users/domain/clinic-errors";
import { generateSessionToken, hashSessionToken } from "@/modules/users/domain/session-token";
import { prismaClinicAccessRepository } from "@/modules/users/infrastructure/repositories/prisma-clinic-access-repository";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";

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

beforeEach(resetDatabase);

const listAvailableClinics = createListAvailableClinics({ clinicAccess: prismaClinicAccessRepository });
const selectActiveClinic = createSelectActiveClinic({
  resolveCurrentSession: createResolveCurrentSession({ sessions: prismaSessionRepository, now: () => new Date() }),
  clinicAccess: prismaClinicAccessRepository,
  sessions: prismaSessionRepository,
});

// Una cuenta con una sesión abierta cuyo identificador conocemos, como lo tendría su navegador.
async function signedInUser() {
  const user = await createUser({ sessionsValidFrom: new Date(0) });
  const token = generateSessionToken();
  const session = await createSession({ userId: user.id, tokenHash: hashSessionToken(token) });

  return { user, token, session };
}

async function activeRelationshipOf(sessionId: string) {
  const row = await prismaClient.session.findUniqueOrThrow({ where: { id: sessionId } });

  return { staff: row.activeStaffMembershipId, patient: row.activePatientId };
}

describe("Lista de clínicas disponibles (FR-017, SC-006)", () => {
  it("ofrece solo membresías activas y pacientes vinculados en clínicas activas", async () => {
    const { user } = await signedInUser();
    const [active, suspended, deactivated, revoked, pending] = await Promise.all([
      createTenant({ name: "Activa" }),
      createTenant({ name: "Suspendida", status: "SUSPENDED" }),
      createTenant({ name: "Desactivada" }),
      createTenant({ name: "Revocada" }),
      createTenant({ name: "Pendiente" }),
    ]);

    await createDoctorMembership({ tenantId: active.id, userId: user.id });
    await createStaffMembership({ tenantId: suspended.id, userId: user.id });
    await createStaffMembership({ tenantId: deactivated.id, userId: user.id, status: "DEACTIVATED" });
    await createLinkedPatient({ tenantId: revoked.id, userId: user.id, status: "REVOKED", revokedAt: new Date() });
    await createPatient({ tenantId: pending.id });

    const clinics = await listAvailableClinics(user.id);

    expect(clinics.map((clinic) => clinic.tenantName)).toEqual(["Activa"]);
  });

  it("muestra ambas clínicas, con su tipo, a quien es personal en una y paciente en otra", async () => {
    const { user } = await signedInUser();
    const [staffTenant, patientTenant] = await Promise.all([
      createTenant({ name: "Como personal" }),
      createTenant({ name: "Como paciente" }),
    ]);

    await createStaffMembership({ tenantId: staffTenant.id, userId: user.id });
    await createLinkedPatient({ tenantId: patientTenant.id, userId: user.id });

    const clinics = await listAvailableClinics(user.id);

    // La lista va ordenada por nombre de clínica.
    expect(clinics.map((clinic) => [clinic.kind, clinic.tenantName])).toEqual([
      ["PATIENT", "Como paciente"],
      ["STAFF", "Como personal"],
    ]);
  });

  it("no ofrece nada a quien no tiene vínculos", async () => {
    const { user } = await signedInUser();

    expect(await listAvailableClinics(user.id)).toEqual([]);
  });
});

describe("Elegir la clínica activa (FR-022, SC-003)", () => {
  it("activa un vínculo propio y vigente", async () => {
    const { user, token, session } = await signedInUser();
    const tenant = await createTenant();
    const membership = await createStaffMembership({ tenantId: tenant.id, userId: user.id });

    await selectActiveClinic({ token, kind: "STAFF", relationshipId: membership.id });

    expect(await activeRelationshipOf(session.id)).toEqual({ staff: membership.id, patient: null });
  });

  it("al cambiar de la clínica A a la B deja la sesión solo con B", async () => {
    const { user, token, session } = await signedInUser();
    const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
    const membership = await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    const patient = await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });

    await selectActiveClinic({ token, kind: "STAFF", relationshipId: membership.id });
    await selectActiveClinic({ token, kind: "PATIENT", relationshipId: patient.id });

    expect(await activeRelationshipOf(session.id)).toEqual({ staff: null, patient: patient.id });
  });

  it("rechaza un vínculo de otra cuenta, de una clínica suspendida o inexistente con el mismo error", async () => {
    const { user, token, session } = await signedInUser();
    const [tenant, suspended, other] = await Promise.all([
      createTenant(),
      createTenant({ status: "SUSPENDED" }),
      createUser(),
    ]);
    const foreign = await createStaffMembership({ tenantId: tenant.id, userId: other.id });
    const inSuspended = await createStaffMembership({ tenantId: suspended.id, userId: user.id });
    const own = await createStaffMembership({ tenantId: tenant.id, userId: user.id });

    await selectActiveClinic({ token, kind: "STAFF", relationshipId: own.id });

    for (const relationshipId of [foreign.id, inSuspended.id, randomUUID()]) {
      await expect(selectActiveClinic({ token, kind: "STAFF", relationshipId })).rejects.toBeInstanceOf(
        ClinicUnavailableError,
      );
    }

    // Los rechazos no tocan la clínica que ya estaba activa.
    expect(await activeRelationshipOf(session.id)).toEqual({ staff: own.id, patient: null });
  });

  it("rechaza a quien ya no tiene una sesión vigente", async () => {
    const { user, token, session } = await signedInUser();
    const tenant = await createTenant();
    const membership = await createStaffMembership({ tenantId: tenant.id, userId: user.id });

    await prismaSessionRepository.revokeByTokenHash({ tokenHash: hashSessionToken(token), now: new Date() });

    await expect(selectActiveClinic({ token, kind: "STAFF", relationshipId: membership.id })).rejects.toBeInstanceOf(
      ClinicUnavailableError,
    );
    expect(await activeRelationshipOf(session.id)).toEqual({ staff: null, patient: null });
  });
});
