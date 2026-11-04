import { defineConfig, devices } from "@playwright/test";

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
  },
});
