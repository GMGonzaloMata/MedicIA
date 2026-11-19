import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const ROOT = process.cwd();
const PRELOAD = resolve(ROOT, "tests/support/ui-test-environment.mts");
const TEST_URL = "postgresql://127.0.0.1:15433/medicia_test?schema=public";
const DEMO_URL = "postgresql://127.0.0.1:15433/medicia_demo?schema=public";
const fixtures: string[] = [];

function fixture(database = TEST_URL) {
  const parent = resolve(ROOT, "node_modules/.cache/medicia-ui-config-fixtures");
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, "case-"));
  fixtures.push(directory);
  writeFileSync(join(directory, "settings.test"), `DATABASE_URL=${database}\n`);
  writeFileSync(join(directory, ".env.local"), `DATABASE_URL=${DEMO_URL}\nUI_ENV_PROBE=loaded-demo\n`);
  return directory;
}

function probe(directory: string, program: string, isolated: boolean, preload = false) {
  const keys = ["SystemRoot", "WINDIR", "PATH", "Path", "TEMP", "TMP"];
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    ...Object.fromEntries<string>(keys.flatMap((key) => {
      const value = process.env[key];
      return value === undefined ? [] : [[key, value] as const];
    })),
  };
  if (isolated) env.MEDICIA_ISOLATED_UI_TESTS = "1";
  return spawnSync(process.execPath, [
    "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
    ...(isolated ? ["--env-file=settings.test"] : []),
    ...(preload ? ["--import", pathToFileURL(PRELOAD).href] : []),
    "--input-type=module", "-e", program,
  ], { cwd: directory, env, encoding: "utf8", timeout: 8_000 });
}

function configProgram(filename: string) {
  const url = pathToFileURL(resolve(ROOT, filename)).href;
  return `const config=(await import(${JSON.stringify(url)})).default;
    console.log(JSON.stringify({ database:process.env.DATABASE_URL,
      marker:process.env.UI_ENV_PROBE??null,
      baseURL:config.use?.baseURL, command:config.webServer?.command,
      reuse:config.webServer?.reuseExistingServer }));`;
}

afterEach(() => {
  for (const directory of fixtures.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("isolated UI test configuration", () => {
  it("rejects non-owned database targets before the command can start", () => {
    for (const database of [DEMO_URL, TEST_URL.replace(":15433", ":55433"), TEST_URL.replace(":15433", ":5432"), TEST_URL + "&host=remote.invalid"]) {
      const directory = fixture(database);
      const before = readFileSync(join(directory, ".env.local"), "utf8");
      const result = probe(directory, "await import('node:fs').then(fs=>fs.writeFileSync('started.txt','1'));", true, true);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(2);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("medicia UI tests: expected 127.0.0.1:15433/medicia_test with no routing overrides\n");
      expect(existsSync(join(directory, "started.txt"))).toBe(false);
      expect(readFileSync(join(directory, ".env.local"), "utf8")).toBe(before);
    }
  });

  it("validates TEST privately before allowing a command to start", () => {
    const result = probe(fixture(), "console.log('test-command-started');", true, true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("test-command-started\n");
    expect(result.stderr).toBe("");
  });

  it("validates the database before the entrypoint can execute a package command", () => {
    for (const [database, status] of [[TEST_URL, 0], [DEMO_URL, 2]] as const) {
      const directory = fixture(database);
      writeFileSync(join(directory, "package.json"), JSON.stringify({
        scripts: { check: "node -e \"require('node:fs').writeFileSync('started.txt','1');console.log('test-command-started')\"" },
      }));
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: "test", MEDICIA_ISOLATED_UI_TESTS: "1",
        ...Object.fromEntries<string>(["SystemRoot", "WINDIR", "PATH", "Path", "TEMP", "TMP"].flatMap((key) => {
          const value = process.env[key];
          return value === undefined ? [] : [[key, value] as const];
        })),
      };
      const before = readFileSync(join(directory, "settings.test"), "utf8");
      const result = spawnSync(process.execPath, [
        "--env-file=settings.test", PRELOAD, "check",
      ], { cwd: directory, env, encoding: "utf8", timeout: 8_000 });
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(status);
      expect(result.stdout).toBe(status === 0 ? "test-command-started\n" : "");
      expect(result.stderr).toBe(status === 0 ? "" : "medicia UI tests: expected 127.0.0.1:15433/medicia_test with no routing overrides\n");
      expect(existsSync(join(directory, "started.txt"))).toBe(status === 0);
      expect(readFileSync(join(directory, "settings.test"), "utf8")).toBe(before);
    }
  });

  it("does not load the demo environment in isolated Vitest mode", () => {
    const result = probe(fixture(), configProgram("vitest.config.mts"), true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ database: TEST_URL, marker: null });
  });

  it("uses an exclusive loopback server without reuse in isolated Playwright mode", () => {
    const result = probe(fixture(), configProgram("playwright.config.mts"), true);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      database: TEST_URL, marker: null, baseURL: "http://127.0.0.1:3100",
      command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3100", reuse: false,
    });
  });

  it("preserves the previous Vitest environment loading without opt-in", () => {
    const result = probe(fixture(), configProgram("vitest.config.mts"), false);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ database: DEMO_URL, marker: "loaded-demo" });
  });

  it("preserves the previous Playwright URL, command and reuse without opt-in", () => {
    const result = probe(fixture(), configProgram("playwright.config.mts"), false);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({
      database: DEMO_URL, marker: "loaded-demo", baseURL: "http://localhost:3000",
      command: "npm run build && npm run start", reuse: true,
    });
  });
});
