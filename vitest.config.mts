import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { config as loadEnvFile } from "dotenv";
import { defineConfig } from "vitest/config";
import { isolatedUiTests } from "./tests/support/ui-test-environment.mts";

// En Windows, `bash` suele resolver al de WSL, que falla si no hay una distribución instalada. Las pruebas de
// scripts de infraestructura lanzan `bash`, así que se antepone Git Bash (si existe) al PATH de los procesos de prueba.
// En Linux y en CI no hace nada.
if (process.platform === "win32") {
  const gitRoot = `${process.env.ProgramFiles ?? "C:\\Program Files"}\\Git`;
  if (existsSync(`${gitRoot}\\bin\\bash.exe`)) {
    // `usr\bin` trae las herramientas que usan los scripts (openssl, etc.).
    process.env.PATH = `${gitRoot}\\bin;${gitRoot}\\usr\\bin;${process.env.PATH ?? ""}`;
  }
}

// El modo aislado exige TEST precargado; nunca carga aquí el entorno de demo.
if (!isolatedUiTests) loadEnvFile({ path: ".env.local", quiet: true });

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
    alias: {
      // `server-only` lanza un error fuera de Next.js, así que en las pruebas se reemplaza.
      "server-only": fileURLToPath(
        new URL("./tests/support/server-only.ts", import.meta.url),
      ),
    },
  },
  test: {
    coverage: {
      provider: "v8",
      // Solo se mide el código con lógica, donde la constitución exige cobertura.
      // La interfaz queda afuera: un cambio visual no debe requerir pruebas nuevas.
      include: [
        "src/modules/**/*.ts",
        "src/infrastructure/**/*.ts",
        "src/shared/**/*.ts",
      ],
      // Los puertos solo declaran contratos y `composition.ts` solo conecta implementaciones.
      exclude: ["**/application/ports/**", "**/composition.ts"],
      reporter: ["text", "html"],
      // Por archivo, para que un archivo sin pruebas no quede oculto en el promedio.
      thresholds: { lines: 80, perFile: true },
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          include: ["tests/unit/**/*.test.{ts,tsx}"],
          environment: "jsdom",
          setupFiles: ["tests/support/setup-dom.ts"],
          // Algunas pruebas de infra y de PDF lanzan `bash` y otros procesos. En Windows, con toda la suite en
          // paralelo, tardan más de los 5 s por defecto sin que haya un error de lógica.
          testTimeout: 30_000,
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
          // Verifica la base antes de correr y evita vaciarla desde dos archivos a la vez.
          globalSetup: ["tests/support/integration-setup.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
});
