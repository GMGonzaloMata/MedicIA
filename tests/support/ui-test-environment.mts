import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Optional guard and explicit command entrypoint. Never print connection strings.
export const isolatedUiTests = process.env.MEDICIA_ISOLATED_UI_TESTS === "1";

function rejectTarget(): never {
  process.stderr.write(
    "medicia UI tests: expected 127.0.0.1:15433/medicia_test with no routing overrides\n",
  );
  process.exit(2);
}

if (process.env.MEDICIA_ISOLATED_UI_TESTS !== undefined) {
  if (!isolatedUiTests) rejectTarget();
  let target: URL;
  try {
    target = new URL(process.env.DATABASE_URL ?? "");
  } catch {
    rejectTarget();
  }
  const parameters = [...target.searchParams];
  const publicSchemaOnly = parameters.length === 0 || (
    parameters.length === 1 && parameters[0][0] === "schema" && parameters[0][1] === "public"
  );
  if (
    !["postgres:", "postgresql:"].includes(target.protocol) ||
    target.hostname !== "127.0.0.1" || target.port !== "15433" ||
    target.pathname !== "/medicia_test" || target.hash !== "" || !publicSchemaOnly
  ) rejectTarget();
}

const directInvocation = process.argv[1] !== undefined &&
  pathToFileURL(process.argv[1]).href === import.meta.url;

if (directInvocation) {
  const command = process.argv[2];
  if (!isolatedUiTests || command === undefined ||
      !["check", "test:e2e"].includes(command) || process.argv.length !== 3) {
    process.stderr.write("Usage: enable MEDICIA_ISOLATED_UI_TESTS=1 and run this file with check or test:e2e\n");
    process.exit(2);
  }
  // Native --run may ignore preload hooks; validate in this primary process first.
  const result = spawnSync(process.execPath, ["--run", command], { stdio: "inherit" });
  if (result.error) {
    process.stderr.write("medicia UI tests: command failed to start\n");
    process.exit(1);
  }
  process.exit(result.status ?? 1);
}
