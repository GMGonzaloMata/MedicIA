import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, lstatSync, readlinkSync, symlinkSync, linkSync, truncateSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { gunzipSync } from "node:zlib";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it } from "vitest";

const script = resolve("infra/scripts/package-demo.sh");
const roots: string[] = [];
// La limpieza del fixture de 100000 entradas usa el mismo presupuesto ya declarado por ese caso.
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); }, 600000);
function fixture(hook = "") {
  const root = mkdtempSync(join(tmpdir(), "medicia-package-")); roots.push(root);
  const input = join(root, "input"); const bin = join(root, "bin");
  mkdirSync(input); mkdirSync(bin);
  function put(name: string, body = "synthetic") { const path = join(input, name); mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, body); }
  put("release.json", JSON.stringify({ platform: "linux", arch: "x64", node: 24 }));
  for (const name of [".next/BUILD_ID", "node_modules/next/dist/bin/next", "generated/prisma/client.ts"]) put(name);
  // Doble explícito Windows: solo identidad del proceso; no prueba Linux/ABI/build real.
  writeFileSync(join(bin, "node"), `#!/usr/bin/env bash\nexec '${process.execPath.replaceAll("\\", "/")}' -e 'Object.defineProperty(process,"platform",{value:"linux",configurable:true});Object.defineProperty(process,"arch",{value:"x64",configurable:true});Object.defineProperty(process.versions,"node",{value:"24.0.0",configurable:true});eval(Buffer.from("${Buffer.from(hook).toString("base64")}","base64").toString());eval(require("node:fs").readFileSync(0,"utf8"))' "$@"\n`, { mode: 0o755 });
  for (const tool of ["npm", "npx", "prisma", "aws", "next", "build", "install", "pnpm", "yarn"]) writeFileSync(join(bin, tool), `#!/usr/bin/env bash\nprintf called > '${root.replaceAll("\\", "/")}/external-call'\nexit 99\n`, { mode: 0o755 });
  const output = join(root, "release.tar.gz");
  function run(args = [input, output], timeout = 20000) {
    const env: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", NODE_ENV: "test" };
    if (process.platform === "win32") env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
    const bashBin = bin.replaceAll("\\", "/").replace(/^([A-Za-z]):/, drive => "/" + drive.charAt(0).toLowerCase());
    return spawnSync("bash", ["-c", 'export PATH="$1:$PATH"; shift; exec bash "$@"', "fixture", bashBin, script, ...args], { env, encoding: "utf8", timeout });
  }
  return { root, input, output, put, run };
}
function snapshot(path: string): string[] {
  return readdirSync(path).sort().flatMap(name => {
    const item = join(path, name); const stat = lstatSync(item);
    if (stat.isSymbolicLink()) return [name + ":link:" + readlinkSync(item)];
    if (stat.isDirectory()) return [name + ":directory", ...snapshot(item).map(child => name + "/" + child)];
    if (!stat.isFile()) return [name + ":special"];
    // Los fixtures de overflow son sparse: no leer 512 MiB para probar rechazo temprano.
    return [name + ":" + [stat.size, stat.mode, stat.nlink, stat.ino, stat.mtimeMs, stat.ctimeMs].join(":") + ":" + (stat.size < 1024 * 1024 ? createHash("sha256").update(readFileSync(item)).digest("hex") : "sparse")];
  });
}
function packaged(f: ReturnType<typeof fixture>) {
  const before = snapshot(f.input); const result = f.run();
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]);
  expect(snapshot(f.input)).toEqual(before);
  expect(readdirSync(f.root).sort()).toEqual(["bin", "input", "release.tar.gz", "release.tar.gz.sha256"]);
  const packed = readFileSync(f.output); const sha = createHash("sha256").update(packed).digest("hex");
  expect(readFileSync(f.output + ".sha256", "utf8")).toBe(sha + "\n");
  const consumer = readFileSync("infra/modules/demo-host/templates/runtime.sh.tftpl", "utf8");
  const validator = consumer.slice(consumer.indexOf("if (packed.length >"), consumer.indexOf("throw Error('platform');") + "throw Error('platform');".length);
  expect(validator.length).toBeGreaterThan(2000);
  // Solo validador de archivo como datos; nunca bootstrap/servicio/import de aplicación.
  expect(() => runInNewContext(validator, { packed, config: Object.fromEntries<string>([["release_sha256", sha]]), createHash, gunzipSync })).not.toThrow();
  return gunzipSync(packed);
}
it("packages a valid tree, SHA and exact unchanged consumer validator", () => {
  packaged(fixture());
});
const nextRuntimePath = "node_modules/next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.production.js";
for (const name of [
  nextRuntimePath,
  "a".repeat(75) + "/" + "b".repeat(79) + "/" + "c".repeat(100),
  "a".repeat(100) + "/" + "b".repeat(55) + "/" + "c".repeat(44),
]) it(`ustar accepts representable long path ${name}`, () => {
  const f = fixture(); f.put(name, "synthetic-long-runtime");
  if (name === nextRuntimePath) f.put("node_modules/next/dist/server/app-render/server.node.js", 'require("../../compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-server.node.production.js")');
  const tar = packaged(f);
  const entries = new Map<string, { prefix: string; name: string; body: string }>();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const field = (start: number, end: number) => header.subarray(start, end).toString("ascii").split("\0")[0];
    const short = field(0, 100); const prefix = field(345, 500);
    const size = parseInt(field(124, 136), 8);
    expect(["0", "5"]).toContain(field(156, 157));
    entries.set((prefix ? prefix + "/" : "") + short, { prefix, name: short, body: tar.subarray(offset + 512, offset + 512 + size).toString() });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const entry = entries.get(name);
  expect(entry?.body).toBe("synthetic-long-runtime");
  expect(entry?.prefix.length).toBeGreaterThan(0); expect(entry?.prefix.length).toBeLessThanOrEqual(155);
  expect(entry?.name.length).toBeLessThanOrEqual(100);
  if (name.length === 256) { expect(entry?.prefix.length).toBe(155); expect(entry?.name.length).toBe(100); }
  if (name === nextRuntimePath) expect(entries.get("node_modules/next/dist/server/app-render/server.node.js")?.body).toContain("react-server-dom-turbopack-server.node.production.js");
});
for (const name of [
  "a".repeat(75) + "/" + "b".repeat(80) + "/" + "c".repeat(100),
  "a".repeat(75) + "/" + "b".repeat(79) + "/" + "c".repeat(101),
  "a/" + "b".repeat(101),
  "a".repeat(100) + "/.env.production",
  "a".repeat(100) + "/credentials",
]) it(`ustar rejects unrepresentable or unsafe long path ${name}`, () => {
  const f = fixture(); f.put(name); rejected(f);
});
it("documents help and rejects malformed CLI", () => {
  const f = fixture();
  expect([f.run(["--help"]).status, f.run(["--help"]).stdout, f.run(["--help"]).stderr]).toEqual([0, "Usage: package-demo.sh INPUT OUTPUT.tar.gz\n", ""]);
  const result = f.run([]); expect([result.status, result.stdout, result.stderr]).toEqual([2, "", "Usage: package-demo.sh INPUT OUTPUT.tar.gz\n"]);
});
for (const name of [".env", ".env.production", ".aws/config", ".git/config", "credentials", "tests/data", "x.tfstate", "x.tfvars", "patients/a", "studies/a", "node_modules/patients/a", "generated/studies/a", "secrets/a", ".next/cache/a", "a".repeat(101)]) {
  it(`rejects contamination/unsupported path ${name} without mutation`, () => {
    const f = fixture(); f.put(name); const before = snapshot(f.input); const result = f.run();
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
    expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input"]);
  });
}
it("acepta las rutas patients y studies del build de Next, pero solo dentro de .next", () => {
  const f = fixture();
  for (const name of [".next/server/app/studies/page.js", ".next/server/app/(dashboard)/clinic/patients/page.js"]) f.put(name);
  const result = f.run();
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]);
});
for (const body of ["", "{}", "not-json", '{"platform":"win32","arch":"x64","node":24}', '{"platform":"linux","arch":"arm64","node":24}', '{"platform":"linux","arch":"x64","node":22}']) {
  it(`rejects metadata ${body}`, () => {
    const f = fixture(); f.put("release.json", body); const before = snapshot(f.input); const result = f.run();
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
    expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input"]);
  });
}
it("rejects empty required files, overflow, outputs inside input and existing operator output", () => {
  for (const mode of ["empty", "overflow", "inside", "exists"]) {
    const f = fixture(); let output = f.output;
    if (mode === "empty") f.put(".next/BUILD_ID", "");
    if (mode === "overflow") { f.put("large"); truncateSync(join(f.input, "large"), 512 * 1024 * 1024); }
    if (mode === "inside") output = join(f.input, "out.tar.gz");
    if (mode === "exists") writeFileSync(output, "operator");
    const before = snapshot(f.input); const result = f.run([f.input, output]);
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
    expect(snapshot(f.input)).toEqual(before);
    expect(readdirSync(f.root).sort()).toEqual(mode === "exists" ? ["bin", "input", "release.tar.gz"] : ["bin", "input"]);
    if (mode === "exists") expect(readFileSync(output, "utf8")).toBe("operator");
  }
});
it.skipIf(process.platform === "win32")("rejects colon paths (Windows represents colon as ADS, not a directory entry)", () => {
  const f = fixture(); f.put("bad:name"); const before = snapshot(f.input); const result = f.run();
  expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
  expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input"]);
});
for (const name of ["release.json", ".next/BUILD_ID", "node_modules/next/dist/bin/next", "generated/prisma/client.ts"]) {
  for (const mode of ["missing", "empty", "directory"]) it(`rejects ${mode} ${name}`, () => {
    const f = fixture();
    if (mode !== "empty") rmSync(join(f.input, name)); else f.put(name, "");
    if (mode === "directory") mkdirSync(join(f.input, name));
    const before = snapshot(f.input); const result = f.run();
    expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
    expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input"]);
  });
}
function rejected(f: ReturnType<typeof fixture>, extra: string[] = [], timeout = 20000) {
  const before = snapshot(f.input); const result = f.run(undefined, timeout);
  expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
  expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input", ...extra].sort());
}
for (const field of ["platform", "arch", "node"]) it(`rejects incompatible actual process ${field}`, () => {
  const target = field === "node" ? "process.versions" : "process";
  rejected(fixture(`Object.defineProperty(${target},${JSON.stringify(field)},{value:"unsupported"});`));
});
it("rejects hardlinks and internal directory links", () => {
  for (const type of ["hard", "internal"]) {
    const f = fixture();
    if (type === "hard") linkSync(join(f.input, ".next/BUILD_ID"), join(f.input, "linked"));
    else symlinkSync(join(f.input, ".next"), join(f.input, "linked"), "junction");
    rejected(f);
  }
});
it.skipIf(process.platform === "win32")("rejects FIFO and backslash/control paths on Linux", () => {
  for (const name of ["fifo", "bad\\\\name", "bad\\nname"]) {
    const f = fixture();
    if (name === "fifo") expect(spawnSync("mkfifo", [join(f.input, name)], { env: { NODE_ENV: "test", PATH: "/usr/bin:/bin" }, timeout: 20000 }).status).toBe(0);
    else f.put(name);
    rejected(f);
  }
});
it("accepts 100-byte names; rejects preexisting checksum without touching operator files", () => {
  const f = fixture(); f.put("a".repeat(100)); const before = snapshot(f.input); const result = f.run();
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]); expect(snapshot(f.input)).toEqual(before);
  const collision = fixture(); writeFileSync(collision.output + ".sha256", "operator");
  rejected(collision, ["release.tar.gz.sha256"]); expect(readFileSync(collision.output + ".sha256", "utf8")).toBe("operator");
});
// Inyección determinista en la llamada real a linkSync: simula al operador entre chequeo y publicación.
for (const target of ["archive", "checksum", "removed-archive"]) it(`preserves concurrent operator collision ${target}`, () => {
  const hook = `const fs=require("node:fs"), original=fs.linkSync; fs.linkSync=function(source,target){
    if (${JSON.stringify(target)} === "archive" || target.endsWith(".sha256")) {
      if (${JSON.stringify(target)} === "removed-archive") fs.unlinkSync(target.slice(0,-7));
      fs.writeFileSync(target,"operator",{flag:"wx"});
    } return original(source,target); };`;
  const f = fixture(hook); const suffix = target === "archive" ? "release.tar.gz" : "release.tar.gz.sha256";
  rejected(f, [suffix]); expect(readFileSync(join(f.root, suffix), "utf8")).toBe("operator");
});
// Fault injection del resultado gzip real: ejercita guards del CLI antes de publicar, sin extraer.
for (const rule of ["../escape", "/absolute", "a/../b", "a//b", "a/./b", "a\\\\b", "a:b", "bad\nname", "duplicate", "link", "pax", "longname", "size", "checksum"]) it(`rejects finalized archive ${rule}`, () => {
  const f = fixture(`const z=require("node:zlib"), gzip=z.gzipSync; z.gzipSync=function(...args){
    const tar=z.gunzipSync(gzip(...args)), rule=${JSON.stringify(rule)}, header=tar.subarray(0,512);
    if(rule==="duplicate") { tar.fill(0,512,612); tar.write(".next",512); }
    else if(["link","pax","longname"].includes(rule)) header[156]=({link:50,pax:120,longname:76})[rule];
    else if(rule==="size") header.write("77777777777",124);
    else if(rule==="checksum") header[0]^=1;
    else { header.fill(0,0,100); header.write(rule,0); }
    if(rule!=="checksum") { const h=rule==="duplicate"?tar.subarray(512,1024):header;
      h.fill(32,148,156); h.write(h.reduce((sum,b)=>sum+b,0).toString(8).padStart(7,"0")+"\\0",148); }
    return gzip(tar); };`);
  rejected(f);
});
for (const prefix of ["../escape", "/absolute", "a/../b", "a//b", "a/./b", "a\\b", "a:b", "bad\nname", "bad\u0080name", "credentials", "tests", "longsafe/.env.production"]) it(`ustar rejects unsafe finalized prefix ${JSON.stringify(prefix)}`, () => {
  const f = fixture(`const z=require("node:zlib"), gzip=z.gzipSync; z.gzipSync=function(...args){
    const tar=z.gunzipSync(gzip(...args)), header=tar.subarray(0,512);
    header.fill(0,345,500); header.write(${JSON.stringify(prefix)},345,"latin1");
    header.fill(32,148,156); header.write(header.reduce((sum,b)=>sum+b,0).toString(8).padStart(7,"0")+"\\0",148);
    return gzip(tar); };`);
  rejected(f);
});
function treeMetrics(directory: string): { entries: number; bytes: number } {
  let entries = 0; let bytes = 0;
  for (const name of readdirSync(directory)) {
    const location = join(directory, name); const stat = lstatSync(location); entries++; bytes += 512;
    if (stat.isDirectory()) { const child = treeMetrics(location); entries += child.entries; bytes += child.bytes; }
    else bytes += Math.ceil(stat.size / 512) * 512;
  }
  return { entries, bytes };
}
it("[large] accepts exactly 512 MiB expanded and rejects one additional padded block", () => {
  const f = fixture(); f.put("large", "");
  const size = 512 * 1024 * 1024 - 1024 - treeMetrics(f.input).bytes;
  truncateSync(join(f.input, "large"), size);
  const before = snapshot(f.input); const result = f.run(undefined, 180000);
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]);
  expect(snapshot(f.input)).toEqual(before); expect(gunzipSync(readFileSync(f.output)).length).toBe(512 * 1024 * 1024);
  rmSync(f.output); rmSync(f.output + ".sha256"); truncateSync(join(f.input, "large"), size + 1); rejected(f, [], 180000);
}, 240000);
it("[large] accepts existing consumer limit 100000 entries and rejects 100001", () => {
  const f = fixture(); const needed = 100000 - treeMetrics(f.input).entries;
  for (let i = 0; i < needed; i++) writeFileSync(join(f.input, `q${i}`), "");
  const before = snapshot(f.input); const result = f.run(undefined, 300000);
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]); expect(snapshot(f.input)).toEqual(before);
  rmSync(f.output); rmSync(f.output + ".sha256"); f.put("overflow", ""); rejected(f, [], 300000);
}, 600000);
for (const excess of [0, 1]) it(`[large] compressed limit 128 MiB plus ${excess}`, () => {
  // Gzip válido con comentario sintético grande; evita random/compresión costosa de 128 MiB.
  const f = fixture(`const z=require("node:zlib"), gzip=z.gzipSync; z.gzipSync=function(...args){
    const packed=gzip(...args), header=Buffer.from(packed.subarray(0,10)); header[3]|=16;
    return Buffer.concat([header,Buffer.alloc(128*1024*1024+${excess}-packed.length-1,65),Buffer.from([0]),packed.subarray(10)]); };`);
  if (excess) { rejected(f, [], 180000); return; }
  const before = snapshot(f.input); const result = f.run(undefined, 180000);
  expect([result.status, result.stdout, result.stderr]).toEqual([0, "medicia package: created\n", ""]); expect(snapshot(f.input)).toEqual(before);
  const packed = readFileSync(f.output); expect(packed.length).toBe(128 * 1024 * 1024); expect(() => gunzipSync(packed)).not.toThrow();
  expect(readFileSync(f.output + ".sha256", "utf8")).toBe(createHash("sha256").update(packed).digest("hex") + "\n");
}, 240000);
it("rejects escaping links", () => {
  const f = fixture(); symlinkSync(f.root, join(f.input, "escape"), "junction");
  const before = snapshot(f.input); const result = f.run();
  expect([result.status, result.stdout, result.stderr]).toEqual([1, "", "medicia package: rejected\n"]);
  expect(snapshot(f.input)).toEqual(before); expect(readdirSync(f.root).sort()).toEqual(["bin", "input"]);
});
