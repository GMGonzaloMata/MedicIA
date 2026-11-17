#!/usr/bin/env bash
set -eu
exec node - "$@" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const usage = 'Usage: package-demo.sh INPUT OUTPUT.tar.gz\n';
const args = process.argv.slice(2);
if (args.length === 1 && args[0] === '--help') { process.stdout.write(usage); process.exit(0); }
if (args.length !== 2 || args.some(arg => arg.startsWith('-'))) { process.stderr.write(usage); process.exit(2); }
const expandedLimit = 512 * 1024 * 1024;
const compressedLimit = 128 * 1024 * 1024;
const required = ['release.json', '.next/BUILD_ID', 'node_modules/next/dist/bin/next', 'generated/prisma/client.ts'];
let temporary;
const published = [];
function reject() { throw Error('rejected'); }
function exists(name) { try { fs.lstatSync(name); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; } }
function ustarPath(name) {
  if (Buffer.byteLength(name) <= 100) return { name, prefix: '' };
  // La separación debe coincidir con un slash, nunca truncar un segmento.
  for (let split = name.lastIndexOf('/'); split > 0; split = name.lastIndexOf('/', split - 1)) {
    const prefix = name.slice(0, split); const suffix = name.slice(split + 1);
    if (Buffer.byteLength(prefix) <= 155 && Buffer.byteLength(suffix) <= 100) return { name: suffix, prefix };
  }
  reject();
}
function safeName(name) {
  const parts = name.split('/');
  if (!name || /[^\x20-\x7e]|[\\:]/.test(name) || parts.some(part =>
    !part || part === '.' || part === '..' || part.startsWith('.env') ||
    ['.aws', '.git', 'credentials', 'tests', 'patients', 'studies', 'secrets', '.cache', 'cache'].includes(part) ||
    part.includes('.tfstate') || part.endsWith('.tfvars') || /\.(pem|key|p12|pfx|dcm|dicom|csv|sqlite|db)$/i.test(part))) reject();
  ustarPath(name);
}
function checkManifest(body) {
  const manifest = JSON.parse(body.toString('utf8'));
  if (!manifest || manifest.platform !== 'linux' || manifest.arch !== 'x64' || manifest.node !== 24) reject();
}
function octal(header, offset, length, value) {
  const number = value.toString(8);
  if (!Number.isSafeInteger(value) || value < 0 || number.length >= length) reject();
  header.write(number.padStart(length - 1, '0') + '\0', offset, length, 'ascii');
}
function headerFor(entry) {
  const header = Buffer.alloc(512);
  const fields = ustarPath(entry.name);
  header.write(fields.name, 0, 100, 'ascii');
  header.write(fields.prefix, 345, 155, 'ascii');
  octal(header, 100, 8, entry.directory ? 0o755 : 0o644);
  octal(header, 108, 8, 0); octal(header, 116, 8, 0);
  octal(header, 124, 12, entry.size); octal(header, 136, 12, 0);
  header.fill(32, 148, 156); header[156] = entry.directory ? 53 : 48;
  header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
  octal(header, 148, 8, header.reduce((sum, byte) => sum + byte, 0));
  return header;
}
// Revalidar los bytes finales antes de publicar: no basta que gzip termine con exit0.
function validate(packed) {
  if (packed.length > compressedLimit) reject();
  const tar = gunzipSync(packed, { maxOutputLength: expandedLimit });
  const entries = new Map(); let offset = 0;
  function text(bytes) { return bytes.toString('utf8').split('\0')[0]; }
  function number(bytes) { const value = text(bytes).trim(); if (!/^[0-7]+$/.test(value)) reject(); return parseInt(value, 8); }
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== number(header.subarray(148, 156)) || text(header.subarray(257, 263)) !== 'ustar') reject();
    const prefix = text(header.subarray(345, 500));
    const name = (prefix ? prefix + '/' : '') + text(header.subarray(0, 100)); safeName(name);
    const type = header[156]; const size = number(header.subarray(124, 136));
    if (![48, 53].includes(type) || entries.has(name) || entries.size >= 100000 ||
      offset + 512 + size > tar.length || (type === 53 && size !== 0)) reject();
    entries.set(name, { directory: type === 53, body: tar.subarray(offset + 512, offset + 512 + size) });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  for (const name of required) if (!entries.has(name) || entries.get(name).directory || !entries.get(name).body.length) reject();
  checkManifest(entries.get('release.json').body);
}
try {
  if (process.platform !== 'linux' || process.arch !== 'x64' || Number(process.versions.node.split('.')[0]) !== 24) reject();
  const input = fs.realpathSync(args[0]);
  if (!fs.lstatSync(args[0]).isDirectory() || !fs.statSync(input).isDirectory()) reject();
  const output = path.join(fs.realpathSync(path.dirname(path.resolve(args[1]))), path.basename(args[1]));
  if (!output.endsWith('.tar.gz') || output === input || output.startsWith(input + path.sep) || exists(output) || exists(output + '.sha256')) reject();
  const entries = []; let expanded = 1024;
  function walk(directory, prefix = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const relative = prefix + name; safeName(relative);
      const location = path.join(directory, name); const stat = fs.lstatSync(location);
      if ((!stat.isFile() && !stat.isDirectory()) || stat.isSymbolicLink() || (stat.isFile() && stat.nlink !== 1)) reject();
      const entry = { name: relative, location, directory: stat.isDirectory(), size: stat.isDirectory() ? 0 : stat.size, stat };
      expanded += 512 + Math.ceil(entry.size / 512) * 512;
      if (expanded > expandedLimit || entries.length >= 100000) reject();
      entries.push(entry);
      if (entry.directory) walk(location, relative + '/');
    }
  }
  walk(input);
  for (const name of required) {
    const entry = entries.find(item => item.name === name);
    if (!entry || entry.directory || entry.size === 0) reject();
  }
  checkManifest(fs.readFileSync(path.join(input, 'release.json')));
  const blocks = [];
  for (const entry of entries) {
    blocks.push(headerFor(entry));
    if (!entry.directory) {
      const fd = fs.openSync(entry.location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || stat.ino !== entry.stat.ino || stat.dev !== entry.stat.dev || stat.size !== entry.size || stat.mtimeMs !== entry.stat.mtimeMs) reject();
        const body = fs.readFileSync(fd);
        if (body.length !== entry.size || fs.fstatSync(fd).mtimeMs !== stat.mtimeMs) reject();
        blocks.push(body, Buffer.alloc((512 - body.length % 512) % 512));
      } finally { fs.closeSync(fd); }
    }
  }
  blocks.push(Buffer.alloc(1024));
  const packed = gzipSync(Buffer.concat(blocks), { level: 6 }); validate(packed);
  const sha = createHash('sha256').update(packed).digest('hex') + '\n';
  temporary = fs.mkdtempSync(path.join(path.dirname(output), '.medicia-package-'));
  const archive = path.join(temporary, 'archive'); const checksum = path.join(temporary, 'sha256');
  fs.writeFileSync(archive, packed, { flag: 'wx', mode: 0o600 });
  fs.writeFileSync(checksum, sha, { flag: 'wx', mode: 0o600 });
  // Link exclusivo: no reemplaza archivos de operador, incluso ante colisión concurrente.
  for (const [source, target] of [[archive, output], [checksum, output + '.sha256']]) {
    fs.linkSync(source, target); published.push({ target, ino: fs.statSync(source).ino });
  }
  process.stdout.write('medicia package: created\n');
} catch {
  for (const item of published) {
    if (fs.lstatSync(item.target, { throwIfNoEntry: false })?.ino === item.ino) fs.unlinkSync(item.target);
  }
  process.stderr.write('medicia package: rejected\n'); process.exitCode = 1;
} finally {
  if (temporary) fs.rmSync(temporary, { recursive: true });
}
NODE
