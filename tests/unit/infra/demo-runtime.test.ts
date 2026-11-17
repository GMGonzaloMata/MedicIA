// @vitest-environment node
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, readdirSync, readlinkSync, rmSync, symlinkSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";

const MODULE = resolve("infra/modules/demo-host");
const scratchDirectories: string[] = [];
const DB = "demo.abcdefghijkl.sa-east-1.rds.amazonaws.com";
const APP_SECRET = "synthetic-app-secret-NOT-REAL";
const TOKEN = "synthetic-duckdns-token-NOT-REAL";
const APP_ARN = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/app-Ab1234";
const DUCK_ARN = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/duckdns-Cd5678";
const files = {
  "release.json": JSON.stringify({ platform: "linux", arch: "x64", node: 24 }),
  ".next/BUILD_ID": "synthetic-build",
  "node_modules/next/dist/bin/next": "synthetic-next-runtime",
  "generated/prisma/client.ts": "// cliente sintético preexistente",
  "public/fixture.txt": "synthetic-only",
};

// Tar ustar determinista de fixtures sintéticos: no usa archivos de la aplicación.
function archive(entries: Record<string, string>, link?: string): Buffer {
  const records: Buffer[] = [];
  for (const [name, contents] of Object.entries(entries)) {
    const body = Buffer.from(contents);
    const header = Buffer.alloc(512);
    header.write(name, 0, 100);
    header.write("0000644\0", 100);
    header.write("0000000\0", 108);
    header.write("0000000\0", 116);
    header.write(body.length.toString(8).padStart(11, "0") + "\0", 124);
    header.write("00000000000\0", 136);
    header.fill(32, 148, 156);
    header.write(link === name ? "2" : "0", 156);
    if (link === name) header.write("../../escape", 157);
    header.write("ustar\0", 257);
    header.write("00", 263);
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, "0") + "\0 ", 148);
    records.push(header, body, Buffer.alloc((512 - (body.length % 512)) % 512));
  }
  records.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(records));
}

function posix(path: string): string { return path.replaceAll("\\", "/"); }
function put(path: string, value: string | Buffer): void {
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, value, { mode: 0o700 });
}
function fixture(options: {
  entries?: Record<string, string>; checksum?: string; missing?: "app" | "duckdns";
  app?: unknown; duck?: unknown; nodeVersion?: string; platform?: string; platformExit?: number; link?: string;
} = {}) {
  const root = posix(mkdtempSync(join(tmpdir(), "medicia-host-runtime-")));
  scratchDirectories.push(root);
  const runtimeRoot = root + "/run/medicia";
  const releaseRoot = root + "/releases";
  const oldGeneration = runtimeRoot + "/old";
  mkdirSync(oldGeneration, { recursive: true });
  mkdirSync(releaseRoot + "/old", { recursive: true });
  put(oldGeneration + "/runtime.env", "PRESERVED=previous-config\n");
  put(oldGeneration + "/duckdns", "previous-token\n");
  put(releaseRoot + "/old/marker", "previous-release\n");
  symlinkSync(releaseRoot + "/old", oldGeneration + "/release", "junction");
  symlinkSync(oldGeneration, runtimeRoot + "/current", "junction");
  const packed = archive(options.entries ?? files, options.link);
  put(root + "/release.tar.gz", packed);
  const sha = options.checksum ?? createHash("sha256").update(packed).digest("hex");
  put(root + "/app.json", JSON.stringify(options.app ?? {
    DATABASE_URL: "postgresql://medicia_app:synthetic-password@" + DB + ":5432/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem",
    COGNITO_CLIENT_SECRET: APP_SECRET,
  }));
  put(root + "/duckdns.json", JSON.stringify(options.duck ?? { token: TOKEN }));
  const config = {
    region: "sa-east-1",
    // Serialized external keys remain verbatim; this is wire data, not TypeScript identifiers.
    ...Object.fromEntries<string>([
      ["app_secret_arn", APP_ARN], ["duckdns_secret_arn", DUCK_ARN],
      ["release_bucket", "medicia-releases-dev-123456789012"], ["release_key", "releases/1.2.3/web-linux-amd64.tar.gz"],
      ["release_sha256", sha], ["database_address", DB],
    ]),
    environment: {
      NODE_ENV: "production", HOSTNAME: "127.0.0.1", PORT: "3000",
      IDENTITY_PROVIDER: "cognito", STUDY_STORAGE: "s3", MODEL_INFERENCE: "sagemaker",
      AWS_REGION: "sa-east-1", COGNITO_REGION: "sa-east-1", COGNITO_USER_POOL_ID: "sa-east-1_fixture",
      COGNITO_CLIENT_ID: "fixture123", STUDIES_BUCKET: "medicia-studies-dev-123456789012",
      SAGEMAKER_ENDPOINT_NAME: "medicia-dev-echonext-mini",
    },
  };
  const template = readFileSync(MODULE + "/templates/runtime.sh.tftpl", "utf8");
  const rendered = template
    .replaceAll("${runtime_root}", runtimeRoot)
    .replaceAll("${release_root}", releaseRoot)
    .replaceAll("${runtime_config_base64}", Buffer.from(JSON.stringify(config)).toString("base64"))
    .replaceAll("$${", "${");
  put(root + "/runtime.sh", rendered);
  const bin = root + "/bin";
  put(bin + "/aws", `#!/bin/bash\nprintf '%s\\n' "$*" >> "$FIXTURE/calls"\nif [[ "$*" == *get-secret-value* ]]; then\n  if [[ "$*" == *'/app-'* ]]; then kind=app; else kind=duckdns; fi\n  if [[ "$kind" == "$MISSING" ]]; then printf '%s\\n' 'synthetic-leak-must-be-masked' >&2; exit 4; fi\n  cat "$FIXTURE/$kind.json"\nelif [[ "$*" == *'s3 cp'* ]]; then\n  cp "$FIXTURE/release.tar.gz" "$4"\nelse exit 5; fi\n`);
  put(bin + "/node", `#!/bin/bash\nprintf 'node:%s\\n' "$1" >> "$FIXTURE/trace"\nif [[ "$1" == --version ]]; then printf '%s\\n' '${options.nodeVersion ?? "v24.11.0"}'; else exec '${posix(process.execPath)}' --require "$FIXTURE/fs-contract.cjs" "$@" 2> "$FIXTURE/node-error"; fi\n`);
  put(bin + "/uname", `#!/bin/bash\nprintf 'uname\\n' >> "$FIXTURE/trace"\nprintf '%s\\n' '${options.platform ?? "Linux x86_64"}'\nif [[ '${options.platformExit ?? 0}' != 0 ]]; then printf 'synthetic-platform-probe-failed\\n' >&2; exit ${options.platformExit ?? 0}; fi\n`);
  put(bin + "/findmnt", "#!/bin/bash\nprintf 'tmpfs\\n'\n");
  // Las llamadas siguen usando filesystem real, con fault injection EXDEV entre raíces.
  put(root + "/fs-contract.cjs", `
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FIXTURE;
const rename = fs.renameSync;
const chmod = fs.chmodSync;
fs.renameSync = function(from, to) {
  const source = path.resolve(from);
  const target = path.resolve(to);
  fs.appendFileSync(path.join(root, 'renames'), JSON.stringify([source, target]) + '\\n');
  if (source.startsWith(path.join(root, 'run') + path.sep) && target.startsWith(path.join(root, 'releases') + path.sep)) {
    const error = new Error('synthetic EXDEV'); error.code = 'EXDEV'; throw error;
  }
  // Windows junctions no permiten rename sobre otro junction; POSIX symlinks sí.
  // Solo adapta esta diferencia del fixture, no simula atomicidad ni permisos Linux.
  if (process.platform === 'win32' && fs.existsSync(target) && fs.lstatSync(target).isSymbolicLink()) fs.unlinkSync(target);
  return rename.call(fs, from, to);
};
fs.chmodSync = function(file, mode) {
  fs.appendFileSync(path.join(root, 'modes'), JSON.stringify([path.resolve(file), mode]) + '\\n');
  return chmod.call(fs, file, mode);
};
`);
  for (const tool of ["install", "mkdir", "mktemp", "base64"]) {
    put(bin + "/" + tool, `#!/bin/bash\n/usr/bin/${tool} "$@"\nstatus=$?\nprintf '${tool}:%s\\n' "$status" >> "$FIXTURE/trace"\nexit "$status"\n`);
  }
  // No chown real sobre el host Windows; solo fixture sintético propio.
  put(bin + "/chown", "#!/bin/bash\nexit 0\n");
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test", PATH: process.env.PATH ?? "", FIXTURE: root, MISSING: options.missing ?? "",
    HOME: root, TMPDIR: root, TEMP: root, TMP: root,
    MSYS_NO_PATHCONV: "1",
  };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  function run() {
    // Bash convierte su PATH Windows al arrancar; prefijar después evita mezclar ; y :.
    const bashBin = bin.replace(/^([A-Za-z]):/, drive => "/" + drive.charAt(0).toLowerCase());
    return spawnSync("bash", ["-c", 'export PATH="$1:$PATH"; source "$2"', "fixture", bashBin, root + "/runtime.sh"], { env, encoding: "utf8", timeout: 10000 });
  }
  function snapshot() {
    return {
      pointer: readlinkSync(runtimeRoot + "/current"),
      config: readFileSync(runtimeRoot + "/current/runtime.env", "utf8"),
      token: readFileSync(runtimeRoot + "/current/duckdns", "utf8"),
      release: readFileSync(runtimeRoot + "/current/release/marker", "utf8"),
      artifacts: readdirSync(releaseRoot).sort(),
      runtimeEntries: readdirSync(runtimeRoot).sort(),
    };
  }
  function probeTools() {
    const bashBin = bin.replace(/^([A-Za-z]):/, drive => "/" + drive.charAt(0).toLowerCase());
    return spawnSync("bash", ["-c", 'set -e; export PATH="$1:$PATH"; uname -sm; node --version; command -v aws; findmnt -n -o FSTYPE --target "$2"', "fixture", bashBin, runtimeRoot], { env, encoding: "utf8", timeout: 10000 });
  }
  function trace() { return existsSync(root + "/trace") ? readFileSync(root + "/trace", "utf8") : ""; }
  function calls() { return existsSync(root + "/calls") ? readFileSync(root + "/calls", "utf8").trim().split("\n") : []; }
  function reason() { return existsSync(root + "/node-error") ? readFileSync(root + "/node-error", "utf8").match(/(?:Error|TypeError): ([^\r\n]+)/)?.[1] : undefined; }
  return { root, runtimeRoot, releaseRoot, sha, run, snapshot, probeTools, trace, calls, reason };
}

afterEach(() => {
  for (const directory of scratchDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("runtime público renderizado, sin AWS ni escrituras globales", () => {
  it("el probe conserva el primer fallo y no ejecuta herramientas posteriores", () => {
    const f = fixture({ platformExit: 7 });
    const before = f.snapshot(); const result = f.probeTools();
    expect(result.status).toBe(7); expect(result.stdout).toBe("Linux x86_64\n");
    expect(result.stderr).toBe("synthetic-platform-probe-failed\n");
    expect(f.trace()).toBe("uname\n"); expect(f.calls()).toEqual([]); expect(f.snapshot()).toEqual(before);
  });
  it.each(["app", "duckdns"] as const)("rechaza secreto %s ausente sin filtrar ni modificar configuración/release", (missing) => {
    const f = fixture({ missing }); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(result.stderr).toBe("medicia runtime: rejected\n"); expect(f.snapshot()).toEqual(before);
    expect(readdirSync(f.runtimeRoot).sort()).toEqual(["current", "old"]);
    expect(f.calls()).toHaveLength(missing === "app" ? 1 : 2);
    expect(f.calls()[missing === "app" ? 0 : 1]).toContain(missing === "app" ? APP_ARN : DUCK_ARN);
    expect(f.calls().some(call => call.includes("s3 cp"))).toBe(false);
    expect(f.trace().split("node:\n")).toHaveLength(3); // preparación y referencias alcanzadas
  });
  it.each(["0".repeat(64), "bad", "a".repeat(63), "g".repeat(64)])("rechaza checksum %s sin cambiar estado", (checksum) => {
    const f = fixture({ checksum }); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(result.stderr).toBe("medicia runtime: rejected\n"); expect(f.snapshot()).toEqual(before);
    expect(f.reason()).toBe("checksum");
    expect(f.calls()).toHaveLength(checksum === "0".repeat(64) ? 3 : 0);
  });
  it.each([
    { app: {}, expectedReason: "secret" }, { app: { DATABASE_URL: "secret-invalid-url", COGNITO_CLIENT_SECRET: APP_SECRET }, expectedReason: "Invalid URL" },
    { duck: { token: "" }, expectedReason: "secret" }, { app: { DATABASE_URL: "postgresql://medicia_admin:synthetic-password@" + DB + "/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem", COGNITO_CLIENT_SECRET: APP_SECRET }, expectedReason: "connection" },
    { app: { DATABASE_URL: "postgresql://app:synthetic-password@" + DB + "/medicia?sslmode=no-verify", COGNITO_CLIENT_SECRET: APP_SECRET }, expectedReason: "connection" },
    { app: { DATABASE_URL: "postgresql://app:synthetic-password@foreign.example.invalid/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem", COGNITO_CLIENT_SECRET: APP_SECRET }, expectedReason: "connection" },
    { app: { DATABASE_URL: "postgresql://app:synthetic-password@" + DB + "/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem", COGNITO_CLIENT_SECRET: "line1\nINJECT=bad" }, expectedReason: "secret" },
  ])("rechaza estructura/TLS de secreto inválidos sin registrar valores %#", (options) => {
    const f = fixture(options); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(result.stderr).toBe("medicia runtime: rejected\n"); expect(f.snapshot()).toEqual(before);
    expect(f.reason()).toBe(options.expectedReason); expect(f.calls()).toHaveLength(3);
  });
  it.each(["user", "password", "host", "port", "%75ser", "pass%77ord", "h%6fst", "%70ort"])("rechaza overrides PostgreSQL decodificados antes de publicar: %s", key => {
    const f = fixture({ app: {
      DATABASE_URL: "postgresql://medicia_app:synthetic-password@" + DB + ":5432/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem&" + key + "=synthetic-override",
      COGNITO_CLIENT_SECRET: APP_SECRET,
    } });
    const before = f.snapshot(); const result = f.run();
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia runtime: rejected\n"]);
    expect(f.snapshot()).toEqual(before); expect(f.reason()).toBe("connection");
    const calls = f.calls();
    expect(calls).toEqual([
      "secretsmanager get-secret-value --region sa-east-1 --secret-id " + APP_ARN + " --query SecretString --output text",
      "secretsmanager get-secret-value --region sa-east-1 --secret-id " + DUCK_ARN + " --query SecretString --output text",
      "s3 cp s3://medicia-releases-dev-123456789012/releases/1.2.3/web-linux-amd64.tar.gz " + calls[2]?.split(" ")[3] + " --region sa-east-1 --only-show-errors",
    ]);
    expect(calls[2]?.split(" ")[3]).toMatch(/\/run\/medicia\/\.candidate\.[A-Za-z0-9]+\/release\.tar\.gz$/);
    expect(existsSync(f.root + "/renames")).toBe(false);
  });
  it.each([
    "sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem&sslmode=no-verify",
    "sslmode=no-verify&sslrootcert=/etc/pki/rds/global-bundle.pem&sslmode=verify-full",
    "sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem&sslrootcert=/tmp/other-ca.pem",
    "sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem&sslmode=verify-full",
    "sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem&%73slmode=no-verify",
  ])("rechaza parámetros TLS duplicados sin activar ni filtrar valores %#", (query) => {
    const f = fixture({ app: {
      DATABASE_URL: "postgresql://medicia_app:synthetic-password@" + DB + ":5432/medicia?" + query,
      COGNITO_CLIENT_SECRET: APP_SECRET,
    } });
    const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(result.stderr).toBe("medicia runtime: rejected\n");
    expect(f.snapshot()).toEqual(before); expect(f.reason()).toBe("connection");
    expect(f.calls()).toHaveLength(3);
  });
  it.each([
    { entries: { ...files, "release.json": JSON.stringify({ platform: "win32", arch: "x64", node: 24 }) }, expectedReason: "platform" },
    { entries: { ...files, "release.json": JSON.stringify({ platform: "linux", arch: "arm64", node: 24 }) }, expectedReason: "platform" },
    { entries: { ...files, "release.json": JSON.stringify({ platform: "linux", arch: "x64", node: 26 }) }, expectedReason: "platform" },
    { entries: Object.fromEntries(Object.entries(files).filter(([name]) => name !== "generated/prisma/client.ts")), expectedReason: "package" },
    { entries: Object.fromEntries(Object.entries(files).filter(([name]) => name !== ".next/BUILD_ID")), expectedReason: "package" },
    { entries: Object.fromEntries(Object.entries(files).filter(([name]) => name !== "node_modules/next/dist/bin/next")), expectedReason: "package" },
    { entries: { ...files, "../escape": "synthetic" }, expectedReason: "tar-path" },
    { entries: { ...files, ".env.production": "synthetic-never-activate" }, expectedReason: "tar-path" },
    { entries: { ...files, "link": "" }, link: "link", expectedReason: "tar-type" },
    { nodeVersion: "v26.13.0", expectedReason: "host-node" }, { platform: "Linux aarch64", expectedReason: "host-platform" },
  ])("rechaza plataforma/paquete/prerrequisitos antes de activar %#", (options) => {
    const f = fixture(options); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe("");
    expect(result.stderr).toBe("medicia runtime: rejected\n"); expect(f.snapshot()).toEqual(before);
    expect(existsSync(f.root + "/escape")).toBe(false);
    if (options.expectedReason.startsWith("host-")) {
      expect(f.calls()).toEqual([]); expect(f.reason()).toBeUndefined();
      expect(f.trace()).toBe(options.expectedReason === "host-node" ? "uname\nnode:--version\n" : "uname\n");
    } else {
      expect(f.reason()).toBe(options.expectedReason); expect(f.calls()).toHaveLength(3);
    }
  });
  it("activa juntos configuración y release verificado, conserva el anterior y permite reaplicar", () => {
    const f = fixture();
    const tools = f.probeTools();
    expect(tools.status, tools.stdout + tools.stderr).toBe(0);
    expect(tools.stdout, tools.stdout + tools.stderr).toContain("Linux x86_64\nv24.11.0\n");
    expect(tools.stdout).toContain("tmpfs\n");
    const result = f.run();
    expect(result.status, existsSync(f.root + "/node-error") ? readFileSync(f.root + "/node-error", "utf8").match(/^Error: .*/m)?.[0] : "No se alcanzó el validador Node: " + f.trace()).toBe(0); expect(result.stdout).toBe("medicia runtime: activated\n"); expect(result.stderr).toBe("");
    const env = readFileSync(f.runtimeRoot + "/current/runtime.env", "utf8");
    expect(env).toContain('COGNITO_CLIENT_SECRET="' + APP_SECRET + '"');
    expect(env).toContain('DATABASE_URL="postgresql://medicia_app:synthetic-password@' + DB + ':5432/medicia?sslmode=verify-full&sslrootcert=/etc/pki/rds/global-bundle.pem"');
    expect(env).toContain('HOSTNAME="127.0.0.1"'); expect(env).toContain('PORT="3000"');
    expect(readFileSync(f.runtimeRoot + "/current/duckdns", "utf8")).toBe(TOKEN + "\n");
    expect(readFileSync(f.runtimeRoot + "/current/release/.next/BUILD_ID", "utf8")).toBe("synthetic-build");
    expect(readFileSync(f.releaseRoot + "/old/marker", "utf8")).toBe("previous-release\n");
    expect(readFileSync(f.root + "/calls", "utf8")).toContain(APP_ARN);
    expect(readFileSync(f.root + "/calls", "utf8")).toContain(DUCK_ARN);
    const repeated = f.run(); expect(repeated.status).toBe(0); expect(repeated.stdout).toBe("medicia runtime: activated\n"); expect(repeated.stderr).toBe("");
    expect(readFileSync(f.runtimeRoot + "/current/runtime.env", "utf8")).toBe(env);
    expect(readdirSync(f.releaseRoot).sort()).toEqual([f.sha, "old"].sort());
    const renames: unknown = readFileSync(f.root + "/renames", "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(renames).toEqual(expect.arrayContaining([[
      expect.stringContaining(".candidate"), expect.stringContaining(f.sha),
    ]]));
    if (!Array.isArray(renames)) throw new Error("Registro de renames inválido");
    for (const pair of renames) {
      if (!Array.isArray(pair) || typeof pair[0] !== "string" || typeof pair[1] !== "string") throw new Error("Par de rename inválido");
      const source = posix(pair[0]); const target = posix(pair[1]);
      expect(source.startsWith(f.runtimeRoot + "/") && target.startsWith(f.releaseRoot + "/")).toBe(false);
      if (target === f.releaseRoot + "/" + f.sha) expect(source.startsWith(f.releaseRoot + "/.candidate.")).toBe(true);
    }
    // chmod explícito después de umask077: evidencia de llamadas reales, no cobertura POSIX.
    const modes = readFileSync(f.root + "/modes", "utf8");
    expect(modes).toContain(",493]"); // 0755 directorios
    expect(modes).toContain(",420]"); // 0644 archivos públicos del release
    expect(modes).toContain(",384]"); // 0600 secretos
    expect(modes).toMatch(/runtime\.env[^\n]*,384]/); expect(modes).toMatch(/duckdns[^\n]*,384]/);
    expect(modes).toMatch(/BUILD_ID[^\n]*,420]/); expect(modes).toMatch(/[.]next[^\n]*,493]/);
  });
});

// DNS usa su propio fixture; no cambia ni reutiliza la activación runtime.
function dnsFixture(options: {
  hostname?: string; token?: string; missing?: boolean; mode?: number; uid?: number;
  unreadable?: boolean; response?: string; curlExit?: number; nodeExit?: number;
} = {}) {
  const root = posix(mkdtempSync(join(tmpdir(), "medicia-dns-")));
  scratchDirectories.push(root);
  const tokenPath = root + "/current/duckdns";
  const token = options.token ?? 'synthetic-token&query="\\safe';
  if (!options.missing) put(tokenPath, token + "\n");
  put(root + "/runtime.env", 'HOSTNAME="127.0.0.1"\n');
  const config = Object.fromEntries<string>([
    ["public_hostname", options.hostname ?? "synthetic-demo.duckdns.org"], ["token_path", tokenPath],
  ]);
  const rendered = readFileSync(MODULE + "/templates/dns.sh.tftpl", "utf8")
    .replaceAll("${dns_config_base64}", Buffer.from(JSON.stringify(config)).toString("base64"))
    .replaceAll("$${", "${");
  put(root + "/dns.sh", rendered);
  // Solo simula metadatos Linux del secreto propio; nunca cambia ACL/uid globales.
  put(root + "/metadata.cjs", `
const fs = require('node:fs');
process.getuid = () => 0;
const child = require('node:child_process');
const spawn = child.spawnSync;
child.spawnSync = (command, args, options) => {
  if (command !== 'curl') throw new Error('unexpected external command');
  // Windows no ejecuta el stub Bash con CreateProcess; mismo stdin/argv, sin red.
  return spawn(process.execPath, [process.env.FIXTURE + '/curl.cjs', ...args], options);
};
const open = fs.openSync;
fs.openSync = (...args) => {
  if (args[0] === ${JSON.stringify(tokenPath)}) fs.appendFileSync(process.env.FIXTURE + '/token-reads', 'open\\n');
  return open(...args);
};
const stat = fs.fstatSync;
fs.fstatSync = (...args) => {
  const value = stat(...args); value.mode = 0o100000 | ${options.mode ?? 0o600}; value.uid = ${options.uid ?? 0}; return value;
};
if (${options.unreadable ?? false}) fs.openSync = () => { throw new Error('synthetic denied'); };
`);
  put(root + "/bin/node", `#!/bin/bash\nprintf 'node\\n' >> "$FIXTURE/stages"\nif [[ '${options.nodeExit ?? 0}' != 0 ]]; then exit ${options.nodeExit ?? 0}; fi\nexec '${posix(process.execPath)}' --require "$FIXTURE/metadata.cjs" "$@"\n`);
  put(root + "/bin/curl", `#!/bin/bash\nexec '${posix(process.execPath)}' "$FIXTURE/curl.cjs" "$@"\n`);
  put(root + "/curl.cjs", `
const fs = require('node:fs');
const root = process.env.FIXTURE;
fs.appendFileSync(root + '/calls', JSON.stringify({ args: process.argv.slice(2), env: process.env }) + '\\n');
const config = fs.readFileSync(0, 'utf8');
fs.writeFileSync(root + '/request', config);
process.stdout.write(${JSON.stringify(options.response ?? "OK")});
if (${options.curlExit ?? 0}) process.stderr.write(${JSON.stringify(token)});
process.exitCode = ${options.curlExit ?? 0};
`);
  const bashBin = (root + "/bin").replace(/^([A-Za-z]):/, drive => "/" + drive.charAt(0).toLowerCase());
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", FIXTURE: root, HOME: root, MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  function run(args: string[] = []) {
    return spawnSync("bash", ["-c", 'export PATH="$1:$PATH"; shift; exec bash "$@"', "fixture", bashBin, root + "/dns.sh", ...args], { env, encoding: "utf8", timeout: 10000 });
  }
  function calls() { return existsSync(root + "/calls") ? readFileSync(root + "/calls", "utf8").trim().split("\n") : []; }
  function snapshot() { return [existsSync(tokenPath) ? readFileSync(tokenPath, "utf8") : null, readFileSync(root + "/runtime.env", "utf8")]; }
  return { root, token, run, calls, snapshot };
}

describe("DNS updater aislado", () => {
  it.each([["--dry-run"], ["unexpected"], [""], ["--help", "extra"]])("rechaza cualquier argumento antes de token/red: %j", (...args) => {
    const f = dnsFixture(); const before = f.snapshot(); const result = f.run(args);
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia dns: rejected\n"]);
    expect(f.snapshot()).toEqual(before); expect(f.calls()).toEqual([]);
    expect(readFileSync(f.root + "/stages", "utf8")).toBe("node\n");
    expect(existsSync(f.root + "/token-reads")).toBe(false);
    expect(existsSync(f.root + "/request")).toBe(false);
  });
  it("control válido llega a curl, codifica token solo por stdin y conserva configuración", () => {
    const f = dnsFixture(); const before = f.snapshot(); const result = f.run();
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toBe("medicia dns: updated\n"); expect(result.stderr).toBe("");
    expect(f.calls()).toHaveLength(1); expect(f.calls()[0]).not.toContain(f.token);
    expect(readFileSync(f.root + "/token-reads", "utf8")).toBe("open\n");
    const request = readFileSync(f.root + "/request", "utf8");
    expect(request).toContain("https://www.duckdns.org/update?domains=synthetic-demo&token=" + encodeURIComponent(f.token));
    expect(request).not.toContain("&ip="); expect(request).not.toContain(f.token);
    const invocation: unknown = JSON.parse(f.calls()[0]);
    expect(invocation).toMatchObject({ args: ["-q", "--silent", "--fail", "--proto", "=https", "--proxy", "", "--noproxy", "*", "--connect-timeout", "5", "--max-time", "20", "--config", "-"] });
    expect(f.calls()[0]).not.toContain("--insecure");
    expect(f.snapshot()).toEqual(before);
  });
  it.each([
    { missing: true }, { token: "" }, { token: "line1\nline2" }, { mode: 0o644 }, { uid: 1000 }, { unreadable: true },
    { hostname: "other.example.invalid" }, { hostname: "a.b.duckdns.org" }, { hostname: "a&token=evil.duckdns.org" },
    { hostname: "-bad.duckdns.org" }, { hostname: "a".repeat(64) + ".duckdns.org" }, { hostname: "" },
    { nodeExit: 7 },
  ])("rechaza antes de red sin mutaciones %#", (options) => {
    const f = dnsFixture(options); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("medicia dns: rejected\n");
    expect(f.calls()).toEqual([]); expect(f.snapshot()).toEqual(before);
    expect(readFileSync(f.root + "/stages", "utf8")).toBe("node\n");
  });
  it.each([{ response: "KO" }, { response: "OK\n" }, { response: "OKextra" }, { response: "" }, { curlExit: 28 }, { curlExit: 6 }])("falla cerrada tras respuesta/red inválida %#", (options) => {
    const f = dnsFixture(options); const before = f.snapshot(); const result = f.run();
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("medicia dns: rejected\n");
    expect(f.calls()).toHaveLength(1); expect(f.calls()[0]).not.toContain(f.token); expect(f.snapshot()).toEqual(before);
  });
  it("acepta límites de label y token codificable sin inyección de config curl", () => {
    const f = dnsFixture({ hostname: "a".repeat(63) + ".duckdns.org", token: "?&=\\\"#%" });
    const result = f.run(); expect(result.status).toBe(0); expect(result.stdout).toBe("medicia dns: updated\n"); expect(result.stderr).toBe(""); expect(f.calls()).toHaveLength(1);
  });
  it("timer acotado no reactiva runtime y bootstrap instala solo DNS adicional", () => {
    const service = readFileSync(MODULE + "/templates/medicia-dns.service.tftpl", "utf8");
    const timer = readFileSync(MODULE + "/templates/medicia-dns.timer.tftpl", "utf8");
    expect(service).toContain("User=root"); expect(service).toContain("TimeoutStartSec=45"); expect(service).toContain("After=network-online.target");
    expect(service).not.toMatch(/(?:Requires|Wants)=.*medicia(?:-runtime)?\.service/);
    expect(service).toContain("ExecStart=/usr/local/libexec/medicia-dns");
    expect(timer).toContain("OnBootSec=60s"); expect(timer).toContain("OnUnitActiveSec=5min"); expect(timer).toContain("Unit=medicia-dns.service");
    const bootstrap = readFileSync(MODULE + "/templates/user-data.sh.tftpl", "utf8");
    expect(bootstrap).toContain("chmod 0700 /usr/local/libexec/medicia-dns"); expect(bootstrap).toContain("systemctl enable --now medicia-dns.timer");
  });
});

// Independent proxy fixtures; the 48 runtime/DNS controls above remain unchanged.
function proxyFixture(options: {
  active?: "challenge" | "tls"; certificates?: boolean; missingKey?: boolean;
  nginxFailure?: boolean; reloadFailures?: number; locked?: boolean;
} = {}) {
  const root = posix(mkdtempSync(join(tmpdir(), "medicia-proxy-")));
  scratchDirectories.push(root);
  const config = root + "/config";
  const certificates = root + "/certificates";
  mkdirSync(config); mkdirSync(certificates); mkdirSync(root + "/state");
  function render(name: string) {
    return readFileSync(MODULE + "/templates/" + name, "utf8")
      .replaceAll("${proxy_root}", config).replaceAll("${certificate_root}", certificates)
      .replaceAll("${state_root}", root + "/state")
      .replaceAll("${public_hostname}", "synthetic-demo.duckdns.org")
      .replaceAll("${hostname_pattern}", "synthetic-demo[.]duckdns[.]org")
      .replaceAll("$${", "${");
  }
  put(config + "/challenge.conf", render("nginx-challenge.conf.tftpl"));
  put(config + "/tls.conf", render("nginx.conf.tftpl"));
  if (options.active) put(config + "/active.conf", readFileSync(config + "/" + options.active + ".conf"));
  put(root + "/running", options.active ?? "stopped");
  if (options.certificates !== false) {
    put(certificates + "/fullchain.pem", "SYNTHETIC CERTIFICATE - not TLS proof");
    if (!options.missingKey) put(certificates + "/privkey.pem", "SYNTHETIC KEY - not a credential");
  }
  if (options.locked) mkdirSync(config + "/.activation-lock");
  put(root + "/proxy.sh", render("proxy.sh.tftpl"));
  put(root + "/external.cjs", `
const fs = require("node:fs"), root = process.env.FIXTURE;
const [command, ...args] = process.argv.slice(2);
fs.appendFileSync(root + "/calls", JSON.stringify([command, ...args]) + "\\n");
if (command === "nginx") {
  if (args.length !== 5 || args[0] !== "-t" || args[1] !== "-c" || !fs.existsSync(args[2]) || args[3] !== "-e" || args[4] !== "/dev/null") process.exit(94);
  process.exit(${options.nginxFailure ? 1 : 0});
}
if (command !== "systemctl" || args.join(" ") !== "reload medicia-nginx.service") process.exit(95);
const counter = root + "/reload-count", count = fs.existsSync(counter) ? Number(fs.readFileSync(counter)) + 1 : 1;
fs.writeFileSync(counter, String(count));
if (count <= ${options.reloadFailures ?? 0}) process.exit(1);
fs.writeFileSync(root + "/running", fs.readFileSync(root + "/config/active.conf"));
`);
  for (const command of ["nginx", "systemctl"]) {
    put(root + "/bin/" + command, "#!/bin/bash\nexec '" + posix(process.execPath) + "' \"$FIXTURE/external.cjs\" '" + command + "' \"$@\"\n");
  }
  const bin = (root + "/bin").replace(/^([A-Za-z]):/, drive => "/" + drive.charAt(0).toLowerCase());
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", FIXTURE: root, HOME: root, MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  function run(args = ["init"]) {
    return spawnSync("bash", ["-c", 'export PATH="$1:$PATH"; shift; exec bash "$@"', "fixture", bin, root + "/proxy.sh", ...args],
      { env, encoding: "utf8", timeout: 10000 });
  }
  const contents = (file: string) => existsSync(file) ? readFileSync(file, "utf8") : null;
  function snapshot() {
    return [contents(config + "/active.conf"), contents(root + "/running"),
      contents(config + "/challenge.conf"), contents(config + "/tls.conf"),
      contents(certificates + "/fullchain.pem"), contents(certificates + "/privkey.pem"),
      readdirSync(config).filter(name => name.startsWith("."))];
  }
  function calls(): string[][] {
    return existsSync(root + "/calls") ? readFileSync(root + "/calls", "utf8").trim().split("\n").map(line => JSON.parse(line) as string[]) : [];
  }
  return { root, config, run, snapshot, calls, contents };
}

describe("Nginx proxy aislado T015b", () => {
  it("initializes challenge-only after validation, without a certificate or reload", () => {
    const f = proxyFixture({ certificates: false }); const result = f.run();
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toBe("medicia proxy: configured\n"); expect(result.stderr).toBe("");
    expect(f.contents(f.config + "/active.conf")).toBe(f.contents(f.config + "/challenge.conf"));
    expect(f.calls().map(call => call[0])).toEqual(["nginx"]); expect(f.snapshot().at(-1)).toEqual([]);
  });
  it("reinitializing preserves existing TLS without downgrading or reloading", () => {
    const f = proxyFixture({ active: "tls" }); const before = f.snapshot(); const result = f.run();
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toBe("medicia proxy: configured\n"); expect(result.stderr).toBe("");
    expect(f.snapshot()).toEqual(before); expect(f.calls()).toEqual([["nginx", "-t", "-c", f.config + "/active.conf", "-e", "/dev/null"]]);
  });
  it("promotes only validated TLS and reloads only the owned service", () => {
    const f = proxyFixture({ active: "challenge" }); const result = f.run(["activate"]);
    expect(result.status, result.stderr).toBe(0); expect(result.stdout).toBe("medicia proxy: activated\n"); expect(result.stderr).toBe("");
    expect(f.contents(f.config + "/active.conf")).toBe(f.contents(f.config + "/tls.conf"));
    expect(f.contents(f.root + "/running")).toBe(f.contents(f.config + "/tls.conf"));
    expect(f.calls().map(call => call[0])).toEqual(["nginx", "systemctl"]);
    expect(f.calls()[1]).toEqual(["systemctl", "reload", "medicia-nginx.service"]); expect(f.snapshot().at(-1)).toEqual([]);
  });
  it.each([
    { active: "challenge" as const, certificates: false }, { active: "challenge" as const, missingKey: true },
    {}, { active: "challenge" as const, locked: true },
  ])("rejects missing prerequisites or concurrent activation without mutation %#", options => {
    const f = proxyFixture(options); const before = f.snapshot(); const result = f.run(["activate"]);
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("medicia proxy: rejected\n");
    expect(f.snapshot()).toEqual(before); expect(f.calls()).toEqual([]);
  });
  it("rejects Nginx validation failure before changing the active config or public state", () => {
    const f = proxyFixture({ active: "challenge", nginxFailure: true }); const before = f.snapshot(); const result = f.run(["activate"]);
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("medicia proxy: rejected\n");
    expect(f.calls().map(call => call[0])).toEqual(["nginx"]); expect(f.snapshot()).toEqual(before);
  });
  it.each([1, 2])("restores config on reload failure and reports rollback failure honestly: %i", reloadFailures => {
    const f = proxyFixture({ active: "challenge", reloadFailures }); const before = f.snapshot(); const result = f.run(["activate"]);
    expect(result.status).toBe(reloadFailures === 1 ? 1 : 2); expect(result.stdout).toBe("");
    expect(result.stderr).toBe(reloadFailures === 1 ? "medicia proxy: rejected\n" : "medicia proxy: rollback failed; inspect service\n");
    expect(f.calls().map(call => call[0])).toEqual(["nginx", "systemctl", "systemctl"]);
    expect(f.contents(f.config + "/active.conf")).toBe(before[0]);
    expect(f.snapshot().slice(2)).toEqual(before.slice(2));
    expect(f.contents(f.root + "/running")).toBe(reloadFailures === 1 ? before[0] : before[1]);
  });
  it.each([["bad"], ["activate", "extra"]])("rejects unsupported arguments without touching state: %j", (...args) => {
    const f = proxyFixture({ active: "challenge" }); const before = f.snapshot(); const result = f.run(args);
    expect(result.status).toBe(1); expect(result.stdout).toBe(""); expect(result.stderr).toBe("medicia proxy: rejected\n");
    expect(f.snapshot()).toEqual(before); expect(f.calls()).toEqual([]);
  });
  it("documents its private command without activating anything", () => {
    const f = proxyFixture(); const before = f.snapshot(); const result = f.run(["--help"]);
    expect(result.status).toBe(0); expect(result.stdout).toBe("Usage: medicia-proxy init|activate\n"); expect(result.stderr).toBe("");
    expect(f.snapshot()).toEqual(before); expect(f.calls()).toEqual([]);
  });
  it.each(["nginx-challenge.conf.tftpl", "nginx.conf.tftpl"])("rejects foreign hosts and keeps HTTP challenge-only or canonical redirect: %s", file => {
    const text = readFileSync(MODULE + "/templates/" + file, "utf8");
    expect(text).toContain("location ^~ /.well-known/acme-challenge/"); expect(text).toContain("try_files $uri =404;");
    expect(text).toContain('$http_host !~* "^${hostname_pattern}(:80)?$"'); expect(text).toContain("return 444;");
    const http = text.split("listen 80 default_server;")[1]?.split("listen 443")[0];
    expect(http).toBeDefined(); expect(http).not.toContain("proxy_pass");
    expect(text).toContain(file.startsWith("nginx-challenge") ? "return 404;" : "return 308 https://${public_hostname}$request_uri;");
  });
  it("TLS pins headers/loopback, preserves multipart and streams without clinical response caching", () => {
    const text = readFileSync(MODULE + "/templates/nginx.conf.tftpl", "utf8");
    for (const required of ["listen 443 ssl default_server;", "proxy_pass http://127.0.0.1:3000;",
      "proxy_set_header Host ${public_hostname};", "proxy_set_header X-Forwarded-Host ${public_hostname};",
      "proxy_set_header X-Forwarded-Proto https;", "proxy_set_header X-Forwarded-For $remote_addr;",
      'proxy_set_header Forwarded "";', "client_max_body_size 3m;", "proxy_buffering off;", "proxy_cache off;",
      'add_header Cache-Control "no-store" always;', "ssl_protocols TLSv1.2 TLSv1.3;",
      '$http_host !~* "^${hostname_pattern}(:443)?$"', "ssl_certificate ${certificate_root}/fullchain.pem;"])
      expect(text).toContain(required);
  });
  it("rejects foreign Origins while allowing absent or canonical HTTPS Origin", () => {
    const text = readFileSync(MODULE + "/templates/nginx.conf.tftpl", "utf8");
    expect(text).toContain('if ($http_origin !~* "^(https://${hostname_pattern}(:443)?)?$") { return 403; }');
  });
  it("dedicated unit and bootstrap do not overwrite or disable the AMI Nginx service", () => {
    const unit = readFileSync(MODULE + "/templates/medicia-nginx.service.tftpl", "utf8");
    const bootstrap = readFileSync(MODULE + "/templates/user-data.sh.tftpl", "utf8");
    expect(unit).toContain("ExecStartPre=/usr/local/libexec/medicia-proxy init");
    expect(unit).toContain("RuntimeDirectory=medicia-nginx"); expect(unit).toContain("-c /etc/medicia/nginx/active.conf");
    expect(unit).not.toMatch(/(?:Wants|Requires)=.*medicia(?:-runtime)?[.]service/);
    expect(bootstrap).toContain("systemctl is-active --quiet nginx.service");
    expect(bootstrap).toContain("systemctl is-enabled --quiet nginx.service");
    expect(bootstrap).toContain("systemctl enable --now medicia-nginx.service");
    expect(bootstrap).not.toMatch(/systemctl (?:disable|stop|mask) nginx/);
    expect(bootstrap).toContain("chmod 0700 /usr/local/libexec/medicia-proxy");
  });
});
