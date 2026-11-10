// Datos de prueba para la carga de estudios (specs/006-carga-estudios-ecg, FR-020): dos clínicas, un
// administrador, médicos, pacientes vinculados y asignaciones. Sirve para probar a mano porque todavía no
// hay pantallas para registrar pacientes ni asignar médicos.
//
// Uso (desde la raíz, con la base local levantada con `docker compose up -d`):
//   npm run seed:demo
//
// Se puede repetir sin duplicar nada. Se niega a correr si DATABASE_URL no apunta a una base local.
// Escribe con `pg` y SQL directo (como las pruebas E2E): no necesita el cliente generado de Prisma.
//
// Las cuentas se crean con el proveedor de identidad simulado (IDENTITY_PROVIDER=fake) en mente: la fila
// de usuario usa el mismo identificador que ese proveedor calcula por correo, así que la persona se registra
// con ese correo (código de verificación 000000) y ya queda vinculada. Con Cognito real hay que registrar
// primero las cuentas por la interfaz y recién después correr este script: usa las que ya existen.

import { createHash, randomUUID } from "node:crypto";

import pg from "pg";

// Es un archivo de apoyo de las pruebas, pero la lógica es la misma que se necesita acá.
import { assertLocalDatabaseUrl } from "../tests/support/local-database.ts";

const DOCUMENT_TYPE = "DNI";

interface DemoPerson {
  email: string;
  fullName: string;
}

export const DEMO_PEOPLE = {
  adminA: { email: "admin-a@demo.medicia.test", fullName: "Admin Clínica A" },
  doctor1A: { email: "medico1-a@demo.medicia.test", fullName: "Dra. Lucía Ferrer" },
  doctor2A: { email: "medico2-a@demo.medicia.test", fullName: "Dr. Martín Aldao" },
  patient1A: { email: "paciente1-a@demo.medicia.test", fullName: "Paciente Uno A" },
  patient2A: { email: "paciente2-a@demo.medicia.test", fullName: "Paciente Dos A" },
  patient3A: { email: "paciente3-a@demo.medicia.test", fullName: "Paciente Tres A" },
  doctorB: { email: "medico-b@demo.medicia.test", fullName: "Dra. Inés Soria" },
  patientB: { email: "paciente-b@demo.medicia.test", fullName: "Paciente Uno B" },
} as const satisfies Record<string, DemoPerson>;

type DemoKey = keyof typeof DEMO_PEOPLE;

// Matrículas de prueba, únicas dentro de cada clínica.
const DOCTOR_LICENSES: Partial<Record<DemoKey, string>> = {
  doctor1A: "MP-DEMO-1",
  doctor2A: "MP-DEMO-2",
  doctorB: "MP-DEMO-3",
};

export const DEMO_TENANTS = { a: "Clínica de prueba A", b: "Clínica de prueba B" } as const;

// Quién es médico, quién paciente y quién atiende a quién. P1 y P2 son de M1; P3 es de M2; la clínica B va aparte.
const PLAN = {
  clinicA: {
    tenant: DEMO_TENANTS.a,
    admin: "adminA",
    doctors: ["doctor1A", "doctor2A"],
    patients: [
      { key: "patient1A", documentNumber: "30000001", doctor: "doctor1A" },
      { key: "patient2A", documentNumber: "30000002", doctor: "doctor1A" },
      { key: "patient3A", documentNumber: "30000003", doctor: "doctor2A" },
    ],
  },
  clinicB: {
    tenant: DEMO_TENANTS.b,
    admin: null,
    doctors: ["doctorB"],
    patients: [{ key: "patientB", documentNumber: "30000011", doctor: "doctorB" }],
  },
} as const;

// Mismo cálculo que `fakeSubjectForEmail` (src/modules/users/infrastructure/adapters/in-memory-identity-provider.ts).
// Una prueba comprueba que no se desvíen. Se repite acá porque este archivo no puede importar código de `src/`
// (usa importaciones sin extensión).
export function fakeSubject(email: string): string {
  const hash = createHash("sha256").update(email).digest("hex");

  return [hash.slice(0, 8), hash.slice(8, 12), hash.slice(12, 16), hash.slice(16, 20), hash.slice(20, 32)].join("-");
}

type Queryable = Pick<pg.PoolClient, "query">;

async function ensureUser(db: Queryable, person: DemoPerson): Promise<string> {
  const existing = await db.query<{ id: string }>(`SELECT id FROM users WHERE email = $1`, [person.email]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = randomUUID();
  await db.query(`INSERT INTO users (id, cognito_sub, email, full_name, updated_at) VALUES ($1, $2, $3, $4, now())`, [
    id,
    fakeSubject(person.email),
    person.email,
    person.fullName,
  ]);

  return id;
}

async function ensureTenant(db: Queryable, name: string): Promise<string> {
  const existing = await db.query<{ id: string }>(`SELECT id FROM tenants WHERE name = $1`, [name]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = randomUUID();
  await db.query(`INSERT INTO tenants (id, name, updated_at) VALUES ($1, $2, now())`, [id, name]);

  return id;
}

// Un médico necesita especialidad y matrícula (restricción `staff_memberships_doctor_fields`); un integrante que
// no es médico no puede tenerlas. La matrícula es única dentro de la clínica.
async function ensureMembership(
  db: Queryable,
  input: { tenantId: string; userId: string; isClinicAdmin: boolean; isDoctor: boolean; licenseNumber?: string },
): Promise<string> {
  const existing = await db.query<{ id: string }>(
    `SELECT id FROM staff_memberships WHERE tenant_id = $1 AND user_id = $2`,
    [input.tenantId, input.userId],
  );
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO staff_memberships (id, tenant_id, user_id, is_clinic_admin, is_doctor, specialty, license_number, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())`,
    [
      id,
      input.tenantId,
      input.userId,
      input.isClinicAdmin,
      input.isDoctor,
      input.isDoctor ? "Cardiología" : null,
      input.isDoctor ? (input.licenseNumber ?? null) : null,
    ],
  );

  return id;
}

async function ensurePatient(
  db: Queryable,
  input: { tenantId: string; userId: string; fullName: string; documentNumber: string },
): Promise<string> {
  const existing = await db.query<{ id: string }>(`SELECT id FROM patients WHERE tenant_id = $1 AND user_id = $2`, [
    input.tenantId,
    input.userId,
  ]);
  if (existing.rows[0]) {
    return existing.rows[0].id;
  }

  const id = randomUUID();
  await db.query(
    `INSERT INTO patients (id, tenant_id, user_id, document_type, document_number, full_name, status, linked_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'LINKED', now(), now())`,
    [id, input.tenantId, input.userId, DOCUMENT_TYPE, input.documentNumber, input.fullName],
  );

  return id;
}

async function ensureAssignment(
  db: Queryable,
  input: { tenantId: string; membershipId: string; patientId: string; createdByUserId: string },
): Promise<void> {
  await db.query(
    `INSERT INTO doctor_patient_assignments (id, tenant_id, membership_id, patient_id, created_by_user_id)
     SELECT $1, $2, $3, $4, $5
     WHERE NOT EXISTS (
       SELECT 1 FROM doctor_patient_assignments
       WHERE membership_id = $3 AND patient_id = $4 AND ended_at IS NULL
     )`,
    [randomUUID(), input.tenantId, input.membershipId, input.patientId, input.createdByUserId],
  );
}

export async function seedDemoClinics(db: Queryable): Promise<void> {
  const userIds = new Map<DemoKey, string>();
  for (const [key, person] of Object.entries(DEMO_PEOPLE) as [DemoKey, DemoPerson][]) {
    userIds.set(key, await ensureUser(db, person));
  }
  const userId = (key: DemoKey): string => userIds.get(key) as string;

  for (const clinic of [PLAN.clinicA, PLAN.clinicB]) {
    const tenantId = await ensureTenant(db, clinic.tenant);

    if (clinic.admin) {
      await ensureMembership(db, { tenantId, userId: userId(clinic.admin), isClinicAdmin: true, isDoctor: false });
    }

    const membershipByDoctor = new Map<DemoKey, string>();
    for (const doctor of clinic.doctors) {
      membershipByDoctor.set(
        doctor,
        await ensureMembership(db, {
          tenantId,
          userId: userId(doctor),
          isClinicAdmin: false,
          isDoctor: true,
          licenseNumber: DOCTOR_LICENSES[doctor],
        }),
      );
    }

    for (const patient of clinic.patients) {
      const patientId = await ensurePatient(db, {
        tenantId,
        userId: userId(patient.key),
        fullName: DEMO_PEOPLE[patient.key].fullName,
        documentNumber: patient.documentNumber,
      });

      await ensureAssignment(db, {
        tenantId,
        membershipId: membershipByDoctor.get(patient.doctor) as string,
        patientId,
        createdByUserId: userId(patient.doctor),
      });
    }
  }
}

function describeAccounts(): string {
  return (Object.keys(DEMO_PEOPLE) as DemoKey[]).map((key) => `  ${DEMO_PEOPLE[key].email}  (${DEMO_PEOPLE[key].fullName})`).join("\n");
}

async function main(): Promise<void> {
  if (process.argv.includes("--help")) {
    console.log(`Crea las clínicas, los médicos, los pacientes y las asignaciones de prueba.\n\nCuentas:\n${describeAccounts()}`);
    return;
  }

  const pool = new pg.Pool({ connectionString: assertLocalDatabaseUrl(process.env.DATABASE_URL) });
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await seedDemoClinics(client);
    await client.query("COMMIT");
    console.log("Datos de prueba listos. Registrá cada cuenta con su correo (código 000000) para poder ingresar:");
    console.log(describeAccounts());
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

// Solo corre al ejecutarlo como script, no al importarlo desde una prueba.
if (process.argv[1] && import.meta.url === new URL(`file:///${process.argv[1].replaceAll("\\", "/")}`).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Error desconocido");
    process.exitCode = 1;
  });
}
