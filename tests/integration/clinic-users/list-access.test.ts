import { performance } from "node:perf_hooks";
import { beforeEach, describe, expect, it } from "vitest";

import { createListClinicPatients } from "@/modules/users/application/use-cases/list-clinic-patients";
import { createListClinicStaff } from "@/modules/users/application/use-cases/list-clinic-staff";
import { prismaClinicMemberRepository } from "@/modules/users/infrastructure/repositories/prisma-clinic-member-repository";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";

beforeEach(resetDatabase);

const listStaff = createListClinicStaff({ members: prismaClinicMemberRepository });
const listPatients = createListClinicPatients({ members: prismaClinicMemberRepository });

describe("listas de gestión: aislamiento entre clínicas", () => {
  it("un administrador ve solo su clínica aunque la misma cuenta pertenezca a ambas", async () => {
    const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
    const commonUser = await createUser({ fullName: "Admin compartido" });
    const [adminA, adminB] = await Promise.all([
      createStaffMembership({ tenantId: tenantA.id, userId: commonUser.id }),
      createStaffMembership({ tenantId: tenantB.id, userId: commonUser.id }),
    ]);
    const doctorAUser = await createUser({ fullName: "Doctora A" });
    const doctorA = await createDoctorMembership({ tenantId: tenantA.id, userId: doctorAUser.id });
    const doctorBUser = await createUser({ fullName: "Doctor B" });
    await createDoctorMembership({ tenantId: tenantB.id, userId: doctorBUser.id });
    const linked = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    const revoked = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    await prismaClient.patient.update({
      where: { id: revoked.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await createPatient({ tenantId: tenantA.id });
    const patientB = await createLinkedPatient({ tenantId: tenantB.id, userId: (await createUser()).id });
    const active = await createAssignment({
      tenantId: tenantA.id, membershipId: doctorA.id, patientId: linked.id, createdByUserId: commonUser.id,
    });
    const ended = await createAssignment({
      tenantId: tenantA.id, membershipId: doctorA.id, patientId: revoked.id, createdByUserId: commonUser.id,
    });
    await prismaClient.doctorPatientAssignment.update({
      where: { id: ended.id },
      data: { endedAt: new Date(Date.now() + 1000), endedByUserId: commonUser.id },
    });
    const actorA = { tenantId: tenantA.id, userId: commonUser.id, membershipId: adminA.id, isClinicAdmin: true, isDoctor: false };
    const actorB = { ...actorA, tenantId: tenantB.id, membershipId: adminB.id };

    const [staffA, patientsA, staffB, patientsB] = await Promise.all([
      listStaff({ actor: actorA, page: 1 }),
      listPatients({ actor: actorA, page: 1 }),
      listStaff({ actor: actorB, page: 1 }),
      listPatients({ actor: actorB, page: 1 }),
    ]);

    expect(staffA.status).toBe("OK");
    expect(staffB.status).toBe("OK");
    expect(patientsA.status).toBe("OK");
    expect(patientsB.status).toBe("OK");
    if (staffA.status !== "OK" || staffB.status !== "OK" || patientsA.status !== "OK" || patientsB.status !== "OK") return;
    expect(staffA.items.map((item) => item.email)).toEqual([commonUser.email, doctorAUser.email]);
    expect(staffB.items.map((item) => item.email)).toEqual([commonUser.email, doctorBUser.email]);
    expect(new Set(patientsA.items.map((item) => item.status))).toEqual(new Set(["LINKED", "REVOKED", "PENDING"]));
    expect(patientsA.items.find((item) => item.patientId === linked.id)?.doctors).toEqual([
      expect.objectContaining({ assignmentId: active.id, membershipId: doctorA.id }),
    ]);
    expect(patientsA.items.find((item) => item.patientId === revoked.id)?.doctors).toEqual([]);
    expect(patientsA.items.every((item) => item.patientId !== patientB.id)).toBe(true);
    expect(patientsB.items.map((item) => item.patientId)).toEqual([patientB.id]);
  });

  it("devuelve la primera página de 500 integrantes en menos de dos segundos", async () => {
    const tenant = await createTenant();
    const admin = await createUser();
    const membership = await createStaffMembership({ tenantId: tenant.id, userId: admin.id });
    const users = Array.from(Array(499).keys(), (index) => ({
      cognitoSub: `bulk-sub-${index}`,
      email: `bulk-${index}@example.com`,
      fullName: `Médico ${String(index).padStart(3, "0")}`,
    }));
    await prismaClient.user.createMany({ data: users });
    const createdUsers = await prismaClient.user.findMany({
      where: { email: { startsWith: "bulk-" } },
      select: { id: true },
    });
    await prismaClient.staffMembership.createMany({
      data: createdUsers.map((user, index) => ({
        tenantId: tenant.id,
        userId: user.id,
        isClinicAdmin: false,
        isDoctor: true,
        specialty: "Cardiología",
        licenseNumber: `BULK-${index}`,
      })),
    });
    const actor = { tenantId: tenant.id, userId: admin.id, membershipId: membership.id, isClinicAdmin: true, isDoctor: false };

    const start = performance.now();
    const result = await listStaff({ actor, page: 1 });
    const elapsed = performance.now() - start;

    expect(result).toMatchObject({ status: "OK", total: 500, page: 1, pageSize: 25 });
    if (result.status !== "OK") return;
    expect(result.items).toHaveLength(25);
    expect(elapsed).toBeLessThan(2000);
  });
});
