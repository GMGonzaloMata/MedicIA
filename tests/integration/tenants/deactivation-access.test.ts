import { beforeEach, describe, expect, it } from "vitest";

import { createDeactivateMember } from "@/modules/tenants/application/use-cases/deactivate-member";
import { createReactivateMember } from "@/modules/tenants/application/use-cases/reactivate-member";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { prismaStaffRepository } from "@/modules/tenants/infrastructure/repositories/prisma-staff-repository";
import { toActiveClinic } from "@/modules/users/domain/active-relationship";
import { evaluateSession } from "@/modules/users/domain/session-policy";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";

import {
  createDoctorMembership,
  createSession,
  createStaffMembership,
  createTenant,
  createUser,
  resetDatabase,
} from "../../support/database";

beforeEach(resetDatabase);

const deactivateMember = createDeactivateMember({ staff: prismaStaffRepository, now: () => new Date() });
const reactivateMember = createReactivateMember({ staff: prismaStaffRepository });

// Resuelve la sesión como lo hace `getAccessContext`: estado de la sesión y clínica activa vigente en cada llamada.
async function resolve(tokenHash: string) {
  const resolved = await prismaSessionRepository.findByTokenHash(tokenHash);

  if (!resolved) {
    return { state: "missing" as const, clinic: null };
  }

  return {
    state: evaluateSession({ session: resolved.session, sessionsValidFrom: resolved.sessionsValidFrom, now: new Date() }),
    clinic: toActiveClinic(resolved.activeRelationship),
  };
}

// FR-009 y SC-005: la desactivación se nota en la siguiente operación, sin esperar a que venza la sesión.
describe("desactivar con una sesión ya abierta", () => {
  it("la clínica deja de resolverse en la siguiente llamada y vuelve al reactivar", async () => {
    const tenant = await createTenant();
    const adminUser = await createUser();
    const admin = await createStaffMembership({ tenantId: tenant.id, userId: adminUser.id });
    const doctorUser = await createUser();
    const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
    const actor: ClinicAdminActor = { tenantId: tenant.id, userId: adminUser.id, membershipId: admin.id };
    const session = await createSession({ userId: doctorUser.id, activeStaffMembershipId: doctor.id });

    expect((await resolve(session.tokenHash)).clinic?.tenantId).toBe(tenant.id);

    await deactivateMember({ actor, membershipId: doctor.id });

    // La sesión sigue vigente, pero ya no devuelve la clínica: no hay un contexto de trabajo.
    const afterDeactivation = await resolve(session.tokenHash);
    expect(afterDeactivation.state).toBe("CURRENT");
    expect(afterDeactivation.clinic).toBeNull();

    await reactivateMember({ actor, membershipId: doctor.id });

    expect((await resolve(session.tokenHash)).clinic?.relationship).toMatchObject({ kind: "STAFF", isDoctor: true });
  });

  it("desactivar en una clínica no afecta la sesión de la misma persona en otra", async () => {
    const [a, b] = await Promise.all([createTenant(), createTenant()]);
    const adminUser = await createUser();
    const admin = await createStaffMembership({ tenantId: a.id, userId: adminUser.id });
    const doctorUser = await createUser();
    const inA = await createDoctorMembership({ tenantId: a.id, userId: doctorUser.id });
    const inB = await createDoctorMembership({ tenantId: b.id, userId: doctorUser.id });
    const sessionB = await createSession({ userId: doctorUser.id, activeStaffMembershipId: inB.id });

    await deactivateMember({ actor: { tenantId: a.id, userId: adminUser.id, membershipId: admin.id }, membershipId: inA.id });

    expect((await resolve(sessionB.tokenHash)).clinic?.tenantId).toBe(b.id);
  });
});
