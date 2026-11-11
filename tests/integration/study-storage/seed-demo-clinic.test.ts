import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { assertLocalDatabaseUrl } from "../../support/local-database";
import { prismaClient, resetDatabase } from "../../support/database";
import { DEMO_PEOPLE, seedDemoClinics } from "../../../scripts/seed-demo-clinic.ts";

let client: Client;

beforeAll(async () => {
  client = new Client({ connectionString: assertLocalDatabaseUrl(process.env.DATABASE_URL) });
  await client.connect();
});

afterAll(async () => {
  await client.end();
});

beforeEach(resetDatabase);

async function counts() {
  const [tenants, users, memberships, patients, assignments] = await Promise.all([
    prismaClient.tenant.count(),
    prismaClient.user.count(),
    prismaClient.staffMembership.count(),
    prismaClient.patient.count(),
    prismaClient.doctorPatientAssignment.count(),
  ]);

  return { tenants, users, memberships, patients, assignments };
}

describe("script de datos de prueba", () => {
  it("crea dos clínicas, un administrador, tres médicos, cuatro pacientes y sus asignaciones", async () => {
    await seedDemoClinics(client);

    expect(await counts()).toEqual({
      tenants: 2,
      users: Object.keys(DEMO_PEOPLE).length,
      // Administrador y médico 1 y 2 de la clínica A, más el médico de la B.
      memberships: 4,
      patients: 4,
      assignments: 4,
    });
  });

  it("se puede repetir sin duplicar nada", async () => {
    await seedDemoClinics(client);
    const first = await counts();

    await seedDemoClinics(client);

    expect(await counts()).toEqual(first);
  });

  it("vincula a los pacientes con su médico y deja a P3 con el otro", async () => {
    await seedDemoClinics(client);

    const rows = await prismaClient.doctorPatientAssignment.findMany({
      include: { membership: { include: { user: true } }, patient: true },
    });
    const byPatient = Object.fromEntries(
      rows.map((row) => [row.patient.fullName, row.membership.user.email]),
    );

    expect(byPatient[DEMO_PEOPLE.patient1A.fullName]).toBe(DEMO_PEOPLE.doctor1A.email);
    expect(byPatient[DEMO_PEOPLE.patient2A.fullName]).toBe(DEMO_PEOPLE.doctor1A.email);
    expect(byPatient[DEMO_PEOPLE.patient3A.fullName]).toBe(DEMO_PEOPLE.doctor2A.email);
    expect(byPatient[DEMO_PEOPLE.patientB.fullName]).toBe(DEMO_PEOPLE.doctorB.email);
  });
});
