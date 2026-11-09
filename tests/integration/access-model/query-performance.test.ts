import { beforeAll, describe, expect, it } from "vitest";

import { createTenant, createUser, prismaClient, resetDatabase } from "../../support/database";

const TENANT_COUNT = 100;
const PATIENTS_IN_LARGEST_TENANT = 10_000;
const PATIENTS_IN_OTHER_TENANTS = 10;
const DOCTORS_IN_LARGEST_TENANT = 20;
const MEASUREMENTS_PER_QUERY = 5;
const MAX_QUERY_MILLISECONDS = 1_000;
const INSERT_CHUNK_SIZE = 2_000;
const SEED_TIMEOUT_MS = 120_000;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

// Mediana de varias mediciones, para que la variación del equipo no cause falsos fallos.
async function medianMilliseconds(query: () => Promise<unknown>): Promise<number> {
  const durations: number[] = [];

  for (let run = 0; run < MEASUREMENTS_PER_QUERY; run += 1) {
    const start = performance.now();
    await query();
    durations.push(performance.now() - start);
  }

  durations.sort((a, b) => a - b);
  return durations[Math.floor(durations.length / 2)] ?? Number.POSITIVE_INFINITY;
}

let personId: string;
let largestTenantId: string;
let doctorMembershipId: string;
let sampledPatientId: string;

beforeAll(async () => {
  await resetDatabase();

  const person = await createUser();
  personId = person.id;

  const tenantIds: string[] = [];
  for (let index = 0; index < TENANT_COUNT; index += 1) {
    tenantIds.push((await createTenant()).id);
  }
  largestTenantId = tenantIds[0] as string;

  // La misma persona pertenece a las 100 clínicas, la peor situación para "clínicas de una persona".
  await prismaClient.staffMembership.createMany({
    data: tenantIds.map((tenantId) => ({ tenantId, userId: person.id, isClinicAdmin: true })),
  });

  const patientRows: { tenantId: string; documentType: "DNI"; documentNumber: string }[] = [];
  for (const tenantId of tenantIds) {
    const count = tenantId === largestTenantId ? PATIENTS_IN_LARGEST_TENANT : PATIENTS_IN_OTHER_TENANTS;
    for (let number = 0; number < count; number += 1) {
      patientRows.push({ tenantId, documentType: "DNI", documentNumber: `${number}` });
    }
  }
  for (const rows of chunk(patientRows, INSERT_CHUNK_SIZE)) {
    await prismaClient.patient.createMany({ data: rows });
  }

  const doctorUsers = await Promise.all(
    Array.from({ length: DOCTORS_IN_LARGEST_TENANT }, () => createUser()),
  );
  await prismaClient.staffMembership.createMany({
    data: doctorUsers.map((user, number) => ({
      tenantId: largestTenantId,
      userId: user.id,
      isDoctor: true,
      specialty: "Clínica médica",
      licenseNumber: `MP-${number}`,
    })),
  });
  const doctors = await prismaClient.staffMembership.findMany({
    where: { tenantId: largestTenantId, isDoctor: true },
  });
  doctorMembershipId = doctors[0]?.id as string;

  const patients = await prismaClient.patient.findMany({ where: { tenantId: largestTenantId } });
  sampledPatientId = patients[0]?.id as string;

  // Cada paciente de la clínica más grande tiene un médico asignado, repartidos entre los 20.
  const assignmentRows = patients.map((patient, number) => ({
    tenantId: largestTenantId,
    membershipId: (doctors[number % doctors.length] as { id: string }).id,
    patientId: patient.id,
    createdByUserId: person.id,
  }));
  for (const rows of chunk(assignmentRows, INSERT_CHUNK_SIZE)) {
    await prismaClient.doctorPatientAssignment.createMany({ data: rows });
  }
}, SEED_TIMEOUT_MS);

describe("Rendimiento de las consultas habituales (SC-004)", () => {
  it("lista las clínicas de una persona en menos de 1 segundo", async () => {
    const duration = await medianMilliseconds(async () => {
      await prismaClient.staffMembership.findMany({
        where: { userId: personId },
        include: { tenant: true },
      });
      await prismaClient.patient.findMany({ where: { userId: personId }, include: { tenant: true } });
    });

    expect(duration).toBeLessThan(MAX_QUERY_MILLISECONDS);
  });

  it("lista los pacientes de un médico en menos de 1 segundo", async () => {
    const duration = await medianMilliseconds(() =>
      prismaClient.doctorPatientAssignment.findMany({
        where: { tenantId: largestTenantId, membershipId: doctorMembershipId, endedAt: null },
        include: { patient: true },
      }),
    );

    expect(duration).toBeLessThan(MAX_QUERY_MILLISECONDS);
  });

  it("lista los médicos de un paciente en menos de 1 segundo", async () => {
    const duration = await medianMilliseconds(() =>
      prismaClient.doctorPatientAssignment.findMany({
        where: { tenantId: largestTenantId, patientId: sampledPatientId, endedAt: null },
        include: { membership: true },
      }),
    );

    expect(duration).toBeLessThan(MAX_QUERY_MILLISECONDS);
  });
});
