import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvFile } from "dotenv";

// Las pruebas E2E leen DATABASE_URL de .env.local para preparar datos; en CI viene del entorno.
loadEnvFile({ path: ".env.local", quiet: true });

const BASE_URL = "http://localhost:3000";
const BUILD_TIMEOUT_MS = 180_000;

const isContinuousIntegration = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 2 : 0,
  // El reporte HTML queda esperando al abrirse tras un fallo y bloquearía a los agentes.
  reporter: "list",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  // La constitución exige que cada vista funcione en escritorio, tablet y móvil.
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablet", use: { ...devices["Galaxy Tab S4"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !isContinuousIntegration,
    timeout: BUILD_TIMEOUT_MS,
    // El servidor de pruebas usa el proveedor de identidad simulado, sin AWS, y la misma base
    // local que las pruebas de integración.
    env: {
      IDENTITY_PROVIDER: "fake",
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
  },
});
