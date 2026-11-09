import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Prisma 7 no lee las variables de entorno por sí solo, y el proyecto las guarda en .env.local.
config({ path: ".env.local", quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: env("DATABASE_URL") },
});
