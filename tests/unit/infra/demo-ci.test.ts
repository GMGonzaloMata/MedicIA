import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

// Solo se lee el workflow: no imports de aplicación, configuración ni Terraform.
const source = readFileSync(".github/workflows/infra.yml", "utf8");

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected a YAML mapping");
  }
  return Object.fromEntries(Object.entries(value));
}

function text(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a YAML string");
  return value;
}

function list(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected a YAML sequence");
  return value;
}

const workflow = record(load(source));
const jobs = record(workflow.jobs);
const staticJob = record(jobs.static);
const planJob = record(jobs.plan);
const staticSteps = list(staticJob.steps).map(record);
const planSteps = list(planJob.steps).map(record);

function step(steps: Record<string, unknown>[], name: string) {
  const matches = steps.filter((candidate) => candidate.name === name);
  expect(matches, name).toHaveLength(1);
  return record(matches[0]);
}

// El parser exige el bucle ejecutable dentro del run del paso, no comentarios
// ni menciones de módulos en otro lugar del YAML.
function loopDirectories(name: string): string[] {
  const script = text(step(staticSteps, name).run);
  const loops = [...script.matchAll(/^for dir in ([^;\n]+); do$/gm)];
  expect(loops, name).toHaveLength(1);
  return text(loops[0]?.[1]).split(/\s+/);
}

const previousDirectories = [
  "infra/bootstrap",
  "infra/environments/dev",
  "infra/modules/identity",
  "infra/modules/model-artifacts",
  "infra/modules/sagemaker-execution-role",
  "infra/modules/model-endpoints",
  "infra/modules/model-registry",
  "infra/modules/study-storage",
];
const demoDirectories = [
  "infra/modules/demo-network",
  "infra/modules/demo-database",
  "infra/modules/demo-host",
];
const sections = [
  "Inicializar y validar cada raíz y módulo",
  "tflint",
  "Pruebas de Terraform",
  "Cada raíz tiene su archivo de bloqueo versionado",
];

function expectedDirectories(name: string, directories: string[]): string[] {
  return name === "tflint"
    ? directories.map((directory) => directory.replace(/^infra\//, ""))
    : directories;
}

// La huella autorizada CRLF a1c67bba… equivale a esta huella LF; no consulta Git.
const expectedWorkflowHash = "108450fb5bb20c0d4d9a3cde3b0ae632e7f3311b90e90d1067ea439c6e09a743";

function preservedWorkflowHash(workflowSource: string): string {
  const previous = workflowSource.replace(/ infra\/modules\/demo-(?:network|database|host)| modules\/demo-(?:network|database|host)/g, "");
  // Solo se canoniza CRLF: no trim, reserialización YAML ni otros cambios de bytes.
  return createHash("sha256").update(previous.replaceAll("\r\n", "\n")).digest("hex");
}

describe("CI demo EC2/RDS (S13, T011)", () => {
  it.each(sections)("%s cubre los tres módulos demo una sola vez", (name) => {
    expect(loopDirectories(name)).toEqual([
      ...expectedDirectories(name, previousDirectories),
      ...expectedDirectories(name, demoDirectories),
    ]);
  });

  it.each(sections)("%s conserva todas las entradas anteriores y su orden", (name) => {
    const demos = expectedDirectories(name, demoDirectories);
    expect(loopDirectories(name).filter((directory) => !demos.includes(directory)))
      .toEqual(expectedDirectories(name, previousDirectories));
  });

  it("ejecuta init sin backend y validate/test/tflint para cada dir del bucle", () => {
    const initialize = text(step(staticSteps, sections[0]).run);
    expect(initialize).toContain('  terraform -chdir="$dir" init -backend=false -input=false\n');
    expect(initialize).toContain('  terraform -chdir="$dir" validate\n');
    expect(initialize).toMatch(/validate\n[\s\S]*\ndone\n$/);
    const lint = step(staticSteps, "tflint");
    expect(lint["working-directory"]).toBe("infra");
    expect(text(lint.run)).toContain('  tflint --config="$PWD/.tflint.hcl" --chdir="$dir"\n');
    expect(text(step(staticSteps, sections[2]).run))
      .toContain('  terraform -chdir="$dir" test\n');
    const locks = text(step(staticSteps, sections[3]).run);
    expect(locks).toContain('  if ! git ls-files --error-unmatch "$dir/.terraform.lock.hcl" >/dev/null 2>&1; then\n');
    expect(locks).toContain('    fallo=1\n');
    expect(locks).toMatch(/done\nexit "\$fallo"\n$/);
  });

  it("conserva eventos, permisos mínimos y guarda OIDC sin acceso de forks", () => {
    expect(workflow.on).toEqual(Object.fromEntries([
      ["pull_request", { paths: ["infra/**", ".github/workflows/**"] }],
      ["push", { branches: ["main"], paths: ["infra/**", ".github/workflows/**"] }],
    ]));
    expect(workflow.permissions).toEqual({ contents: "read" });
    expect(staticJob.permissions).toBeUndefined();
    expect(planJob.permissions).toEqual({ contents: "read", "id-token": "write" });
    expect(planJob.needs).toBe("static");
    expect(planJob.if).toBe("github.event_name == 'pull_request' && github.event.pull_request.head.repo.full_name == github.repository");
    expect(workflow.concurrency).toEqual({
      group: "infra-${{ github.ref }}", "cancel-in-progress": true,
    });
  });

  it("conserva versiones y acciones fijadas sin añadir herramientas", () => {
    expect(workflow.env).toEqual({ TERRAFORM_VERSION: "1.15.1" });
    expect([...staticSteps, ...planSteps].flatMap((candidate) => candidate.uses ?? []))
      .toEqual([
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e",
        "terraform-linters/setup-tflint@6ffdbaa3be476b3431f7275c26966ef32ff60337",
        "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
        "aquasecurity/trivy-action@ed142fd0673e97e23eac54620cfb913e5ce36c25",
        "actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1",
        "hashicorp/setup-terraform@dfe3c3f87815947d99a8997f908cb6525fc44e9e",
        "aws-actions/configure-aws-credentials@e1253824e5c10ff9df46874f81ed3ec929e19cfd",
      ]);
  });

  it("conserva backend protegido, plan solo lectura y guarda no-apply", () => {
    expect(text(step(planSteps, "Inicializar el entorno de desarrollo").run))
      .toBe("terraform -chdir=infra/environments/dev init -input=false");
    expect(text(step(planSteps, "Plan").run)).toBe(
      'set -o pipefail\nterraform -chdir=infra/environments/dev plan -lock=false -input=false -no-color | tee "$RUNNER_TEMP/plan.txt"\n',
    );
    const guard = text(step(staticSteps, "Guarda de no aplicar (FR-018)").run);
    expect(guard).toContain("(apply|destroy|import|state|force-unlock|refresh|taint|untaint|workspace");
    expect(guard).toContain("exit 1");
    const executable = [...staticSteps, ...planSteps]
      .flatMap((candidate) => typeof candidate.run === "string"
        ? candidate.run.split("\n").filter((line) => !line.trimStart().startsWith("#"))
        : []);
    expect(executable.filter((line) => /^\s*terraform(?:\s+-\S+)*\s+(?:apply|destroy|import|state|force-unlock|refresh|taint|untaint|workspace)\b/.test(line)))
      .toEqual([]);
  });

  it("mantiene idénticos todos los bytes ajenos a las cuatro listas salvo LF/CRLF", () => {
    expect(preservedWorkflowHash(source)).toBe(expectedWorkflowHash);
  });

  it.each([["LF", "\n"], ["CRLF", "\r\n"]])("acepta el workflow autorizado con %s", (name, eol) => {
    const input = source.replace(/\r?\n/g, eol);
    expect(preservedWorkflowHash(input), name).toBe(expectedWorkflowHash);
  });

  it.each([["LF", "\n"], ["CRLF", "\r\n"]])("rechaza cambios no EOL con %s", (name, eol) => {
    const input = source.replace(/\r?\n/g, eol);
    const mutated = input.replace("contents: read", "contents: write");
    expect(mutated).not.toBe(input);
    expect(preservedWorkflowHash(mutated), name).not.toBe(expectedWorkflowHash);
  });
});
