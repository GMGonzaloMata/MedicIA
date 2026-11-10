import { beforeEach, describe, expect, it } from "vitest";

import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";

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

beforeEach(resetDatabase);

async function setup() {
  const tenant = await createTenant();
  const admin = await createUser();
  const doctorUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const otherDoctorUser = await createUser();
  const otherDoctor = await createDoctorMembership({ tenantId: tenant.id, userId: otherDoctorUser.id });

  const assign = (membershipId: string, patientId: string) =>
    createAssignment({ tenantId: tenant.id, membershipId, patientId, createdByUserId: admin.id });

  return { tenant, admin, doctor, otherDoctor, assign };
}

// Un paciente vinculado necesita una cuenta propia.
async function linkedPatient(tenantId: string, fullName?: string) {
  return createLinkedPatient({ tenantId, userId: (await createUser()).id, ...(fullName ? { fullName } : {}) });
}

const list = (tenantId: string, membershipId: string, page = 1, pageSize = 20) =>
  prismaPatientDirectory.listAssignedPatients({ tenantId, membershipId, page, pageSize });

describe("pacientes de un médico", () => {
  it("lista exactamente a los pacientes con asignación vigente, ordenados por nombre", async () => {
    const { tenant, doctor, otherDoctor, assign } = await setup();
    const zeta = await linkedPatient(tenant.id, "Zeta");
    const alfa = await linkedPatient(tenant.id, "Alfa");
    const ajeno = await linkedPatient(tenant.id);
    await assign(doctor.id, zeta.id);
    await assign(doctor.id, alfa.id);
    await assign(otherDoctor.id, ajeno.id);

    const result = await list(tenant.id, doctor.id);

    expect(result.items.map((patient) => patient.fullName)).toEqual(["Alfa", "Zeta"]);
    expect(result.totalItems).toBe(2);
  });

  it("no incluye pacientes pendientes ni revocados", async () => {
    const { tenant, doctor, assign } = await setup();
    const pending = await createPatient({ tenantId: tenant.id });
    const revoked = await linkedPatient(tenant.id);
    await prismaClient.patient.update({
      where: { id: revoked.id },
      data: { status: "REVOKED", revokedAt: new Date() },
    });
    await assign(doctor.id, pending.id);
    await assign(doctor.id, revoked.id);

    expect((await list(tenant.id, doctor.id)).items).toEqual([]);
    for (const patient of [pending, revoked]) {
      expect(
        await prismaPatientDirectory.hasActiveAssignment({
          tenantId: tenant.id,
          membershipId: doctor.id,
          patientId: patient.id,
        }),
      ).toBe(false);
    }
  });

  it("una asignación terminada quita el acceso y una nueva lo devuelve", async () => {
    const { tenant, doctor, assign } = await setup();
    const patient = await linkedPatient(tenant.id);
    const first = await assign(doctor.id, patient.id);
    const input = { tenantId: tenant.id, membershipId: doctor.id, patientId: patient.id };

    expect(await prismaPatientDirectory.hasActiveAssignment(input)).toBe(true);

    await prismaClient.doctorPatientAssignment.update({
      where: { id: first.id },
      data: { endedAt: new Date(), endedByUserId: first.createdByUserId },
    });
    expect(await prismaPatientDirectory.hasActiveAssignment(input)).toBe(false);
    expect((await list(tenant.id, doctor.id)).items).toEqual([]);

    await assign(doctor.id, patient.id);
    expect(await prismaPatientDirectory.hasActiveAssignment(input)).toBe(true);
  });

  it("la comprobación de acceso a un paciente ajeno o de otra clínica devuelve falso", async () => {
    const { tenant, doctor, otherDoctor, assign } = await setup();
    const patient = await linkedPatient(tenant.id);
    const otherTenant = await createTenant();
    await assign(otherDoctor.id, patient.id);

    expect(
      await prismaPatientDirectory.hasActiveAssignment({
        tenantId: tenant.id,
        membershipId: doctor.id,
        patientId: patient.id,
      }),
    ).toBe(false);
    expect(
      await prismaPatientDirectory.hasActiveAssignment({
        tenantId: otherTenant.id,
        membershipId: otherDoctor.id,
        patientId: patient.id,
      }),
    ).toBe(false);
  });

  it("cuenta los estudios de cada paciente", async () => {
    const { tenant, doctor, admin, assign } = await setup();
    const patient = await linkedPatient(tenant.id);
    await assign(doctor.id, patient.id);
    await prismaClient.study.createMany({
      data: [1, 2].map((number) => ({
        tenantId: tenant.id,
        patientId: patient.id,
        uploadedByUserId: admin.id,
        number,
        storageKey: `studies/${tenant.id}/${patient.id}-${number}.ecg1`,
      })),
    });

    expect((await list(tenant.id, doctor.id)).items[0]?.studyCount).toBe(2);
  });

  it("pagina y resuelve una página de 500 pacientes en menos de 200 ms", async () => {
    const { tenant, doctor, admin } = await setup();
    const users = Array.from({ length: 500 }, (value, index) => ({
      cognitoSub: `sub-masivo-${index}`,
      email: `masivo${index}@example.com`,
      fullName: `Cuenta ${index}`,
    }));
    await prismaClient.user.createMany({ data: users });
    const createdUsers = await prismaClient.user.findMany({
      where: { cognitoSub: { startsWith: "sub-masivo-" } },
      orderBy: { cognitoSub: "asc" },
      select: { id: true, cognitoSub: true },
    });
    await prismaClient.patient.createMany({
      data: createdUsers.map((user, index) => ({
        tenantId: tenant.id,
        userId: user.id,
        documentType: "DNI" as const,
        documentNumber: `${10_000 + index}`,
        status: "LINKED" as const,
        linkedAt: new Date(),
        fullName: `Paciente ${String(Number(user.cognitoSub.slice("sub-masivo-".length))).padStart(3, "0")}`,
      })),
    });
    const patients = await prismaClient.patient.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    await prismaClient.doctorPatientAssignment.createMany({
      data: patients.map((patient) => ({
        tenantId: tenant.id,
        membershipId: doctor.id,
        patientId: patient.id,
        createdByUserId: admin.id,
        createdAt: new Date(),
      })),
    });
    const durations: number[] = [];
    let result = await list(tenant.id, doctor.id, 3);

    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      result = await list(tenant.id, doctor.id, 3);
      durations.push(performance.now() - start);
    }

    durations.sort((first, second) => first - second);
    expect(result.totalItems).toBe(500);
    expect(result.items).toHaveLength(20);
    expect(result.items[0]?.fullName).toBe("Paciente 040");
    expect(durations[2]).toBeLessThan(200);
  });
});
