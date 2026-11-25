import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

// Ejecuta el prefijo real hasta la frontera de instalación de la app, sin root ni servicios.
function bootstrap(appEnabled: boolean, failure = "") {
  const cache = path.resolve("node_modules/.cache/medicia-app-activation/fixtures");
  fs.mkdirSync(cache, { recursive: true });
  const root = fs.mkdtempSync(cache + "/gate-"); roots.push(root);
  const posix = root.replaceAll("\\", "/").replace(/^[A-Za-z]:/, drive => "/" + drive.charAt(0).toLowerCase());
  for (const file of ["nginx", "bundle", "existing-app", "existing-unit"]) fs.writeFileSync(root + "/" + file, file === "nginx" ? "#!/bin/bash\nexit 0\n" : "unrelated\n", { mode: 0o700 });
  fs.writeFileSync(root + "/calls", "");
  const source = fs.readFileSync("infra/modules/demo-host/templates/user-data.sh.tftpl", "utf8");
  const boundary = source.indexOf("getent group medicia");
  expect(boundary).toBeGreaterThan(0);
  const prefix = source.slice(0, boundary)
    .replaceAll("${app_enabled}", String(appEnabled))
    .replaceAll("${prerequisite_script_raw}", `record prerequisites\n${failure === "prerequisites" ? "false" : ":"}`)
    .replaceAll("/usr/sbin/nginx", `'${posix}/nginx'`)
    .replaceAll("/etc/pki/rds/global-bundle.pem", `'${posix}/bundle'`);
  const definitions = `
record() { printf '%s\\n' "$*" >> '${posix}/calls'; }
uname() { printf 'Linux x86_64\\n'; }
node() { printf 'v24.21.0\\n'; }
aws() { record unexpected-aws; return 99; }
getent() { return 0; }
systemctl() {
  record "$*"
  case "$1" in is-active|is-enabled) return 1;; esac
  [[ "$*" != '${failure}' ]]
}
`;
  const input = prefix.replace('[[ "$(uname -sm)"', definitions + '\n[[ "$(uname -sm)"') + "record application-boundary\n";
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root, MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const result = spawnSync("bash", ["-s"], { input, env, encoding: "utf8", timeout: 20000 });
  expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
  for (const file of ["existing-app", "existing-unit"]) expect(fs.readFileSync(root + "/" + file, "utf8")).toBe("unrelated\n");
  expect(fs.readdirSync(root).sort()).toEqual(["bundle", "calls", "existing-app", "existing-unit", "nginx"]);
  return { result, calls: fs.readFileSync(root + "/calls", "utf8") };
}

describe("explicit app activation", () => {
  it("infrastructure alone starts only SSM after prerequisites and never reaches app installation", () => {
    const x = bootstrap(false);
    expect(x.result.status).toBe(0); expect(x.result.stdout).toBe(""); expect(x.result.stderr).toBe("");
    expect(x.calls).toBe("prerequisites\nenable amazon-ssm-agent.service\nstart amazon-ssm-agent.service\n");
  });
  it.each(["prerequisites", "enable amazon-ssm-agent.service", "start amazon-ssm-agent.service"])("fails closed at %s without app effects", failure => {
    const x = bootstrap(false, failure);
    expect(x.result.status).toBe(1); expect(x.result.stdout).toBe("");
    expect(x.result.stderr).toBe("medicia bootstrap: prerequisites/services failed\n");
    const calls = ["prerequisites", "enable amazon-ssm-agent.service", "start amazon-ssm-agent.service"];
    expect(x.calls).toBe(calls.slice(0, calls.indexOf(failure) + 1).join("\n") + "\n");
  });
  it("explicit active mode retains the previous prerequisite checks and app boundary", () => {
    const x = bootstrap(true);
    expect(x.result.status).toBe(0); expect(x.result.stdout).toBe(""); expect(x.result.stderr).toBe("");
    expect(x.calls).toBe("prerequisites\nis-active --quiet nginx.service\nis-enabled --quiet nginx.service\ncat amazon-ssm-agent.service\napplication-boundary\n");
  });
});
