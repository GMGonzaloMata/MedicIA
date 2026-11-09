import { randomUUID } from "node:crypto";

import { Pool } from "pg";

import { fakeSubjectForEmail } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { assertLocalDatabaseUrl } from "./local-database";

const MINUTE_MS = 60 * 1000;
const EPOCH = new Date(0);

// Acceso a la base para preparar y alterar datos en las pruebas E2E. Playwright corre los archivos
// como CommonJS y no puede cargar el cliente de Prisma generado (usa `import.meta`), así que
// escribe SQL directo con `pg`. Se niega a correr si la base no es local. Los datos llevan nombres y
// correos únicos, porque los tres proyectos (escritorio, tablet y móvil) corren a la vez contra la
// misma base y no se vacía entre pruebas.
export function createE2eDatabase() {
  const pool = new Pool({ connectionString: assertLocalDatabaseUrl(process.env.DATABASE_URL) });

  return {
    // Crea la cuenta propia con el mismo `subject` que usa el proveedor simulado, para poder
    // vincularla a una clínica antes de que la persona ingrese por primera vez.
    async seedUser({ email, fullName }: { email: string; fullName: string }) {
      const id = randomUUID();

      await pool.query(
        `INSERT INTO users (id, cognito_sub, email, full_name, updated_at) VALUES ($1, $2, $3, $4, now())`,
        [id, fakeSubjectForEmail(email), email, fullName],
      );

      return { id };
    },

    async seedTenant(name: string) {
      const id = randomUUID();

      await pool.query(`INSERT INTO tenants (id, name, updated_at) VALUES ($1, $2, now())`, [id, name]);

      return { id };
    },

    async linkAsClinicAdmin({ userId, tenantId }: { userId: string; tenantId: string }) {
      const id = randomUUID();

      await pool.query(
        `INSERT INTO staff_memberships (id, tenant_id, user_id, is_clinic_admin, is_doctor, updated_at)
         VALUES ($1, $2, $3, true, false, now())`,
        [id, tenantId, userId],
      );

      return { id };
    },

    async linkAsLinkedPatient({
      userId,
      tenantId,
      documentNumber,
    }: {
      userId: string;
      tenantId: string;
      documentNumber: string;
    }) {
      const id = randomUUID();

      await pool.query(
        `INSERT INTO patients (id, tenant_id, user_id, document_type, document_number, full_name, status, linked_at, updated_at)
         VALUES ($1, $2, $3, 'DNI', $4, 'Paciente de prueba', 'LINKED', now(), now())`,
        [id, tenantId, userId, documentNumber],
      );

      return { id };
    },

    async setTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
      await pool.query(`UPDATE tenants SET status = $2, updated_at = now() WHERE id = $1`, [tenantId, status]);
    },

    // Simula el paso del tiempo: deja las sesiones de la cuenta con la última actividad de hace
    // `minutes` minutos, sin que la fecha de alta de la cuenta las invalide.
    async ageSessions({ userId, minutes }: { userId: string; minutes: number }) {
      const lastActivityAt = new Date(Date.now() - minutes * MINUTE_MS);
      const createdAt = new Date(lastActivityAt.getTime() - MINUTE_MS);

      await pool.query(`UPDATE users SET sessions_valid_from = $2 WHERE id = $1`, [userId, EPOCH]);
      await pool.query(`UPDATE sessions SET created_at = $2, last_activity_at = $3 WHERE user_id = $1`, [
        userId,
        createdAt,
        lastActivityAt,
      ]);
    },

    close(): Promise<void> {
      return pool.end();
    },
  };
}

export type E2eDatabase = ReturnType<typeof createE2eDatabase>;

// Correo único por llamada, para que las pruebas no choquen entre sí ni con corridas anteriores.
export function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function uniqueName(prefix: string): string {
  return `${prefix} ${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}
