import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import * as f from "node:fs";
import * as os from "node:os";
import * as p from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

// Synthetic PKI only. No real Certbot, ACME, AWS or project environment files are executed/read.
const hostname = "synthetic-demo.duckdns.org";
const roots: string[] = [];
let material = "";
beforeAll(() => {
  material = f.mkdtempSync(p.join(os.tmpdir(), "medicia-acme-pki-"));
  const empty = p.join(material, "empty.cnf"); f.writeFileSync(empty, "");
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  for (const [name, domain] of [["valid", hostname], ["other", "other.duckdns.org"]]) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", p.join(material, name + ".key"),
      "-out", p.join(material, name + ".pem"), "-subj", "/CN=" + domain, "-days", "1", "-addext", "subjectAltName=DNS:" + domain,
      "-config", empty], { env, timeout: 20000, stdio: "pipe" });
  }
});
afterEach(() => { for (const root of roots.splice(0)) f.rmSync(root, { recursive: true, force: true }); });
afterAll(() => { if (material) f.rmSync(material, { recursive: true, force: true }); });

function fixture(options: { accept?: boolean; email?: string; mode?: string; proxyExit?: number; unprivileged?: boolean; writable?: boolean; clockDays?: number } = {}) {
  const root = f.mkdtempSync(p.join(os.tmpdir(), "medicia-acme-")); roots.push(root);
  const config = { acceptTerms: options.accept ?? true, email: options.email ?? "ops@example.invalid", hostname,
    configRoot: root + "/config", workRoot: root + "/work", logsRoot: root + "/logs", homeRoot: root + "/home",
    cliConfig: root + "/cli/cli.ini", binary: root + "/certbot", proxyHelper: root + "/proxy", webroot: root + "/webroot" };
  const globalConfig = root + "/global-cli.ini";
  const callsFile = root + "/calls.jsonl"; f.writeFileSync(callsFile, "");
  f.mkdirSync(config.webroot);
  const source = f.readFileSync("infra/modules/demo-host/templates/acme.sh.tftpl", "utf8")
    .replaceAll("${acme_config_json}", JSON.stringify(config))
    .replaceAll('"/etc/letsencrypt/cli.ini"', JSON.stringify(globalConfig));
  f.writeFileSync(root + "/acme.sh", source);
  const q = JSON.stringify;
  f.writeFileSync(root + "/ca.cjs", `const f=require('node:fs'),p=require('node:path');const a=process.argv.slice(2);
    f.appendFileSync(${q(callsFile)},JSON.stringify({name:'certbot',args:a,envKeys:Object.keys(process.env)})+'\\n');
    const mode=${q(options.mode ?? "valid")};if(mode==='failure')process.exit(1);if(mode==='missing')process.exit(0);
    const c=${JSON.stringify(config)};const archive=mode==='escape'?${q(root + "/escape")}:p.join(c.configRoot,'archive',c.hostname);
    f.mkdirSync(archive,{recursive:true});f.mkdirSync(p.join(c.configRoot,'live'),{recursive:true});
    const live=p.join(c.configRoot,'live',c.hostname);if(!f.existsSync(live))f.symlinkSync(archive,live,'junction');
    f.copyFileSync(${q(material)}+'/'+(mode==='wrong-host'?'other':'valid')+'.pem',p.join(archive,'fullchain.pem'));
    f.copyFileSync(${q(material)}+'/'+(mode==='wrong-key'?'other':'valid')+'.key',p.join(archive,'privkey.pem'));
    f.chmodSync(p.join(archive,'privkey.pem'),0o600);`);
  f.writeFileSync(root + "/proxy.cjs", `require('node:fs').appendFileSync(${q(callsFile)},JSON.stringify({name:'proxy',args:process.argv.slice(2)})+'\\n');process.exit(${options.proxyExit ?? 0});`);
  // Windows-only POSIX ownership stand-ins; real crypto, file bytes and canonical paths remain native.
  f.writeFileSync(root + "/shim.cjs", `const f=require('node:fs'),cp=require('node:child_process');const c=${JSON.stringify(config)};
    process.getuid=()=>${options.unprivileged ? 1000 : 0};const stat=f.lstatSync;f.lstatSync=(...a)=>{const s=stat(...a);s.uid=0;s.mode=(s.mode&0o170000)|(s.isDirectory()?0o700:0o600);
      if(${options.writable ?? false}&&String(a[0])===c.configRoot)s.mode=0o40777;return s;};
    ${options.clockDays ? "const now=Date.now();Date.now=()=>now+" + options.clockDays * 86400000 + ";" : ""}
    const spawn=cp.spawnSync;cp.spawnSync=(cmd,args,opts)=>{let file;if(cmd===c.binary)file='ca.cjs';else if(cmd===c.proxyHelper)file='proxy.cjs';else throw Error('forbidden tool');
      return spawn(process.execPath,[${q(root)}+'/'+file,...args],{...opts,env:{...opts.env,SystemRoot:process.env.SystemRoot??'C:\\\\Windows'}});};`);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root,
    NODE_OPTIONS: "--require=" + root + "/shim.cjs", MSYS_NO_PATHCONV: "1", DO_NOT_FORWARD: "synthetic-canary" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const run = (args: string[] = []) => spawnSync("bash", [root + "/acme.sh", ...args], { env, encoding: "utf8", timeout: 20000 });
  const calls = () => f.readFileSync(callsFile, "utf8").trim().split("\n").filter(Boolean)
    .map(line => JSON.parse(line) as { name: string; args: string[]; envKeys: string[] });
  const snapshot = () => [config.configRoot, config.workRoot, config.logsRoot, config.homeRoot, p.dirname(config.cliConfig)]
    .map(path => f.existsSync(path) ? f.readdirSync(path).sort() : null);
  const rejectBeforeState = () => { const before = snapshot(); const r = run(); expect(r.status).toBe(1);
    expect(r.stdout).toBe(""); expect(r.stderr).toBe("medicia acme: rejected\n"); expect(calls()).toEqual([]); expect(snapshot()).toEqual(before); };
  return { root, config, globalConfig, source, env, run, calls, snapshot, rejectBeforeState };
}

describe("private ACME initial issuance", () => {
  it("embeds ACME source verbatim and preserves bootstrap shell syntax without execution", () => {
    const x = fixture(); const before = x.snapshot();
    const service = f.readFileSync("infra/modules/demo-host/templates/medicia-acme.service.tftpl", "utf8").trimEnd();
    const data = f.readFileSync("infra/modules/demo-host/templates/user-data.sh.tftpl", "utf8")
      .replaceAll("${acme_script}", x.source.trimEnd()).replaceAll("${acme_service}", service).replace(/\$\{[a-z_]+\}/g, "false");
    expect(data).toContain(x.source.trimEnd() + "\nMEDICIA_ACME_SCRIPT_V1_EOF");
    expect(data).toContain(service + "\nMEDICIA_ACME_SERVICE_V1_EOF");
    const r = spawnSync("bash", ["-n"], { env: x.env, input: data, encoding: "utf8", timeout: 20000 });
    expect(r.status).toBe(0); expect(r.stdout).toBe(""); expect(r.stderr).toBe(""); expect(x.calls()).toEqual([]); expect(x.snapshot()).toEqual(before);
  });
  it("rejects false terms before account/state creation or command execution", () => fixture({ accept: false }).rejectBeforeState());
  it.each(["", "not-an-email", "ops@example.invalid\n", "ops@example.invalid\n--hook=bad"])("rejects invalid contact %j without effects", email => fixture({ email }).rejectBeforeState());
  it("rejects nonroot before effects", () => fixture({ unprivileged: true }).rejectBeforeState());
  it("rejects visible global CLI defaults without editing them", () => {
    const x = fixture(); f.writeFileSync(x.globalConfig, "unrelated-defaults"); x.rejectBeforeState(); expect(f.readFileSync(x.globalConfig, "utf8")).toBe("unrelated-defaults");
  });
  it("does not adopt unmarked nonempty state", () => {
    const x = fixture(); f.mkdirSync(x.config.configRoot); f.writeFileSync(x.config.configRoot + "/unrelated", "keep");
    x.rejectBeforeState(); expect(f.readFileSync(x.config.configRoot + "/unrelated", "utf8")).toBe("keep");
  });
  it("rejects an unrelated namespace marker unchanged", () => {
    const x = fixture(); f.mkdirSync(x.config.configRoot); const file = x.config.configRoot + "/.medicia-owner.json";
    const other = JSON.stringify({ schema: 1, hostname: "unrelated.duckdns.org" }); f.writeFileSync(file, other);
    x.rejectBeforeState(); expect(f.readFileSync(file, "utf8")).toBe(other);
  });
  it("rejects an existing operation lock before adding state", () => {
    const x = fixture(); f.mkdirSync(x.config.configRoot); f.writeFileSync(x.config.configRoot + "/.medicia-owner.json", JSON.stringify({ schema: 1, hostname }));
    f.mkdirSync(x.config.configRoot + "/.medicia-operation"); x.rejectBeforeState();
  });
  it("rejects unsafe writable state", () => { const x = fixture({ writable: true }); f.mkdirSync(x.config.configRoot); x.rejectBeforeState(); });
  it("rejects unexpected arguments without state or calls", () => {
    const x = fixture(); const before = x.snapshot(); const r = x.run(["unexpected"]);
    expect(r.status).toBe(1); expect(r.stdout).toBe(""); expect(r.stderr).toBe("medicia acme: rejected\n"); expect(x.calls()).toEqual([]); expect(x.snapshot()).toEqual(before);
  });
  it.each(["failure", "missing", "wrong-host", "wrong-key", "escape"])("does not activate after %s", mode => {
    const x = fixture({ mode }); const r = x.run(); expect(r.status).toBe(1); expect(r.stdout).toBe(""); expect(r.stderr).toBe("medicia acme: rejected\n");
    expect(x.calls().map(c => c.name)).toEqual(["certbot"]);
  });
  it.each([-2, 2])("rejects certificate outside validity interval (clock %i days)", clockDays => {
    const x = fixture({ clockDays }); const r = x.run(); expect(r.status).toBe(1); expect(r.stdout).toBe(""); expect(r.stderr).toBe("medicia acme: rejected\n");
    expect(x.calls().map(c => c.name)).toEqual(["certbot"]);
  });
  it("uses owned namespace, controlled environment and literal activation only after native certificate checks", () => {
    const x = fixture(); const r = x.run(); expect(r.status).toBe(0); expect(r.stdout).toBe("medicia acme: activated\n"); expect(r.stderr).toBe("");
    expect(x.calls().map(c => c.name)).toEqual(["certbot", "proxy"]);
    expect(x.calls()[0].args).toEqual(["certonly", "--config", x.config.cliConfig, "--config-dir", x.config.configRoot,
      "--work-dir", x.config.workRoot, "--logs-dir", x.config.logsRoot, "--non-interactive", "--no-directory-hooks",
      "--server", "https://acme-v02.api.letsencrypt.org/directory", "--webroot", "--webroot-path", x.config.webroot,
      "--preferred-challenges", "http", "--cert-name", hostname, "--domains", hostname, "--email", "ops@example.invalid", "--agree-tos", "--keep-until-expiring"]);
    expect(x.calls()[0].envKeys).not.toContain("NODE_OPTIONS"); expect(x.calls()[0].envKeys).not.toContain("DO_NOT_FORWARD");
    expect(x.calls()[1].args).toEqual(["activate"]); expect(f.readFileSync(x.config.cliConfig, "utf8")).toBe("");
    expect(f.readFileSync(x.config.configRoot + "/.medicia-owner.json", "utf8")).toBe(JSON.stringify({ schema: 1, hostname }));
  });
  it.each([1, 2])("preserves issued certificate and propagates activation failure %i", proxyExit => {
    const x = fixture({ proxyExit }); const r = x.run(); expect(r.status).toBe(proxyExit); expect(r.stdout).toBe("");
    expect(r.stderr).toBe(proxyExit === 2 ? "medicia acme: recovery unconfirmed\n" : "medicia acme: rejected\n");
    expect(x.calls().map(c => c.name)).toEqual(["certbot", "proxy"]);
    expect(f.readFileSync(x.config.configRoot + "/live/" + hostname + "/fullchain.pem", "utf8")).toBe(f.readFileSync(material + "/valid.pem", "utf8"));
  });
  it("does not force renewal on an already issued lineage", () => {
    const x = fixture(); expect(x.run().status).toBe(0); expect(x.run().status).toBe(0);
    expect(x.calls().map(c => c.name)).toEqual(["certbot", "proxy", "certbot", "proxy"]);
    expect(x.calls()[2].args).toContain("--keep-until-expiring"); expect(x.calls()[2].args).not.toContain("--force-renewal");
  });
});
