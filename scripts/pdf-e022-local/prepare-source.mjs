// Frontera local de build: fuentes fijadas, contexto cerrado y ningún archivo .env.
import { createHash } from 'node:crypto';
import { lstat, realpath, readdir, mkdir, readFile, writeFile, open } from 'node:fs/promises';
import { resolve, dirname, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const commit = '4ff99ce97a42ff32a47268996f3cedcdabe70c1c';
const paths = [
  'pyproject.toml', 'src/anonimizacion/__init__.py',
  'src/anonimizacion/dominio/__init__.py', 'src/anonimizacion/dominio/errores.py',
  'src/anonimizacion/dominio/modelos.py', 'src/anonimizacion/dominio/precision_hora.py',
  'src/anonimizacion/dominio/referencias.py', 'src/anonimizacion/dominio/tipos_documento.py',
  'src/anonimizacion/dominio/senal_ecg.py', 'src/anonimizacion/extraccion/__init__.py',
  'src/anonimizacion/extraccion/texto_pymupdf.py', 'src/anonimizacion/extraccion/trazos_pymupdf.py',
  'src/anonimizacion/extraccion/senal_ecg.py', 'src/anonimizacion/parseo/__init__.py',
  'src/anonimizacion/parseo/ecg_mortara.py', 'src/anonimizacion/reconciliacion/__init__.py',
  'src/anonimizacion/reconciliacion/base.py', 'src/anonimizacion/reconciliacion/normalizacion.py',
  'tests/fixtures/pdf_sintetico.py', 'tests/parseo/test_ecg_mortara.py', 'tests/fixtures/test_pdf_sintetico_ecg.py',
];
const runtime = ['Dockerfile', 'requirements.txt', 'extractor.py', 'synthetic_pdf.py', 'smoke.py', 'verify_model.py'];
const pins = { 'inference.py': '243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9',
  'serve.py': '956bb27c52b46959b33a05609e88ebeed132dbd5ae5cf27cb1e78bdc1c930e81',
  'pdf_adapter.py': 'd27e82f4a8002763eb76586b23801cd12d24d3e4c63ef8be799fc7e666702b67' };
const expected = [...paths.map((p) => 'reader/' + p), ...runtime, 'tests/test_extractor.py', 'synthetic_waveform.py'];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const fail = () => { throw new Error('Runtime preparation rejected.'); };
const canonical = (p) => process.platform === 'win32' ? p.toLowerCase() : p;
async function exists(path) {
  try { return await lstat(path); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
function inside(root, path) {
  const rel = relative(root, path);
  if (rel === '..' || rel.startsWith('..' + sep) || resolve(root, rel) !== resolve(path)) fail();
}
async function safePath(root, target, checked) {
  inside(root, target);
  const pieces = relative(root, target).split(sep).filter(Boolean);
  let path = root;
  for (const part of ['', ...pieces]) {
    if (part) path = resolve(path, part);
    const info = await exists(path);
    if (!info) continue;
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile()) || canonical(await realpath(path)) !== canonical(path)) fail();
    checked.add(path);
  }
}
async function tree(root, directory, checked, files = new Map(), directories = new Set()) {
  await safePath(root, directory, checked);
  const info = await exists(directory);
  if (!info) return { files, directories };
  if (!info.isDirectory()) fail();
  for (const entry of await readdir(directory)) {
    const path = resolve(directory, entry);
    await safePath(root, path, checked);
    const stat = await lstat(path);
    if (stat.isDirectory()) {
      directories.add(path);
      if (directories.size > 128) fail();
      await tree(root, path, checked, files, directories);
    } else {
      files.set(path, stat.size);
      if (files.size > 128) fail();
    }
  }
  return { files, directories };
}
function rejectWindowsReparsePoints(checked) {
  if (process.platform !== 'win32') return;
  // lstat detecta symlinks/junctions; Attributes también rechaza otros tipos de reparse point.
  const literals = [...checked].map((p) => "'" + p.replaceAll("'", "''") + "'").join(',');
  const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', `$ErrorActionPreference='Stop';foreach($p in @(${literals})){if(([IO.File]::GetAttributes($p) -band [IO.FileAttributes]::ReparsePoint) -ne 0){exit 3}}`], { timeout: 10000, encoding: 'utf8' });
  if (result.status !== 0) fail();
}
const sameKeys = (value, keys) => value && typeof value === 'object' && !Array.isArray(value) &&
  Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
async function boundedSource(response) {
  if (!response.ok || !response.body) fail();
  const reader = response.body.getReader(); const chunks = []; let length = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      length += next.value.byteLength; if (length > 512 * 1024) fail(); chunks.push(next.value);
    }
    return Buffer.concat(chunks, length);
  } finally { await reader.cancel(); reader.releaseLock(); }
}
export async function prepareSource({ root = project, cache = resolve(root, 'node_modules/.cache/medicia-pdf-runtime-build-compat/runtime'), validateOnly = false, fetchSource = globalThis.fetch, reuseContext, reuseManifestSha256 = 'b5621b10b4b6d24ede5796aeb8cc6b7026be572883870fec83eadd0baae96fb2' } = {}) {
  try {
    root = resolve(root); cache = resolve(cache); inside(root, cache);
    if (root === cache) fail();
    const context = resolve(cache, 'context'); const manifestPath = resolve(cache, 'context-manifest.json');
    const checked = new Set();
    const sourcePaths = [...runtime.map((p) => 'runtime/pdf-e022/' + p), 'tests/unit/runtime/pdf-e022/test_extractor.py',
      ...Object.keys(pins).map((p) => 'node_modules/.cache/medicia-e022-source-inspection/' + p)];
    for (const path of sourcePaths) await safePath(root, resolve(root, path), checked);
    await tree(root, resolve(root, 'runtime/pdf-e022'), checked);
    await tree(root, cache, checked);
    rejectWindowsReparsePoints(checked); // Antes de lectura de contenido, fetch o escritura.
    const inputs = {}; const sourceBytes = new Map();
    for (const path of sourcePaths) {
      const bytes = await readFile(resolve(root, path)); inputs[path] = hash(bytes); sourceBytes.set(path, bytes);
    }
    for (const [name, digest] of Object.entries(pins)) if (inputs['node_modules/.cache/medicia-e022-source-inspection/' + name] !== digest) fail();
    if (await exists(context) || await exists(manifestPath)) {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      if (!sameKeys(manifest, ['schema', 'commit', 'inputs', 'files']) || manifest.schema !== 'pdf-e022-context.v1' || manifest.commit !== commit ||
          !sameKeys(manifest.files, expected) || !sameKeys(manifest.inputs, sourcePaths)) fail();
      if (sourcePaths.some((p) => manifest.inputs[p] !== inputs[p])) fail();
      const listing = await tree(root, context, checked);
      const allowedDirectories = new Set(expected.flatMap((p) => {
        const parts = p.split('/'); return parts.slice(0, -1).map((part, i) => resolve(context, ...parts.slice(0, i + 1)));
      }));
      if (listing.files.size !== expected.length || [...listing.directories].some((p) => !allowedDirectories.has(p))) fail();
      for (const path of expected) {
        if (!listing.files.has(resolve(context, path)) || hash(await readFile(resolve(context, path))) !== manifest.files[path]) fail();
      }
      return { context, manifestPath, validated: true, files: expected.length };
    }
    if (validateOnly) fail();
    const contents = new Map();
    if (reuseContext) {
      reuseContext = resolve(reuseContext);
      const previousManifestPath = resolve(reuseContext, '../context-manifest.json');
      await safePath(root, previousManifestPath, checked);
      const listing = await tree(root, reuseContext, checked); rejectWindowsReparsePoints(checked);
      const bytes = await readFile(previousManifestPath);
      if (hash(bytes) !== reuseManifestSha256) fail();
      const previous = JSON.parse(bytes);
      if (!sameKeys(previous, ['schema','commit','inputs','files']) || previous.schema !== 'pdf-e022-context.v1' || previous.commit !== commit ||
          !sameKeys(previous.files, expected) || !sameKeys(previous.inputs, sourcePaths) || listing.files.size !== expected.length ||
          sourcePaths.some((p) => p !== 'runtime/pdf-e022/Dockerfile' && previous.inputs[p] !== inputs[p])) fail();
      const allowedDirectories = new Set(expected.flatMap((p) => p.split('/').slice(0,-1).map((part,i) => resolve(reuseContext,...p.split('/').slice(0,i+1)))));
      if ([...listing.directories].some((p) => !allowedDirectories.has(p))) fail();
      for (const path of expected) {
        const bytes = await readFile(resolve(reuseContext, path));
        if (hash(bytes) !== previous.files[path]) fail();
        if (path.startsWith('reader/')) contents.set(path, bytes);
      }
    } else {
      for (const path of paths) {
        const response = await fetchSource(`https://raw.githubusercontent.com/luchoaquinopla/Anonimizacion/${commit}/${path}`,
          { redirect: 'error', signal: AbortSignal.timeout(10000) });
        contents.set('reader/' + path, await boundedSource(response));
      }
    }
    const fixture = contents.get('reader/tests/fixtures/pdf_sintetico.py').toString('utf8');
    const marker = '# --- Trazado de ECG con oráculo'; if (!fixture.includes(marker)) fail();
    contents.set('synthetic_waveform.py', Buffer.from('from __future__ import annotations\nimport math\nimport random\nfrom pathlib import Path\nimport numpy as np\nimport pymupdf\n' + fixture.slice(fixture.indexOf(marker))));
    for (const name of runtime) contents.set(name, sourceBytes.get('runtime/pdf-e022/' + name));
    contents.set('tests/test_extractor.py', sourceBytes.get('tests/unit/runtime/pdf-e022/test_extractor.py'));
    // Segundo preflight después de la red: nunca reutilizar un contexto creado concurrentemente.
    await tree(root, cache, checked); rejectWindowsReparsePoints(checked);
    if (await exists(context) || await exists(manifestPath)) fail();
    const files = {};
    for (const [path, bytes] of contents) {
      const target = resolve(context, path); await safePath(root, target, checked);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, bytes, { flag: 'wx' }); files[path] = hash(bytes);
    }
    const manifest = { schema: 'pdf-e022-context.v1', commit, inputs, files };
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + '\n', { flag: 'wx' });
    return { context, manifestPath, validated: true, files: expected.length };
  } catch { fail(); }
}
const baseImage = 'sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4';
const baseManifest = 'sha256:85b6c041ca253782ebb2f769ab765790f2a70c09467f66aac4b1beabf11d8236';
const imageType = 'application/vnd.oci.image.';
const digestPattern = /^sha256:[a-f0-9]{64}$/;
// Siete JSON v1 de compatibilidad del export REAL Docker 29.9.2. Se verifican,
// pero no se copian al layout OCI; cualquier otro blob no referenciado se rechaza.
const exportMetadata = ['1681e367e9653848a298685bcccb1272c282dfbbab5d5cfe1fe3f0911f999e75',
  '7369950791e0ce881d6cdb925cec334d5d44ace6e347c30545b9dc4bf05227ac',
  'ba74d6639bad63d1ab4fb32518bc5db6a63d86a69eb4fd40160d880be5fe56aa',
  'd1729aea479097915a26045dde6955e5a4cc90c99ba2095b36676612992c1c40',
  'd36e01a8e996c919329954cd7c5eff45ebe7ce8d795dcf4c85043755b17dfc85',
  'ecc43ca9b7457ab7090b198c307199c0c00b2c091025f9a21e82460442a35a41',
  'f8bb0fd22f11003d0f28238b7e177af254f752dfc2c3abf0526eeb15afc7845c'].map((s) => 'blobs/sha256/' + s);
const baseFail = () => { throw new Error('Immutable base preparation rejected.'); };
const blobPath = (digest) => { if (typeof digest !== 'string' || !digestPattern.test(digest)) baseFail(); return 'blobs/sha256/' + digest.slice(7); };
async function readRange(file, offset, length, signal) {
  signal.throwIfAborted(); const bytes = Buffer.alloc(length); let read = 0;
  while (read < length) { signal.throwIfAborted(); const next = await file.read(bytes, read, length-read, offset+read); if (!next.bytesRead) baseFail(); read += next.bytesRead; }
  return bytes;
}
async function hashRange(file, offset, length, signal, output) {
  const digest = createHash('sha256'); let done = 0;
  while (done < length) {
    const bytes = await readRange(file, offset+done, Math.min(1024*1024,length-done), signal); digest.update(bytes);
    if (output) { let written=0; while(written<bytes.length) { const next=await output.write(bytes,written,bytes.length-written); if(!next.bytesWritten)baseFail(); written+=next.bytesWritten; } }
    done += bytes.length;
  }
  return digest.digest('hex');
}
async function archiveEntries(file, size, signal) {
  if (size < 1024 || size % 512 || size > 8*1024**3) baseFail();
  const entries = new Map(); let offset=0;
  while(offset+512 <= size) {
    const header=await readRange(file,offset,512,signal);
    if(header.every((b)=>b===0)) {
      if(size-offset<1024)baseFail();
      while(offset<size) { if(!(await readRange(file,offset,Math.min(1024*1024,size-offset),signal)).every((b)=>b===0))baseFail();offset+=Math.min(1024*1024,size-offset); }
      return entries;
    }
    const text=(a,b)=>header.subarray(a,b).toString('ascii').replace(/\0.*$/s,'');
    const octal=(a,b)=>{const s=text(a,b).trim();if(!/^[0-7]+$/.test(s))baseFail();return Number.parseInt(s,8);};
    const checksum=[...header].reduce((sum,b,i)=>sum+(i>=148&&i<156?32:b),0);
    if(checksum!==octal(148,156)||!header.subarray(257,263).equals(Buffer.from('ustar\0'))||text(263,265)!=='00'||header.subarray(157,257).some((b)=>b!==0))baseFail();
    const name=(text(345,500)?text(345,500)+'/':'')+text(0,100);const length=octal(124,136);const type=text(156,157);
    if(entries.has(name)||entries.size>=128||offset+512+Math.ceil(length/512)*512>size)baseFail();
    if(type==='5') { if(!['blobs/','blobs/sha256/'].includes(name)||length!==0)baseFail(); }
    else if(!['0',''].includes(type)||!(/^(oci-layout|index\.json|manifest\.json|blobs\/sha256\/[a-f0-9]{64})$/.test(name)))baseFail();
    const padding=(512-length%512)%512;
    if(padding&&(await readRange(file,offset+512+length,padding,signal)).some((b)=>b!==0))baseFail();
    entries.set(name,{offset:offset+512,size:length,directory:type==='5'}); offset+=512+Math.ceil(length/512)*512;
  }
  baseFail();
}
async function describeOci(load, baseImageId, manifestDigest) {
  const indexBytes=await load('index.json');const index=JSON.parse(indexBytes);
  if(!sameKeys(index,['schemaVersion','mediaType','manifests'])||index.schemaVersion!==2||index.mediaType!==imageType+'index.v1+json'||!Array.isArray(index.manifests)||index.manifests.length!==1)baseFail();
  const descriptor=(value,mediaType)=>{if(!sameKeys(value,['mediaType','digest','size'])||value.mediaType!==mediaType||!digestPattern.test(value.digest)||!Number.isSafeInteger(value.size)||value.size<1)baseFail();return blobPath(value.digest);};
  const manifestPath=descriptor(index.manifests[0],imageType+'manifest.v1+json');
  if(index.manifests[0].digest!==manifestDigest)baseFail();
  const manifestBytes=await load(manifestPath);const manifest=JSON.parse(manifestBytes);
  if(hash(manifestBytes)!==manifestDigest.slice(7)||manifestBytes.length!==index.manifests[0].size||!sameKeys(manifest,['schemaVersion','mediaType','config','layers'])||manifest.schemaVersion!==2||manifest.mediaType!==imageType+'manifest.v1+json'||!Array.isArray(manifest.layers)||manifest.layers.length<1||manifest.layers.length>64)baseFail();
  const configPath=descriptor(manifest.config,imageType+'config.v1+json');const configBytes=await load(configPath);const config=JSON.parse(configBytes);
  if(manifest.config.digest!==baseImageId||hash(configBytes)!==baseImageId.slice(7)||configBytes.length!==manifest.config.size||config.os!=='linux'||config.architecture!=='amd64'||!sameKeys(config.rootfs,['type','diff_ids'])||config.rootfs.type!=='layers'||!Array.isArray(config.rootfs.diff_ids)||config.rootfs.diff_ids.length!==manifest.layers.length)baseFail();
  const layoutBytes=await load('oci-layout');
  const files=new Map([['oci-layout',layoutBytes.length],['index.json',indexBytes.length],[manifestPath,manifestBytes.length],[configPath,configBytes.length]]);
  const layout=JSON.parse(layoutBytes);if(!sameKeys(layout,['imageLayoutVersion'])||layout.imageLayoutVersion!=='1.0.0')baseFail();
  for(const [i,layer] of manifest.layers.entries()) { const path=descriptor(layer,imageType+'layer.v1.tar');if(layer.digest!==config.rootfs.diff_ids[i]||files.has(path))baseFail();files.set(path,layer.size); }
  return {files,manifest,configPath};
}
export async function prepareBase({root=project,archive=resolve(root,'node_modules/.cache/medicia-pdf-runtime-build-compat/base-source.tar'),layout=resolve(root,'node_modules/.cache/medicia-pdf-runtime-build-compat/base-oci'),baseImageId=baseImage,manifestDigest=baseManifest,validateOnly=false,signal=AbortSignal.timeout(25000)}={}) {
  let input;
  try {
    root=resolve(root);archive=resolve(archive);layout=resolve(layout);signal.throwIfAborted();blobPath(baseImageId);blobPath(manifestDigest);
    const provenance=resolve(layout,'../base-manifest.json');const checked=new Set();
    for(const path of [layout,provenance,...(validateOnly?[]:[archive])])await safePath(root,path,checked);
    rejectWindowsReparsePoints(checked);
    const result=(count,archiveSha256)=>({baseImageId,manifestDigest,files:count,archiveSha256,uri:'oci-layout://'+layout.replaceAll('\\','/')+'@'+manifestDigest});
    if(validateOnly) {
      const listing=await tree(root,layout,checked);rejectWindowsReparsePoints(checked);
      const load=async(path)=>{const size=listing.files.get(resolve(layout,path));if(size===undefined||size>1024*1024)baseFail();return readFile(resolve(layout,path));};
      const {files}=await describeOci(load,baseImageId,manifestDigest);
      if(listing.files.size!==files.size||[...listing.directories].some((p)=>!['blobs','blobs/sha256'].map((s)=>resolve(layout,s)).includes(p)))baseFail();
      const metadata=JSON.parse(await readFile(provenance));
      if(!sameKeys(metadata,['schema','baseImageId','manifestDigest','archiveSha256','files'])||metadata.schema!=='pdf-e022-base.v1'||metadata.baseImageId!==baseImageId||metadata.manifestDigest!==manifestDigest||!sameKeys(metadata.files,[...files.keys()])||typeof metadata.archiveSha256!=='string'||!/^[a-f0-9]{64}$/.test(metadata.archiveSha256))baseFail();
      for(const [path,size] of files) { const target=resolve(layout,path);if(listing.files.get(target)!==size)baseFail();signal.throwIfAborted();const file=await open(target,'r');try{if(await hashRange(file,0,listing.files.get(target),signal)!==metadata.files[path]||(path.startsWith('blobs/')&&metadata.files[path]!==path.slice(-64)))baseFail();}finally{await file.close();} }
      return result(files.size,metadata.archiveSha256);
    }
    if(await exists(layout)||await exists(provenance))baseFail();
    input=await open(archive,'r');const before=await input.stat();if(!before.isFile())baseFail();
    const entries=await archiveEntries(input,before.size,signal);
    const load=async(path)=>{const row=entries.get(path);if(!row||row.directory||row.size>1024*1024)baseFail();return readRange(input,row.offset,row.size,signal);};
    const {files,manifest,configPath}=await describeOci(load,baseImageId,manifestDigest);
    // Verificar también miembros requeridos AUSENTES antes de cualquier output.
    for(const [path,size] of files) {
      const row=entries.get(path);if(!row||row.directory||row.size!==size)baseFail();
    }
    const legacy=JSON.parse(await load('manifest.json'));
    if(!Array.isArray(legacy)||legacy.length!==1||!sameKeys(legacy[0],['Config','RepoTags','Layers','LayerSources'])||legacy[0].Config!==configPath||legacy[0].RepoTags!==null||JSON.stringify(legacy[0].Layers)!==JSON.stringify(manifest.layers.map((l)=>blobPath(l.digest)))||!sameKeys(legacy[0].LayerSources,manifest.layers.map((l)=>l.digest)))baseFail();
    for(const layer of manifest.layers) { const source=legacy[0].LayerSources[layer.digest];if(!sameKeys(source,['mediaType','size','digest'])||source.mediaType!==layer.mediaType||source.size!==layer.size||source.digest!==layer.digest)baseFail(); }
    const extras=[...entries.keys()].filter((p)=>!files.has(p)&&!['blobs/','blobs/sha256/','manifest.json'].includes(p));
    if(extras.length&&(extras.length!==exportMetadata.length||extras.some((p)=>!exportMetadata.includes(p))||baseImageId!==baseImage))baseFail();
    const hashes={};
    for(const [path,row] of entries) {
      if(row.directory)continue;
      const digest=await hashRange(input,row.offset,row.size,signal);
      if(path.startsWith('blobs/')&&digest!==path.slice(-64))baseFail();
      if(files.has(path)) { if(row.size!==files.get(path))baseFail();hashes[path]=digest; }
    }
    const archiveSha256=await hashRange(input,0,before.size,signal);signal.throwIfAborted();
    const after=await input.stat();if(before.size!==after.size||before.mtimeMs!==after.mtimeMs)baseFail();
    await safePath(root,layout,checked);rejectWindowsReparsePoints(checked);
    if(await exists(layout)||await exists(provenance))baseFail();
    // Todo el archive fue validado ANTES de crear outputs. Copia por rangos propios,
    // nunca tar -xf, links, permisos del archive ni extracción del contenido de capas.
    for(const [path,size] of files) {
      signal.throwIfAborted();const target=resolve(layout,path);await safePath(root,target,checked);await mkdir(dirname(target),{recursive:true});
      const output=await open(target,'wx',0o600);try{const digest=await hashRange(input,entries.get(path).offset,size,signal,output);if(digest!==hashes[path])baseFail();}finally{await output.close();}
    }
    const metadata={schema:'pdf-e022-base.v1',baseImageId,manifestDigest,archiveSha256,files:hashes};
    await writeFile(provenance,JSON.stringify(metadata,null,2)+'\n',{flag:'wx'});return result(files.size,archiveSha256);
  } catch { baseFail(); } finally { await input?.close(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2);const usage='Usage: node scripts/pdf-e022-local/prepare-source.mjs [--validate-only|--convert-base|--verify-base]';
  if(args.length>1||(args.length===1&&!['--validate-only','--convert-base','--verify-base'].includes(args[0]))) { console.error(usage);process.exitCode=2; }
  else {
    try {
      const remaining=process.env.MEDICIA_PDF_RUNTIME_DEADLINE?Number(process.env.MEDICIA_PDF_RUNTIME_DEADLINE)-Date.now():25000;
      if(!Number.isInteger(remaining)||remaining<1||remaining>1800000)baseFail();
      console.log(JSON.stringify(args[0]==='--convert-base'||args[0]==='--verify-base'?await prepareBase({validateOnly:args[0]==='--verify-base',signal:AbortSignal.timeout(remaining)}):await prepareSource({validateOnly:args[0]==='--validate-only',reuseContext:resolve(project,'node_modules/.cache/medicia-pdf-runtime-repair/runtime/context')})));
    }catch{console.error(args[0]==='--convert-base'||args[0]==='--verify-base'?'Immutable base preparation rejected.':'Runtime preparation rejected.');process.exitCode=1;}
  }
}

