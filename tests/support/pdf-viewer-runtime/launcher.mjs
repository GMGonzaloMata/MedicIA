import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, lstat, mkdir, readFile, readdir, realpath, symlink, writeFile } from "node:fs/promises";
import { createServer, request } from "node:http";
import { createRequire } from "node:module";
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

const REPOSITORY = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const CACHE_ROOT = join(REPOSITORY, "node_modules", ".cache", "medicia-pdf-runtime");
export const APP_ROOT = join(CACHE_ROOT, "app");
export const DEPENDENCY_ROOT = resolve(REPOSITORY, "../Trabajo-lucho/node_modules");
export const LINK_PATH = join(APP_ROOT, "node_modules");
const OWNER = "medicia-pdf-runtime-launcher-v1";
const LINK_RECORD = join(CACHE_ROOT, "dependency-link.json");
const USAGE = "Usage: launcher.mjs prepare | preflight | --help";
const HELP = `${USAGE}\nprepare: synthetic files + exact owned dependency link; no server.\npreflight: owned loopback Next/Turbopack + MCP check; runtime deadline 29s after preparation.\n`;
const MARKER = "MEDICIA_SYNTHETIC_PREFLIGHT_ONLY";
const RUN_NAME = /^run-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SWC_PLATFORMS = ["darwin-arm64", "darwin-x64", "linux-arm64-gnu", "linux-arm64-musl", "linux-x64-gnu", "linux-x64-musl", "win32-arm64-msvc", "win32-x64-msvc"];

function samePath(a, b) {
  const normalize = (value) => process.platform === "win32" ? resolve(value).toLowerCase() : resolve(value);
  return typeof a === "string" && typeof b === "string" && normalize(a) === normalize(b);
}

export function parseCommand(args) {
  if (args.length === 1 && args[0] === "--help") return "help";
  if (args.length === 1 && ["prepare", "preflight"].includes(args[0])) return args[0];
  if (args.length === 2 && args[0] === "--worker" && RUN_NAME.test(args[1])) return "worker";
  throw new Error(USAGE);
}

/** Solo consulta claves del sistema explícitas; nunca enumera ni serializa el entorno padre. */
export function createEnvironment(inherited, runRoot) {
  if (dirname(runRoot) !== CACHE_ROOT || !/^(run-|unit-)[a-z0-9-]+$/.test(relative(CACHE_ROOT, runRoot))) {
    throw new Error("Invalid run directory.");
  }
  const home = join(runRoot, "home");
  const tmp = join(runRoot, "tmp");
  const systemRoot = inherited.SystemRoot || "C:\\Windows";
  if (process.platform === "win32" && (!isAbsolute(systemRoot) || /[\r\n\0]/.test(systemRoot))) throw new Error("Invalid OS directory.");
  return {
    ...(process.platform === "win32" ? { SystemRoot: systemRoot, WINDIR: systemRoot } : {}),
    PATH: [dirname(process.execPath), ...(process.platform === "win32" ? [join(systemRoot, "System32")] : [])].join(delimiter),
    HOME: home, USERPROFILE: home, APPDATA: join(home, "AppData", "Roaming"), LOCALAPPDATA: join(home, "AppData", "Local"),
    XDG_CONFIG_HOME: join(home, "config"), XDG_CACHE_HOME: join(home, "cache"), XDG_DATA_HOME: join(home, "data"),
    TMP: tmp, TEMP: tmp, TMPDIR: tmp, LANG: "C.UTF-8", TZ: "UTC", CI: "1", NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1", MEDICIA_PDF_RUNTIME_PREFLIGHT: "synthetic-only",
    npm_config_cache: join(home, "npm-cache"), npm_config_offline: "true", npm_config_ignore_scripts: "true", npm_config_audit: "false",
  };
}

export function fixtureFiles() {
  const dependencies = { next: "16.4.4", react: "19.3.0", "react-dom": "19.3.0" };
  // Lock sintético local: evita buscar/alterar un lock del checkout ancestro. Nunca se instala.
  const browserslist = ["last 1 Chrome version"];
  const packages = { "": { name: "medicia-synthetic-preflight", version: "0.0.0", dependencies } };
  for (const [name, version] of Object.entries(dependencies)) packages[`node_modules/${name}`] = { version };
  for (const platform of SWC_PLATFORMS) packages[`node_modules/@next/swc-${platform}`] = { version: "16.4.4", optional: true };
  return {
    "package.json": `${JSON.stringify({ name: "medicia-synthetic-preflight", version: "0.0.0", private: true, dependencies, browserslist }, null, 2)}\n`,
    "package-lock.json": `${JSON.stringify({ name: "medicia-synthetic-preflight", version: "0.0.0", lockfileVersion: 3, packages }, null, 2)}\n`,
    "next.config.mjs": `export default ${JSON.stringify({
      distDir: "runtime-dist", agentRules: false,
      turbopack: { root: APP_ROOT, resolveAlias: { "@swc/helpers": join(LINK_PATH, "@swc", "helpers") } },
      experimental: { agentUpgrade: false, turbopackAdditionalRoots: { registeredDependencies: { path: DEPENDENCY_ROOT } } },
    }, null, 2)};\n`,
    "app/layout.js": 'export default function Layout({ children }) { return <html lang="es"><body>{children}</body></html>; }\n',
    "app/page.js": `export default function Page() { return <main><h1>${MARKER}</h1><p>Preflight sintético; no prueba la aplicación ni sus guards.</p></main>; }\n`,
  };
}

export function validateAppEntries(names, directory = "") {
  const allowed = directory === "" ? ["app", "node_modules", "package.json", "package-lock.json", "next.config.mjs", "runtime-dist"]
    : directory === "app" ? ["layout.js", "page.js"] : null;
  if (!allowed) throw new Error("Unexpected isolated app directory.");
  if (names.some((name) => !allowed.includes(name))) throw new Error("Unexpected isolated app entry.");
}

export function validateLinkRecord(record, actualTarget) {
  if (!record || record.owner !== OWNER || !samePath(record.source, LINK_PATH) || !samePath(record.target, DEPENDENCY_ROOT)
    || !samePath(record.resolvedTarget, DEPENDENCY_ROOT) || !samePath(actualTarget, DEPENDENCY_ROOT)
    || record.kind !== (process.platform === "win32" ? "junction" : "dir")) throw new Error("Dependency link ownership mismatch.");
}

async function maybeStat(path) {
  try { return await lstat(path); } catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

/** Todas las escrituras pasan por ancestros reales; jamás se escribe dentro del enlace autorizado. */
async function ensureDirectory(path) {
  const parts = relative(REPOSITORY, path).split(sep);
  if (parts.some((part) => part === "..") || !samePath(path, CACHE_ROOT) && !path.startsWith(`${CACHE_ROOT}${sep}`)) throw new Error("Write outside runtime cache.");
  if (samePath(path, LINK_PATH) || path.startsWith(`${LINK_PATH}${sep}`)) throw new Error("Write through dependency link denied.");
  let current = REPOSITORY;
  for (const part of parts) {
    current = join(current, part);
    const stat = await maybeStat(current);
    if (!stat) await mkdir(current);
    else if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Runtime directory must not be a link.");
  }
}

async function assertPlainTree(path) {
  const stat = await lstat(path);
  if (stat.isSymbolicLink()) throw new Error("Unexpected link in isolated app.");
  if (!stat.isFile() && !stat.isDirectory()) throw new Error("Unexpected isolated file type.");
  if (stat.isDirectory()) for (const name of await readdir(path)) await assertPlainTree(join(path, name));
}

async function checkApp() {
  validateAppEntries(await readdir(APP_ROOT));
  const app = join(APP_ROOT, "app");
  if (await maybeStat(app)) {
    const stat = await lstat(app);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Unexpected isolated app directory.");
    validateAppEntries(await readdir(app), "app");
    await assertPlainTree(app);
  }
  const dist = join(APP_ROOT, "runtime-dist");
  if (await maybeStat(dist)) await assertPlainTree(dist);
  for (const name of ["package.json", "package-lock.json", "next.config.mjs"]) {
    const stat = await maybeStat(join(APP_ROOT, name));
    if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new Error("Unexpected synthetic file type.");
  }
}

async function verifyDependencies() {
  const stat = await lstat(DEPENDENCY_ROOT);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(await realpath(DEPENDENCY_ROOT), DEPENDENCY_ROOT)) throw new Error("Registered dependency target must be an exact real directory.");
  for (const [name, version] of Object.entries({ next: "16.4.4", react: "19.3.0", "react-dom": "19.3.0" })) {
    const directoryStat = await lstat(join(DEPENDENCY_ROOT, name));
    const manifestStat = await lstat(join(DEPENDENCY_ROOT, name, "package.json"));
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink() || !manifestStat.isFile() || manifestStat.isSymbolicLink()) throw new Error("Dependency package must be a real directory with a regular manifest.");
    const manifest = JSON.parse(await readFile(join(DEPENDENCY_ROOT, name, "package.json"), "utf8"));
    if (manifest.version !== version) throw new Error("Registered dependency version mismatch.");
  }
  const native = process.platform === "win32" ? `win32-${process.arch}-msvc` : process.platform === "darwin" ? `darwin-${process.arch}` : null;
  if (!SWC_PLATFORMS.includes(native)) throw new Error("Native Turbopack precheck is unavailable on this platform.");
  const require = createRequire(join(DEPENDENCY_ROOT, "next", "package.json"));
  const nativePath = require.resolve(`@next/swc-${native}`);
  if (!nativePath.startsWith(`${DEPENDENCY_ROOT}${sep}`)) throw new Error("Native binding outside registered dependencies.");
  const nativeStat = await lstat(nativePath);
  if (!nativeStat.isFile() || nativeStat.isSymbolicLink() || !nativePath.endsWith(".node")) throw new Error("Installed native binary is required; downloads are not allowed.");
  const nativeManifest = JSON.parse(await readFile(join(DEPENDENCY_ROOT, "@next", `swc-${native}`, "package.json"), "utf8"));
  if (nativeManifest.version !== "16.4.4") throw new Error("Native binding version mismatch.");
  return nativePath;
}

export async function prepareRuntime() {
  await verifyDependencies();
  await ensureDirectory(APP_ROOT);
  await checkApp();
  const sourceStat = await maybeStat(LINK_PATH);
  if (!sourceStat) {
    if (await maybeStat(LINK_RECORD)) throw new Error("Orphaned dependency ownership record; no replacement allowed.");
    // Exclusivamente este enlace. En Windows se usa la junction autorizada, sin elevación ni reintento.
    const kind = process.platform === "win32" ? "junction" : "dir";
    await symlink(DEPENDENCY_ROOT, LINK_PATH, kind);
    const resolvedTarget = await realpath(LINK_PATH);
    const record = { owner: OWNER, source: LINK_PATH, target: DEPENDENCY_ROOT, resolvedTarget, kind, createdAt: new Date().toISOString() };
    validateLinkRecord(record, resolvedTarget);
    await writeFile(LINK_RECORD, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx" });
  } else {
    if (!sourceStat.isSymbolicLink()) throw new Error("Existing dependency path is not an owned link; no replacement allowed.");
    const recordStat = await lstat(LINK_RECORD);
    if (!recordStat.isFile() || recordStat.isSymbolicLink()) throw new Error("Dependency ownership record must be a regular file.");
    const record = JSON.parse(await readFile(LINK_RECORD, "utf8"));
    validateLinkRecord(record, await realpath(LINK_PATH));
  }
  await ensureDirectory(join(APP_ROOT, "app"));
  for (const [name, content] of Object.entries(fixtureFiles())) {
    const path = join(APP_ROOT, name);
    if (!await maybeStat(path)) await writeFile(path, content, { flag: "wx" });
    else if (await readFile(path, "utf8") !== content) throw new Error("Existing synthetic file differs; no replacement allowed.");
  }
  await checkApp();
  return { appRoot: APP_ROOT, dependencyLink: LINK_PATH, resolvedTarget: await realpath(LINK_PATH), serverStarted: false };
}

export function parseMcpResponse(raw, id) {
  try {
    const messages = raw.trim().startsWith("{") ? [raw] : raw.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim());
    const message = messages.map((value) => JSON.parse(value)).find((value) => value.id === id);
    if (!message || message.error || !("result" in message)) throw new Error();
    return message.result;
  } catch { throw new Error("Invalid MCP response."); }
}

export function validateCompilation(result) {
  try {
    if (result.isError || result.content.length !== 1 || result.content[0].type !== "text") throw new Error();
    const data = JSON.parse(result.content[0].text);
    if (data.error || !Array.isArray(data.issues) || data.issues.length !== 0) throw new Error();
  } catch { throw new Error("Turbopack compilation was not clean."); }
}

async function captureHttp({ port, path, payload, logRoot, label, signal }) {
  // Sin DNS, proxy ni redirects; solo el puerto informado por nuestro propio hijo vía IPC.
  const body = payload ? JSON.stringify(payload) : undefined;
  return new Promise((accept, reject) => {
    const req = request({ hostname: "127.0.0.1", port, path, method: body ? "POST" : "GET", signal,
      headers: body ? { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "Content-Length": Buffer.byteLength(body) } : {} }, (res) => {
      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > 1024 * 1024) res.destroy(new Error("Local response exceeded 1 MiB."));
        else chunks.push(chunk);
      });
      res.on("error", reject);
      res.on("end", async () => {
        try {
          const raw = Buffer.concat(chunks);
          await writeFile(join(logRoot, `${label}.body`), raw, { flag: "wx" });
          await writeFile(join(logRoot, `${label}.http.json`), JSON.stringify({ status: res.statusCode, headers: res.headers, request: payload || { path } }, null, 2), { flag: "wx" });
          if (res.statusCode !== 200) throw new Error("Owned local endpoint did not return HTTP 200.");
          accept(raw.toString("utf8"));
        } catch (error) { reject(error); }
      });
    });
    req.on("error", reject);
    req.end(body);
  });
}

/** Stop accepting requests, close owned connections, then finish application cleanup. */
export async function closeOwnedRuntime({ stopAccepting, closeConnections, closeApplication }) {
  const httpClosed = stopAccepting();
  closeConnections();
  await httpClosed;
  await closeApplication();
}

async function runWorker() {
  if (!process.send || !process.connected) throw new Error("Worker requires an owning IPC parent.");
  if (!samePath(process.cwd(), APP_ROOT) || process.env.MEDICIA_PDF_RUNTIME_PREFLIGHT !== "synthetic-only") throw new Error("Worker is not in the isolated application.");
  await prepareRuntime();
  // Dentro del hijo ya sanitizado: falla ANTES de Next y de cualquier descarga de fallback.
  createRequire(join(APP_ROOT, "package.json"))(await verifyDependencies());
  let app;
  let ready = false;
  let stopping = false;
  const server = createServer((req, res) => {
    if (!ready) { res.writeHead(503); res.end("Preparing synthetic preflight."); return; }
    app.getRequestHandler()(req, res).catch((error) => { console.error(error); res.destroy(); });
  });
  const ownedSockets = new Set();
  server.on("connection", (socket) => {
    ownedSockets.add(socket);
    socket.once("close", () => ownedSockets.delete(socket));
  });
  async function stop() {
    if (stopping) return;
    stopping = true;
    await closeOwnedRuntime({
      stopAccepting: () => new Promise((done, reject) => server.close((error) => error ? reject(error) : done())),
      closeConnections: () => {
        server.closeAllConnections();
        // closeAllConnections excludes upgraded sockets; all these sockets belong to this server.
        for (const socket of ownedSockets) socket.destroy();
      },
      closeApplication: async () => { await app?.close(); },
    });
    await new Promise((done, reject) => process.send({ type: "stopped", pid: process.pid }, (error) => error ? reject(error) : done()));
    process.exitCode = 0;
    process.disconnect();
    // Resource types only: diagnostics must not turn a forced exit into a successful teardown.
    console.log(JSON.stringify({ shutdownResourceTypes: process.getActiveResourcesInfo() }));
  }
  process.on("message", (message) => { if (message?.type === "stop") stop().catch((error) => { console.error(error); process.exit(1); }); });
  process.on("disconnect", () => { if (!stopping) stop().catch((error) => { console.error(error); process.exit(1); }); });
  // Puerto 0 se asigna atómicamente al servidor dueño; no se exploran ni reutilizan servidores existentes.
  await new Promise((done, reject) => { server.once("error", reject); server.listen({ host: "127.0.0.1", port: 0, exclusive: true }, done); });
  const port = server.address().port;
  const require = createRequire(join(APP_ROOT, "package.json"));
  const next = require("next");
  app = next({ dev: true, dir: APP_ROOT, hostname: "127.0.0.1", port, httpServer: server, turbopack: true });
  await app.prepare();
  if (!stopping) {
    ready = true;
    process.send({ type: "ready", pid: process.pid, port });
  }
}

async function within(promise, milliseconds) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error("Bounded preflight deadline exceeded; no retry.")), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

async function runPreflight(logRoot) {
  const environment = createEnvironment(process.env, logRoot);
  for (const key of ["HOME", "APPDATA", "LOCALAPPDATA", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "TMPDIR", "npm_config_cache"]) await ensureDirectory(environment[key]);
  const child = spawn(process.execPath, ["--", fileURLToPath(import.meta.url), "--worker", relative(CACHE_ROOT, logRoot)], {
    cwd: APP_ROOT, env: environment, shell: false, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  const stdout = createWriteStream(join(logRoot, "server.stdout.log"), { flags: "wx" });
  const stderr = createWriteStream(join(logRoot, "server.stderr.log"), { flags: "wx" });
  child.stdout.pipe(stdout); child.stderr.pipe(stderr);
  let acknowledgedStop = false;
  let failure;
  let exit;
  const closed = new Promise((done) => child.once("close", (code, signal) => { exit = { code, signal }; done(); }));
  const abort = new AbortController();
  const deadline = setTimeout(() => abort.abort(), 24000);
  const hardDeadline = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL"); }, 28000);
  try {
    await writeFile(join(logRoot, "owner.json"), JSON.stringify({ launcherPid: process.pid, workerPid: child.pid, executable: process.execPath, appRoot: APP_ROOT, startedAt: new Date().toISOString(), deadlineMs: 29000 }, null, 2), { flag: "wx" });
    const ready = await within(new Promise((done, reject) => {
      child.once("error", reject);
      child.once("exit", () => reject(new Error("Owned Next worker exited before readiness.")));
      child.on("message", (message) => {
        if (message?.type === "stopped" && message.pid === child.pid) acknowledgedStop = true;
        if (message?.type === "ready" && message.pid === child.pid && Number.isInteger(message.port) && message.port > 0 && message.port <= 65535) done(message);
      });
    }), 24000);
    await writeFile(join(logRoot, "ready.json"), JSON.stringify(ready, null, 2), { flag: "wx" });
    const get = (path, label, payload) => captureHttp({ port: ready.port, path, payload, label, logRoot, signal: abort.signal });
    const html = await get("/", "page");
    if (!html.includes(MARKER)) throw new Error("Synthetic page marker missing.");
    const tools = parseMcpResponse(await get("/_next/mcp", "tools-list", { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }), 1);
    if (!Array.isArray(tools.tools) || !tools.tools.some((tool) => tool.name === "get_compilation_issues")) throw new Error("Required Next MCP compilation tool missing.");
    const compilation = parseMcpResponse(await get("/_next/mcp", "compilation", { jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "get_compilation_issues", arguments: {} } }), 2);
    validateCompilation(compilation);
  } catch (error) { failure = error; }
  finally {
    clearTimeout(deadline); abort.abort();
    if (child.connected) child.send({ type: "stop" }, (error) => { if (error) failure ??= error; });
    await Promise.race([closed, delay(2500)]);
    if (!exit) { child.kill("SIGKILL"); await Promise.race([closed, delay(1000)]); }
    clearTimeout(hardDeadline);
    await writeFile(join(logRoot, "server.exit.json"), JSON.stringify({ ...exit, acknowledgedStop, workerPid: child.pid, teardownConfirmed: Boolean(exit && acknowledgedStop && exit.code === 0) }, null, 2), { flag: "wx" });
  }
  if (!exit || !acknowledgedStop || exit.code !== 0) throw new Error("Owned worker graceful teardown unconfirmed; inspect owner and exit logs. No other process was killed.");
  if (failure) throw failure;
  return { syntheticOnly: true, next: "16.4.4", turbopackCompilationClean: true, mcpToolsListed: true, ownedWorkerStopped: true, logRoot };
}

async function main() {
  const mode = parseCommand(process.argv.slice(2));
  if (mode === "help") { process.stdout.write(HELP); return; }
  if (mode === "worker") { await runWorker(); return; }
  const logRoot = join(CACHE_ROOT, `run-${randomUUID()}`);
  await ensureDirectory(logRoot);
  await writeFile(join(logRoot, "launcher.stdout.log"), "", { flag: "wx" });
  await writeFile(join(logRoot, "launcher.stderr.log"), "", { flag: "wx" });
  try {
    const prepared = await prepareRuntime();
    const result = mode === "prepare" ? { ...prepared, logRoot } : await runPreflight(logRoot);
    const raw = `${JSON.stringify(result, null, 2)}\n`;
    await appendFile(join(logRoot, "launcher.stdout.log"), raw);
    process.stdout.write(raw);
    await writeFile(join(logRoot, "launcher.exit.json"), '{"code":0}\n', { flag: "wx" });
  } catch (error) {
    const raw = `${error.message}\nEvidence: ${logRoot}\n`;
    await appendFile(join(logRoot, "launcher.stderr.log"), raw);
    await writeFile(join(logRoot, "launcher.exit.json"), '{"code":1}\n', { flag: "wx" });
    process.stderr.write(raw);
    process.exitCode = 1;
  }
}

// Importar o ejecutar las pruebas nunca inicia un servidor. Solo el modo explícito preflight lo hace.
if (process.argv[1] && samePath(process.argv[1], fileURLToPath(import.meta.url))) {
  main().catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
