import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a YAML mapping");
  }
  return Object.fromEntries(Object.entries(value));
}

const source = readFileSync(".github/workflows/ci.yml", "utf8");
const workflow = record(load(source));
const jobs = record(workflow.jobs);
const runner = "npx --no-install vitest run --config vitest.infra-ci.config.mts";
const linuxNames = [
  "rejects colon paths (Windows represents colon as ADS, not a directory entry)",
  "rejects FIFO and backslash/control paths on Linux",
];
const packageSelection = "^rejects (colon paths|FIFO and backslash/control paths)";
const packageCommand = `${runner} tests/unit/infra/demo-package.test.ts -t '${packageSelection}' --reporter=json --outputFile="$RUNNER_TEMP/infra-package.json"
node -e 'const r=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8")); if(r.numPassedTests!==2 || r.numFailedTests!==0) process.exit(1)' "$RUNNER_TEMP/infra-package.json"
`;

// Huellas de las secciones autorizadas antes de esta unidad; admite checkout LF/CRLF,
// sin consultar historia Git ni normalizar ningún otro byte.
const previousSections = [
  ["header", "ecd5145c25f8d298d686efdd6c66e571a3b3cf93ef6bec3289e3c4256c458fc1", "779369f20e3347c34facc219d57b1109286e18eb00bff547e973bb2bfcddf9ff"],
  ["check", "7122151c79e42ecaf4455e5c31e0af3f1304c656ef6671ea41de84925afd0b27", "67b427e28c0fc2a4df2821a0a00837a11a1044dc9008adde6fb3bbe1e6607e3b"],
  ["e2e", "2592463017b5e4e92905a1240ab5038bb3e2f70f323e5fa79f306c5bcf33dede", "f4306c388b78ddd3c58c9e4c26d52c822d90cb53e9180411ae7db34d7af6e12c"],
];

describe("isolated Linux infrastructure CI (S1–S2)", () => {
  it.each(previousSections)("preserves the bytes of %s", (section, lf, crlf) => {
    const headerEnd = source.indexOf("  check:");
    const checkEnd = source.indexOf("  e2e:");
    const newJob = source.indexOf("  infra-linux:");
    const sections: Record<string, string> = {
      header: source.slice(0, headerEnd),
      check: source.slice(headerEnd, checkEnd),
      e2e: source.slice(checkEnd, newJob === -1 ? undefined : newJob),
    };
    expect(headerEnd).toBeGreaterThan(0);
    expect(checkEnd).toBeGreaterThan(headerEnd);
    expect([lf, crlf]).toContain(createHash("sha256").update(sections[section]).digest("hex"));
  });

  it("selects only explicit Linux checks with read-only permissions and no services or app lifecycle", () => {
    expect(Object.keys(jobs)).toEqual(["check", "e2e", "infra-linux"]);
    expect(workflow.on).toEqual(Object.fromEntries([
      ["pull_request", null], ["push", { branches: ["main"] }],
    ]));
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(record(jobs["infra-linux"])).toEqual({
      "runs-on": "ubuntu-latest",
      permissions: { contents: "read" },
      steps: [
        { uses: "actions/checkout@v7" },
        { uses: "actions/setup-node@v7", with: { "node-version": 24, cache: "npm" } },
        { run: "npm ci --ignore-scripts" },
        { name: "Contrato de CI aislada", run: `${runner} tests/unit/infra/infra-ci.test.ts` },
        { name: "Activación explícita", run: `${runner} tests/unit/infra/demo-activation.test.ts` },
        { name: "Dos casos Linux de empaquetado", run: packageCommand },
      ],
    });
    const packageSource = readFileSync("tests/unit/infra/demo-package.test.ts", "utf8");
    for (const name of linuxNames) {
      expect(packageSource.split(`("${name}", () => {`)).toHaveLength(2);
      expect(name).toMatch(new RegExp(packageSelection));
    }
  });

  it("uses a standalone no-env Node config without application imports or global setup", async () => {
    const configUrl = pathToFileURL(resolve("vitest.infra-ci.config.mts")).href;
    const config = record((await import(/* @vite-ignore */ configUrl)).default);
    expect(config).toEqual({
      envDir: false,
      cacheDir: "node_modules/.cache/medicia-infra-ci/vite",
      test: {
        environment: "node", globalSetup: [], setupFiles: [], passWithNoTests: false,
        include: [
          "tests/unit/infra/infra-ci.test.ts",
          "tests/unit/infra/demo-ci.test.ts",
          "tests/unit/infra/demo-activation.test.ts",
          "tests/unit/infra/demo-package.test.ts",
        ],
      },
    });
    const configSource = readFileSync("vitest.infra-ci.config.mts", "utf8");
    expect(configSource.match(/^import .*$/gm)).toEqual(['import { defineConfig } from "vitest/config";']);
  });
});
