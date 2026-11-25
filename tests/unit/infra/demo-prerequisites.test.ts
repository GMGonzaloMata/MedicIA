// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { runInNewContext } from "node:vm";

const moduleRoot = "infra/modules/demo-host";
const cache = "node_modules/.cache/medicia-standard-bootstrap-01a1d777";
const roots: string[] = [];
const rejected = "medicia bootstrap: prerequisites/services failed\n";
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

interface Options {
  os?: string; kernel?: string; repo?: string; node?: string; dnfExit?: number;
  curlExit?: number; pemExit?: number; global?: boolean; foreign?: boolean;
  nginxOn?: boolean; conflictAfterInstall?: boolean; foreignAfterInstall?: boolean; ssmExit?: number;
}
function fixture(options: Options = {}) {
  fs.mkdirSync(cache + "/fixtures", { recursive: true });
  const root = path.resolve(fs.mkdtempSync(cache + "/fixtures/prereq-")); roots.push(root);
  const slash = root.replaceAll("\\", "/");
  const posix = slash.replace(/^[A-Za-z]:/, drive => "/" + drive.charAt(0).toLowerCase());
  const put = (name: string, body: string) => {
    fs.mkdirSync(path.dirname(root + name), { recursive: true });
    fs.writeFileSync(root + name, body, { mode: 0o700 });
  };
  put("/etc/os-release", `ID=${options.os ?? "amzn"}\nVERSION_ID=2023\n`);
  put("/sentinel", "unrelated-data\n"); put("/trace", "");
  put("/usr/bin/node", `#!/bin/bash\nprintf '%s\\n' '${options.node ?? "v24.21.0"}'\n`);
  // Dobles de ejecutables: no Python, DNF, curl, systemd, AWS ni instalación real.
  put("/usr/bin/python3", "#!/bin/bash\nprintf 'certbot 2.6.0\\n'\n");
  put("/usr/sbin/nginx", "#!/bin/bash\nexit 99\n");
  if (options.global) put("/etc/letsencrypt/cli.ini", "unrelated-global\n");
  if (options.foreign) put("/opt/certbot/bin/certbot", "unrelated-installation\n");
  const source = fs.readFileSync(moduleRoot + "/templates/prerequisites.sh", "utf8")
    .replace(/\/(?:etc|opt|usr|var)(?=\/)/g, prefix => posix + prefix);
  const definitions = `
record() { printf '%s\\n' "$*" >> '${posix}/trace'; }
uname() { printf '%s\\n' '${options.kernel ?? "Linux x86_64"}'; }
rpm() {
  record "rpm:$*"
  if [[ "$*" == *system-release* ]]; then printf '%s' '${options.repo ?? "2023.12.20261021"}'; return 0; fi
  if [[ "$*" == *'certbot'* ]]; then return 1; fi
  return 0
}
systemctl() {
  record "systemctl:$*"
  case "$1" in is-active|is-enabled) [[ '${options.nginxOn ? "yes" : "no"}' == yes ]];; cat) return ${options.ssmExit ?? 0};; *) return 99;; esac
}
dnf() {
  record "dnf:$*"
  if [[ '${options.conflictAfterInstall ? "yes" : "no"}' == yes ]]; then mkdir -p '${posix}/etc/letsencrypt'; printf 'package-global\\n' > '${posix}/etc/letsencrypt/cli.ini'; fi
  if [[ '${options.foreignAfterInstall ? "yes" : "no"}' == yes ]]; then mkdir -p '${posix}/opt/certbot/bin'; printf 'foreign-package-path\\n' > '${posix}/opt/certbot/bin/certbot'; fi
  return ${options.dnfExit ?? 0}
}
alternatives() { record "alternatives:$*"; }
timeout() { record "timeout:$1"; shift; "$@"; }
sleep() { record "sleep:$*"; }
aws() { record "aws:$*"; }
getent() { return 0; }
stat() { case "$3" in */.medicia-bootstrap-v1) printf '0:0:600';; */bin/certbot) printf '0:0:700';; */global-bundle.pem) printf '0:0:644';; *) printf '0:0:755';; esac; }
chown() { record "chown:$*"; }
install() {
  record "install:$*"
  local directory=false mode=0755
  local -a args=()
  while (( $# )); do case "$1" in -d) directory=true; shift;; -m) mode="$2"; shift 2;; -o|-g) shift 2;; *) args+=("$1"); shift;; esac; done
  if [[ "$directory" == true ]]; then mkdir -p -- "\${args[@]}"; else cp -- "\${args[0]}" "\${args[1]}"; chmod "$mode" "\${args[1]}"; fi
}
curl() {
  record "curl:$*"
  local output=''
  while (( $# )); do case "$1" in --output|-o) output="$2"; shift 2;; *) shift;; esac; done
  if [[ '${options.curlExit ?? 0}' != 0 ]]; then return ${options.curlExit ?? 0}; fi
  [[ -n "$output" ]] || return 87
  printf '%s\\n' '-----BEGIN CERTIFICATE-----' 'synthetic-public-bundle' '-----END CERTIFICATE-----' > "$output"
}
openssl() { record "openssl:$*"; if [[ '${options.pemExit ?? 0}' != 0 ]]; then return ${options.pemExit ?? 0}; fi; if [[ "$1" == pkcs7 ]]; then printf 'subject=synthetic\\n'; else printf 'synthetic-der'; fi; }
`;
  const script = root + "/run.sh";
  fs.writeFileSync(script, "#!/bin/bash\nset -Eeuo pipefail\numask 077\nexec 3>&2 2>/dev/null\ntrap 'printf \"medicia bootstrap: prerequisites/services failed\\n\" >&3; exit 1' ERR\n" + definitions + source);
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root, MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const syntax = spawnSync("bash", ["-n", script], { env, encoding: "utf8", timeout: 20000 });
  expect(syntax.status, syntax.stderr).toBe(0);
  const run = () => spawnSync("bash", [script], { env, encoding: "utf8", timeout: 20000 });
  const trace = () => fs.readFileSync(root + "/trace", "utf8");
  const check = (result: ReturnType<typeof run>, status: number) => {
    expect(result.error).toBeUndefined(); expect(result.signal).toBeNull();
    expect(result.status).toBe(status); expect(result.stdout).toBe(""); expect(result.stderr).toBe(status ? rejected : "");
    expect(fs.readFileSync(root + "/sentinel", "utf8")).toBe("unrelated-data\n");
    expect(trace()).not.toMatch(/systemctl:(?:start|enable|disable|stop|mask)\b/);
  };
  return { root, run, trace, check, put };
}

describe("standard AL2023 host preparation", () => {
  it("prepares signed repository tools, owned Certbot entrypoint and validated CA without starting services", () => {
    const x = fixture(); x.check(x.run(), 0);
    const trace = x.trace();
    expect(trace).toContain("dnf:"); expect(trace).toContain("gpgcheck=1");
    expect(trace).toContain("install_weak_deps=False"); expect(trace).toContain("--exclude=certbot");
    expect(trace).toContain("nodejs24"); expect(trace).toContain("python3-certbot");
    expect(trace).toContain("awscli-2"); expect(trace).toContain("amazon-ssm-agent"); expect(trace).toContain("nginx");
    expect(trace).toContain("alternatives:--set node ");
    expect(trace).toContain("https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem");
    expect(trace).toContain("openssl:crl2pkcs7"); expect(trace).toContain("openssl:pkcs7");
    expect(trace).not.toMatch(/--nogpgcheck|--releasever=latest|--insecure|(?:^| )-k(?: |$)|\bpip\b|\bnpm\b|\bprisma\b/m);
    const launcher = fs.readFileSync(x.root + "/opt/certbot/bin/certbot", "utf8");
    expect(launcher).toContain("from certbot.main import main"); expect(launcher).toContain("sys.exit(main())");
    expect(fs.readFileSync(x.root + "/etc/pki/rds/global-bundle.pem", "utf8")).toContain("synthetic-public-bundle");
    expect(fs.existsSync(x.root + "/etc/letsencrypt/cli.ini")).toBe(false);
  });
  it.each<Options>([{ os: "ubuntu" }, { kernel: "Linux aarch64" }, { repo: "2023.0.20230315" }, { repo: "latest" }, { global: true }, { foreign: true }, { nginxOn: true }])("rejects incompatible input %j before packages or owned state", options => {
    const x = fixture(options); x.check(x.run(), 1);
    expect(x.trace()).not.toContain("dnf:"); expect(x.trace()).not.toContain("curl:");
    expect(fs.existsSync(x.root + "/etc/pki/rds/global-bundle.pem")).toBe(false);
    if (options.global) expect(fs.readFileSync(x.root + "/etc/letsencrypt/cli.ini", "utf8")).toBe("unrelated-global\n");
    if (options.foreign) expect(fs.readFileSync(x.root + "/opt/certbot/bin/certbot", "utf8")).toBe("unrelated-installation\n");
  });
  it.each([1, 124])("bounds package/signature/network failure %s before launcher, CA or services", dnfExit => {
    const x = fixture({ dnfExit }); x.check(x.run(), 1);
    expect(x.trace().match(/^dnf:/gm)?.length).toBe(3); expect(x.trace()).not.toContain("curl:");
    expect(fs.existsSync(x.root + "/opt/certbot/bin/certbot")).toBe(false);
    expect(x.trace()).toContain("timeout:180");
  });
  it.each<Options>([{ curlExit: 28 }, { pemExit: 1 }, { node: "v22.0.0" }, { ssmExit: 4 }, { conflictAfterInstall: true }, { foreignAfterInstall: true }])("rejects failed tool or CA validation %j without a readiness claim", options => {
    const x = fixture(options); x.check(x.run(), 1);
    expect(fs.existsSync(x.root + "/etc/pki/rds/global-bundle.pem")).toBe(false);
    if (options.conflictAfterInstall) expect(fs.readFileSync(x.root + "/etc/letsencrypt/cli.ini", "utf8")).toBe("package-global\n");
    if (options.foreignAfterInstall) expect(fs.readFileSync(x.root + "/opt/certbot/bin/certbot", "utf8")).toBe("foreign-package-path\n");
  });
  it("reapplies its own launcher without replacing unrelated files", () => {
    const x = fixture(); x.check(x.run(), 0);
    const launcher = fs.readFileSync(x.root + "/opt/certbot/bin/certbot");
    const ca = fs.readFileSync(x.root + "/etc/pki/rds/global-bundle.pem");
    x.check(x.run(), 0);
    expect(fs.readFileSync(x.root + "/opt/certbot/bin/certbot")).toEqual(launcher);
    expect(fs.readFileSync(x.root + "/etc/pki/rds/global-bundle.pem")).toEqual(ca);
  });
  it("transports payload bytes as data, including quotes, dollars, backslashes and trailing newlines", () => {
    fs.mkdirSync(cache + "/fixtures", { recursive: true });
    const root = path.resolve(fs.mkdtempSync(cache + "/fixtures/transport-")); roots.push(root);
    const body = "#!/bin/bash\nprintf '%s' '$HOME \\\"quoted\\\"'\n// ñ\n\n";
    const destination = root + "/installed";
    const payload = { [destination]: { mode: 448, content: body } };
    const template = fs.readFileSync(moduleRoot + "/templates/user-data.sh.tftpl", "utf8");
    const match = /node --input-type=commonjs <<'MEDICIA_FILES_V2_EOF'\n([\s\S]*?)\nMEDICIA_FILES_V2_EOF/.exec(template);
    expect(match).not.toBeNull(); if (!match) throw new Error("Missing data-only transport");
    const operations: unknown[] = [];
    const safe = (name: string) => { expect(path.resolve(name)).toBe(path.resolve(destination)); return name; };
    runInNewContext(match[1].replaceAll("${bootstrap_files_json}", JSON.stringify(payload)), {
      require: (name: string) => { expect(name).toBe("node:fs"); return {
        writeFileSync: (file: string, data: string, options: { mode: number }) => { operations.push(["write", options.mode]); fs.writeFileSync(safe(file), data); },
        chmodSync: (file: string, mode: number) => { safe(file); operations.push(["mode", mode]); },
        chownSync: (file: string, uid: number, gid: number) => { safe(file); operations.push(["owner", uid, gid]); },
      }; },
    }, { timeout: 1000 });
    expect(fs.readFileSync(destination, "utf8")).toBe(body);
    expect(operations).toEqual([["write", 448], ["mode", 448], ["owner", 0, 0]]);
  });
});
