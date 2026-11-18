import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

// La copia sin cambios del runner conserva su whitelist; TODO el fixture queda en la caché de esta ronda.
const evidence = resolve("node_modules/.cache/medicia-pdf-runtime-import-recovery");
mkdirSync(evidence, { recursive: true });
const fixture = mkdtempSync(resolve(evidence, "runner-fixture-"));
const cache = resolve(fixture, "node_modules/.cache/medicia-pdf-runtime-build-compat");
mkdirSync(cache, { recursive: true });
const script = resolve("scripts/pdf-e022-local/runtime.ps1");
const runnerScript = resolve(fixture, "scripts/pdf-e022-local/run-step.mjs");
mkdirSync(dirname(runnerScript), { recursive: true });
if (!existsSync(runnerScript)) writeFileSync(runnerScript, readFileSync("scripts/pdf-e022-local/run-step.mjs"), { flag: "wx" });
const runner = pathToFileURL(runnerScript).href;
const base = "sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4";
const baseDigest = "sha256:85b6c041ca253782ebb2f769ab765790f2a70c09467f66aac4b1beabf11d8236";
const image = `sha256:${"a".repeat(64)}`;
function ps(body: string) {
  const directory = mkdtempSync(resolve(cache, "ps-"));
  const harness = resolve(directory, "harness.ps1");
  writeFileSync(harness, `$ErrorActionPreference='Stop'\n$tokens=$null;$errors=$null\n$ast=[System.Management.Automation.Language.Parser]::ParseFile('${script.replaceAll("'", "''")}',[ref]$tokens,[ref]$errors)\nif($errors.Count){throw 'Invalid runtime syntax'}\nforeach($name in @('Run-Docker','Get-VerifiedImage')) { $f=$ast.Find({param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true);if($f){Invoke-Expression $f.Extent.Text} }\n$BaseDigest='${baseDigest}'\n${body}`);
  return spawnSync("powershell.exe", ["-NoProfile", "-File", harness], { encoding: "utf8", timeout: 10000 });
}
it("PowerShell real conserva TODOS los argumentos de volume/network y el exit de Docker simulado", () => {
  const text = readFileSync(script, "utf8");
  const volume = text.split("\n").find((line) => line.includes("Run-Docker") && line.includes("'volume','create'"));
  const network = text.split("\n").find((line) => line.includes("Run-Docker") && line.includes("'network','create'"));
  expect(volume).toBeDefined(); expect(network).toBeDefined();
  const result = ps(`$Prefix='owned';$Owner='owner'\nfunction docker { $global:LASTEXITCODE=0; ConvertTo-Json -Compress -InputObject @($args) }\n${volume}\n${network}\nfunction docker { $global:LASTEXITCODE=7; [Console]::Error.Write('synthetic-stderr') }\ntry { Run-Docker -Arguments @('run','image');exit 8 } catch { Write-Output $_.Exception.Message;exit 0 }`);
  expect(result.status).toBe(0);
  const lines = result.stdout.trim().split(/\r?\n/);
  expect(JSON.parse(lines[0])).toEqual(["volume", "create", "--label", "medicia.pdf-e022.owner=owner", "owned-model"]);
  expect(JSON.parse(lines[1])).toEqual(["network", "create", "--internal", "owned-net"]);
  expect(lines[2]).toBe("Docker failed (7). Preserve names/logs; no cleanup or retry.");
  expect(result.stderr).toBe("synthetic-stderr");
});
// Captura real local, image inspect --format '{{.Id}}': stdout 0a, stderr exacto y exit 1.
// Literal portable: los tests no leen cachés históricas ni consultan Docker real.
const realMissingImage = { name: "medicia-pdf-e022-local-01a1e570-reader:local", stdout: "\n",
  stderr: "Error response from daemon: No such image: medicia-pdf-e022-local-01a1e570-reader:local\n" };
const nativeCases = [...["image", "container", "volume", "network"].flatMap((kind) =>
  ["absent", "exists", "daemon", "access-denied", "unexpected-exit", "blank-stderr", "wrong-name", "wrong-kind", "mixed-error", "stdout-only"].map((mode) => ({ kind, mode }))),
  ...["real-absence", "real-space", "real-text", "real-extra-error"].map((mode) => ({ kind: "image", mode }))];
function missingMessage(kind: string, name: string): string {
  if (kind === "image") return `Error response from daemon: No such image: ${name}`;
  if (kind === "container") return `Error: No such container: ${name}`;
  if (kind === "volume") return `Error response from daemon: get ${name}: no such volume`;
  return `Error response from daemon: network ${name} not found`;
}
it.each(nativeCases)("NATIVE $kind $mode", ({ kind, mode }) => {
  const directory = mkdtempSync(resolve(evidence, `native-${kind}-${mode}-`));
  const replay = mode.startsWith("real-");
  const name = replay ? realMissingImage.name : `owned-${kind}`;
  const stderr = replay ? realMissingImage.stderr + (mode === "real-extra-error" ? "permission denied\n" : "") :
    mode === "exists" || mode === "blank-stderr" || mode === "stdout-only" ? "" :
    mode === "daemon" ? "error during connect: daemon unavailable" : mode === "access-denied" ? "Error response from daemon: access denied" :
    mode === "wrong-name" ? missingMessage(kind, "another-resource") :
    mode === "wrong-kind" ? missingMessage(kind === "container" ? "image" : "container", name) :
    missingMessage(kind, name) + (mode === "mixed-error" ? "\npermission denied" : "");
  const stdout = replay ? realMissingImage.stdout + (mode === "real-space" ? " \n" : mode === "real-text" ? "unexpected\n" : "") :
    mode === "exists" ? "synthetic-existing-id" : mode === "stdout-only" ? missingMessage(kind, name) : "";
  const nativeExit = mode === "exists" ? 0 : mode === "unexpected-exit" ? 2 : 1;
  const expectedExit = mode === "absent" || mode === "real-absence" ? 0 : 9;
  const wrapper = resolve(directory, "docker.cmd");
  const executable = resolve(directory, "fake-docker.cjs");
  const stored = resolve(directory, "stored-resource.json"); const counter = resolve(directory, "counter.txt");
  writeFileSync(stored, '{"synthetic":"unchanged"}'); writeFileSync(counter, "0");
  const before = readFileSync(stored);
  writeFileSync(executable, `const fs=require('node:fs');fs.writeFileSync(${JSON.stringify(resolve(directory, "native-args.json"))},JSON.stringify(process.argv.slice(2)));process.stdout.write(${JSON.stringify(stdout)});process.stderr.write(${JSON.stringify(stderr)});process.exit(${nativeExit});`);
  // .cmd invoca Node nativo y devuelve SU exit/stderr; no es una función PowerShell.
  writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${executable}" %*\r\nexit /b %errorlevel%\r\n`);
  const quote = (text: string) => "'" + text.replaceAll("'", "''") + "'";
  const harness = resolve(directory, "harness.ps1");
  const outcome = resolve(directory, "outcome.json");
  writeFileSync(harness, `$ErrorActionPreference='Stop'\nSet-Alias -Name docker -Value ${quote(wrapper)} -Scope Script\n$DockerCommand=Get-Command docker\nif($DockerCommand.CommandType -ne 'Alias' -or $DockerCommand.Definition -ne ${quote(wrapper)}){throw 'Unsafe fake resolution'}\n$tokens=$null;$errors=$null;$ast=[System.Management.Automation.Language.Parser]::ParseFile(${quote(script)},[ref]$tokens,[ref]$errors)\nif($errors.Count){throw 'Invalid syntax'}\n$f=$ast.Find({param($n)$n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq 'Assert-New'},$true);Invoke-Expression $f.Extent.Text\n$global:LASTEXITCODE=77\nfunction Invoke-GuardFromCaller {\n$Code=0;$ErrorId=''\n# Un scope de función crea el binding local real; sembrarlo en script puede actualizar el global.\n$LASTEXITCODE=88\ntry{Assert-New '${kind}' '${name}';[IO.File]::WriteAllText(${quote(counter)},'1');[Console]::Out.Write('NEXT')}catch{$Code=9;$ErrorId=$_.FullyQualifiedErrorId;[Console]::Error.Write($_.Exception.Message)}\n[IO.File]::WriteAllText(${quote(outcome)},(@{errorId=$ErrorId;preference=[string]$ErrorActionPreference;version=$PSVersionTable.PSVersion.ToString();nativeExit=$global:LASTEXITCODE;callerExit=$LASTEXITCODE}|ConvertTo-Json -Compress));exit $Code\n}\nInvoke-GuardFromCaller\n`);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", harness], { encoding: "utf8", timeout: 10000 });
  writeFileSync(resolve(directory, "stdout.log"), result.stdout); writeFileSync(resolve(directory, "stderr.log"), result.stderr);
  writeFileSync(resolve(directory, "result.json"), JSON.stringify({ exitCode: result.status, signal: result.signal, error: result.error?.message ?? null }));
  expect(result.error).toBeUndefined(); expect(result.status).toBe(expectedExit);
  expect(result.stdout).toBe(expectedExit === 0 ? "NEXT" : "");
  expect(result.stderr).toBe(expectedExit === 0 ? "" : mode === "exists" ? `Exclusive resource already exists: ${name}. No reuse/cleanup.` : `Cannot establish exclusive absence: ${name} (exit ${nativeExit}). No resource creation.`);
  expect(readFileSync(counter, "utf8")).toBe(expectedExit === 0 ? "1" : "0");
  expect(readFileSync(stored)).toEqual(before);
  expect(JSON.parse(readFileSync(resolve(directory, "native-args.json"), "utf8"))).toEqual([kind, "inspect", "--format", kind === "volume" ? "{{.Name}}" : "{{.Id}}", name]);
  expect(JSON.parse(readFileSync(outcome, "utf8"))).toMatchObject({ preference: "Stop", version: expect.stringMatching(/^5\.1\./), nativeExit, callerExit: 88 });
});
it("OCI reemplaza el FROM que BuildKit interpreta como docker.io/library/sha256, sin fallback", () => {
  const text = readFileSync(script, "utf8");
  expect(text).toContain("'buildx','build','--builder',$Builder,'--load'");
  expect(text).toContain("'--build-context',\"e022base=$BaseUri\"");
  expect(text).toContain("'--verify-base'"); expect(text).toContain("--iidfile");
  expect(text).not.toContain("BASE_IMAGE=$Base"); expect(text).not.toContain("DOCKER_BUILDKIT");
  expect(readFileSync("runtime/pdf-e022/Dockerfile", "utf8").match(/^[ \t]*FROM[ \t]+[^\r\n]+/gim)?.map((line) => line.trim())).toEqual(["FROM e022base"]);
  expect(text.match(/Get-VerifiedImage/g)?.length).toBeGreaterThanOrEqual(6);
  expect(text).not.toMatch(/'python',\$Image/);
  expect(text).toContain("$Base,'serve'");
});
it.each([false, true])("retag no cambia identidad y mismatch bloquea ejecución: %s", (mismatch) => {
  const directory = mkdtempSync(resolve(cache, "image-"));
  const manifestBytes = Buffer.from('{"synthetic":"closed"}');
  writeFileSync(resolve(directory, "context-manifest.json"), manifestBytes);
  writeFileSync(resolve(directory, "image-manifest.json"), JSON.stringify({ schema: "pdf-e022-image.v2", baseImageId: base, baseManifestDigest: baseDigest, imageId: image,
    contextManifestSha256: createHash("sha256").update(manifestBytes).digest("hex") }));
  const before = readFileSync(resolve(directory, "image-manifest.json"));
  const result = ps(`$Cache='${directory}';$Base='${base}'\nfunction docker { if($args[0] -eq 'image'){ if($args[-1] -ne '${image}'){throw 'Mutable tag used'};$global:LASTEXITCODE=0;Write-Output '${mismatch ? `sha256:${"b".repeat(64)}` : image}'}else{$global:LASTEXITCODE=0;Write-Output ('EXEC:'+($args -join '|'))} }\ntry { if(-not(Get-Command Get-VerifiedImage -ErrorAction SilentlyContinue)){throw 'Missing identity helper'}; $id=Get-VerifiedImage; Run-Docker -Arguments @('run',$id);exit 0 }catch{[Console]::Error.Write('rejected');exit 9}`);
  expect(result.status).toBe(mismatch ? 9 : 0);
  expect(result.stdout.includes("EXEC:")).toBe(!mismatch);
  expect(readFileSync(resolve(directory, "image-manifest.json"))).toEqual(before);
});
it.each(["base", "context", "identifier", "transport"])("procedencia inválida %s no invoca ni crea recursos", (mode) => {
  const directory = mkdtempSync(resolve(cache, "bad-provenance-"));
  const bytes = Buffer.from("synthetic-context");
  writeFileSync(resolve(directory, "context-manifest.json"), bytes);
  const value = { schema: "pdf-e022-image.v2", baseImageId: mode === "base" ? "wrong" : base, baseManifestDigest: mode === "transport" ? "sha256:" + "0".repeat(64) : baseDigest,
    imageId: mode === "identifier" ? "mutable:tag" : image,
    contextManifestSha256: mode === "context" ? "0".repeat(64) : createHash("sha256").update(bytes).digest("hex") };
  const manifest = resolve(directory, "image-manifest.json"); writeFileSync(manifest, JSON.stringify(value));
  const before = readFileSync(manifest);
  const result = ps(`$Cache='${directory}';$Base='${base}'\nfunction docker { Write-Output 'UNEXPECTED_EXECUTION';throw 'Docker must not run' }\ntry { Get-VerifiedImage;exit 0 }catch{[Console]::Error.Write('rejected');exit 9}`);
  expect(result.status).toBe(9); expect(result.stdout).toBe(""); expect(readFileSync(manifest)).toEqual(before);
});
it("identidad ausente/ajena se rechaza antes de invocar Docker", () => {
  const directory = mkdtempSync(resolve(cache, "no-image-"));
  const result = ps(`$Cache='${directory}';$Base='${base}'\nfunction docker { throw 'Docker must not run' }\ntry { if(-not(Get-Command Get-VerifiedImage -ErrorAction SilentlyContinue)){throw 'Missing helper'};Get-VerifiedImage;exit 0 }catch{[Console]::Error.Write('rejected');exit 9}`);
  expect(result.status).toBe(9); expect(result.stdout).toBe("");
  expect(existsSync(resolve(directory, "image-manifest.json"))).toBe(false);
});
function child(mode: "exit" | "timeout" | "signal" | "sigterm") {
  const directory = mkdtempSync(resolve(cache, "child-"));
  const code = mode === "exit" ? "process.stdout.write('out\\n');process.stderr.write('err\\n');process.exit(7)" : "process.stdout.write('ready\\n');setInterval(()=>{},1000)";
  const controller = mode === "signal" || mode === "sigterm" ? `const controller=new AbortController();setTimeout(()=>controller.abort(${mode === "sigterm" ? "'SIGTERM'" : ""}),300);` : "";
  const program = `import {runProcess} from ${JSON.stringify(runner)};${controller}const r=await runProcess({command:process.execPath,args:['-e',${JSON.stringify(code)}],timeoutMs:${mode === "exit" ? 3000 : 500},directory:${JSON.stringify(directory)},${mode === "signal" || mode === "sigterm" ? "signal:controller.signal," : ""}});console.log(JSON.stringify(r));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(0);
  return { directory, result: JSON.parse(result.stdout) };
}
it("runner preserva stdout/stderr y exit no cero sin reintentar", () => {
  const { directory, result } = child("exit");
  expect(result).toMatchObject({ exitCode: 7, childExitCode: 7, timedOut: false, processClosed: true });
  expect(readFileSync(resolve(directory, "stdout.log"), "utf8")).toBe("out\n");
  expect(readFileSync(resolve(directory, "stderr.log"), "utf8")).toBe("err\n");
});
it.each(["timeout", "signal"] as const)("deadline/señal termina solo árbol propio y registra salida parcial: %s", (mode) => {
  const { directory, result } = child(mode);
  expect(result).toMatchObject({ exitCode: mode === "timeout" ? 124 : 130, timedOut: mode === "timeout", treeTerminationRequested: true, processClosed: true, daemonWorkMayRemain: true });
  expect(readFileSync(resolve(directory, "stdout.log"), "utf8")).toBe("ready\n");
  expect(readFileSync(resolve(directory, "stderr.log"), "utf8")).toBe("");
});
it("SIGTERM conserva señal y código efectivo 143, sin convertirlo en timeout", () => {
  const { result } = child("sigterm");
  expect(result).toMatchObject({ exitCode: 143, timedOut: false, interruptionSignal: "SIGTERM", processClosed: true });
});
it("evidencia existente rechaza antes de spawn sin modificar logs ni crear otros", () => {
  const directory = mkdtempSync(resolve(cache, "collision-")); const marker = resolve(directory, "counter");
  writeFileSync(resolve(directory, "stdout.log"), "preserve");
  const code = `require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected')`;
  const program = `import {runProcess} from ${JSON.stringify(runner)};try{await runProcess({command:process.execPath,args:['-e',${JSON.stringify(code)}],timeoutMs:1000,directory:${JSON.stringify(directory)}});process.exitCode=9}catch{console.log('rejected')}`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(0); expect(result.stdout.trim()).toBe("rejected");
  expect(readFileSync(resolve(directory, "stdout.log"), "utf8")).toBe("preserve");
  for (const path of ["counter", "stderr.log", "result.json"]) expect(existsSync(resolve(directory, path))).toBe(false);
});
it("timeout también termina un nieto sintético del proceso propio", () => {
  const directory = mkdtempSync(resolve(cache, "tree-"));
  const marker = resolve(directory, "grandchild-output");
  const grandchild = `setTimeout(()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'unexpected')},1800)`;
  const childCode = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:'ignore'});setInterval(()=>{},1000)`;
  const program = `import {runProcess} from ${JSON.stringify(runner)};console.log(JSON.stringify(await runProcess({command:process.execPath,args:['-e',${JSON.stringify(childCode)}],timeoutMs:500,directory:${JSON.stringify(directory)}})));await new Promise(r=>setTimeout(r,2000));`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", program], { encoding: "utf8", timeout: 10000 });
  expect(result.status).toBe(0); expect(JSON.parse(result.stdout)).toMatchObject({ exitCode: 124, treeTerminationRequested: true, processClosed: true });
  expect(existsSync(marker)).toBe(false);
});
it("CLI rechaza paso/bounds desconocidos antes de lanzar proceso o crear outputs", () => {
  for (const args of [["Unknown"], ["Build", "--timeout-ms", "0"], ["Build", "--timeout-ms", "Infinity"]]) {
    const result = spawnSync(process.execPath, ["scripts/pdf-e022-local/run-step.mjs", ...args], { encoding: "utf8", timeout: 5000 });
    expect(result.status).toBe(2); expect(result.stdout).toBe(""); expect(result.stderr).toContain("Usage:");
  }
});
// Public -Step Build with node/docker functions scoped to this synthetic process.
// No real context, builder, Docker, archive, network or owner-record dependency.
const buildkit = "moby/buildkit@sha256:054d632d0d7e94b11cdc6048674773499a5170cf7d8ce0c326daaff6be43c8e0";
const builder = "medicia-pdf-e022-local-01a1e570-builder";
function builderCall(mode: string, configIid = false) {
  const directory = mkdtempSync(resolve(evidence, "builder-")); const project = resolve(directory, "project");
  const own = resolve(project, "node_modules/.cache/medicia-pdf-runtime-builder");
  const output = resolve(project, "node_modules/.cache/medicia-pdf-runtime-build-compat/runtime");
  const runtime = resolve(project, "scripts/pdf-e022-local/runtime.ps1");
  const put = (path: string, value: string) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  put(runtime, readFileSync(script, "utf8")); put(resolve(output, "context-manifest.json"), '{"synthetic":"closed"}');
  const stored = resolve(directory, "stored.json"); const counter = resolve(directory, "counter.txt"); const argumentsFile = resolve(directory, "arguments.json");
  put(stored, '{"synthetic":"unchanged"}'); put(counter, "0"); const before = readFileSync(stored); const contextBefore = readFileSync(resolve(output, "context-manifest.json"));
  const nodeName = "medicia-pdf-e022-local-01a1e570-node"; const container = "buildx_buildkit_" + nodeName; const volume = container + "_state";
  const kitId = "sha256:4a177e10126688bb9608de9661b5c2204222e232d261339ff4c94eb785b211fa"; const containerId = "c".repeat(64);
  if (mode !== "missing-config") {
    put(resolve(own, "medicia-owner.json"), JSON.stringify({ owner: mode === "owner" ? "foreign" : "01a1e570-bf21-713e-a6ad-6707cb5b4178", purpose: "pdf-e022-local-builder", root: project, requestedBuildKit: "v0.27.0", privilegedContainerAuthorized: true }));
    put(resolve(own, "pin.json"), JSON.stringify({ version: "v0.27.0", image: mode === "pin" ? "moby/buildkit:latest" : buildkit, platform: "linux/amd64", platformManifest: "sha256:ca9db05302dc3a4846e3401ecfbd27e349fcc614ab046a7d89a83b0a5c313cee", builder }));
    put(resolve(own, "image-verified.json"), JSON.stringify({ image: buildkit, id: kitId, os: "linux", arch: "amd64", builder, node: nodeName }));
    put(resolve(own, "resources-verified.json"), JSON.stringify({ container, id: containerId, image: kitId, reference: buildkit, privileged: true, volume, buildkitVersion: "v0.27.0" }));
    put(resolve(own, "instances", builder), JSON.stringify(Object.fromEntries([["Name", builder], ["Driver", mode === "driver" ? "docker" : "docker-container"], ["Dynamic", false], ["Nodes", [Object.fromEntries([["Name", mode === "node" ? "foreign" : nodeName], ["Endpoint", mode === "endpoint" ? "remote" : "desktop-linux"], ["DriverOpts", { image: buildkit }], ["Flags", ["--allow-insecure-entitlement=network.host"]]])]]])));
  }
  const q = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  const harness = resolve(directory, "harness.ps1");
  const live = `${mode === "resource" ? "f".repeat(64) : containerId}|${kitId}|${buildkit}|true|true|volume:${volume}:/var/lib/buildkit;`;
  const manifestDigest = "sha256:" + "b".repeat(64); const iid = mode === "iid" ? "sha256:" + "f".repeat(64) : configIid ? image : manifestDigest;
  const uri = "oci-layout://" + resolve(project, "node_modules/.cache/medicia-pdf-runtime-build-compat/base-oci").replaceAll("\\", "/") + "@" + baseDigest;
  put(harness, `$ErrorActionPreference='Stop'\n$env:MEDICIA_PDF_RUNTIME_DEADLINE='synthetic'\n$env:BUILDX_CONFIG=${q(mode === "ambient-config" ? "C:/synthetic/foreign" : own)}\n$env:DOCKER_CONTEXT='synthetic-original'\n$global:FakeBuilt=$false;$global:FakeLoaded=$false\nfunction node { $global:LASTEXITCODE=0;if($args[-1] -eq '--verify-base'){${q(JSON.stringify({ baseImageId: base, manifestDigest: baseDigest, uri }))}}else{'{"validated":true}'} }\nfunction docker {\n$a=@($args);if($a[0] -eq '--context'){$a=$a[2..($a.Count-1)]};$global:LASTEXITCODE=0\nif($a[0] -eq 'context'){${q(mode === "endpoint-live" ? "tcp://remote:2375" : "npipe:////./pipe/dockerDesktopLinuxEngine")};return}\nif($a[0] -eq 'container'){${q(live)};return}\nif($a[0] -eq 'buildx'){[IO.File]::WriteAllText(${q(argumentsFile)},(ConvertTo-Json -Compress -InputObject @($args)));[IO.File]::WriteAllText(${q(counter)},'1');$global:FakeBuilt=$true;$global:FakeLoaded=$a -contains '--load';$i=[Array]::IndexOf($a,'--iidfile');[IO.File]::WriteAllText($a[$i+1],${q(iid)});$m=[Array]::IndexOf($a,'--metadata-file');if($m -ge 0){[IO.File]::WriteAllText($a[$m+1],${q(JSON.stringify(Object.fromEntries([["containerimage.digest", manifestDigest], ["containerimage.config.digest", mode === "config" ? "sha256:" + "e".repeat(64) : image]])))})};return}\nif($a[0] -ne 'image'){throw 'Unexpected fake command'}\nif($a[-1] -eq '${base}'){'${base}';return}\nif($global:FakeBuilt -and $global:FakeLoaded){'${mode === "local" ? "sha256:" + "e".repeat(64) : image}';return}\n$global:LASTEXITCODE=1;Write-Error ('Error response from daemon: No such image: '+$a[-1])\n}\nif((Get-Command docker).CommandType -ne 'Function' -or (Get-Command node).CommandType -ne 'Function'){throw 'Unsafe fake resolution'}\ntry{& ${q(runtime)} -Step Build;if($env:BUILDX_CONFIG -ne ${q(mode === "ambient-config" ? "C:/synthetic/foreign" : own)} -or $env:DOCKER_CONTEXT -ne 'synthetic-original'){throw 'Process configuration leaked'};[Console]::Out.Write('BUILT');exit 0}catch{[Console]::Error.Write($_.Exception.Message);exit 9}`);
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", harness], { encoding: "utf8", timeout: 10000 });
  expect(result.error).toBeUndefined(); expect(readFileSync(stored)).toEqual(before); expect(readFileSync(resolve(output, "context-manifest.json"))).toEqual(contextBefore);
  return { result, output, counter: readFileSync(counter, "utf8"), args: existsSync(argumentsFile) ? JSON.parse(readFileSync(argumentsFile, "utf8")) as string[] : [] };
}
it.each([false, true])("BUILDER carga local y liga iid/config/exporter sin confundir digests: %s", (configIid) => {
  const value = builderCall("valid", configIid); expect(value.result.status).toBe(0); expect(value.result.stdout).toBe('{"validated":true}\r\nBUILT'); expect(value.result.stderr).toBe(""); expect(value.counter).toBe("1");
  expect(value.args.slice(0, 8)).toEqual(["--context", "desktop-linux", "buildx", "build", "--builder", builder, "--load", "--pull=false"]);
  expect(value.args).toContain("--metadata-file"); expect(value.args).not.toContain("--use"); expect(value.args).not.toContain("--bootstrap");
  expect(JSON.parse(readFileSync(resolve(value.output, "image-manifest.json"), "utf8"))).toMatchObject({ schema: "pdf-e022-image.v2", imageId: image, baseImageId: base, baseManifestDigest: baseDigest });
});
it.each(["missing-config", "owner", "pin", "endpoint", "driver", "node", "resource", "ambient-config", "endpoint-live"])("BUILDER rechaza %s antes de build sin outputs ni cambio de contador", (mode) => {
  const value = builderCall(mode); expect(value.result.status).toBe(9); expect(value.result.stdout).toBe(""); expect(value.result.stderr).toBe("Owned local builder validation failed; no build allowed"); expect(value.counter).toBe("0"); expect(value.args).toEqual([]);
  for (const name of ["wrapper.iid", "wrapper-build.json", "image-manifest.json"]) expect(existsSync(resolve(value.output, name))).toBe(false);
});
it.each(["iid", "config", "local"])("BUILDER salida %s no ligada se conserva pero no habilita wrapper", (mode) => {
  const value = builderCall(mode); expect(value.result.status).toBe(9); expect(value.result.stdout).toBe('{"validated":true}\r\n'); expect(value.result.stderr).toBe("Built image identity mismatch"); expect(value.counter).toBe("1");
  expect(existsSync(resolve(value.output, "wrapper.iid"))).toBe(true); expect(existsSync(resolve(value.output, "wrapper-build.json"))).toBe(true); expect(existsSync(resolve(value.output, "image-manifest.json"))).toBe(false);
});
const approvedOwner = "03281252-1af6-4587-a1c4-0e8c4908ae63";
const approvedVolume = "medicia-pdf-e022-local-01a1e570-model";
const loadedWrapper = "sha256:249d5e805e05afead656b382a255d2986a4fb5a2c13c2e3aef169453f3a2656b";
function recoveryCall(mode: string, action: "owner" | "recovery" | "fresh" | "evidence" = "owner") {
  const directory = mkdtempSync(resolve(evidence, "recovery-native-"));
  const state = resolve(directory, "stored.json"), counter = resolve(directory, "counter.txt"), calls = resolve(directory, "calls.json");
  writeFileSync(state, '{"synthetic":"unchanged"}'); writeFileSync(counter, "0"); writeFileSync(calls, "[]");
  const before = readFileSync(state); const labels = mode === "invalid-json" ? "{" : mode === "missing" ? "{}" : mode === "array" ? '[{"medicia.pdf-e022.owner":"'+approvedOwner+'"}]' : mode === "duplicate" ? '{"medicia.pdf-e022.owner":"'+approvedOwner+'","medicia.pdf-e022.owner":"'+approvedOwner+'"}' : JSON.stringify(Object.fromEntries([["medicia.pdf-e022.owner", mode === "wrong" ? "00000000-0000-0000-0000-000000000000" : mode === "wrong-type" ? 3 : approvedOwner], ...(mode === "extra" ? [["foreign", "value"]] : [])]));
  const fake = resolve(directory, "fake-docker.cjs"), wrapper = resolve(directory, "docker.cmd");
  writeFileSync(fake, `const fs=require('node:fs');const p=${JSON.stringify(calls)};const a=process.argv.slice(2);const calls=JSON.parse(fs.readFileSync(p));calls.push(a);fs.writeFileSync(p,JSON.stringify(calls));if(a.includes('context')){process.stdout.write(a.includes('show')?'desktop-linux\\n':${JSON.stringify(mode === "remote" ? "tcp://remote:2375\n" : "npipe:////./pipe/dockerDesktopLinuxEngine\n")});process.exit(0)}if(a.includes('image')){process.stdout.write(${JSON.stringify(loadedWrapper + "\n")});process.exit(0)}if(a.includes('container')){if(${JSON.stringify(mode)}==='existing-importer'){process.stdout.write('owned-id');process.exit(0)}process.stderr.write('Error: No such container: medicia-pdf-e022-local-01a1e570-import\\n');process.exit(1)}if(a.includes('volume')&&a.includes('{{.Name}}')){process.stdout.write(${JSON.stringify(approvedVolume)});process.exit(0)}if(!a.includes('{{json .Labels}}')){process.stderr.write('template parsing error: template: :1: function "medicia" not defined\\n');process.exit(1)}process.stdout.write(${JSON.stringify(labels + "\n")});if(${JSON.stringify(mode)}==='docker-error'){process.stderr.write('synthetic-native-error\\n');process.exit(7)}`);
  writeFileSync(wrapper, `@echo off\r\n"${process.execPath}" "${fake}" %*\r\nexit /b %errorlevel%\r\n`);
  const q = (value: string) => "'" + value.replaceAll("'", "''") + "'";
  writeFileSync(resolve(directory, "model-volume-owner.txt"), approvedOwner);
  const text = readFileSync(script, "utf8"); const start = text.slice(text.indexOf("    # No permite autocrear"), text.indexOf("    # Verifica nuevamente TODOS"));
  const project = resolve(directory, "project"), runtime = resolve(project, "scripts/pdf-e022-local/runtime.ps1");
  const output = resolve(project, "node_modules/.cache/medicia-pdf-runtime-build-compat/runtime"); mkdirSync(dirname(runtime), { recursive: true }); mkdirSync(output, { recursive: true });
  // A regression cannot reach the real private ZIP even if the original absence guard breaks.
  writeFileSync(runtime, text.replace(/^\$ZipPath = .*$/m, "$ZipPath = " + q(resolve(directory, "never-existing.zip"))));
  const context = Buffer.from('{"synthetic":"context"}'); writeFileSync(resolve(output, "context-manifest.json"), context);
  writeFileSync(resolve(output, "image-manifest.json"), JSON.stringify({ schema: "pdf-e022-image.v2", baseImageId: base, baseManifestDigest: baseDigest, imageId: loadedWrapper, contextManifestSha256: createHash("sha256").update(context).digest("hex") }));
  const record = resolve(directory, "exclusive.txt"); if (action === "evidence") writeFileSync(record, "preserve");
  const body = action === "owner" ? start : action === "recovery" ? `Assert-ImportRecovery ${q(mode === "wrong-volume" ? approvedVolume + "-foreign" : approvedVolume)} ${q(mode === "wrong-token" ? "00000000-0000-0000-0000-000000000000" : approvedOwner)} ${q(mode === "wrong-wrapper" ? image : loadedWrapper)}` : action === "fresh" ? `function node {$global:LASTEXITCODE=0};$env:MEDICIA_PDF_RUNTIME_DEADLINE='synthetic';& ${q(runtime)} -Step ImportModel` : `Write-ExclusiveText ${q(record)} 'replacement'`;
  const harness = resolve(directory, "harness.ps1"); writeFileSync(harness, `$ErrorActionPreference='Stop'\nSet-Alias -Name docker -Value ${q(wrapper)} -Scope Script\n$c=Get-Command docker;if($c.CommandType -ne 'Alias' -or $c.Definition -ne ${q(wrapper)}){throw 'Unsafe fake resolution'}\n$t=$null;$e=$null;$a=[System.Management.Automation.Language.Parser]::ParseFile(${q(script)},[ref]$t,[ref]$e);if($e.Count){throw 'syntax'}\nforeach($name in @('Assert-New','Assert-VolumeOwner','Assert-LocalDocker','Assert-ImportRecovery','Write-ExclusiveText')){$f=$a.Find({param($n)$n -is [System.Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -eq $name},$true);if($f){Invoke-Expression $f.Extent.Text}}\n$Cache=${q(directory)};$Prefix='medicia-pdf-e022-local-01a1e570';$Root=${q(project)}\ntry{${body};[IO.File]::WriteAllText(${q(counter)},'1');[Console]::Out.Write('NEXT');exit 0}catch{[Console]::Error.Write($_.Exception.Message);exit 9}`);
  const outputBefore = readdirSync(output).sort();
  const result = spawnSync("powershell.exe", ["-NoProfile", "-File", harness], { encoding: "utf8", timeout: 10000 }); expect(result.error).toBeUndefined(); expect(readFileSync(state)).toEqual(before);
  if (action === "fresh") expect(readdirSync(output).sort()).toEqual(outputBefore);
  if (action === "evidence") expect(readFileSync(record, "utf8")).toBe("preserve");
  return { result, counter: readFileSync(counter, "utf8"), calls: JSON.parse(readFileSync(calls, "utf8")) as string[][], directory };
}
it.each(["valid", "docker-error", "invalid-json", "missing", "wrong", "array", "extra", "duplicate", "wrong-type"])("IMPORT OWNER native JSON %s conserva estado y token", (mode) => {
  const value = recoveryCall(mode); expect(value.result.status).toBe(mode === "valid" ? 0 : 9); expect(value.result.stdout).toBe(mode === "valid" ? "NEXT" : ""); expect(value.result.stderr).toBe(mode === "valid" ? "" : "Exclusive model volume ownership mismatch"); expect(value.counter).toBe(mode === "valid" ? "1" : "0");
  expect(value.calls).toEqual([["volume", "inspect", "--format", "{{json .Labels}}", approvedVolume]]);
});
it.each(["valid", "wrong-volume", "wrong-token", "wrong-wrapper", "remote", "existing-importer", "wrong"])("IMPORT RECOVERY exacto %s no adopta recursos ajenos", (mode) => {
  const value = recoveryCall(mode, "recovery"); expect(value.result.status).toBe(mode === "valid" ? 0 : 9); expect(value.result.stdout).toBe(mode === "valid" ? "NEXT" : ""); expect(value.result.stderr).toBe(mode === "valid" ? "" : "Import recovery rejected; preserve volume and evidence."); expect(value.counter).toBe(mode === "valid" ? "1" : "0");
  expect(value.calls.flat()).not.toContain("create"); expect(value.calls.flat()).not.toContain("run");
});
it("IMPORT RECOVERY original ImportModel sigue rechazando volumen existente antes de ZIP/escrituras", () => {
  const value = recoveryCall("valid", "fresh"); expect(value.result.status).toBe(9); expect(value.result.stdout).toBe(""); expect(value.result.stderr).toBe(`Exclusive resource already exists: ${approvedVolume}. No reuse/cleanup.`); expect(value.counter).toBe("0"); expect(value.calls.flat()).not.toContain("create");
});
it("IMPORT RECOVERY evidencia exclusiva nunca sobrescribe una colisión", () => {
  const value = recoveryCall("valid", "evidence"); expect(value.result.status).toBe(9); expect(value.result.stdout).toBe(""); expect(value.result.stderr).toBe("Import evidence already exists; preserve it."); expect(value.counter).toBe("0"); expect(value.calls).toEqual([]);
});
it("IMPORT RECOVERY ayuda enumera entrada explícita sin aceptar opciones de adopción arbitraria", () => {
  const usage = "Usage: node scripts/pdf-e022-local/run-step.mjs <ConvertBase|Prepare|Build|WrapperTests|ImportModel|ResumeImportModel|Start|Fixture|Smoke> [--timeout-ms <100..1800000>]";
  const deadlines = Object.fromEntries([["ConvertBase", 180000], ["Prepare", 120000], ["Build", 1800000], ["WrapperTests", 60000], ["ImportModel", 180000], ["ResumeImportModel", 180000], ["Start", 120000], ["Fixture", 30000], ["Smoke", 90000]]);
  const marker = resolve(cache, "cli-preserved-counter.txt"); writeFileSync(marker, "0"); const before = readdirSync(cache).sort();
  const help = spawnSync(process.execPath, [runnerScript, "--help"], { encoding: "utf8", timeout: 5000 }); expect(help.status).toBe(0); expect(help.stderr).toBe(""); expect(help.stdout).toBe(usage + "\n" + JSON.stringify(deadlines) + "\n");
  for (const args of [["ResumeImportModel", "--volume", "foreign"], ["ImportModel", "--expected-owner", approvedOwner]]) { const value = spawnSync(process.execPath, [runnerScript, ...args], { encoding: "utf8", timeout: 5000 }); expect(value.status).toBe(2); expect(value.stdout).toBe(""); expect(value.stderr).toBe(usage + "\n"); }
  expect(readFileSync(marker, "utf8")).toBe("0"); expect(readdirSync(cache).sort()).toEqual(before);
});
