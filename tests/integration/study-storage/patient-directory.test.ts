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

const RECENT_SINCE = new Date("2026-11-01T00:00:00Z");

const list = (tenantId: string, membershipId: string, page = 1, pageSize = 20) =>
  prismaPatientDirectory.listAssignedPatients({ tenantId, membershipId, page, pageSize, sort: "name", recentSince: RECENT_SINCE });

async function addStudies(tenantId: string, patientId: string, uploadedByUserId: string, dates: string[]) {
  await prismaClient.study.createMany({
    data: dates.map((date, index) => ({
      tenantId,
      patientId,
      uploadedByUserId,
      number: index + 1,
      uploadedAt: new Date(date),
      storageKey: `studies/${tenantId}/${patientId}-${index + 1}.ecg1`,
    })),
  });
}

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

  it("busca un paciente asignado solo con asignación vigente en su clínica", async () => {
    const { tenant, doctor, otherDoctor, assign } = await setup();
    const patient = await linkedPatient(tenant.id, "Asignado");
    await assign(doctor.id, patient.id);
    const input = { tenantId: tenant.id, membershipId: doctor.id, patientId: patient.id };

    expect(await prismaPatientDirectory.findAssignedPatient(input)).toMatchObject({
      id: patient.id,
      fullName: "Asignado",
      studyCount: 0,
    });
    expect(await prismaPatientDirectory.findAssignedPatient({ ...input, membershipId: otherDoctor.id })).toBeNull();
    expect(await prismaPatientDirectory.findAssignedPatient({ ...input, tenantId: (await createTenant()).id })).toBeNull();
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

  it("muestra el último estudio y ordena por él, con los pacientes sin estudios al final", async () => {
    const { tenant, doctor, admin, assign } = await setup();
    const ana = await linkedPatient(tenant.id, "Ana");
    const beto = await linkedPatient(tenant.id, "Beto");
    const ciro = await linkedPatient(tenant.id, "Ciro");
    for (const patient of [ana, beto, ciro]) {
      await assign(doctor.id, patient.id);
    }
    await addStudies(tenant.id, ana.id, admin.id, ["2026-10-01T10:00:00Z", "2026-10-05T10:00:00Z"]);
    await addStudies(tenant.id, ciro.id, admin.id, ["2026-11-20T10:00:00Z"]);

    const result = await prismaPatientDirectory.listAssignedPatients({
      tenantId: tenant.id,
      membershipId: doctor.id,
      page: 1,
      pageSize: 20,
      sort: "recent",
      recentSince: RECENT_SINCE,
    });

    expect(result.items.map((patient) => patient.fullName)).toEqual(["Ciro", "Ana", "Beto"]);
    expect(result.items[1]?.lastStudy).toEqual({ number: 2, uploadedAt: new Date("2026-10-05T10:00:00Z") });
    expect(result.items[2]?.lastStudy).toBeNull();
  });

  it("busca por nombre o documento y filtra sobre todos los pacientes asignados, nunca los ajenos", async () => {
    const { tenant, doctor, otherDoctor, admin, assign } = await setup();
    const maria = await linkedPatient(tenant.id, "María González");
    const carlos = await linkedPatient(tenant.id, "Carlos Méndez");
    const ajena = await linkedPatient(tenant.id, "María Ajena");
    await assign(doctor.id, maria.id);
    await assign(doctor.id, carlos.id);
    await assign(otherDoctor.id, ajena.id);
    await addStudies(tenant.id, maria.id, admin.id, ["2026-11-20T10:00:00Z"]);
    await addStudies(tenant.id, ajena.id, admin.id, ["2026-11-20T10:00:00Z"]);
    const carlosDocument = (await prismaClient.patient.findUniqueOrThrow({ where: { id: carlos.id } })).documentNumber;
    const query = (input: Partial<Parameters<typeof prismaPatientDirectory.listAssignedPatients>[0]>) =>
      prismaPatientDirectory.listAssignedPatients({
        tenantId: tenant.id,
        membershipId: doctor.id,
        page: 1,
        pageSize: 20,
        recentSince: RECENT_SINCE,
        ...input,
      });
    const names = async (input: Partial<Parameters<typeof prismaPatientDirectory.listAssignedPatients>[0]>) =>
      (await query(input)).items.map((patient) => patient.fullName);

    expect(await names({ search: { name: "maría", document: "maría" } })).toEqual(["María González"]);
    expect(await names({ search: { name: carlosDocument, document: carlosDocument } })).toEqual(["Carlos Méndez"]);
    expect(await names({ filter: "recent" })).toEqual(["María González"]);
    expect(await names({ filter: "without-studies" })).toEqual(["Carlos Méndez"]);
    expect(await names({ search: { name: "zzz", document: "zzz" } })).toEqual([]);
    expect(
      await prismaPatientDirectory.countAssignedPatients({
        tenantId: tenant.id,
        membershipId: doctor.id,
        recentSince: RECENT_SINCE,
      }),
    ).toEqual({ total: 2, recent: 1, withoutStudies: 1 });
    expect(
      await prismaPatientDirectory.countAssignedPatients({
        tenantId: (await createTenant()).id,
        membershipId: doctor.id,
        recentSince: RECENT_SINCE,
      }),
    ).toEqual({ total: 0, recent: 0, withoutStudies: 0 });
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

    // El orden por último estudio lee todos los identificadores: también tiene que resolver a tiempo.
    const recentDurations: number[] = [];
    for (let run = 0; run < 5; run += 1) {
      const start = performance.now();
      await prismaPatientDirectory.listAssignedPatients({
        tenantId: tenant.id,
        membershipId: doctor.id,
        page: 3,
        pageSize: 20,
        sort: "recent",
        recentSince: RECENT_SINCE,
      });
      recentDurations.push(performance.now() - start);
    }
    recentDurations.sort((first, second) => first - second);
    expect(recentDurations[2]).toBeLessThan(200);
  });
});
