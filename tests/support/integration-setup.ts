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
  "analyses",
  "staff_invitations",
  "patient_link_codes",
  "patient_link_attempts",
];

// Índices parciales de la funcionalidad 012. Viven en una migración aparte; si falta, las pruebas de unicidad
// pasarían o fallarían por el motivo equivocado, así que se comprueba su existencia.
const REQUIRED_INDEXES = [
  "staff_invitations_one_pending_per_email",
  "patient_link_codes_one_active_per_patient",
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

    const indexes = await client.query<{ indexName: string }>(
      `SELECT indexname AS "indexName" FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const existingIndexes = new Set(indexes.rows.map((row) => row.indexName));
    const missingIndexes = REQUIRED_INDEXES.filter((index) => !existingIndexes.has(index));

    if (missingIndexes.length > 0) {
      throw new Error(
        `Faltan índices en la base de pruebas (${missingIndexes.join(", ")}). Aplicá las migraciones con \`npx prisma migrate dev\`.`,
      );
    }
  } finally {
    await client.end();
  }
}
