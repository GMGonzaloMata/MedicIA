// Deadline externo: nunca limpia Docker ni afirma que terminó trabajo del daemon.
import { spawn, spawnSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, lstat, realpath, writeFile } from 'node:fs/promises';
import { finished } from 'node:stream/promises';
import { resolve, relative, dirname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const cache = resolve(root, 'node_modules/.cache/medicia-pdf-runtime-build-compat');
export const STEP_TIMEOUTS = Object.freeze({ ConvertBase: 180000, Prepare: 120000, Build: 1800000, WrapperTests: 60000,
  ImportModel: 180000, ResumeImportModel: 180000, Start: 120000, Fixture: 30000, Smoke: 90000 });
const MAX_TIMEOUT = 1800000;
async function safeDirectory(directory) {
  const rel = relative(cache, directory);
  if (rel === '..' || rel.startsWith('..' + sep) || resolve(cache, rel) !== directory) throw new Error('Invalid output directory');
  let path = root;
  for (const part of relative(root, directory).split(sep)) {
    path = resolve(path, part);
    try {
      const info = await lstat(path);
      if (!info.isDirectory() || info.isSymbolicLink() || (await realpath(path)).toLowerCase() !== path.toLowerCase()) throw new Error('Unsafe output directory');
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
}
export async function runProcess({ command, args, timeoutMs, directory, signal, environment = process.env }) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT || typeof command !== 'string' || !Array.isArray(args)) throw new Error('Invalid process options');
  directory = resolve(directory); await safeDirectory(directory);
  for (const name of ['stdout.log', 'stderr.log', 'result.json']) {
    let present = false;
    try { await lstat(resolve(directory, name)); present = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (present) throw new Error('Process evidence already exists');
  }
  await mkdir(directory, { recursive: true });
  const stdout = createWriteStream(resolve(directory, 'stdout.log'), { flags: 'wx' });
  const stderr = createWriteStream(resolve(directory, 'stderr.log'), { flags: 'wx' });
  // Antes de lanzar, detectar colisión/denegación de logs; nunca sobrescribir evidencia.
  await Promise.all([new Promise((ok, fail) => { stdout.once('open', ok); stdout.once('error', fail); }),
    new Promise((ok, fail) => { stderr.once('open', ok); stderr.once('error', fail); })]);
  const child = spawn(command, args, { cwd: root, env: environment, stdio: ['ignore', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true });
  child.stdout.pipe(stdout); child.stderr.pipe(stderr);
  let timedOut = false; let treeTerminationRequested = false; let interruptionSignal = null;
  let terminalCode; let fallback;
  const result = await new Promise((resolveResult) => {
    let settled = false;
    const finish = (code, childSignal, processClosed) => {
      if (settled) return; settled = true;
      clearTimeout(timer); clearTimeout(fallback); signal?.removeEventListener('abort', onAbort);
      if (!processClosed) { child.stdout.destroy(); child.stderr.destroy(); stdout.end(); stderr.end(); child.unref(); }
      resolveResult({ exitCode: timedOut ? 124 : interruptionSignal ? (interruptionSignal === 'SIGTERM' ? 143 : 130) : terminalCode ?? code ?? 127,
        childExitCode: code, childSignal, timedOut, interruptionSignal, treeTerminationRequested, processClosed,
        daemonWorkMayRemain: treeTerminationRequested, pid: child.pid ?? null });
    };
    const terminate = () => {
      if (settled || treeTerminationRequested) return;
      treeTerminationRequested = true;
      // Fijar el primer motivo antes de taskkill síncrono: no convertir SIGINT en timeout durante el cierre.
      clearTimeout(timer);
      if (child.pid) {
        if (process.platform === 'win32') {
          spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { timeout: 5000, stdio: 'ignore', windowsHide: true });
        } else {
          try { process.kill(-child.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') terminalCode = 127; }
        }
      }
      fallback = setTimeout(() => finish(null, null, false), 5000);
    };
    const onAbort = () => {
      // Solo etiquetas internas conocidas: nunca publicar signal.reason arbitrario.
      interruptionSignal = signal?.reason === 'SIGTERM' ? 'SIGTERM' : 'SIGINT'; terminate();
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    signal?.addEventListener('abort', onAbort, { once: true });
    child.once('error', () => { terminalCode = 127; stdout.end(); stderr.end(); finish(null, null, true); });
    child.once('close', (code, childSignal) => finish(code, childSignal, true));
    if (signal?.aborted) onAbort();
  });
  await Promise.all([finished(stdout), finished(stderr)]);
  await writeFile(resolve(directory, 'result.json'), JSON.stringify(result, null, 2) + '\n', { flag: 'wx' });
  return result;
}
async function main(args) {
  const usage = 'Usage: node scripts/pdf-e022-local/run-step.mjs <ConvertBase|Prepare|Build|WrapperTests|ImportModel|ResumeImportModel|Start|Fixture|Smoke> [--timeout-ms <100..1800000>]';
  if (args.length === 1 && args[0] === '--help') { console.log(usage); console.log(JSON.stringify(STEP_TIMEOUTS)); return 0; }
  const [step, flag, value] = args;
  const timeoutMs = args.length === 1 ? STEP_TIMEOUTS[step] : Number(value);
  if (!Object.hasOwn(STEP_TIMEOUTS, step ?? '') || ![1, 3].includes(args.length) ||
      (args.length === 3 && (flag !== '--timeout-ms' || !/^\d+$/.test(value ?? ''))) ||
      !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > MAX_TIMEOUT) { console.error(usage); return 2; }
  const runs = resolve(cache, 'runs'); await safeDirectory(runs); await mkdir(runs, { recursive: true });
  const directory = await mkdtemp(resolve(runs, step + '-'));
  const controller = new AbortController();
  const onInterrupt = () => controller.abort('SIGINT');
  const onTerminate = () => controller.abort('SIGTERM');
  process.once('SIGINT', onInterrupt); process.once('SIGTERM', onTerminate);
  try {
    const invocation = step === 'ConvertBase' ? {command:process.execPath,args:[resolve(root,'scripts/pdf-e022-local/prepare-source.mjs'),'--convert-base']} :
      {command:'powershell.exe',args:['-NoProfile','-File',resolve(root,'scripts/pdf-e022-local/runtime.ps1'),'-Step',step]};
    const result = await runProcess({ ...invocation,
      timeoutMs, directory, signal: controller.signal, environment: { ...process.env, MEDICIA_PDF_RUNTIME_DEADLINE: String(Date.now() + timeoutMs) } });
    console.log(JSON.stringify({ step, directory, ...result }));
    if (result.treeTerminationRequested) console.error('Owned process-tree termination requested; Docker daemon work/resources may remain. No retry or cleanup.');
    return result.exitCode;
  } finally { process.removeListener('SIGINT', onInterrupt); process.removeListener('SIGTERM', onTerminate); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = await main(process.argv.slice(2)); }
  catch { console.error('Step runner failed; preserve its evidence and inspect owned processes.'); process.exitCode = 1; }
}
