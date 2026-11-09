import { beforeEach, describe, expect, it } from "vitest";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

async function createClinicWithDoctorAndPatient() {
  const tenant = await createTenant();
  const doctorUser = await createUser();
  const patientUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });

  return { tenant, doctorUser, doctor, patient };
}

describe("Información separada por clínica (historia 1)", () => {
  it("acepta una asignación entre un médico y un paciente de la misma clínica", async () => {
    const clinic = await createClinicWithDoctorAndPatient();

    const assignment = await createAssignment({
      tenantId: clinic.tenant.id,
      membershipId: clinic.doctor.id,
      patientId: clinic.patient.id,
      createdByUserId: clinic.doctorUser.id,
    });

    expect(assignment.tenantId).toBe(clinic.tenant.id);
  });

  it("rechaza una asignación entre el médico de la clínica A y el paciente de la clínica B", async () => {
    const clinicA = await createClinicWithDoctorAndPatient();
    const clinicB = await createClinicWithDoctorAndPatient();

    await expectRejectedBy(
      createAssignment({
        tenantId: clinicA.tenant.id,
        membershipId: clinicA.doctor.id,
        patientId: clinicB.patient.id,
        createdByUserId: clinicA.doctorUser.id,
      }),
      "doctor_patient_assignments_tenant_id_patient_id_fkey",
    );
  });

  it("rechaza una asignación entre el paciente de la clínica A y el médico de la clínica B", async () => {
    const clinicA = await createClinicWithDoctorAndPatient();
    const clinicB = await createClinicWithDoctorAndPatient();

    await expectRejectedBy(
      createAssignment({
        tenantId: clinicA.tenant.id,
        membershipId: clinicB.doctor.id,
        patientId: clinicA.patient.id,
        createdByUserId: clinicA.doctorUser.id,
      }),
      "doctor_patient_assignments_tenant_id_membership_id_fkey",
    );
  });

  it("rechaza una membresía, un paciente y una asignación sin clínica", async () => {
    const clinic = await createClinicWithDoctorAndPatient();

    await expectRejectedBy(
      prismaClient.$executeRaw`
        INSERT INTO "staff_memberships" ("id", "user_id", "is_clinic_admin", "updated_at")
        VALUES (gen_random_uuid(), ${clinic.doctorUser.id}::uuid, true, now())`,
      'null value in column "tenant_id"',
    );

    await expectRejectedBy(
      prismaClient.$executeRaw`
        INSERT INTO "patients" ("id", "document_type", "document_number", "updated_at")
        VALUES (gen_random_uuid(), 'DNI', '999', now())`,
      'null value in column "tenant_id"',
    );

    await expectRejectedBy(
      prismaClient.$executeRaw`
        INSERT INTO "doctor_patient_assignments"
          ("id", "membership_id", "patient_id", "created_by_user_id")
        VALUES (gen_random_uuid(), ${clinic.doctor.id}::uuid, ${clinic.patient.id}::uuid,
                ${clinic.doctorUser.id}::uuid)`,
      'null value in column "tenant_id"',
    );
  });

  it("obtiene los registros de una clínica filtrando solo por esa clínica", async () => {
    const clinicA = await createClinicWithDoctorAndPatient();
    const clinicB = await createClinicWithDoctorAndPatient();

    await createAssignment({
      tenantId: clinicA.tenant.id,
      membershipId: clinicA.doctor.id,
      patientId: clinicA.patient.id,
      createdByUserId: clinicA.doctorUser.id,
    });
    await createAssignment({
      tenantId: clinicB.tenant.id,
      membershipId: clinicB.doctor.id,
      patientId: clinicB.patient.id,
      createdByUserId: clinicB.doctorUser.id,
    });

    const where = { tenantId: clinicA.tenant.id };
    const [memberships, patients, assignments] = await Promise.all([
      prismaClient.staffMembership.findMany({ where }),
      prismaClient.patient.findMany({ where }),
      prismaClient.doctorPatientAssignment.findMany({ where }),
    ]);

    expect(memberships.map((record) => record.id)).toEqual([clinicA.doctor.id]);
    expect(patients.map((record) => record.id)).toEqual([clinicA.patient.id]);
    expect(assignments).toHaveLength(1);
    expect(assignments[0]?.membershipId).toBe(clinicA.doctor.id);
  });
});
