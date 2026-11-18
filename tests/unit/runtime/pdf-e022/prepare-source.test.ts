// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, symlinkSync, cpSync, realpathSync, rmSync } from "node:fs";
import { delimiter, resolve, dirname } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";

const scriptPath = "scripts/pdf-e022-local/prepare-source.mjs";
const source = resolve(scriptPath);
const url = pathToFileURL(source).href;
const artifactDir = "node_modules/.cache/medicia-e022-source-inspection";
const artifactNames = ["inference.py", "serve.py", "pdf_adapter.py"];
const sha = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

function scratchDirectory() {
  return mkdtempSync(resolve(realpathSync(tmpdir()), "medicia-pdf-e022-"));
}

function removeScratch(dir: string) {
  rmSync(dir, { recursive: true, force: true });
}

function scratch() {
  const dir = scratchDirectory();
  onTestFinished(() => removeScratch(dir));
  return dir;
}

function sourceWorld(root: string) {
  return { root, fixtureUrl: pathToFileURL(resolve(root, scriptPath)).href, context: resolve(root, "owned/context"), output: resolve(root, "owned") };
}

function writeSyntheticInputs(root: string) {
  const inputPaths = [
    ...["Dockerfile", "requirements.txt", "extractor.py", "synthetic_pdf.py", "smoke.py", "verify_model.py"]
      .map((name) => `runtime/pdf-e022/${name}`),
    "tests/unit/runtime/pdf-e022/test_extractor.py",
    ...artifactNames.map((name) => `${artifactDir}/${name}`),
  ];
  const inputs = Object.fromEntries(inputPaths.map((path) => {
    const bytes = Buffer.from(`# synthetic fixture: ${path}\n`);
    const target = resolve(root, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, bytes);
    return [path, sha(bytes)];
  }));
  writeSyntheticPinModule(root, inputs);
  return inputs;
}

function writeSyntheticPinModule(root: string, inputs: Record<string, string>) {
  // Solo cambia la identidad de los artefactos en una copia descartable. El SHA-256 y
  // su comparación siguen siendo reales; el módulo original se prueba por separado.
  const text = readFileSync(source, "utf8");
  const pinDeclaration = text.match(/^const pins = \{[^}]+\};$/m)?.[0];
  if (!pinDeclaration) throw new Error("Synthetic pin fixture requires the original pin declaration.");
  const pins = [...pinDeclaration.matchAll(/'([^']+)': '[a-f0-9]{64}'/g)].map((match) => match[1]);
  expect(pins).toEqual(artifactNames);
  const syntheticPins = Object.fromEntries(pins.map((name) => [name, inputs[`${artifactDir}/${name}`]]));
  const fixturePath = resolve(root, scriptPath);
  mkdirSync(dirname(fixturePath), { recursive: true });
  writeFileSync(fixturePath, text.replace(pinDeclaration, () => `const pins = ${JSON.stringify(syntheticPins)};`));
}

type World = ReturnType<typeof sourceWorld>;

function run(root: string, program: string) {
  // PowerShell solo inspecciona los atributos de los archivos sintéticos en Windows.
  const systemRoot = process.env.SystemRoot || "C:\\Windows";
  const env: NodeJS.ProcessEnv = {
    NODE_ENV: "test",
    PATH: [dirname(process.execPath), ...(process.platform === "win32" ? [resolve(systemRoot, "System32/WindowsPowerShell/v1.0")] : [])].join(delimiter),
    ...(process.platform === "win32" ? Object.fromEntries([["SystemRoot", systemRoot]]) : {}),
  };
  return spawnSync(process.execPath, ["--input-type=module", "-e", program], { cwd: root, env, encoding: "utf8", timeout: 15000 });
}

function call(w: World, options: { cache?: string; validateOnly?: boolean; reuseContext?: string; reuseManifestSha256?: string; productionPins?: boolean } = {}) {
  const { productionPins, ...preparation } = options;
  const input = { root: w.root, cache: w.output, ...preparation };
  // El proceso no admite red real y siempre usa la raíz descartable explícita.
  const program = `
    globalThis.fetch = async () => { throw Error('network forbidden'); };
    let calls = 0;
    const {prepareSource} = await import(${JSON.stringify(productionPins ? url : w.fixtureUrl)});
    try {
      const result = await prepareSource({
        ...${JSON.stringify(input)},
        fetchSource: async () => {
          calls++;
          if (${Boolean(input.reuseContext || input.validateOnly)}) throw Error('unexpected fetch');
          return new Response('# --- Trazado de ECG con oráculo\\n# synthetic fixture\\n');
        },
      });
      console.log(JSON.stringify({result, calls}));
    } catch (error) {
      console.log(JSON.stringify({error: error.message, calls}));
      process.exitCode = 9;
    }`;
  const result = run(w.root, program);
  expect(result.error).toBeUndefined();
  expect(result.stderr).toBe("");
  const output = JSON.parse(result.stdout);
  expect(result.status).toBe(output.error === undefined ? 0 : 9);
  return output;
}

describe("contexto prepareSource", () => {
  let seedDirectory: string | undefined;
  let seed: World;
  let seedInputs: Record<string, string>;
  let creation: ReturnType<typeof call>;

  beforeAll(() => {
    // Crear ocho veces el mismo contexto repetía el arranque de Node y las dos
    // comprobaciones de atributos con PowerShell en Windows.
    seedDirectory = scratchDirectory();
    seed = sourceWorld(resolve(seedDirectory, "root"));
    seedInputs = writeSyntheticInputs(seed.root);
    creation = call(seed);
    expect(creation.error).toBeUndefined();
  });

  afterAll(() => {
    if (seedDirectory) removeScratch(seedDirectory);
  });

  function world(context: "empty" | "prepared" | "missing-extractor" = "empty") {
    const w = sourceWorld(resolve(scratch(), "root"));
    // Solo se modifica la copia de cada prueba; la semilla queda intacta.
    const omit = context === "empty" ? seed.output
      : context === "missing-extractor" ? resolve(seed.context, "extractor.py") : undefined;
    cpSync(seed.root, w.root, { recursive: true, filter: (path) => path !== omit });
    return w;
  }

  it("crea un contexto cerrado y hashea runtime/test/modeltext", () => {
    expect(creation.calls).toBe(21);
    const parsed = JSON.parse(readFileSync(resolve(seed.output, "context-manifest.json"), "utf8"));
    expect(Object.keys(parsed.files)).toHaveLength(29);
    expect(Object.keys(parsed.inputs)).toHaveLength(10);
    expect(parsed.inputs).toEqual(seedInputs);
  });

  it("revalida el contexto sin escribir ni red", () => {
    const w = world("prepared");
    const manifest = resolve(w.output, "context-manifest.json");
    const before = readFileSync(manifest);
    const second = call(w, { validateOnly: true });
    expect(second.error).toBeUndefined(); expect(second.calls).toBe(0);
    expect(readFileSync(manifest)).toEqual(before);
  });

  it("los pines de producción rechazan los artefactos sintéticos sin red ni escritura", () => {
    const w = world();
    expect(call(w, { productionPins: true })).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(existsSync(w.output)).toBe(false);
  });

  it.each(artifactNames)("rechaza un artefacto sintético alterado (%s) sin red ni escritura", (name) => {
    const w = world(); const artifact = resolve(w.root, artifactDir, name);
    writeFileSync(artifact, "# changed synthetic artifact\n");
    expect(call(w)).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(readFileSync(artifact, "utf8")).toBe("# changed synthetic artifact\n");
    expect(existsSync(w.output)).toBe(false);
  });

  it.each(["extra", "corrupt", "missing", "manifest", "runtime-input"])("rechaza %s antes de red/escrituras sin reparar ni mutar manifiesto", (mode) => {
    const w = world("prepared");
    const manifest = resolve(w.output, "context-manifest.json");
    if (mode === "extra") writeFileSync(resolve(w.context, "extra.py"), "synthetic extra");
    if (mode === "corrupt") writeFileSync(resolve(w.context, "extractor.py"), "corrupt");
    if (mode === "missing") {
      // Simula falta sin borrar: un manifiesto exige un miembro esperado cuyo nombre fue alterado.
      const value = JSON.parse(readFileSync(manifest, "utf8")); value.files["missing.py"] = "0".repeat(64); writeFileSync(manifest, JSON.stringify(value));
    }
    if (mode === "manifest") writeFileSync(manifest, "{}");
    if (mode === "runtime-input") writeFileSync(resolve(w.root, "runtime/pdf-e022/extractor.py"), "changed input");
    const before = readFileSync(manifest);
    const result = call(w);
    expect(result).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(readFileSync(manifest)).toEqual(before);
    if (mode === "extra") expect(readFileSync(resolve(w.context, "extra.py"), "utf8")).toBe("synthetic extra");
  });

  it("un archivo físicamente ausente se rechaza sin reconstruir el contexto", () => {
    const w = world("missing-extractor");
    const manifest = resolve(w.output, "context-manifest.json"); const before = readFileSync(manifest);
    expect(call(w)).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(readFileSync(manifest)).toEqual(before); expect(existsSync(resolve(w.context, "extractor.py"))).toBe(false);
  });

  it("contexto parcial sin manifiesto no se completa ni sobrescribe", () => {
    const w = world(); mkdirSync(w.context, { recursive: true }); writeFileSync(resolve(w.context, "unexpected"), "preserve");
    expect(call(w)).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(readFileSync(resolve(w.context, "unexpected"), "utf8")).toBe("preserve");
    expect(existsSync(resolve(w.output, "context-manifest.json"))).toBe(false);
  });

  it("cache fuera de raíz se rechaza antes de crear outputs", () => {
    const w = world(); const escaped = resolve(w.root, "../not-owned-output");
    expect(call(w, { cache: escaped })).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(existsSync(escaped)).toBe(false);
  });

  it.each(["cache", "source"])("rechaza symlink/junction %s sin seguirlo ni modificar destino", (mode) => {
    const w = world(); const target = resolve(w.root, "link-target"); mkdirSync(target);
    const link = mode === "cache" ? w.output : resolve(w.root, "runtime/pdf-e022/link");
    // Se valida todo el pequeño directorio de inputs, no solo el archivo consumido.
    symlinkSync(target, link, process.platform === "win32" ? "junction" : "dir");
    writeFileSync(resolve(target, "untouched"), "preserve");
    expect(call(w)).toEqual({ error: "Runtime preparation rejected.", calls: 0 });
    expect(readFileSync(resolve(target, "untouched"), "utf8")).toBe("preserve");
    expect(existsSync(resolve(target, "context"))).toBe(false);
    expect(existsSync(resolve(w.output, "context-manifest.json"))).toBe(false);
  });

  it("contexto nuevo reutiliza lector verificado sin fetch y conserva el contexto original", () => {
    const w = world("prepared");
    const manifest = readFileSync(resolve(w.output, "context-manifest.json")); const output = resolve(w.root, "new-owned");
    writeFileSync(resolve(w.root, "runtime/pdf-e022/Dockerfile"), "FROM e022base\n# changed recipe\n");
    expect(call(w, { cache: output, reuseContext: w.context, reuseManifestSha256: sha(manifest) }))
      .toMatchObject({ result: { validated: true, files: 29 }, calls: 0 });
    expect(readFileSync(resolve(w.output, "context-manifest.json"))).toEqual(manifest);
    expect(readFileSync(resolve(output, "context/Dockerfile"), "utf8")).toBe("FROM e022base\n# changed recipe\n");
  });
});

const ociType = "application/vnd.oci.image.";
function archiveMember(name: string, bytes: Buffer, type = "0") {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100); header.write("0000600\0", 100); header.write("0000000\0", 108); header.write("0000000\0", 116);
  header.write(bytes.length.toString(8).padStart(11, "0") + "\0", 124); header.write("00000000000\0", 136);
  header.fill(32, 148, 156); header.write(type, 156); header.write("ustar\0", 257); header.write("00", 263);
  header.write([...header].reduce((a, b) => a + b, 0).toString(8).padStart(6, "0") + "\0 ", 148);
  return Buffer.concat([header, bytes, Buffer.alloc((512 - bytes.length % 512) % 512)]);
}
function baseWorld(mode = "valid") {
  const root = scratch(); const layout = resolve(root, "base-oci");
  const layer = Buffer.from("synthetic uncompressed layer bytes"); const layerDigest = "sha256:" + sha(layer);
  const config = Buffer.from(JSON.stringify({ os: mode === "platform" ? "windows" : "linux", architecture: "amd64", rootfs: Object.fromEntries<unknown>([["type", "layers"], ["diff_ids", [mode === "diffid" ? "sha256:" + "0".repeat(64) : layerDigest]]]) }));
  const baseImageId = "sha256:" + sha(config);
  const descriptor = { mediaType: ociType + "layer.v1.tar", digest: layerDigest, size: layer.length };
  const manifest = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: ociType + "manifest.v1+json", config: { mediaType: ociType + "config.v1+json", digest: baseImageId, size: config.length }, layers: [descriptor] }));
  const manifestDigest = "sha256:" + sha(manifest);
  const index = Buffer.from(JSON.stringify({ schemaVersion: 2, mediaType: ociType + "index.v1+json", manifests: [{ mediaType: ociType + "manifest.v1+json", digest: manifestDigest, size: manifest.length }] }));
  const layerPath = "blobs/sha256/" + sha(layer); const configPath = "blobs/sha256/" + sha(config);
  // Casing impuesto por el wire format Docker, no nombres del dominio de la app.
  const dockerManifest = Buffer.from(JSON.stringify([Object.fromEntries<unknown>([["Config", configPath], ["RepoTags", null], ["Layers", [layerPath]], ["LayerSources", { [layerDigest]: descriptor }]])]));
  const entries: Array<[string, Buffer, string?]> = [["oci-layout", Buffer.from('{"imageLayoutVersion":"1.0.0"}')], ["index.json", index], ["manifest.json", dockerManifest], ["blobs/sha256/" + sha(manifest), manifest], [configPath, mode === "config-corrupt" ? Buffer.from("corrupted") : config], [layerPath, mode === "layer-corrupt" ? Buffer.from("corrupted") : layer]];
  if (["traversal", "absolute", "drive", "backslash"].includes(mode)) entries[0][0] = ({ traversal: "../escape", absolute: "/escape", drive: "C:/escape", backslash: "..\\escape" })[mode] ?? "../escape";
  if (["symlink", "hardlink", "pax"].includes(mode)) entries[0][2] = ({ symlink: "2", hardlink: "1", pax: "x" })[mode];
  if (mode === "extra") entries.push(["blobs/sha256/" + sha(Buffer.from("extra")), Buffer.from("extra")]);
  if (mode === "duplicate") entries.push(entries[0]);
  if (mode === "missing") entries.pop();
  let bytes = Buffer.concat([...entries.map(([name, content, type]) => archiveMember(name, content, type)), Buffer.alloc(1024)]);
  if (mode === "checksum") bytes[100] ^= 1;
  if (mode === "truncated") bytes = bytes.subarray(0, bytes.length - 513);
  if (mode === "trailing") bytes[bytes.length - 1] = 1;
  if (mode === "compressed") bytes = Buffer.from([31, 139, 8, 0]);
  const archive = resolve(root, "base-source.tar"); writeFileSync(archive, bytes);
  return { root, layout, archive, baseImageId: mode === "wrong-config" ? "sha256:" + "0".repeat(64) : baseImageId, manifestDigest, bytes };
}
function baseCall(w: ReturnType<typeof baseWorld>, validateOnly = false, aborted = false) {
  const program = `try{const api=await import(${JSON.stringify(url)});if(typeof api.prepareBase!=='function')throw Error('OCI entrypoint missing');const result=await api.prepareBase({root:${JSON.stringify(w.root)},archive:${JSON.stringify(w.archive)},layout:${JSON.stringify(w.layout)},baseImageId:${JSON.stringify(w.baseImageId)},manifestDigest:${JSON.stringify(w.manifestDigest)},validateOnly:${validateOnly}${aborted ? ",signal:AbortSignal.abort()" : ""}});console.log(JSON.stringify(result));}catch(e){console.log(JSON.stringify({error:e.message}));process.exitCode=9;}`;
  const r = run(w.root, program);
  expect(r.error).toBeUndefined(); expect(r.stderr).toBe("");
  return { status: r.status, output: JSON.parse(r.stdout) };
}
it("OCI conserva manifest digest distinto del config ID, verifica capas y revalida readonly", () => {
  const w = baseWorld(); const result = baseCall(w);
  expect(result.status).toBe(0); expect(result.output).toMatchObject({ baseImageId: w.baseImageId, manifestDigest: w.manifestDigest, files: 5, uri: "oci-layout://" + w.layout.replaceAll("\\", "/") + "@" + w.manifestDigest });
  expect(w.baseImageId).not.toBe(w.manifestDigest);
  const proof = readFileSync(resolve(w.root, "base-manifest.json"));
  expect(baseCall(w, true)).toEqual(result);
  expect(readFileSync(resolve(w.root, "base-manifest.json"))).toEqual(proof);
  expect(readFileSync(w.archive)).toEqual(w.bytes);
});
it.each(["traversal", "absolute", "drive", "backslash", "symlink", "hardlink", "pax", "extra", "duplicate", "missing", "checksum", "truncated", "trailing", "compressed", "wrong-config", "config-corrupt", "layer-corrupt", "platform", "diffid"])("OCI rechaza %s antes de outputs, preservando archivo/estado", (mode) => {
  const w = baseWorld(mode); const marker = resolve(w.root, "counter"); writeFileSync(marker, "0");
  expect(baseCall(w)).toEqual({ status: 9, output: { error: "Immutable base preparation rejected." } });
  expect(existsSync(w.layout)).toBe(false); expect(existsSync(resolve(w.root, "base-manifest.json"))).toBe(false);
  expect(readFileSync(marker, "utf8")).toBe("0"); expect(readFileSync(w.archive)).toEqual(w.bytes);
});
it("OCI no repara evidencia parcial, ni acepta abort antes de efectos", () => {
  const w = baseWorld(); mkdirSync(w.layout); writeFileSync(resolve(w.layout, "preserve"), "owned");
  expect(baseCall(w).status).toBe(9); expect(readFileSync(resolve(w.layout, "preserve"), "utf8")).toBe("owned");
  const clean = baseWorld(); expect(baseCall(clean, false, true).status).toBe(9); expect(existsSync(clean.layout)).toBe(false);
});
it.each(["extra", "corrupt", "manifest"])("OCI validación rechaza %s sin reparar", (mode) => {
  const w = baseWorld(); expect(baseCall(w).status).toBe(0);
  if (mode === "extra") writeFileSync(resolve(w.layout, "unexpected"), "preserve");
  if (mode === "corrupt") writeFileSync(resolve(w.layout, "blobs/sha256", w.baseImageId.slice(7)), "corrupt");
  if (mode === "manifest") writeFileSync(resolve(w.root, "base-manifest.json"), "{}");
  const before = readFileSync(resolve(w.root, "base-manifest.json"));
  expect(baseCall(w, true)).toEqual({ status: 9, output: { error: "Immutable base preparation rejected." } });
  expect(readFileSync(resolve(w.root, "base-manifest.json"))).toEqual(before);
});
