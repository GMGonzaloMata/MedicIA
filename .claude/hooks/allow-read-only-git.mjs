// Los revisores necesitan Bash para ver diffs, pero no deben modificar nada.
// Se configura en settings.json y no en el frontmatter de cada revisor porque Claude Code omite
// los hooks del frontmatter cuando VS Code abre el proyecto como `c:\` y la confianza está en `C:/`.
import { readFileSync } from "node:fs";

const BLOCKED_EXIT_CODE = 2;
const REVIEWER_SUFFIX = "-reviewer";
const READ_ONLY_GIT = /^git\s+(diff|status|log|show|ls-files|rev-parse|merge-base)(\s|$)/;
// Estas opciones de git escriben archivos o ejecutan programas externos, aunque el subcomando solo lea.
const UNSAFE_GIT_OPTION = /\s--(output|ext-diff|textconv)\b/;
const SHELL_OPERATOR = /[;&|<>`$\n\r]/;

const { agent_type: agentType, tool_input: toolInput } = JSON.parse(readFileSync(0, "utf8"));

// El hook corre en toda la sesión: los demás agentes conservan sus permisos habituales.
if (!String(agentType ?? "").endsWith(REVIEWER_SUFFIX)) {
  process.exit(0);
}

const command = String(toolInput?.command ?? "").trim();
const isAllowed =
  READ_ONLY_GIT.test(command) && !UNSAFE_GIT_OPTION.test(command) && !SHELL_OPERATOR.test(command);

if (!isAllowed) {
  console.error(
    "Los revisores son de solo lectura: en Bash solo pueden usar git diff, status, log, show, ls-files, rev-parse y merge-base, sin `cd`, `git -C` ni operadores de shell.",
  );
  process.exit(BLOCKED_EXIT_CODE);
}
