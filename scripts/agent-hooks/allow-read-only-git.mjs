// Hook de los revisores de Claude Code: necesitan Bash para ver los diffs, pero no deben modificar nada.
import { readFileSync } from "node:fs";

const BLOCKED_EXIT_CODE = 2;
const READ_ONLY_GIT = /^git\s+(diff|status|log|show|ls-files|rev-parse|merge-base)(\s|$)/;
// Estas opciones de git escriben archivos o ejecutan programas externos, aunque el subcomando solo lea.
const UNSAFE_GIT_OPTION = /\s--(output|ext-diff|textconv)\b/;
const SHELL_OPERATOR = /[;&|<>`$\n\r]/;

const { tool_input: toolInput } = JSON.parse(readFileSync(0, "utf8"));
const command = String(toolInput?.command ?? "").trim();

const isAllowed =
  READ_ONLY_GIT.test(command) && !UNSAFE_GIT_OPTION.test(command) && !SHELL_OPERATOR.test(command);

if (!isAllowed) {
  console.error(
    "Los revisores son de solo lectura: en Bash solo pueden usar git diff, status, log, show, ls-files, rev-parse y merge-base, sin operadores de shell.",
  );
  process.exit(BLOCKED_EXIT_CODE);
}
