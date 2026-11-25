// Hook de Stop compartido por Claude Code y Codex: evita cerrar un turno con el código roto.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const CHECK_TIMEOUT_MS = 280_000;

// Por defecto el hook corre una verificacion rapida: tipos, lint y solo las pruebas que tocan los cambios, sin
// cobertura ni `build`. El `npm run check` completo tarda mas que el tiempo del hook (unos 6 minutos) y el hook lo
// cortaba, dejando un Vitest huerfano con la carpeta `coverage/` tomada. El completo sigue siendo obligatorio antes de
// dar un cambio por terminado (AGENTS.md); con `STOP_CHECK_FULL=1` el hook tambien lo ejecuta.
const FULL_CHECK = process.env.STOP_CHECK_FULL === "1";
const CHECK_COMMAND = FULL_CHECK
  ? "npm run check"
  : "npm run typecheck && npm run lint && npx vitest run --changed --coverage.enabled=false --passWithNoTests";
const CHECK_LABEL = FULL_CHECK ? "`npm run check`" : "la verificacion rapida (tipos, lint y pruebas de lo cambiado)";
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
// El modo entra en la huella: pasar la verificacion rapida no equivale a haber pasado la completa.
const currentFingerprint = `${FULL_CHECK ? "full" : "quick"}:${fingerprint(changedPaths)}`;
if (readLastPassed(statePath) === currentFingerprint) {
  finish();
}

const check = spawnSync(CHECK_COMMAND, {
  encoding: "utf8",
  maxBuffer: MAX_OUTPUT_BYTES,
  shell: true,
  timeout: CHECK_TIMEOUT_MS,
});

const timedOut = check.error?.code === "ETIMEDOUT";

// Al vencer el tiempo, `spawnSync` mata solo la shell: sin esto quedan procesos de Node sueltos (por ejemplo un
// Vitest con la carpeta de cobertura tomada) que hacen fallar la ejecucion siguiente.
if (timedOut && process.platform === "win32" && check.pid) {
  try {
    execFileSync("taskkill", ["/pid", String(check.pid), "/T", "/F"], { stdio: "ignore" });
  } catch {
    // Si el proceso ya termino, no hay nada que cerrar.
  }
}

if (check.status === 0) {
  writeFileSync(statePath, currentFingerprint);
  finish();
}

const output = `${check.stdout ?? ""}\n${check.stderr ?? ""}`.trim();
const details = timedOut
  ? `${CHECK_LABEL} supero el tiempo limite de ${CHECK_TIMEOUT_MS / 1000} s y se corto; no es un fallo del codigo. Corre \`npm run check\` en una terminal.

${output.slice(-MAX_REASON_LENGTH)}`
  : output.slice(-MAX_REASON_LENGTH) || "El comando termino sin salida.";

// Solo se bloquea una vez por ronda: si la corrección falla, se avisa y se devuelve el control.
if (hookInput.stop_hook_active) {
  finish({
    continue: true,
    systemMessage: `${CHECK_LABEL} sigue fallando después de un intento de corrección. Revisalo antes de integrar el cambio.`,
  });
}

finish({
  decision: "block",
  reason: `${CHECK_LABEL} falló. Corregí el problema o, si no podés resolverlo, informalo con claridad.\n\n${details}`,
});
