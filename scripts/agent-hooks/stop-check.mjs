// Hook de Stop compartido por Claude Code y Codex: evita cerrar un turno con el código roto.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const CHECK_TIMEOUT_MS = 280_000;
const MAX_OUTPUT_BYTES = 20 * 1024 * 1024;
const MAX_REASON_LENGTH = 6000;

// Solo estos archivos pueden romper `npm run check`; otros cambios no justifican ejecutarlo.
const VERIFIED_PATH =
  /^(src\/|tests\/|prisma\/|scripts\/|package(-lock)?\.json$|tsconfig\.json$|eslint\.config\.mjs$|vitest\.config\.mts$|playwright\.config\.ts$|next\.config\.ts$)/;

const git = (...args) =>
  execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: MAX_OUTPUT_BYTES,
    stdio: ["ignore", "pipe", "ignore"],
  });

const splitPaths = (output) => output.split("\0").filter(Boolean);

const finish = (result = { continue: true }) => {
  // Codex espera JSON en stdout al salir con 0; `continue` también es válido en Claude Code.
  console.log(JSON.stringify(result));
  process.exit(0);
};

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    // Una entrada vacía o inválida solo significa que no se está continuando un bloqueo previo.
    return {};
  }
}

function listVerifiedChanges() {
  const changed = [
    ...splitPaths(git("diff", "--name-only", "-z", "HEAD")),
    ...splitPaths(git("ls-files", "--others", "--exclude-standard", "-z")),
  ];

  return [...new Set(changed)].filter((path) => VERIFIED_PATH.test(path)).sort();
}

function fingerprint(paths) {
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path);
    hash.update(existsSync(path) ? readFileSync(path) : "deleted");
  }
  return hash.digest("hex");
}

function readLastPassed(statePath) {
  return existsSync(statePath) ? readFileSync(statePath, "utf8") : "";
}

const hookInput = readHookInput();
process.chdir(git("rev-parse", "--show-toplevel").trim());

const changedPaths = listVerifiedChanges();
if (changedPaths.length === 0) {
  finish();
}

// El estado vive en `.git/` para no ensuciar el repositorio ni entrar en un commit.
const statePath = git("rev-parse", "--git-path", "medicia-last-passed-check").trim();
const currentFingerprint = fingerprint(changedPaths);
if (readLastPassed(statePath) === currentFingerprint) {
  finish();
}

const check = spawnSync("npm run check", {
  encoding: "utf8",
  maxBuffer: MAX_OUTPUT_BYTES,
  shell: true,
  timeout: CHECK_TIMEOUT_MS,
});

if (check.status === 0) {
  writeFileSync(statePath, currentFingerprint);
  finish();
}

const output = `${check.stdout ?? ""}\n${check.stderr ?? ""}`.trim();
const details = output.slice(-MAX_REASON_LENGTH) || "El comando terminó sin salida o por tiempo límite.";

// Solo se bloquea una vez por ronda: si la corrección falla, se avisa y se devuelve el control.
if (hookInput.stop_hook_active) {
  finish({
    continue: true,
    systemMessage: "`npm run check` sigue fallando después de un intento de corrección. Revisalo antes de integrar el cambio.",
  });
}

finish({
  decision: "block",
  reason: `\`npm run check\` falló. Corregí el problema o, si no podés resolverlo, informalo con claridad.\n\n${details}`,
});
