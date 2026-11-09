import { beforeEach, describe, expect, it } from "vitest";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const FOREIGN_KEY_ERROR = "Foreign key constraint violated";
const PATIENT_STATE_RULE = "patients_state_fields";
const UPDATE_PAUSE_MS = 20;

async function createClinicWithAssignment() {
  const tenant = await createTenant();
  const doctorUser = await createUser();
  const patientUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });
  const assignment = await createAssignment({
    tenantId: tenant.id,
    membershipId: doctor.id,
    patientId: patient.id,
    createdByUserId: doctorUser.id,
  });

  return { tenant, doctorUser, patientUser, doctor, patient, assignment };
}

describe("Estados sin pérdida de información (historia 5)", () => {
  it("conserva todos los datos al suspender una clínica y se puede reactivar", async () => {
    const clinic = await createClinicWithAssignment();

    await prismaClient.tenant.update({ where: { id: clinic.tenant.id }, data: { status: "SUSPENDED" } });

    const suspended = await prismaClient.tenant.findUniqueOrThrow({ where: { id: clinic.tenant.id } });
    expect(suspended.status).toBe("SUSPENDED");
    expect(await prismaClient.staffMembership.count({ where: { tenantId: clinic.tenant.id } })).toBe(1);
    expect(await prismaClient.patient.count({ where: { tenantId: clinic.tenant.id } })).toBe(1);
    expect(
      await prismaClient.doctorPatientAssignment.count({ where: { tenantId: clinic.tenant.id } }),
    ).toBe(1);

    await prismaClient.tenant.update({ where: { id: clinic.tenant.id }, data: { status: "ACTIVE" } });
    expect(
      (await prismaClient.tenant.findUniqueOrThrow({ where: { id: clinic.tenant.id } })).status,
    ).toBe("ACTIVE");
  });

  it("conserva el registro, el documento y las asignaciones al desactivar personal y revocar un paciente", async () => {
    const clinic = await createClinicWithAssignment();

    await prismaClient.staffMembership.update({
      where: { id: clinic.doctor.id },
      data: { status: "DEACTIVATED" },
    });
    await prismaClient.patient.update({
      where: { id: clinic.patient.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const patient = await prismaClient.patient.findUniqueOrThrow({ where: { id: clinic.patient.id } });
    const membership = await prismaClient.staffMembership.findUniqueOrThrow({
      where: { id: clinic.doctor.id },
    });
    expect(patient.status).toBe("REVOKED");
    expect(patient.documentNumber).toBe(clinic.patient.documentNumber);
    expect(membership.status).toBe("DEACTIVATED");
    expect(
      await prismaClient.doctorPatientAssignment.count({ where: { patientId: clinic.patient.id } }),
    ).toBe(1);
  });

  it("rechaza eliminar registros que tienen otros registros que dependen de ellos", async () => {
    const clinic = await createClinicWithAssignment();

    await expectRejectedBy(
      prismaClient.tenant.delete({ where: { id: clinic.tenant.id } }),
      FOREIGN_KEY_ERROR,
    );
    await expectRejectedBy(
      prismaClient.user.delete({ where: { id: clinic.doctorUser.id } }),
      FOREIGN_KEY_ERROR,
    );
    await expectRejectedBy(
      prismaClient.staffMembership.delete({ where: { id: clinic.doctor.id } }),
      "doctor_patient_assignments_tenant_id_membership_id_fkey",
    );
    await expectRejectedBy(
      prismaClient.patient.delete({ where: { id: clinic.patient.id } }),
      "doctor_patient_assignments_tenant_id_patient_id_fkey",
    );
  });

  it("rechaza un paciente vinculado sin cuenta, sin nombre o sin fecha de vinculación", async () => {
    const tenant = await createTenant();
    const user = await createUser();
    const linked = {
      tenantId: tenant.id,
      status: "LINKED" as const,
      userId: user.id,
      fullName: "Paciente Uno",
      linkedAt: new Date(),
    };

    await expectRejectedBy(createPatient({ ...linked, userId: null }), PATIENT_STATE_RULE);
    await expectRejectedBy(createPatient({ ...linked, fullName: null }), PATIENT_STATE_RULE);
    await expectRejectedBy(createPatient({ ...linked, linkedAt: null }), PATIENT_STATE_RULE);
    await expectRejectedBy(
      createPatient({ ...linked, revokedAt: new Date() }),
      PATIENT_STATE_RULE,
    );
  });

  it("rechaza un paciente pendiente con cuenta o con nombre, y un revocado sin fecha de revocación", async () => {
    const tenant = await createTenant();
    const user = await createUser();

    await expectRejectedBy(
      createPatient({ tenantId: tenant.id, status: "PENDING", userId: user.id }),
      PATIENT_STATE_RULE,
    );
    await expectRejectedBy(
      createPatient({ tenantId: tenant.id, status: "PENDING", fullName: "Alguien" }),
      PATIENT_STATE_RULE,
    );
    await expectRejectedBy(
      createPatient({
        tenantId: tenant.id,
        status: "REVOKED",
        userId: user.id,
        fullName: "Paciente Dos",
        linkedAt: new Date(),
        revokedAt: null,
      }),
      PATIENT_STATE_RULE,
    );
  });

  it("rechaza un nombre de paciente vacío o de solo espacios", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);

    await expectRejectedBy(
      createLinkedPatient({ tenantId: tenant.id, userId: user.id, fullName: "   " }),
      "patients_full_name_not_blank",
    );
  });

  it("reutiliza el mismo registro al revincular a un paciente revocado", async () => {
    const [tenant, user] = await Promise.all([createTenant(), createUser()]);
    const patient = await createLinkedPatient({ tenantId: tenant.id, userId: user.id });
    await prismaClient.patient.update({
      where: { id: patient.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });

    const relinked = await prismaClient.patient.update({
      where: { id: patient.id },
      data: { status: "LINKED", revokedAt: null, linkedAt: new Date() },
    });

    expect(relinked.id).toBe(patient.id);
    expect(relinked.status).toBe("LINKED");
    expect(relinked.revokedAt).toBeNull();
    expect(await prismaClient.patient.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it("registra la fecha de creación en todas las tablas y actualiza la de modificación", async () => {
    const clinic = await createClinicWithAssignment();

    expect(clinic.tenant.createdAt).toBeInstanceOf(Date);
    expect(clinic.doctorUser.createdAt).toBeInstanceOf(Date);
    expect(clinic.doctor.createdAt).toBeInstanceOf(Date);
    expect(clinic.patient.createdAt).toBeInstanceOf(Date);
    expect(clinic.assignment.createdAt).toBeInstanceOf(Date);

    await new Promise((resolve) => setTimeout(resolve, UPDATE_PAUSE_MS));
    const updated = await prismaClient.tenant.update({
      where: { id: clinic.tenant.id },
      data: { name: "Nombre nuevo" },
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThan(clinic.tenant.updatedAt.getTime());
  });

  it("rechaza un nombre de clínica vacío o de solo espacios", async () => {
    await expectRejectedBy(createTenant({ name: "" }), "tenants_name_not_blank");
    await expectRejectedBy(createTenant({ name: "   " }), "tenants_name_not_blank");
  });
});
