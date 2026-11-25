#!/usr/bin/env bash
# Construye el paquete de la demo (Linux x64, Node 24) listo para subir a S3.
#
# Corre DENTRO de un contenedor Linux amd64 con Node 24, con el repo montado de solo lectura en /src y una carpeta
# de salida en /out. Desde Windows, en la raíz del repo (PowerShell):
#
#   docker run --rm --platform linux/amd64 -v "${PWD}:/src:ro" -v "${PWD}/release-out:/out" node:24-bookworm `
#     bash /src/infra/scripts/build-demo-release.sh demo-v1
#
# Deja en release-out/: demo-v1.tar.gz y demo-v1.tar.gz.sha256 (el digest va en `release_sha256` del tfvars).
# No lee .env*, no toca AWS ni ninguna base de datos. Los pasos de abajo no se pueden saltar: el cliente de Prisma lo
# genera el responsable ANTES de empaquetar (acá, dentro del contenedor, con una URL falsa porque no se conecta).
set -euo pipefail

NAME="${1:?Uso: build-demo-release.sh NOMBRE (por ejemplo demo-v1)}"
SRC="${MEDICIA_SRC:-/src}"
OUT="${MEDICIA_OUT:-/out}"

[[ "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]*$ ]] || { echo "Nombre inválido." >&2; exit 2; }
[[ "$(uname -sm)" == 'Linux x86_64' ]] || { echo "Hace falta Linux x86_64 (usá --platform linux/amd64)." >&2; exit 2; }
[[ "$(node --version)" =~ ^v24[.] ]] || { echo "Hace falta Node 24." >&2; exit 2; }
[[ -d "$SRC/src" && -d "$OUT" ]] || { echo "Montá el repo en $SRC y una carpeta de salida en $OUT." >&2; exit 2; }
[[ ! -e "$OUT/$NAME.tar.gz" ]] || { echo "Ya existe $OUT/$NAME.tar.gz: elegí otro nombre." >&2; exit 2; }

WORK="$(mktemp -d)"
APP="$WORK/app"
mkdir -p "$APP"

echo "==> Copiando fuentes (sin .env, .git, node_modules ni artefactos locales)"
tar -C "$SRC" -cf - \
  --exclude=./node_modules --exclude=./.next --exclude=./generated --exclude='./.env*' --exclude=./.git \
  --exclude=./coverage --exclude=./test-results --exclude=./release-out --exclude=./.claude --exclude=./.agents \
  --exclude=./tsconfig.tsbuildinfo . | tar -C "$APP" -xf -
cd "$APP"

export NEXT_TELEMETRY_DISABLED=1
# El generador y el build no se conectan a ninguna base: la URL solo tiene que existir.
export DATABASE_URL='postgresql://build:build@localhost:5432/build'

echo "==> Instalando dependencias (npm ci)"
npm ci --no-audit --no-fund

echo "==> Generando el cliente de Prisma"
npx prisma generate

echo "==> Compilando (next build)"
npm run build

echo "==> Pasando la configuración de Next a JavaScript (así el host no necesita TypeScript)"
node -e "
const ts = require('typescript');
const fs = require('node:fs');
const source = fs.readFileSync('next.config.ts', 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
fs.writeFileSync('next.config.mjs', output.outputText);
"

echo "==> Quitando dependencias de desarrollo"
npm prune --omit=dev --no-audit --no-fund

echo "==> Preparando el contenido del paquete"
# Se deja solo lo que `next start` necesita: lo compilado, las dependencias de producción, la configuración y el
# cliente de Prisma generado. Sin fuentes, pruebas, specs ni documentación.
STAGE="$WORK/stage"
mkdir -p "$STAGE"
cp -r .next node_modules generated public package.json next.config.mjs "$STAGE/"
printf '{"platform":"linux","arch":"x64","node":24}\n' > "$STAGE/release.json"

# El límite del paquete es de 512 MiB expandido. Se quitan cosas que `next start` no usa: TypeScript y los tipos
# (la configuración ya está en JavaScript), el CLI y los motores de migración de Prisma (las migraciones las corre el responsable desde su máquina, no el host), el servidor local de
# Prisma, Playwright y los binarios musl (la AMI es Amazon Linux, glibc). La prueba de arranque de más abajo confirma
# que el resto sigue funcionando.
(
  cd "$STAGE/node_modules"
  rm -rf typescript @types next/dist/docs prisma @prisma/engines @prisma/studio-core @prisma/dev @electric-sql playwright-core playwright \
    @next/swc-linux-x64-musl @img/sharp-libvips-linuxmusl-x64 @img/sharp-linuxmusl-x64
  # El cliente de Prisma trae el compilador de consultas de cinco motores; la app usa solo PostgreSQL.
  find @prisma/client/runtime -type f \( -name '*sqlserver*' -o -name '*cockroachdb*' -o -name '*mysql*' -o -name '*sqlite*' \) -delete
)

echo "==> Quitando lo que el empaquetador rechaza (enlaces, pruebas, cachés, claves y datos de ejemplo)"
node - "$STAGE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const blockedDirectories = new Set(['tests', '.cache', 'cache', 'patients', 'studies', 'secrets', 'credentials', '.aws', '.git']);
const blockedFile = /\.(pem|key|p12|pfx|dcm|dicom|csv|sqlite|db)$/i;
const removed = [];
const copied = [];
function remove(location, reason) {
  fs.rmSync(location, { recursive: true, force: true });
  removed.push(path.relative(root, location) + '  [' + reason + ']');
}
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const location = path.join(directory, entry.name);
    const name = entry.name;
    if (entry.isSymbolicLink()) {
      // Next carga sus dependencias externas por alias en .next/node_modules (enlaces a node_modules): el paquete no
      // admite enlaces, así que se reemplazan por una copia real. Cualquier otro enlace (.bin, etc.) se quita.
      if (path.relative(root, directory).split(path.sep).slice(0, 2).join('/') === '.next/node_modules') {
        const target = fs.realpathSync(location);
        fs.rmSync(location, { recursive: true, force: true });
        fs.cpSync(target, location, { recursive: true, dereference: true });
        copied.push(path.relative(root, location));
        walk(location);
        continue;
      }
      remove(location, 'enlace');
      continue;
    }
    if (name.startsWith('.env') || name.includes('.tfstate') || name.endsWith('.tfvars') || blockedFile.test(name)) { remove(location, 'archivo bloqueado'); continue; }
    if (entry.isDirectory()) {
      // `patients` y `studies` son rutas de la app dentro del build de Next: el empaquetador las admite solo ahí.
      const insideNext = path.relative(root, location).split(path.sep)[0] === '.next';
      const routeName = name === 'patients' || name === 'studies';
      if (blockedDirectories.has(name) && !(insideNext && routeName)) { remove(location, 'carpeta bloqueada'); continue; }
      walk(location);
    } else if (!entry.isFile()) { remove(location, 'no es archivo regular'); }
    else if (/[^\x20-\x7e]|[\\:]/.test(path.relative(root, location))) { remove(location, 'nombre no ASCII'); }
  }
}
walk(root);
fs.writeFileSync(path.join(path.dirname(root), 'removed.txt'), removed.join('\n') + '\n\nCopiados en lugar de enlace:\n' + copied.join('\n') + '\n');
console.log('Quitados: ' + removed.length + ' | enlaces copiados: ' + copied.length + ' (lista en removed.txt)');
NODE
# La caché de compilación de Next no hace falta para arrancar.
rm -rf "$STAGE/.next/cache"

echo "==> Diagnóstico previo (el empaquetador solo dice «rejected» sin motivo)"
node - "$STAGE" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = process.argv[2];
const blockedParts = new Set(['.aws', '.git', 'credentials', 'tests', 'secrets', '.cache', 'cache']);
const blockedFile = /\.(pem|key|p12|pfx|dcm|dicom|csv|sqlite|db)$/i;
let expanded = 1024, entries = 0;
const problems = [];
function split(name) {
  if (Buffer.byteLength(name) <= 100) return true;
  for (let i = name.lastIndexOf('/'); i > 0; i = name.lastIndexOf('/', i - 1)) {
    if (Buffer.byteLength(name.slice(0, i)) <= 155 && Buffer.byteLength(name.slice(i + 1)) <= 100) return true;
  }
  return false;
}
function walk(directory, prefix) {
  for (const name of fs.readdirSync(directory).sort()) {
    const relative = prefix + name;
    const stat = fs.lstatSync(path.join(directory, name));
    const parts = relative.split('/');
    if (/[^\x20-\x7e]|[\\:]/.test(relative)) problems.push('nombre no permitido: ' + relative);
    else if (parts.some((part) => part.startsWith('.env') || blockedParts.has(part) || ((part === 'patients' || part === 'studies') && parts[0] !== '.next') || part.includes('.tfstate') || part.endsWith('.tfvars') || blockedFile.test(part))) problems.push('segmento bloqueado: ' + relative);
    else if (!split(relative)) problems.push('ruta demasiado larga para ustar: ' + relative);
    if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory())) problems.push('no es archivo ni carpeta: ' + relative);
    else if (stat.isFile() && stat.nlink !== 1) problems.push('hardlink: ' + relative);
    entries += 1;
    expanded += 512 + (stat.isDirectory() ? 0 : Math.ceil(stat.size / 512) * 512);
    if (stat.isDirectory()) walk(path.join(directory, name), relative + '/');
  }
}
walk(root, '');
console.log('Entradas: ' + entries + ' | tar expandido ≈ ' + (expanded / 1048576).toFixed(0) + ' MiB (límite 512 MiB)');
console.log('Problemas de nombres/tipos: ' + problems.length);
for (const problem of problems.slice(0, 25)) console.log('  - ' + problem);
NODE
echo "Carpetas más pesadas:"
du -s "$STAGE"/node_modules/* "$STAGE"/node_modules/@*/* "$STAGE/.next" 2>/dev/null | sort -rn | head -12 | awk '{printf "  %6.0f MiB  %s\n", $1/1024, $2}'

echo "==> Empaquetando"
bash "$SRC/infra/scripts/package-demo.sh" "$STAGE" "$WORK/$NAME.tar.gz"

echo "==> Prueba de arranque (next start durante unos segundos, sin base de datos)"
SMOKE="$WORK/smoke"
mkdir -p "$SMOKE"
tar -xzf "$WORK/$NAME.tar.gz" -C "$SMOKE"
# El test de arranque no hace pedidos: se comprueba aparte que no faltan rutas ni alias de dependencias.
for route in studies patients clinic/patients; do
  [[ -d "$SMOKE/.next/server/app/$route" || -d "$SMOKE/.next/server/app/(dashboard)/$route" ]] || { echo "Falta la ruta $route en .next/server/app" >&2; exit 1; }
done
shopt -s nullglob
aliases=("$SMOKE"/.next/node_modules/*/ "$SMOKE"/.next/node_modules/@*/*/)
shopt -u nullglob
(( ${#aliases[@]} > 0 )) || { echo "No hay alias en .next/node_modules." >&2; exit 1; }
for alias in "${aliases[@]}"; do
  # Una carpeta de scope (@aws-sdk, @prisma) agrupa alias: sus hijos se revisan por separado.
  [[ "$(basename "$alias")" == @* ]] && continue
  [[ -f "$alias/package.json" ]] || { echo "El alias ${alias#$SMOKE/} no tiene package.json." >&2; exit 1; }
done
echo "Rutas y alias de dependencias presentes (${#aliases[@]} alias)."
(
  cd "$SMOKE"
  NODE_ENV=production node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 3999 >"$WORK/smoke.log" 2>&1 &
  server=$!
  trap 'kill "$server" 2>/dev/null || true' EXIT
  for _ in $(seq 1 30); do
    if grep -q -i "ready\|started server" "$WORK/smoke.log"; then break; fi
    kill -0 "$server" 2>/dev/null || { echo "next start terminó antes de tiempo:" >&2; cat "$WORK/smoke.log" >&2; exit 1; }
    sleep 1
  done
  grep -q -i "ready\|started server" "$WORK/smoke.log" || { echo "next start no arrancó en 30 s:" >&2; cat "$WORK/smoke.log" >&2; exit 1; }
  echo "next start arrancó bien."
)

cp "$WORK/$NAME.tar.gz" "$WORK/$NAME.tar.gz.sha256" "$OUT/"
cp "$WORK/removed.txt" "$OUT/$NAME.removed.txt"
echo
echo "Listo. Archivos en $OUT:"
ls -l "$OUT/$NAME.tar.gz" "$OUT/$NAME.tar.gz.sha256"
echo "SHA-256 (para release_sha256): $(tr -d '\n' < "$WORK/$NAME.tar.gz.sha256")"
