import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

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
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          include: ["tests/integration/**/*.test.ts"],
          environment: "node",
        },
      },
    ],
  },
});
