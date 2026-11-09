import { beforeEach, describe, expect, it } from "vitest";

import {
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const MIN_TENANTS_FOR_SAME_ACCOUNT = 5;
const RECENT_TIMESTAMP_MARGIN_MS = 10_000;

describe("Una cuenta, varias clínicas (historia 2)", () => {
  it("permite que una cuenta sea paciente en dos clínicas con dos registros independientes", async () => {
    const [tenantA, tenantB, user] = await Promise.all([
      createTenant(),
      createTenant(),
      createUser(),
    ]);

    await createLinkedPatient({ tenantId: tenantA.id, userId: user.id, documentNumber: "100" });
    await createLinkedPatient({ tenantId: tenantB.id, userId: user.id, documentNumber: "100" });

    const patients = await prismaClient.patient.findMany({ where: { userId: user.id } });

    expect(patients).toHaveLength(2);
    expect(new Set(patients.map((patient) => patient.tenantId))).toEqual(
      new Set([tenantA.id, tenantB.id]),
    );
    expect(await prismaClient.user.count()).toBe(1);
  });

  it("rechaza un segundo registro de paciente de la misma cuenta en la misma clínica", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    await createLinkedPatient({ tenantId: tenant.id, userId: user.id, documentNumber: "100" });

    await expectRejectedBy(
      createLinkedPatient({ tenantId: tenant.id, userId: user.id, documentNumber: "200" }),
      "patients_tenant_id_user_id_key",
    );
  });

  it("rechaza una segunda membresía de la misma cuenta en la misma clínica", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    await createStaffMembership({ tenantId: tenant.id, userId: user.id });

    await expectRejectedBy(
      createDoctorMembership({ tenantId: tenant.id, userId: user.id }),
      "staff_memberships_tenant_id_user_id_key",
    );
  });

  it("acepta una única membresía con los roles de administrador y de médico a la vez", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);

    const membership = await createDoctorMembership({
      tenantId: tenant.id,
      userId: user.id,
      isClinicAdmin: true,
    });

    expect(membership.isClinicAdmin).toBe(true);
    expect(membership.isDoctor).toBe(true);
    expect(await prismaClient.staffMembership.count({ where: { userId: user.id } })).toBe(1);
  });

  it("rechaza una membresía sin ningún rol", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);

    await expectRejectedBy(
      createStaffMembership({ tenantId: tenant.id, userId: user.id, isClinicAdmin: false }),
      "staff_memberships_has_role",
    );
  });

  it("rechaza un correo con mayúsculas y un correo repetido", async () => {
    await createUser({ email: "persona@example.com" });

    await expectRejectedBy(createUser({ email: "PERSONA@example.com" }), "users_email_lowercase");
    await expectRejectedBy(createUser({ email: "persona@example.com" }), "users_email_key");
  });

  it("rechaza un identificador externo repetido", async () => {
    await createUser({ cognitoSub: "sub-repetido" });

    await expectRejectedBy(createUser({ cognitoSub: "sub-repetido" }), "users_cognito_sub_key");
  });

  it("acepta una cuenta sin clínicas y no la marca como administrador de plataforma", async () => {
    const user = await createUser();

    expect(user.isPlatformAdmin).toBe(false);
    expect(await prismaClient.staffMembership.count({ where: { userId: user.id } })).toBe(0);
    expect(await prismaClient.patient.count({ where: { userId: user.id } })).toBe(0);
  });

  it("vincula una misma cuenta a cinco clínicas sin duplicar su correo ni su identidad", async () => {
    const user = await createUser();

    for (let index = 0; index < MIN_TENANTS_FOR_SAME_ACCOUNT; index += 1) {
      const tenant = await createTenant();
      await createStaffMembership({ tenantId: tenant.id, userId: user.id });
    }

    expect(await prismaClient.user.count()).toBe(1);
    expect(await prismaClient.staffMembership.count({ where: { userId: user.id } })).toBe(
      MIN_TENANTS_FOR_SAME_ACCOUNT,
    );
  });

  it("permite ser personal en una clínica y paciente en otra", async () => {
    const [tenantA, tenantB, user] = await Promise.all([
      createTenant(),
      createTenant(),
      createUser(),
    ]);

    await createStaffMembership({ tenantId: tenantA.id, userId: user.id });
    await createLinkedPatient({ tenantId: tenantB.id, userId: user.id });

    expect(await prismaClient.staffMembership.count({ where: { userId: user.id } })).toBe(1);
    expect(await prismaClient.patient.count({ where: { userId: user.id } })).toBe(1);
  });

  it("completa por defecto la fecha desde la que son válidas las sesiones", async () => {
    const user = await createUser();

    expect(Math.abs(Date.now() - user.sessionsValidFrom.getTime())).toBeLessThan(
      RECENT_TIMESTAMP_MARGIN_MS,
    );
  });

  it("rechaza un nombre de cuenta vacío o de solo espacios", async () => {
    await expectRejectedBy(createUser({ fullName: "" }), "users_full_name_not_blank");
    await expectRejectedBy(createUser({ fullName: "   " }), "users_full_name_not_blank");
  });

  it("permite que un paciente pendiente exista sin cuenta", async () => {
    const tenant = await createTenant();

    const patient = await createPatient({ tenantId: tenant.id });

    expect(patient.status).toBe("PENDING");
    expect(patient.userId).toBeNull();
  });
});
