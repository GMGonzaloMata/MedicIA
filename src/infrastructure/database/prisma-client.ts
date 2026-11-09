import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../../../generated/prisma/client";

const DATABASE_URL_VARIABLE = "DATABASE_URL";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env[DATABASE_URL_VARIABLE];

  if (!connectionString) {
    throw new Error(`Falta la variable de entorno ${DATABASE_URL_VARIABLE}.`);
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// En desarrollo Next.js vuelve a cargar los módulos y crearía un cliente (con su pool de
// conexiones) nuevo en cada recarga, así que la instancia se guarda en `globalThis`.
// El `as unknown as` solo declara esa propiedad extra; el valor guardado siempre es un PrismaClient.
const globalForPrisma = globalThis as unknown as { prismaClient?: PrismaClient };

// Un único cliente por proceso: la constitución exige compartir el PrismaClient.
export const prismaClient = globalForPrisma.prismaClient ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaClient = prismaClient;
}
