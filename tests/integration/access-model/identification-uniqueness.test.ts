import { beforeEach, describe, expect, it } from "vitest";

import {
  createDoctorMembership,
  createPatient,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const DOCUMENT_KEY = "patients_tenant_id_document_type_document_number_key";
const LICENSE_KEY = "staff_memberships_tenant_id_license_number_key";
const DOCTOR_FIELDS_RULE = "staff_memberships_doctor_fields";

describe("Identificación de personas dentro de una clínica (historia 3)", () => {
  it("rechaza el mismo tipo y número de documento en la misma clínica", async () => {
    const tenant = await createTenant();
    await createPatient({ tenantId: tenant.id, documentType: "DNI", documentNumber: "30123456" });

    await expectRejectedBy(
      createPatient({ tenantId: tenant.id, documentType: "DNI", documentNumber: "30123456" }),
      DOCUMENT_KEY,
    );
  });

  it("acepta el mismo documento en otra clínica", async () => {
    const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
    await createPatient({ tenantId: tenantA.id, documentType: "DNI", documentNumber: "30123456" });

    const patient = await createPatient({
      tenantId: tenantB.id,
      documentType: "DNI",
      documentNumber: "30123456",
    });

    expect(patient.tenantId).toBe(tenantB.id);
  });

  it("acepta el mismo número con distinto tipo de documento en una clínica", async () => {
    const tenant = await createTenant();
    await createPatient({ tenantId: tenant.id, documentType: "DNI", documentNumber: "555" });

    await createPatient({ tenantId: tenant.id, documentType: "PASSPORT", documentNumber: "555" });

    expect(await prismaClient.patient.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it("rechaza la misma matrícula en la misma clínica y la acepta en otra", async () => {
    const [tenantA, tenantB, firstUser, secondUser] = await Promise.all([
      createTenant(),
      createTenant(),
      createUser(),
      createUser(),
    ]);
    await createDoctorMembership({
      tenantId: tenantA.id,
      userId: firstUser.id,
      licenseNumber: "MP-1000",
    });

    await expectRejectedBy(
      createDoctorMembership({
        tenantId: tenantA.id,
        userId: secondUser.id,
        licenseNumber: "MP-1000",
      }),
      LICENSE_KEY,
    );

    const inOtherTenant = await createDoctorMembership({
      tenantId: tenantB.id,
      userId: secondUser.id,
      licenseNumber: "MP-1000",
    });
    expect(inOtherTenant.tenantId).toBe(tenantB.id);
  });

  it("acepta dos administradores sin matrícula en la misma clínica", async () => {
    const [tenant, firstUser, secondUser] = await Promise.all([
      createTenant(),
      createUser(),
      createUser(),
    ]);

    await createStaffMembership({ tenantId: tenant.id, userId: firstUser.id });
    await createStaffMembership({ tenantId: tenant.id, userId: secondUser.id });

    expect(await prismaClient.staffMembership.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it("rechaza un médico sin especialidad o sin matrícula, o con alguna vacía", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const base = { tenantId: tenant.id, userId: user.id, isClinicAdmin: false, isDoctor: true };

    await expectRejectedBy(
      createStaffMembership({ ...base, specialty: null, licenseNumber: "MP-1" }),
      DOCTOR_FIELDS_RULE,
    );
    await expectRejectedBy(
      createStaffMembership({ ...base, specialty: "Cardiología", licenseNumber: null }),
      DOCTOR_FIELDS_RULE,
    );
    await expectRejectedBy(
      createStaffMembership({ ...base, specialty: "", licenseNumber: "MP-1" }),
      DOCTOR_FIELDS_RULE,
    );
    await expectRejectedBy(
      createStaffMembership({ ...base, specialty: "Cardiología", licenseNumber: "   " }),
      DOCTOR_FIELDS_RULE,
    );
  });

  it("rechaza especialidad o matrícula en una membresía que no es de médico", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const base = { tenantId: tenant.id, userId: user.id, isClinicAdmin: true, isDoctor: false };

    await expectRejectedBy(
      createStaffMembership({ ...base, specialty: "Cardiología" }),
      DOCTOR_FIELDS_RULE,
    );
    await expectRejectedBy(
      createStaffMembership({ ...base, licenseNumber: "MP-1" }),
      DOCTOR_FIELDS_RULE,
    );
  });

  it("acepta dos pacientes pendientes sin cuenta en la misma clínica con documentos distintos", async () => {
    const tenant = await createTenant();

    await createPatient({ tenantId: tenant.id, documentNumber: "111" });
    await createPatient({ tenantId: tenant.id, documentNumber: "222" });

    expect(await prismaClient.patient.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it("rechaza un número de documento vacío o de solo espacios", async () => {
    const tenant = await createTenant();

    await expectRejectedBy(
      createPatient({ tenantId: tenant.id, documentNumber: "" }),
      "patients_document_number_not_blank",
    );
    await expectRejectedBy(
      createPatient({ tenantId: tenant.id, documentNumber: "   " }),
      "patients_document_number_not_blank",
    );
  });
});
