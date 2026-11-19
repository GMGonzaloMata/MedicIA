import { spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { createRequire } from "node:module";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlaywrightTestConfig } from "@playwright/test";

import { isolatedUiTests } from "./tests/support/ui-test-environment.mts";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const APP_PORT = 3110;
const BASE_URL = `http://127.0.0.1:${APP_PORT}`;
const OUTPUT_DIR = "node_modules/.cache/medicia-acceptance-e022/results";
// Pines del contrato de http-raw-ecg-inference.ts; el responsable verifica los artefactos aparte.
const E022_ENV = {
  PDF_E022_LOCAL_SYNTHETIC: "1",
  PDF_EXTRACTION_ENDPOINT: "http://127.0.0.1:18081/extract",
  E022_INFERENCE_ENDPOINT: "http://127.0.0.1:18080/invocations",
  E022_MODEL_SHA256: "a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96",
  E022_PREPROCESSING_SHA256: "243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9",
};

function metadataIfPresent(path: string) {
  try {
    return lstatSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return undefined;
    throw new Error("No se pudieron comprobar los metadatos del worktree E022 local.");
  }
}

function requireIsolatedConfiguration(): string {
  const { DATABASE_URL, MEDICIA_E022_FIXTURE_SHA256, PLAYWRIGHT_BROWSERS_PATH } = process.env;
  if (!isolatedUiTests || !DATABASE_URL) {
    throw new Error("E022 local requiere MEDICIA_ISOLATED_UI_TESTS=1 y la conexión TEST dedicada.");
  }
  for (const [key, expected] of Object.entries(E022_ENV)) {
    if (process.env[key] !== expected) throw new Error(`E022 local requiere el valor fijado para ${key}.`);
  }
  if (!/^[0-9a-f]{64}$/.test(MEDICIA_E022_FIXTURE_SHA256 ?? "")) {
    throw new Error("E022 local requiere MEDICIA_E022_FIXTURE_SHA256 verificado por el responsable.");
  }
  if (PLAYWRIGHT_BROWSERS_PATH !== "0") throw new Error("E022 local requiere Chromium instalado localmente.");
  if (Object.keys(process.env).some((key) => /^(?:PG[A-Z_]+|HTTPS?_PROXY|ALL_PROXY)$/i.test(key))) {
    throw new Error("E022 local no admite variables PG ni proxies heredados.");
  }

  // next dev carga estos cuatro nombres por sí mismo. Solo verificamos metadatos, incluso de enlaces rotos.
  for (const name of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    if (metadataIfPresent(join(ROOT, name))) {
      throw new Error("E022 local requiere que no existan los archivos de entorno que carga Next en desarrollo.");
    }
  }
  // Playwright prepara su directorio de resultados antes de ejecutar la prueba.
  let directory = ROOT;
  for (const part of OUTPUT_DIR.split("/")) {
    directory = join(directory, part);
    const metadata = metadataIfPresent(directory);
    if (metadata && !metadata.isDirectory()) throw new Error("El scratch E022 local no admite enlaces ni junctions.");
  }
  return DATABASE_URL;
}

const databaseUrl = requireIsolatedConfiguration();

// webServer.env se mezcla con el proceso padre. Este punto de entrada entrega a Next solo una lista explícita.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === "--serve") {
  const systemRoot = process.env.SystemRoot;
  const systemDirectories = process.platform === "win32" && systemRoot ? [join(systemRoot, "System32")] : [];
  const require = createRequire(import.meta.url);
  const result = spawnSync(process.execPath, [require.resolve("next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(APP_PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      SystemRoot: systemRoot,
      PATH: [dirname(process.execPath), ...systemDirectories].join(delimiter),
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: databaseUrl,
      IDENTITY_PROVIDER: "fake",
      STUDY_STORAGE: "fake",
      ...E022_ENV,
    },
  });
  process.exit(result.status ?? 1);
}

export default {
  testDir: "tests/acceptance-e022",
  outputDir: OUTPUT_DIR,
  workers: 1,
  retries: 0,
  forbidOnly: true,
  reporter: "list",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  projects: [{ name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 900 } } }],
  use: {
    baseURL: BASE_URL,
    navigationTimeout: 45_000,
    trace: "off",
    screenshot: "off",
    video: "off",
    launchOptions: { args: ["--no-proxy-server"] },
  },
  webServer: {
    command: `"${process.execPath}" ./playwright.e022-local.config.mts --serve`,
    cwd: ROOT,
    env: { NODE_OPTIONS: "", NODE_PATH: "" },
    url: `${BASE_URL}/sign-in`,
    reuseExistingServer: false,
    stdout: "ignore",
    stderr: "ignore",
    timeout: 180_000,
  },
} satisfies PlaywrightTestConfig;
