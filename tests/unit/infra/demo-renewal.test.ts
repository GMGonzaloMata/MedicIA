import { afterEach, describe, expect, it } from "vitest";
import * as f from "node:fs";
import * as os from "node:os";
import * as p from "node:path";
import { spawnSync } from "node:child_process";

const templates = "infra/modules/demo-host/templates/";
const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) f.rmSync(root, { recursive: true, force: true });
});

// Execute the actual final opt-in block, not a reproduction of its decisions.
// The earlier installation/prerequisite blocks are deliberately NOT executed.
function activation(terms: string, serviceExit = 0) {
  const root = f.mkdtempSync(p.join(os.tmpdir(), "medicia-renewal-gate-"));
  roots.push(root);
  const path = root.replaceAll("\\", "/");
  const source = f.readFileSync(templates + "user-data.sh.tftpl", "utf8");
  const gate = source.slice(source.lastIndexOf("if [[ '${accept_acme_terms}' == true ]]; then"))
    .replaceAll("${accept_acme_terms}", terms);
  const prologue = source.slice(source.indexOf("set -Eeuo pipefail"), source.indexOf('[[ "$(uname -sm)"'));
  f.writeFileSync(root + "/calls", "");
  f.writeFileSync(root + "/state", "unissued\n");
  f.writeFileSync(root + "/sentinel", "unrelated\n");
  const standIn = `systemctl() {
    printf '%s\\n' "$*" >> '${path}/calls'
    case "$*" in
      'start medicia-acme.service')
        if [[ ${serviceExit} != 0 ]]; then
          printf 'synthetic service failure\\n' >&2
          return ${serviceExit}
        fi
        printf 'issued\\n' > '${path}/state' ;;
      'enable --now medicia-acme.timer')
        [[ "$(< '${path}/state')" == issued ]] || return 9
        printf 'enabled\\n' > '${path}/timer' ;;
      *) return 64 ;;
    esac
  }
`;
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: root, MSYS_NO_PATHCONV: "1" };
  env.SystemRoot = process.env.SystemRoot ?? "C:\\Windows";
  const result = spawnSync("bash", ["-s"], {
    input: prologue + standIn + gate, env, encoding: "utf8", timeout: 20000,
  });
  expect(result.error).toBeUndefined();
  expect(result.signal).toBeNull();
  expect(f.readFileSync(root + "/sentinel", "utf8")).toBe("unrelated\n");
  return {
    result,
    calls: f.readFileSync(root + "/calls", "utf8"),
    state: f.readFileSync(root + "/state", "utf8"),
    timer: f.existsSync(root + "/timer") ? f.readFileSync(root + "/timer", "utf8") : null,
  };
}

describe("ACME renewal activation checkpoint", () => {
  it("schedules only the existing service twice daily with jitter and persistence", () => {
    const timer = f.readFileSync(templates + "medicia-acme.timer.tftpl", "utf8");
    expect(timer).toBe("[Timer]\nOnCalendar=*-*-* 00,12:00:00\nRandomizedDelaySec=1h\nPersistent=true\nUnit=medicia-acme.service\n\n[Install]\nWantedBy=timers.target\n");
    const service = f.readFileSync(templates + "medicia-acme.service.tftpl", "utf8");
    expect(service).toContain("ExecStart=/usr/local/libexec/medicia-acme\n");
    expect(service).not.toMatch(/Restart=|RemainAfterExit=/);
  });
  it("renders and installs the timer inertly before reload with enable confined to the final gate", () => {
    const source = f.readFileSync(templates + "user-data.sh.tftpl", "utf8");
    const main = f.readFileSync("infra/modules/demo-host/main.tf", "utf8");
    expect(main).toContain('acme_timer              = chomp(file("${path.module}/templates/medicia-acme.timer.tftpl"))');
    const install = "install -o root -g root -m 0644 /dev/stdin /etc/systemd/system/medicia-acme.timer <<'MEDICIA_ACME_TIMER_V1_EOF'\n${acme_timer}\nMEDICIA_ACME_TIMER_V1_EOF\n";
    expect(source).toContain("chown root:root /etc/systemd/system/medicia-dns.service /etc/systemd/system/medicia-dns.timer\n" + install);
    expect(source.indexOf(install)).toBeLessThan(source.indexOf("systemctl daemon-reload"));
    const boundary = source.lastIndexOf("if [[ '${accept_acme_terms}' == true ]]; then");
    expect(source.slice(0, boundary)).not.toMatch(/systemctl .*medicia-acme[.]timer/);
    expect(source.slice(boundary)).toBe("if [[ '${accept_acme_terms}' == true ]]; then\n  systemctl start medicia-acme.service\n  systemctl enable --now medicia-acme.timer\nfi\n# No external TLS/session readiness is implied.\n");
    expect(source).not.toMatch(/systemctl (disable|stop|restart|reset-failed)/);
    expect(main).toContain("user_data_base64            = base64gzip(local.user_data)");
  });
  it("retains actual mock-provider wiring and the original compressed payload ceiling", () => {
    const mocks = f.readFileSync("infra/modules/demo-host/tests/host.tftest.hcl", "utf8");
    expect(mocks).toContain('mock_provider "aws" {}');
    expect(mocks).toContain('run "acme_renewal_timer_wiring"');
    expect(mocks).toContain('run "acme_renewal_timer_opted_in"');
    expect(mocks.match(/length\(aws_instance.web.user_data_base64\) < 21844/g)?.length).toBe(5);
    expect(mocks).toContain('strcontains(local.user_data, chomp(file("${path.module}/templates/medicia-acme.timer.tftpl")))');
  });
  it("starts the existing service before enabling and starting the timer on explicit opt-in success", () => {
    const x = activation("true");
    expect(x.result.status).toBe(0);
    expect(x.result.stdout).toBe("");
    expect(x.result.stderr).toBe("");
    expect(x.calls).toBe("start medicia-acme.service\nenable --now medicia-acme.timer\n");
    expect(x.state).toBe("issued\n");
    expect(x.timer).toBe("enabled\n");
  });
  it.each([1, 2])("keeps initial service failure %s visible and never enables the timer", code => {
    const x = activation("true", code);
    expect(x.result.status).toBe(1);
    expect(x.result.stdout).toBe("");
    expect(x.result.stderr).toBe("medicia bootstrap: prerequisites/services failed\n");
    expect(x.calls).toBe("start medicia-acme.service\n");
    expect(x.state).toBe("unissued\n");
    expect(x.timer).toBeNull();
  });
  it.each(["false", "not-true"])("does not issue or enable for rejected opt-in %s", terms => {
    const x = activation(terms);
    expect(x.result.status).toBe(0);
    expect(x.result.stdout).toBe("");
    expect(x.result.stderr).toBe("");
    expect(x.calls).toBe("");
    expect(x.state).toBe("unissued\n");
    expect(x.timer).toBeNull();
  });
});
