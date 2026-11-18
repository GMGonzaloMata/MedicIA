// @vitest-environment node
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface LauncherApi {
  APP_ROOT: string;
  DEPENDENCY_ROOT: string;
  LINK_PATH: string;
  createEnvironment(inherited: object, runRoot: string): Record<string, string>;
  fixtureFiles(): Record<string, string>;
  closeOwnedRuntime(steps: { stopAccepting(): Promise<void>; closeConnections(): void; closeApplication(): Promise<void> }): Promise<void>;
  parseCommand(args: string[]): string;
  parseMcpResponse(raw: string, id: number): unknown;
  validateAppEntries(names: string[], directory?: string): void;
  validateCompilation(result: unknown): void;
  validateLinkRecord(record: unknown, target: string): void;
}

function isLauncherApi(value: unknown): value is LauncherApi {
  return typeof value === "object" && value !== null
    && ["APP_ROOT", "DEPENDENCY_ROOT", "LINK_PATH"].every((key) => key in value && typeof Reflect.get(value, key) === "string")
    && ["createEnvironment", "fixtureFiles", "parseCommand", "parseMcpResponse", "validateAppEntries", "validateCompilation", "validateLinkRecord"].every((key) => key in value && typeof Reflect.get(value, key) === "function");
}

// El tooling requerido es .mjs; la frontera dinámica se valida como unknown,
// sin activar allowJs global ni silenciar errores del compilador de la aplicación.
const importedLauncher: unknown = await import(new URL("../../support/pdf-viewer-runtime/launcher.mjs", import.meta.url).href);
if (!isLauncherApi(importedLauncher)) throw new Error("Invalid launcher API.");
const { APP_ROOT, DEPENDENCY_ROOT, LINK_PATH, createEnvironment, fixtureFiles, parseCommand, parseMcpResponse, validateAppEntries, validateCompilation, validateLinkRecord } = importedLauncher;

const runRoot = resolve(APP_ROOT, "..", "unit-synthetic-run");
const launcher = resolve("tests/support/pdf-viewer-runtime/launcher.mjs");
const environment = () => createEnvironment({ SystemRoot: "C:\\Windows" }, runRoot);

function cacheEntries() {
  return [resolve(APP_ROOT, ".."), APP_ROOT].map((directory) => ({
    directory, entries: existsSync(directory) ? readdirSync(directory).sort() : [],
  }));
}

function cli(args: string[]) {
  const before = cacheEntries();
  const result = spawnSync(process.execPath, ["--", launcher, ...args], {
    env: environment(), encoding: "utf8", timeout: 3000,
  });
  expect(cacheEntries()).toEqual(before);
  return result;
}

function rpc(result: unknown) {
  return `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 2, result })}\n\n`;
}

describe("launcher aislado de preflight PDF (sin arrancar Next)", () => {
  it("no lee ni propaga variables privadas, ni siquiera mediante getters", () => {
    const inherited = {
      SystemRoot: "C:\\Windows",
      get DATABASE_URL(): never { throw new Error("No leer secretos"); },
      get AWS_ACCESS_KEY_ID(): never { throw new Error("No leer secretos"); },
      get NODE_OPTIONS(): never { throw new Error("No leer hooks"); },
      get NEXT_PUBLIC_PRIVATE_MARKER(): never { throw new Error("No leer secretos"); },
      get PATH(): never { throw new Error("No heredar búsqueda de ejecutables"); },
      get HOME(): never { throw new Error("No usar estado global"); },
    };
    expect(createEnvironment(inherited, runRoot)).toEqual(environment());
    const env = environment();
    for (const key of ["DATABASE_URL", "AWS_ACCESS_KEY_ID", "NODE_OPTIONS", "NEXT_PUBLIC_PRIVATE_MARKER", "NODE_PATH", "HTTP_PROXY", "HTTPS_PROXY", "AGENT_BROWSER_SESSION"]) {
      expect(env).not.toHaveProperty(key);
    }
    expect(env).toMatchObject({ NODE_ENV: "development", CI: "1", NEXT_TELEMETRY_DISABLED: "1", npm_config_offline: "true", npm_config_ignore_scripts: "true" });
  });

  it("confina home, temporales y cachés a la ejecución, sin usar el enlace", () => {
    const env = environment();
    for (const key of ["HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMP", "TEMP", "TMPDIR", "npm_config_cache"]) {
      expect(env[key].startsWith(runRoot)).toBe(true);
      expect(env[key].startsWith(LINK_PATH)).toBe(false);
    }
    expect(() => createEnvironment({}, resolve(APP_ROOT, "node_modules", "cache"))).toThrow("Invalid run directory.");
    expect(() => createEnvironment({}, resolve(APP_ROOT, "..", "..", "outside"))).toThrow("Invalid run directory.");
  });

  it("solo sintetiza archivos explícitos; configuración y raíz adicional son exactas", () => {
    const files = fixtureFiles();
    expect(Object.keys(files).sort()).toEqual(["app/layout.js", "app/page.js", "next.config.mjs", "package-lock.json", "package.json"]);
    expect(files["next.config.mjs"]).toContain(JSON.stringify(APP_ROOT));
    expect(files["next.config.mjs"]).toContain(JSON.stringify(DEPENDENCY_ROOT));
    expect(files["next.config.mjs"]).toContain('"turbopackAdditionalRoots"');
    expect(files["next.config.mjs"]).toContain('"distDir": "runtime-dist"');
    expect(files["next.config.mjs"]).not.toMatch(/webpack|loader/);
    const config = JSON.parse(files["next.config.mjs"].replace(/^export default /, "").replace(/;\s*$/, ""));
    expect(config.turbopack.resolveAlias).toEqual({ "@swc/helpers": resolve(APP_ROOT, "node_modules/@swc/helpers") });
    expect(files["app/page.js"]).toContain("MEDICIA_SYNTHETIC_PREFLIGHT_ONLY");
    for (const text of Object.values(files)) expect(text).not.toMatch(/DATABASE_URL|prisma|cognito|seed|requireClinicContext/);
  });

  it.each([".env", ".env.local", ".env.test", ".env.test.local", "instrumentation.ts", "src", "next.config.js", "credentials.json", "tsconfig.json", "postcss.config.mjs"])("rechaza el nombre no permitido %s sin leer su contenido", (entry) => {
    expect(() => validateAppEntries(["app", "node_modules", "package.json", entry])).toThrow("Unexpected isolated app entry.");
  });

  it("preserva los únicos nombres de fuentes y salida permitidos", () => {
    expect(() => validateAppEntries(["app", "node_modules", "package.json", "package-lock.json", "next.config.mjs", "runtime-dist"])).not.toThrow();
    expect(() => validateAppEntries(["layout.js", "page.js"], "app")).not.toThrow();
    expect(() => validateAppEntries([".env"], "app")).toThrow("Unexpected isolated app entry.");
    expect(() => validateAppEntries(["page.js"], "src")).toThrow("Unexpected isolated app directory.");
  });

  it("valida registro y destino exactos; no adopta otro enlace existente", () => {
    const record = { source: LINK_PATH, target: DEPENDENCY_ROOT, resolvedTarget: DEPENDENCY_ROOT, kind: process.platform === "win32" ? "junction" : "dir", owner: "medicia-pdf-runtime-launcher-v1" };
    expect(() => validateLinkRecord(record, DEPENDENCY_ROOT)).not.toThrow();
    for (const changed of [{ source: APP_ROOT }, { target: APP_ROOT }, { resolvedTarget: APP_ROOT }, { owner: "foreign" }, { kind: "file" }]) {
      expect(() => validateLinkRecord({ ...record, ...changed }, DEPENDENCY_ROOT)).toThrow("Dependency link ownership mismatch.");
    }
    expect(() => validateLinkRecord(record, APP_ROOT)).toThrow("Dependency link ownership mismatch.");
    expect(() => validateLinkRecord(null, DEPENDENCY_ROOT)).toThrow("Dependency link ownership mismatch.");
  });

  it("solo admite modos cerrados, sin flags de entorno, raíz o bundler", () => {
    expect(parseCommand(["prepare"])).toBe("prepare");
    expect(parseCommand(["preflight"])).toBe("preflight");
    expect(parseCommand(["--help"])).toBe("help");
    for (const args of [[], ["--env-file=.env.local"], ["preflight", "--webpack"], ["prepare", "--root", ".."], ["seed"], ["--worker", "../escape"]]) {
      expect(() => parseCommand(args)).toThrow("Usage: launcher.mjs prepare | preflight | --help");
    }
  });

  it("rechaza CLI inválido con salida exacta y sin iniciar servidor", () => {
    const result = cli(["preflight", "--env-file=.env.synthetic-denied-never-created"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Usage: launcher.mjs prepare | preflight | --help\n");
    expect(result.error).toBeUndefined();
  });

  it("rechaza el worker sin IPC de propietario antes de tocar disco", () => {
    const result = cli(["--worker", "run-00000000-0000-4000-8000-000000000000"]);
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toBe("Worker requires an owning IPC parent.\n");
    expect(result.error).toBeUndefined();
  });

  it("preserva ayuda/importación pasiva sin servidor ni filesystem", () => {
    const help = cli(["--help"]);
    expect(help.status).toBe(0);
    expect(help.stderr).toBe("");
    expect(help.stdout).toBe("Usage: launcher.mjs prepare | preflight | --help\nprepare: synthetic files + exact owned dependency link; no server.\npreflight: owned loopback Next/Turbopack + MCP check; runtime deadline 29s after preparation.\n");
    const before = cacheEntries();
    const imported = spawnSync(process.execPath, ["--input-type=module", "-e", `await import(${JSON.stringify(new URL(`file:///${launcher.replaceAll("\\", "/")}`).href)});`], { env: environment(), encoding: "utf8", timeout: 3000 });
    expect(cacheEntries()).toEqual(before);
    expect(imported.status).toBe(0);
    expect(imported.stdout).toBe("");
    expect(imported.stderr).toBe("");
  });

  it("cierra conexiones propias antes de terminar HTTP y después cierra Next", async () => {
    expect(importedLauncher.closeOwnedRuntime).toBeTypeOf("function");
    const order: string[] = [];
    let completeHttp!: () => void;
    await importedLauncher.closeOwnedRuntime({
      stopAccepting: () => { order.push("stop-accepting"); return new Promise<void>((done) => { completeHttp = done; }); },
      closeConnections: () => { order.push("close-connections"); completeHttp(); },
      closeApplication: async () => { order.push("close-next"); },
    });
    expect(order).toEqual(["stop-accepting", "close-connections", "close-next"]);
  });

  it("propaga el error de cierre sin convertirlo en confirmación", async () => {
    expect(importedLauncher.closeOwnedRuntime).toBeTypeOf("function");
    const error = new Error("synthetic cleanup failure");
    await expect(importedLauncher.closeOwnedRuntime({
      stopAccepting: async () => undefined,
      closeConnections: () => undefined,
      closeApplication: async () => { throw error; },
    })).rejects.toBe(error);
  });

  it("valida respuestas MCP SSE/JSON e id exacto, sin aceptar errores como éxito", () => {
    expect(parseMcpResponse(rpc({ tools: [{ name: "get_compilation_issues" }] }), 2)).toEqual({ tools: [{ name: "get_compilation_issues" }] });
    expect(parseMcpResponse(JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }), 2)).toEqual({});
    for (const raw of ["event: message\n\n", "not-json", JSON.stringify({ id: 3, result: {} }), JSON.stringify({ id: 2, error: { message: "denied" } })]) {
      expect(() => parseMcpResponse(raw, 2)).toThrow("Invalid MCP response.");
    }
  });

  it("exige compilación Turbopack sin issues, incluso si Next devuelve error dentro de content", () => {
    const response = (value: unknown) => ({ content: [{ type: "text", text: JSON.stringify(value) }] });
    expect(() => validateCompilation(response({ issues: [] }))).not.toThrow();
    for (const result of [response({ error: "Turbopack project is not available. This tool requires the Turbopack bundler." }), response({ issues: [{ severity: "error" }] }), response({ issues: [{ severity: "warning" }] }), response({}), { isError: true, ...response({ issues: [] }) }, null]) {
      expect(() => validateCompilation(result)).toThrow("Turbopack compilation was not clean.");
    }
  });
});
