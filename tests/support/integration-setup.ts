import { Client } from "pg";

import { assertLocalDatabaseUrl } from "./local-database";

const REQUIRED_TABLES = [
  "tenants",
  "users",
  "staff_memberships",
  "patients",
  "doctor_patient_assignments",
  "sessions",
  "studies",
  "study_counters",
];

// Preparación global de las pruebas de integración. No ejecuta ningún comando de Prisma:
// solo comprueba que la base sea local y que el responsable ya haya aplicado las migraciones.
export async function setup(): Promise<void> {
  const connectionString = assertLocalDatabaseUrl(process.env.DATABASE_URL);
  const client = new Client({ connectionString });

  try {
    await client.connect();
  } catch {
    throw new Error(
      "No se pudo conectar a la base de pruebas. Levantala con `docker compose up -d` y revisá DATABASE_URL.",
    );
  }

  try {
    const result = await client.query<{ tableName: string }>(
      `SELECT table_name AS "tableName" FROM information_schema.tables WHERE table_schema = 'public'`,
    );
    const existing = new Set(result.rows.map((row) => row.tableName));
    const missing = REQUIRED_TABLES.filter((table) => !existing.has(table));

    if (missing.length > 0) {
      throw new Error(
        `Faltan tablas en la base de pruebas (${missing.join(", ")}). Aplicá las migraciones con \`npx prisma migrate dev\`.`,
      );
    }
  } finally {
    await client.end();
  }
}
