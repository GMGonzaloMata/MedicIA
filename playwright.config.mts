import { resolve } from "node:path";

import { defineConfig, devices } from "@playwright/test";
import { config as loadEnvFile } from "dotenv";
import { isolatedUiTests } from "./tests/support/ui-test-environment.mts";

// El modo aislado exige TEST precargado; nunca carga aquí el entorno de demo.
if (!isolatedUiTests) loadEnvFile({ path: ".env.local", quiet: true });

const BASE_URL = isolatedUiTests ? "http://127.0.0.1:3100" : "http://localhost:3000";
const BUILD_TIMEOUT_MS = 180_000;

const isContinuousIntegration = Boolean(process.env.CI);

// El correo de invitación es el simulado: el servidor escribe cada mensaje en este archivo y las pruebas lo leen.
// Se define antes de arrancar los procesos de prueba para que servidor y pruebas usen la misma ruta.
process.env.FAKE_MAIL_OUTBOX_FILE = resolve(process.env.FAKE_MAIL_OUTBOX_FILE ?? ".tmp/e2e-outbox.jsonl");

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
    command: isolatedUiTests
      ? "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100"
      : "npm run build && npm run start",
    url: BASE_URL,
    reuseExistingServer: !isolatedUiTests && !isContinuousIntegration,
    timeout: BUILD_TIMEOUT_MS,
    // El servidor de pruebas usa el proveedor de identidad simulado, sin AWS, y la misma base
    // local que las pruebas de integración.
    env: {
      IDENTITY_PROVIDER: "fake",
      // Los estudios se guardan en memoria: ninguna prueba usa AWS.
      STUDY_STORAGE: "fake",
      // El modelo es el simulado y tarda 1,5 s: el estado «en curso» se ve siempre y ninguna prueba usa AWS.
      MODEL_INFERENCE: "fake",
      FAKE_MODEL_DELAY_MS: "1500",
      // Ningún correo sale a la red: las invitaciones quedan en un archivo.
      INVITATION_MAILER: "fake",
      FAKE_MAIL_OUTBOX_FILE: process.env.FAKE_MAIL_OUTBOX_FILE,
      APP_BASE_URL: BASE_URL,
      ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
    },
  },
});
