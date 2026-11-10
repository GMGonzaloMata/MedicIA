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

    // Membresía con rol de médico (a diferencia de `linkAsClinicAdmin`, que no lo tiene). Un médico exige
    // especialidad y matrícula; la matrícula sale del identificador para que no se repita.
    async linkAsDoctor({ userId, tenantId }: { userId: string; tenantId: string }) {
      const id = randomUUID();

      await pool.query(
        `INSERT INTO staff_memberships (id, tenant_id, user_id, is_clinic_admin, is_doctor, specialty, license_number, updated_at)
         VALUES ($1, $2, $3, false, true, 'Cardiología', $4, now())`,
        [id, tenantId, userId, `MP-${id.slice(0, 8)}`],
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

    // Registra a un paciente vinculado con nombre y documento propios, para las listas del médico.
    async seedPatient({
      userId,
      tenantId,
      fullName,
      documentNumber,
    }: {
      userId: string;
      tenantId: string;
      fullName: string;
      documentNumber: string;
    }) {
      const id = randomUUID();

      await pool.query(
        `INSERT INTO patients (id, tenant_id, user_id, document_type, document_number, full_name, status, linked_at, updated_at)
         VALUES ($1, $2, $3, 'DNI', $4, $5, 'LINKED', now(), now())`,
        [id, tenantId, userId, documentNumber, fullName],
      );

      return { id };
    },

    // Asignación vigente de un médico a un paciente, creada por la cuenta indicada.
    async assignDoctor({
      tenantId,
      membershipId,
      patientId,
      createdByUserId,
    }: {
      tenantId: string;
      membershipId: string;
      patientId: string;
      createdByUserId: string;
    }) {
      await pool.query(
        `INSERT INTO doctor_patient_assignments (id, tenant_id, membership_id, patient_id, created_by_user_id)
         VALUES ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, membershipId, patientId, createdByUserId],
      );
    },

    // Termina la asignación vigente: el médico pierde el acceso al paciente.
    async endAssignment({
      tenantId,
      membershipId,
      patientId,
      endedByUserId,
    }: {
      tenantId: string;
      membershipId: string;
      patientId: string;
      endedByUserId: string;
    }) {
      await pool.query(
        `UPDATE doctor_patient_assignments SET ended_at = now(), ended_by_user_id = $4
         WHERE tenant_id = $1 AND membership_id = $2 AND patient_id = $3 AND ended_at IS NULL`,
        [tenantId, membershipId, patientId, endedByUserId],
      );
    },

    // Inserta la fila de un estudio con el número siguiente del paciente. No sube ningún objeto: el servidor
    // de la aplicación corre en otro proceso y su almacenamiento simulado no es accesible desde acá. Sirve
    // para listar; eliminar un estudio así borra la fila y no encuentra el objeto, que no es un error.
    async seedStudy({
      tenantId,
      patientId,
      uploadedByUserId,
    }: {
      tenantId: string;
      patientId: string;
      uploadedByUserId: string;
    }) {
      const id = randomUUID();
      const counter = await pool.query<{ lastNumber: number }>(
        `INSERT INTO study_counters (tenant_id, patient_id, last_number) VALUES ($1, $2, 1)
         ON CONFLICT (patient_id) DO UPDATE SET last_number = study_counters.last_number + 1
         RETURNING last_number AS "lastNumber"`,
        [tenantId, patientId],
      );
      const number = counter.rows[0]?.lastNumber ?? 1;

      await pool.query(
        `INSERT INTO studies (id, tenant_id, patient_id, uploaded_by_user_id, number, storage_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, tenantId, patientId, uploadedByUserId, number, `studies/${tenantId}/${id}.ecg1`],
      );

      return { id, number };
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
