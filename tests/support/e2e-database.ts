import { PrismaPg } from "@prisma/adapter-pg";

import { fakeSubjectForEmail } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

import { PrismaClient } from "../../generated/prisma/client";
import { assertLocalDatabaseUrl } from "./local-database";

const MINUTE_MS = 60 * 1000;
const EPOCH = new Date(0);

// Acceso a la base para preparar y alterar datos en las pruebas E2E. Playwright no puede cargar el
// cliente compartido de la aplicación (usa `server-only`), así que arma el suyo. Se niega a correr
// si la base no es local. Los datos llevan nombres y correos únicos, porque los tres proyectos
// (escritorio, tablet y móvil) corren a la vez contra la misma base y no se vacía entre pruebas.
export function createE2eDatabase() {
  const connectionString = assertLocalDatabaseUrl(process.env.DATABASE_URL);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  return {
    // Crea la cuenta propia con el mismo `subject` que usa el proveedor simulado, para poder
    // vincularla a una clínica antes de que la persona ingrese por primera vez.
    async seedUser({ email, fullName }: { email: string; fullName: string }) {
      return prisma.user.create({
        data: { cognitoSub: fakeSubjectForEmail(email), email, fullName },
      });
    },

    async seedTenant(name: string) {
      return prisma.tenant.create({ data: { name } });
    },

    async linkAsClinicAdmin({ userId, tenantId }: { userId: string; tenantId: string }) {
      return prisma.staffMembership.create({
        data: { userId, tenantId, isClinicAdmin: true, isDoctor: false },
      });
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
      return prisma.patient.create({
        data: {
          userId,
          tenantId,
          documentType: "DNI",
          documentNumber,
          fullName: "Paciente de prueba",
          status: "LINKED",
          linkedAt: new Date(),
        },
      });
    },

    async setTenantStatus(tenantId: string, status: "ACTIVE" | "SUSPENDED") {
      await prisma.tenant.update({ where: { id: tenantId }, data: { status } });
    },

    // Simula el paso del tiempo: deja las sesiones de la cuenta con la última actividad de hace
    // `minutes` minutos, sin que la fecha de alta de la cuenta las invalide.
    async ageSessions({ userId, minutes }: { userId: string; minutes: number }) {
      const lastActivityAt = new Date(Date.now() - minutes * MINUTE_MS);

      await prisma.user.update({ where: { id: userId }, data: { sessionsValidFrom: EPOCH } });
      await prisma.session.updateMany({
        where: { userId },
        data: { createdAt: new Date(lastActivityAt.getTime() - MINUTE_MS), lastActivityAt },
      });
    },

    close(): Promise<void> {
      return prisma.$disconnect();
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
