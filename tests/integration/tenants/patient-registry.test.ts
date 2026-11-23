import { beforeEach, describe, expect, it } from "vitest";

import { createListDoctorPatients } from "@/modules/studies/application/use-cases/list-doctor-patients";
import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";
import { createAssignPatient } from "@/modules/tenants/application/use-cases/assign-patient";
import { createListClinicPatients } from "@/modules/tenants/application/use-cases/list-clinic-patients";
import { createRegeneratePatientLinkCode } from "@/modules/tenants/application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { nodeSecretGenerator } from "@/modules/tenants/infrastructure/adapters/node-secret-generator";
import { prismaAssignmentRepository } from "@/modules/tenants/infrastructure/repositories/prisma-assignment-repository";
import { prismaPatientRegistryRepository } from "@/modules/tenants/infrastructure/repositories/prisma-patient-registry-repository";
import { prismaStaffRepository } from "@/modules/tenants/infrastructure/repositories/prisma-staff-repository";

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

const now = () => new Date();
const registerPatient = createRegisterPatient({
  patients: prismaPatientRegistryRepository,
  staff: prismaStaffRepository,
  secrets: nodeSecretGenerator,
  now,
});
const listClinicPatients = createListClinicPatients({ patients: prismaPatientRegistryRepository, now });
const regeneratePatientLinkCode = createRegeneratePatientLinkCode({
  patients: prismaPatientRegistryRepository,
  secrets: nodeSecretGenerator,
  now,
});
const assignPatient = createAssignPatient({ assignments: prismaAssignmentRepository });
const listDoctorPatients = createListDoctorPatients({ directory: prismaPatientDirectory });

async function createClinic() {
  const tenant = await createTenant();
  const adminUser = await createUser();
  const admin = await createStaffMembership({ tenantId: tenant.id, userId: adminUser.id });
  const doctorUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const actor: ClinicAdminActor = { tenantId: tenant.id, userId: adminUser.id, membershipId: admin.id };

  return { tenant, actor, doctor, doctorUser };
}

async function register(actor: ClinicAdminActor, documentNumber = "12345678") {
  const result = await registerPatient({ actor, documentType: "DNI", documentNumber });

  if (!result.ok) {
    throw new Error(`No se pudo registrar: ${result.code}`);
  }

  return result;
}

describe("restricciones de la base para pacientes y códigos", () => {
  it("rechaza dos pacientes con el mismo documento en la misma clínica, pero no en otra", async () => {
    const a = await createClinic();
    const b = await createClinic();
    await register(a.actor);

    expect(await registerPatient({ actor: a.actor, documentType: "DNI", documentNumber: "12.345.678" })).toEqual({
      ok: false,
      code: "DUPLICATE_PATIENT",
    });
    expect((await registerPatient({ actor: b.actor, documentType: "DNI", documentNumber: "12345678" })).ok).toBe(true);
    expect(await prismaClient.patient.count({ where: { tenantId: a.tenant.id } })).toBe(1);
    expect(await prismaClient.patientLinkCode.count({ where: { tenantId: a.tenant.id } })).toBe(1);
  });

  it("no deja dos códigos activos para el mismo paciente", async () => {
    const clinic = await createClinic();
    const { patientId } = await register(clinic.actor);

    await expectRejectedBy(
      prismaClient.patientLinkCode.create({
        data: {
          tenantId: clinic.tenant.id,
          patientId,
          codeHash: "otro-hash",
          expiresAt: new Date(Date.now() + 60_000),
          createdByUserId: clinic.actor.userId,
        },
      }),
      "patient_link_codes_one_active_per_patient",
    );
  });

  it("no deja asignar a un paciente a un médico de otra clínica", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const patient = await createPatient({ tenantId: a.tenant.id });

    await expectRejectedBy(
      prismaClient.doctorPatientAssignment.create({
        data: { tenantId: a.tenant.id, patientId: patient.id, membershipId: b.doctor.id, createdByUserId: a.actor.userId },
      }),
      "Foreign key constraint",
    );
  });
});

describe("registrar y regenerar el código", () => {
  it("guarda solo el resumen del código y reemplaza al activo al regenerar", async () => {
    const clinic = await createClinic();
    const first = await register(clinic.actor);

    const second = await regeneratePatientLinkCode({ actor: clinic.actor, patientId: first.patientId });

    expect(second.ok && second.linkCode).not.toBe(first.linkCode);
    const codes = await prismaClient.patientLinkCode.findMany({ where: { patientId: first.patientId }, orderBy: { createdAt: "asc" } });
    expect(codes.map((code) => code.status)).toEqual(["REPLACED", "ACTIVE"]);
    expect(JSON.stringify(codes)).not.toContain(first.linkCode.replace("-", ""));
    expect(codes[0]?.codeHash).toBe(nodeSecretGenerator.hash(first.linkCode.replace("-", "")));
  });

  it("rechaza regenerar el código de un paciente que ya vinculó su cuenta", async () => {
    const clinic = await createClinic();
    const { patientId } = await register(clinic.actor);
    const user = await createUser();
    await prismaClient.patient.update({
      where: { id: patientId },
      data: { status: "LINKED", userId: user.id, fullName: "Ana Paciente", linkedAt: new Date() },
    });

    expect(await regeneratePatientLinkCode({ actor: clinic.actor, patientId })).toEqual({ ok: false, code: "ALREADY_LINKED" });
  });
});

describe("asignar y que el médico vea a su paciente", () => {
  it("el médico asignado lista al paciente vinculado y otro médico de la clínica no", async () => {
    const clinic = await createClinic();
    const otherDoctorUser = await createUser();
    const otherDoctor = await createDoctorMembership({ tenantId: clinic.tenant.id, userId: otherDoctorUser.id });
    const { patientId } = await register(clinic.actor);
    const patientUser = await createUser();
    await prismaClient.patient.update({
      where: { id: patientId },
      data: { status: "LINKED", userId: patientUser.id, fullName: "Ana Paciente", linkedAt: new Date() },
    });

    expect(await assignPatient({ actor: clinic.actor, patientId, membershipId: clinic.doctor.id })).toMatchObject({ ok: true });

    const assigned = await listDoctorPatients({
      actor: { kind: "DOCTOR", tenantId: clinic.tenant.id, userId: clinic.doctorUser.id, membershipId: clinic.doctor.id },
    });
    const other = await listDoctorPatients({
      actor: { kind: "DOCTOR", tenantId: clinic.tenant.id, userId: otherDoctorUser.id, membershipId: otherDoctor.id },
    });

    expect(assigned.items.map((patient) => patient.id)).toEqual([patientId]);
    expect(other.items).toEqual([]);
  });

  it("rechaza la segunda asignación vigente y las de un médico desactivado o que no es médico", async () => {
    const clinic = await createClinic();
    const { patientId } = await register(clinic.actor);
    const deactivatedUser = await createUser();
    const deactivated = await createDoctorMembership({
      tenantId: clinic.tenant.id,
      userId: deactivatedUser.id,
      status: "DEACTIVATED",
    });
    const adminMembership = clinic.actor.membershipId;

    await assignPatient({ actor: clinic.actor, patientId, membershipId: clinic.doctor.id });

    expect(await assignPatient({ actor: clinic.actor, patientId, membershipId: clinic.doctor.id })).toEqual({ ok: false, code: "ALREADY_ASSIGNED" });
    expect(await assignPatient({ actor: clinic.actor, patientId, membershipId: deactivated.id })).toEqual({ ok: false, code: "DOCTOR_DEACTIVATED" });
    expect(await assignPatient({ actor: clinic.actor, patientId, membershipId: adminMembership })).toEqual({ ok: false, code: "NOT_A_DOCTOR" });
    expect(await prismaClient.doctorPatientAssignment.count({ where: { patientId } })).toBe(1);
  });

  it("la lista de la clínica muestra el médico asignado, aunque esté desactivado, y ningún dato clínico", async () => {
    const clinic = await createClinic();
    const { patientId } = await register(clinic.actor);
    await assignPatient({ actor: clinic.actor, patientId, membershipId: clinic.doctor.id });
    await prismaClient.staffMembership.update({
      where: { id: clinic.doctor.id },
      data: { status: "DEACTIVATED", deactivatedAt: new Date() },
    });

    const [patient] = await listClinicPatients({ actor: clinic.actor });

    expect(patient).toMatchObject({
      id: patientId,
      documentNumber: "12345678",
      status: "PENDING",
      linkCodeState: "active",
      assignments: [{ doctorStatus: "DEACTIVATED" }],
    });
    expect(Object.keys(patient ?? {}).sort()).toEqual(
      ["assignments", "documentNumber", "documentType", "fullName", "id", "linkCodeState", "status"],
    );
  });
});

// Requisito de la constitución: cada operación rechaza un identificador de otra clínica.
describe("aislamiento entre clínicas", () => {
  it("un administrador de otra clínica no ve, regenera ni asigna pacientes ajenos", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const { patientId } = await register(a.actor);
    const patientBefore = await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } });

    expect(await listClinicPatients({ actor: b.actor })).toEqual([]);
    expect(await regeneratePatientLinkCode({ actor: b.actor, patientId })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await assignPatient({ actor: b.actor, patientId, membershipId: b.doctor.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await assignPatient({ actor: b.actor, patientId: (await register(b.actor, "99999999")).patientId, membershipId: a.doctor.id })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });

    expect(await prismaClient.patientLinkCode.count({ where: { patientId } })).toBe(1);
    expect(await prismaClient.doctorPatientAssignment.count()).toBe(0);
    expect(await prismaClient.patient.findUniqueOrThrow({ where: { id: patientId } })).toEqual(patientBefore);
  });

  it("registrar con el mismo documento en dos clínicas no mezcla las listas", async () => {
    const a = await createClinic();
    const b = await createClinic();
    await register(a.actor);
    await register(b.actor);

    expect(await listClinicPatients({ actor: a.actor })).toHaveLength(1);
    expect(await listClinicPatients({ actor: b.actor })).toHaveLength(1);
  });
});
