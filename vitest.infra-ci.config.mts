import { defineConfig } from "vitest/config";

// CI aislada: no carga .env, plugins de aplicación ni preparación de base de datos.
export default defineConfig({
  envDir: false,
  cacheDir: "node_modules/.cache/medicia-infra-ci/vite",
  test: {
    environment: "node",
    globalSetup: [],
    setupFiles: [],
    passWithNoTests: false,
    include: [
      "tests/unit/infra/infra-ci.test.ts",
      "tests/unit/infra/demo-ci.test.ts",
      "tests/unit/infra/demo-activation.test.ts",
      "tests/unit/infra/demo-package.test.ts",
    ],
  },
});
