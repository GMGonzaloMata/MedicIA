# Runtime local candidato PDF → E022

Wrappers de integración exclusivamente para el entorno sintético autorizado. No incluyen entrenamiento ni la implementación PyTorch del modelo. No usar PDFs clínicos, rutas de pacientes, el portal institucional, AWS, una DB preexistente ni `check_local.py` del paquete recibido.

## Recuperación de importación L128 — candidato, nueva ronda 1/2

Build real y cinco tests Python ya pasaron. ImportModel-vtopm7 creó el volumen pero falló al leer el label, antes del ownerfile/importer/TAR. La autorización humana posterior permite adoptar **solo** `medicia-pdf-e022-local-01a1e570-model`, owner esperado independiente `03281252-1af6-4587-a1c4-0e8c4908ae63` y wrapper config ID `sha256:249d5e805e05afead656b382a255d2986a4fb5a2c13c2e3aef169453f3a2656b`. No es reutilización general ni prueba de contenido vacío/importación. Todos los presupuestos anteriores siguen agotados.

Tras focales/full y revisión independiente, solo el padre ejecuta UNA vez:
`node scripts/pdf-e022-local/run-step.mjs ResumeImportModel --timeout-ms 180000`
No recibe flags para cambiar volumen/token. Exige contexto desktop-linux/npipe exacto, wrapper/contexto verificados, label JSON estricto y comparación exacta, importer ausente, inputs ZIP/manifest originales y evidencia nueva sin colisiones. `ImportModel` original sigue rechazando volúmenes existentes. `Start` solo comparte la lectura JSON corregida del mismo label; su flujo no cambia.

La recuperación no crea/elimina/resetea el volumen. Conserva el label y `outer-model-manifest.json` histórico; crea exclusivamente `model-import-recovery.json`, `recovery-outer-model-manifest.json`, ownerfile y logs internos nuevos. El registro dice explícitamente **preflight autorizado, importación no probada**. Ownerfile se persiste antes de crear/importar para no perder el token ante otro fallo; NO acredita éxito. Una colisión, label/contexto/wrapper ajeno, importer existente o error Docker detiene todo sin reparación ni retry.

El mismo verify_model.py ya construido, sin cambios, exige /model vacío ANTES del TAR y usa creación `xb`, valida tamaño/hash del TAR y allowlist/hashes de miembros antes del marcador y de cualquier posterior carga dinámica. Destino no vacío, hashes erróneos o transferencia fallida conservan volumen/contenedor/evidencia parcial y bloquean el arranque. Worker no inspecciona/monta el volumen ni lee ZIP/TAR/modelo reales. No repetir Build/Prepare/ConvertBase; la prueba local de inferencia/app sigue pendiente, sin afirmación clínica. Los estados anteriores se conservan abajo como historia.

## Estado L115 — builder dedicado; ronda adicional L95 2/2 (histórico)

El padre verificó realmente el export/capas, layout OCI de 11 archivos y contexto nuevo de 29 archivos; focal26/full96 y diferencial19 pasaron para la ronda anterior. No repetir ConvertBase ni Prepare: Dockerfile/contexto/inputs no cambian en esta ronda. El driver `docker` de desktop-linux rechazó OCI; el check real del builder dedicado `docker-container` pasó (BuilderCompatibility-4d0b5f99-30c7-4e40-a267-9a3203202ee9), no un build completo ni inferencia.

Build exige ahora `medicia-pdf-e022-local-01a1e570-builder`, nodo `medicia-pdf-e022-local-01a1e570-node`, endpoint npipe desktop-linux y `BUILDX_CONFIG` exclusivo del proyecto en `node_modules/.cache/medicia-pdf-runtime-builder`. Valida owner/pin/instancia/imagen/recursos ya creados y contenedor vivo. BuildKit v0.27.0 está fijado a `moby/buildkit@sha256:054d632d0d7e94b11cdc6048674773499a5170cf7d8ce0c326daaff6be43c8e0`; es un contenedor **privileged** expresamente autorizado, no una garantía de aislamiento. Falta/mismatch/config ajena se rechaza sin build. No crea/bootstrap/repara ni usa fallback/`--use`; las variables de proceso se restauran al salir.

La salida usa `--load --iidfile ... --metadata-file ...`: el iid puede ser digest del manifest o del config, y debe corresponder al metadata del exporter. El tag recién creado y la inspección por ID deben resolver al config ID cargado. Solo ese ID entra en `pdf-e022-image.v2`; evidencia existente/parcial nunca se sobrescribe. Se conserva el binding de base/config/manifest/contexto y todos los guards/deadlines.

Pendiente para este candidato: padre `supervised-tests-l95-round2.mjs focal` (120 s; 40 casos esperados), luego `full` (300 s; 110 casos, incluidos los 96 anteriores), revisión independiente y SOLO después un Build supervisado. Cuatro probes nuevos pasaron tras RED; no se afirma aún GREEN completo ni flujo S14/S15/S16. WrapperTests → ImportModel → Start → Smoke/app/rebranding siguen con sus gates. Terraform a main es una entrega posterior separada, sin publicar/merge/apply ahora.

## Compatibilidad OCI (L90–L93): histórico PARCIAL, no es la secuencia actual

La exportación única del padre terminó exit 0/38 s. Solo se autoriza leer `node_modules/.cache/medicia-pdf-runtime-build-compat/base-source.tar`; no el ZIP/TAR original del modelo ni env/config privados. La inspección por headers encontró un Docker-save USTAR con layout OCI incorporado: index → manifiesto `sha256:85b6c041ca253782ebb2f769ab765790f2a70c09467f66aac4b1beabf11d8236` → config `sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4` y siete capas sin compresión. **Es un vínculo inspeccionado, aún no una verificación completa de hashes.** No confundir config ID con manifest digest.

El candidato agrega verificación cerrada antes de escribir: checksum USTAR, tipos regulares/directorios exactos, tamaños, padding y EOF, descriptor/config/diff_ids/capas, hashes de todos los blobs y del archive. Rechaza paths ajenos, links, PAX/GNU/extensiones, duplicados, faltantes, extras o corrupción. Siete JSON v1 de compatibilidad presentes en el export real se admiten solo por sus SHA-256 exactos fijados en el código; se verifican pero NO se copian. El layout resultante incluye solo index/layout, manifiesto, config y siete capas (11 archivos), copiadas como bytes opacos por rangos, nunca `tar -xf` ni extracción de las capas. Outputs parciales/existentes no se reparan, borran ni sobrescriben.

Build verifica nuevamente el layout y usa `--build-context e022base=oci-layout://<ruta-local>@sha256:<manifest>` con `FROM e022base`, builder `desktop-linux`, `--pull=false`, `--iidfile` y salida verificada. La fuente exacta Buildx 0.38.1 `util/ocilayout/ref.go` confirma que en Windows la ruta debe conservar `C:/...` inmediatamente después de `oci-layout://`, NO `/C:/...` ni una file URI codificada. No se activa legacy ni se crea builder/registry/tag de base. La procedencia de salida pasa a `pdf-e022-image.v2`, agregando `baseManifestDigest` a los cuatro campos anteriores; todo paso posterior exige ese digest y usa el ID de wrapper verificado.

Estado de pruebas: RED observado **25 FAIL/1 PASS**. El primer GREEN agregado se detuvo por deadline del verificador de 20 s, sin resumen de tests; no se afirma GREEN ni se repite el intento. Evidencia conservada en `medicia-pdf-runtime-build-compat/verification-root/node_modules/.cache/medicia-pdf-runtime-repair/{red-oci,green-oci-round1}`. La conversión real y el contexto nuevo todavía NO se crearon. Presupuesto conservador: **2/2 rondas usadas** (candidato inicial y corrección de casing del fixture Docker para lint, sin suppressions). Tipos finales/lint corregido pasan; el timeout focal sigue pendiente, sin retry. No se reinicia ningún presupuesto anterior. Se necesita ejecución focal supervisada del padre (background con deadline explícito), no ampliar una ejecución worker de foreground.

Secuencia PENDIENTE del padre, nunca automática:

1. Ejecutar focales `node node_modules/vitest/vitest.mjs run --config node_modules/.cache/medicia-pdf-runtime-build-compat/vitest.config.mjs -t 'OCI|contexto nuevo'`, con deadline externo sugerido 120 s y evidencia NUEVA. Revisar/fijar cualquier fallo real sin relajar reglas.
2. Completar 59 casos previos, nuevo rechazo de procedencia de transporte, preparación/preservación, tipos, lint y sintaxis; no presentar los pases históricos como nuevos.
3. Solo después de GREEN: `node scripts/pdf-e022-local/run-step.mjs ConvertBase --timeout-ms 180000`. Lee únicamente el nuevo export; escribe `base-oci` y `base-manifest.json` nuevos. Sin Docker, red ni modelo. No repetir exportación. Un fallo/timeout conserva evidencia y detiene la secuencia.
4. `node scripts/pdf-e022-local/run-step.mjs Prepare --timeout-ms 120000` prepara SOLO `medicia-pdf-runtime-build-compat/runtime/context`, reutilizando los 21 archivos del lector del contexto anterior DESPUÉS de verificar su manifiesto fijado y los 29 hashes. No fetch ni nueva Prepare del contexto viejo. Solo la receta nueva cambia entre los diez inputs; se mantienen 29 archivos en el contexto nuevo.
5. Revisión independiente y disposición explícita ANTES de `node scripts/pdf-e022-local/run-step.mjs Build`. Prerrequisitos: contexto activo `desktop-linux`, endpoint npipe local, propiedad exclusiva/sin cambio concurrente de contexto, base exacta disponible, wrapper/evidencias ausentes y ambos manifiestos nuevos verificados. El driver docker carga automáticamente la salida local; el tag etiqueta solo la salida. Build puede descargar dependencias Python y crear imagen/cache del builder; no es inferencia ni aprobación clínica.
6. Luego, con gates propios: WrapperTests → ImportModel → Start/readiness → Smoke/Fixture → app/SQL/tenant/E2E/browser/check. Mini sigue no disponible.

Los bloques siguientes conservan historia de reparaciones anteriores; sus afirmaciones de GREEN no aprueban este candidato OCI.

## Estado observado y límites (histórico)

- Adaptadores/factories y acciones/composiciones: GREEN 157 tests/4 archivos; tres archivos de infraestructura nuevos con 100% líneas, 95,23% ramas agregadas. Tipos reales de esas dependencias/composiciones/acciones exit 0, sin sustitutos Prisma ni factories ficticias.
- La ronda de higiene posterior pasó 157 focales/114 preservación/tipos/lint. Los fallos históricos (7 errores de lint y mock antiguo) siguen en `medicia-pdf-e022-runtime`, sin sobrescribir. Esta reparación separada se limita a scripts/contexto/identidad/deadline; no autoriza inferencia ni reinicia presupuestos anteriores.
- No se ejecutaron Python, Docker build/import/start, inferencia ni app desde este worker. El parseo sintáctico de PowerShell pasa; **no prueba ejecución**. El padre revisa los scripts antes de ejecutarlos y conserva stdout/stderr/exit de cada paso. Un fallo detiene la secuencia: no retry/cleanup automático ni cambio de nombre para esquivar una colisión.
- `tests/unit/runtime/pdf-e022/test_extractor.py` es la ubicación de pruebas conforme a constitución y la única fuente de tests que se copia al contexto. El padre retiró exclusivamente el duplicado temporal `runtime/pdf-e022/test_extractor.py` después de comprobar igualdad byte a byte (4516 bytes) y SHA-256 `d5a1d59146508e193ac8cc59515c792b18d2d9d8b077663cf08ab8363682d734`, y volvió a comprobar el destino sin cambios. El worker no eliminó ni recreó el original; registro previo en `test-relocation-hashes.json`.
- La entrada soportada es `run-step.mjs`: acota el proceso PowerShell completo y sus hijos, incluyendo preparación, Docker build, CopyTo y WaitForExit. Al vencer solicita terminar SOLO su árbol (taskkill /PID propio /T /F en Windows; grupo propio en POSIX). Eso NO cancela trabajo ya aceptado por el daemon Docker ni limpia contenedores/volúmenes; nunca implica teardown exitoso. Después de timeout/señal se conservan recursos/evidencia y se detiene la secuencia, sin retry automático.
- La pérdida de argumentos de `Run-Docker @(...)` no se reprodujo con PowerShell 5.1 y Docker falso: el baseline conservó volume/network completos. Se usa ahora `-Arguments` explícito para quitar ambigüedad; no se afirma un RED inexistente para ese hallazgo. Las otras reglas y el runner sí tienen RED observado.
- La revisión independiente del padre sigue siendo gate antes de cualquier Prepare/Build real. Tests con Docker falso/HTTP sintético no son una prueba de imagen construida, PyMuPDF ejecutado o E022 puntuado.

## Inspección real y stdout vacío (L85–L86): candidato actual

Antes de modificar código se verificó por metadatos el contexto `desktop-linux`, endpoint local `npipe:////./pipe/dockerDesktopLinuxEngine`. Las únicas consultas al daemon fueron `docker.exe --context desktop-linux image inspect --format '{{.Id}}' medicia-pdf-e022-local-01a1e570-reader:local`; nunca full inspect ni otro recurso. Respuesta real capturada por streams separados: exit **1**, stdout **`\n`** (hex `0a`), stderr **`Error response from daemon: No such image: medicia-pdf-e022-local-01a1e570-reader:local\n`**. No era un error de daemon/permisos: la representación nativa de PowerShell 5.1 contenía un único string vacío en stdout, y `Stdout.Count == 0` en runtime.ps1:51 lo rechazaba.

El cambio productivo se limita a esa condición: ninguna fila de stdout puede contener datos; solo se toleran strings de longitud exactamente cero. No se hace Trim de stdout: espacios, texto, objetos inesperados, stderr adicional/desconocido, otro nombre/tipo o exit siguen rechazados. La captura del exit global, clasificación exacta de ausencia, mensajes, ErrorActionPreference, identidad de imágenes, contexto cerrado y deadlines quedan intactos.

RED basado en esa captura literal portable: 1 FAIL/3 PASS. GREEN: 4 regresiones nuevas PASS, las 40 nativas previas PASS y 15 de preservación PASS. Las nuevas variantes rechazan espacio, texto y stderr adicional, comprobando stdout/stderr/exit y que estado/contador no cambien al rechazar. Además el guard extraído volvió a consultar SOLO esa imagen local: pasó con nativeExit=1, caller Stop y cero escrituras de recursos. Eso no ejecuta Build ni demuestra inferencia.

Evidencia nueva: `node_modules/.cache/medicia-pdf-runtime-real-inspect/{real-inspection,diagnosis}.json`, `native-image.*`, `guard-view.*`, `red.*`, `green-real-response.*`, `green-image-container.*`, `green-volume-network.*`, `preserve.*`, `real-guard-green.*`. El recolector inicial salió 1 después de guardar la evidencia real, por intentar verificar un junction antiguo como archivo; la verificación metadata-aware `verify-diagnosis.mjs` pasó sin repetir esas consultas. Se preservan las caches previas, los dos Build fallidos y los 29 archivos/10 inputs/manifiesto preparado, sin reconstruirlo.

Nueva autorización: **1/2 rondas consumida**; no reinicia ninguna autorización anterior agotada. Antes de UN nuevo Build por `node scripts/pdf-e022-local/run-step.mjs Build`, el padre debe obtener revisión independiente y disponer la continuación. No repetir Prepare, no retry/cleanup automático. Este worker solo realizó inspecciones Docker read-only del nombre exacto: no build/import/start/modelo/DB/Prisma/archivos de entorno/fetch de fuentes.

## Captura del exit nativo (L81–L82, histórico)

La reproducción en un fixture copiado confirmó el exit vacío del baseline. La prueba de scopes en PowerShell 5.1.26100.9818 mostró: con `$LASTEXITCODE=$null` local, el valor visible es null pero `$global:LASTEXITCODE` vale 1; con un binding local heredado de función, el visible puede seguir en 88 mientras el global vale 1. Por eso no basta quitar la inicialización local: `Assert-New` ahora reinicia y captura explícitamente `$global:LASTEXITCODE` inmediatamente alrededor de la misma consulta nativa. Solo cambian esas dos referencias y sus comentarios; stderr, clasificación, mensajes, metadatos, procedencia y preferencias de error quedan intactos.

Las 40 regresiones nativas existentes pasan sin relajar assertions: caller local real=88, global previo=77, exit nativo observado=0/1/2 según el caso, stdout/stderr exactos y contador/estado sin cambios al rechazar. Las 15 pruebas de preservación también pasan. La primera corrección funcional pasó las clasificaciones pero falló una assertion nueva del fixture: sembrar 88 en script no creaba el binding local pretendido. La segunda ronda corrigió el fixture usando un scope de función, conservando la assertion de 88 y sin otra modificación productiva. Nueva autorización **2/2 consumida**, distinta de los presupuestos anteriores 2/2 y 1/1 agotados.

Evidencia nueva exclusivamente en `node_modules/.cache/medicia-pdf-runtime-native-exit`: `scope-proof.json`, `red.*`, `focused-green.*` (fallo del fixture conservado), `focused-green-round2.*`, `green-image-container.*`, `green-volume-network.*` y `preserve.*`. La caché anterior `medicia-pdf-runtime-absence` y el contexto preparado no se reescriben. El baseline fallido siguiente es histórico, no el candidato actual.

**GREEN sintético no autoriza Build.** Se requiere revisión independiente/disposición del padre antes de su único Build supervisado por `run-step.mjs`; no repetir Prepare. Este worker no ejecutó Docker real, Build, importación, modelo, DB ni red, y no demuestra inferencia ni el flujo de app.

## Corrección acotada de ausencia (L79–L80, histórico)

**Baseline fallido preservado: NO ejecutar ese baseline.** La única ronda aplicada no pasó GREEN: 40/40 casos nativos de image/container/volume/network fallaron; capturaron exit vacío y rechazaron incluso la ausencia válida, además de perder el mensaje de colisión existente. Las 15 pruebas previas pasan. No se aplicó una segunda corrección. La política siguiente documenta la intención requerida, no comportamiento operativo aprobado; requiere nueva disposición del padre. Evidencia en `medicia-pdf-runtime-absence/green-image-container.*`, `green-volume-network.*` y `preserve.*`; el contexto preparado sigue intacto.

El padre observó Prepare exit 0 con 29 archivos; el primer Build (`runs/Build-D5ZmDV`) falló ANTES del build: PowerShell 5.1 convirtió el stderr esperado de `docker image inspect` en `NativeCommandError`, pese a redirigirlo. Esa evidencia se conserva. Esta ronda no ejecuta Docker ni repite Prepare/Build; el padre requiere checks y revisión antes de autorizar un único nuevo Build por `run-step.mjs`.

`Assert-New` solo consulta metadatos (`inspect --format` de Id/Name). Captura stdout, ErrorRecord nativo y exit dentro de un scope hijo con Continue exclusivamente para esa consulta; el caller y todos los demás comandos conservan Stop. Exit 0 rechaza el recurso existente con el mismo mensaje de colisión. Solo exit 1, stdout vacío y stderr completo de ausencia reconocido para el tipo Y nombre exactos permiten continuar:

- imagen: `Error response from daemon: No such image: <nombre>`;
- contenedor: `Error: No such container: <nombre>` o la misma frase con prefijo `Error response from daemon:`;
- volumen: `Error response from daemon: get <nombre>: no such volume`;
- red: `Error response from daemon: network <nombre> not found`.

Daemon inaccesible, acceso denegado, otro exit, stderr vacío/mixto, mensaje en stdout o ausencia de otro nombre/tipo son fatales: `Cannot establish exclusive absence: <nombre> (exit <código>). No resource creation.` No se propaga texto arbitrario del daemon ni se confunde cualquier code 1 con ausencia. Las pruebas usan un wrapper `.cmd` que ejecuta Node nativo; no una función PowerShell como sustituto del stderr real. Comprueban exit/stdout/stderr, restauración de Stop, argumentos de inspección y estado/contador sin cambios cuando hay rechazo.

Los tres archivos de esta corrección (runtime.ps1, su test TS y README) no son inputs ni archivos del contexto cerrado. Se mantienen los hashes de sus 10 inputs/29 archivos y el manifiesto original sin reescribirlo. Evidencia nueva solo en `node_modules/.cache/medicia-pdf-runtime-absence`; la copia intacta del runner en un fixture evita que los tests escriban en la caché histórica. Esta autorización usa una ronda adicional independiente, sin reiniciar el presupuesto anterior 2/2 ni demostrar inferencia.

## Procedencia

- Imagen E022 cargada: `sha256:9871d08b243d17ae399a290751e67ec22ec5250118a6fccba132d1acaf338aa4`. El intento real Build-R2Yrb1 demostró que FROM con ese config ID se interpretó como `docker.io/library/sha256:<hash>` y falló. No es un problema de credenciales. El candidato OCI descrito arriba sustituye ese mecanismo; su conversión, hashes completos y Build todavía están pendientes.
- ZIP autorizado: `C:/Users/lucho/Downloads/E022 - Paquete SageMaker piloto tecnico-20261116T143639Z-1-001.zip`. Solo se abre ese archivo y sus miembros exactos model.tar.gz/SHA256-manifest.json; no se exploran Downloads ni datos privados.
- model.tar.gz: 344096102 bytes, SHA-256 `a453f8cbcb580f8ff0e591ba90e872931a658d60e0fedb6184d4a619e9583f96`.
- Miembros regulares permitidos: net1d.py (13449), 12_lead_ECGFounder.pth (369942585), e022_model.npz (25115), LICENSE-ECGFounder.txt (1073). La inspección del TAR encontró licencia como cuarto miembro; el manifiesto es externo en el ZIP, no un quinto miembro aceptado. Hashes individuales en `runtime/pdf-e022/verify_model.py`; ningún link/ruta/miembro extra o duplicado se acepta.
- inference.py SHA-256 `243cdfaa1f71080d38898ee7afa5af153dd1550096f1a5c2a33363ed14e292d9`; serve.py `956bb27c52b46959b33a05609e88ebeed132dbd5ae5cf27cb1e78bdc1c930e81`; pdf_adapter.py `d27e82f4a8002763eb76586b23801cd12d24d3e4c63ef8be799fc7e666702b67`. Preparación verifica los tres textos previamente inspeccionados; no los ejecuta ni copia a tracked source.
- Lector: repositorio público Anonimizacion, commit `4ff99ce97a42ff32a47268996f3cedcdabe70c1c`. La preparación descarga solamente 21 archivos fijados de la dependencia mínima del lector y sus fixtures sintéticos. Registra SHA-256 por archivo en `source-manifest.json`. No instala el paquete/CLI ni descarga fixtures clínicos. El fixture de onda se deriva del bloque sintético de `pdf_sintetico.py`, sin importar plantilla_documento ni corpus clínicos.
- No se encontró `LICENSE` en ese commit (HTTP 404 observado); no se afirma una licencia de redistribución del lector. Sus fuentes descargadas quedan solo en caché local ignorada. No publicar imagen/fuentes sin revisar permisos por separado.

## Comandos posteriores para el padre (solo después de resolver el candidato OCI)

No ejecutar ahora: el gate PARCIAL de arriba prevalece. Después de revisión independiente, desde la raíz del worktree autorizado, **uno por vez** y como jobs supervisados del padre. Detenerse ante cualquier exit no cero. No ejecutar el paso siguiente solo por existir el script o por pasar tests simulados. No invocar runtime.ps1 directamente: exige el contexto de deadline del runner.

```powershell
node scripts/pdf-e022-local/run-step.mjs --help
# SOLO si todavía no existe: verifica/convierte el export nuevo sin Docker ni nueva exportación.
node scripts/pdf-e022-local/run-step.mjs ConvertBase
# Contexto NUEVO por copia verificada del lector, no fetch ni reconstrucción del anterior.
node scripts/pdf-e022-local/run-step.mjs Prepare
# Construye únicamente después de GREEN/revisión y validar contexto + layout OCI inmutables.
node scripts/pdf-e022-local/run-step.mjs Build
# Parser real: UN PDF que combina texto inventado y trazos vectoriales sintéticos.
node scripts/pdf-e022-local/run-step.mjs WrapperTests
# .NET ZipArchive -> stdin BINARIO nonroot, nunca pipeline PowerShell de texto para el TAR.
node scripts/pdf-e022-local/run-step.mjs ImportModel
# Verifica propiedad/hashes antes de cargar net1d; monta el modelo readonly.
node scripts/pdf-e022-local/run-step.mjs Start

# Readiness no puntúa, no reintenta y no demuestra inferencia.
Invoke-RestMethod -Uri http://127.0.0.1:18080/ping -TimeoutSec 30 -MaximumRedirection 0
Invoke-RestMethod -Uri http://127.0.0.1:18081/ping -TimeoutSec 30 -MaximumRedirection 0

# Una ejecución: primero ECG numérico sintético → E022; después PDF combinado → lector HTTP → E022.
node scripts/pdf-e022-local/run-step.mjs Smoke

# Opcional para prueba posterior de app con el mismo tipo de fixture; solo escribe base64 sintético en caché.
node scripts/pdf-e022-local/run-step.mjs Fixture
```

Prepare del CLI reutiliza el contexto anterior fijado y no requiere red. La API conserva fetch explícito para su preparación original/test de preservación. Build requiere acceso de instalación solo a dependencias Python mínimas fijadas (PyMuPDF/Pydantic/NumPy). No instala host Python ni dependencias JS. Build sigue prohibido para el worker.

El estado candidato vive en `node_modules/.cache/medicia-pdf-runtime-build-compat/runtime`; ni `medicia-pdf-runtime-repair/runtime/context` ni `medicia-pdf-e022-runtime/context` se vuelven a preparar, limpiar o reescribir. `context-manifest.json` enumera exactamente 29 archivos consumidos: 21 fuentes públicas, seis wrappers/receta/dependencias, el test Python y el generador sintético derivado. También hashea diez inputs locales (incluidos los tres textos E022 fijados, solo como procedencia; no se redistribuyen como entrenamiento). Cada paso valida esquema/lista exacta/hashes y el estado actual de inputs antes de Docker.

Se rechazan links/junctions/reparse points, escapes, archivos o directorios extra, faltantes, corrupción, contexto parcial o manifiesto ajeno, ANTES de red/escrituras/build. No se reparan ni borran automáticamente: preservar y pedir disposición. Las fuentes locales/cache se validan con lstat/realpath y, en Windows, Attributes.ReparsePoint. Una preparación completa existente solo se valida, sin red ni sobrescritura; una incompleta se rechaza. No es un sandbox ni una defensa contra un administrador local que cambie el filesystem concurrentemente entre comprobaciones: se exige propiedad exclusiva/sin escritores paralelos.

### Deadlines y evidencia de procesos

| Paso | Default |
|---|---:|
| ConvertBase | 180 s |
| Prepare | 120 s |
| Build | 1800 s |
| WrapperTests | 60 s |
| ImportModel | 180 s |
| Start | 120 s |
| Fixture | 30 s |
| Smoke | 90 s |

Override explícito: `node scripts/pdf-e022-local/run-step.mjs Build --timeout-ms 600000`. Rango entero 100–1800000 ms; rechaza pasos/opciones desconocidos antes de lanzar hijos o crear outputs. Cada intento tiene directorio nuevo `medicia-pdf-runtime-build-compat/runs/<Step>-…` con stdout.log/stderr.log exactos y result.json. Una colisión de evidencia no se sobrescribe. El watchdog empieza al lanzar el hijo; la solicitud de terminación puede consumir hasta 5 s en taskkill y hasta 5 s adicionales de observación. Exit efectivo timeout=124, SIGINT/abort=130, SIGTERM=143; también conserva exit/signal del hijo, pid, timedOut, processClosed y treeTerminationRequested. processClosed solo describe ese proceso, nunca el daemon o sus recursos. Cada HTTP del smoke conserva además su timeout 30 s.

### Recursos exclusivos

Prefijo `medicia-pdf-e022-local-01a1e570`:

- Imagen `-reader:local`; volumen nuevo `-model` con token de propiedad aleatorio verificado tras creación.
- Contenedores `-wrapper-tests`, `-import`, `-model-preflight`, `-model-server`, `-reader-server`, `-smoke`, opcional `-fixture`.
- Red `-net` interna; servicios publicados solo en 127.0.0.1:18080 y 127.0.0.1:18081. Los dos puertos deben estar libres.
- uid/gid 65534, root filesystem readonly, cap-drop ALL, no-new-privileges, 2 CPU/2 GiB/96 PIDs, tmpfs /tmp 128 MiB. No host/socket mounts. Modelo montado readonly solo en modelo/preflight.
- Ningún contenedor lleva `--rm`; se conservan salidas/recursos. Los recursos antiguos `medicia-e022-01a1e4b0-*` nunca se leen/reutilizan/limpian. Tampoco se toca `-db`/`-db-data`, propiedad del padre.
- Start solo es válido tras ImportModel exit 0 en esta secuencia; no autoimporta ni crea un modelo alternativo. Los errores conservan los recursos parciales para inspección del padre.

## Configuración de la aplicación

El padre establece únicamente configuración sintética del proceso; no leer/mostrar `.env.local`. Factories no aceptan URLs ni identidades de cliente. Claves nuevas:

| Clave | Significado |
|---|---|
| `PDF_EXTRACTION_ENDPOINT` | URL fija del lector `/extract`, puerto local 18081. Nunca `/invocations`. |
| `E022_INFERENCE_ENDPOINT` | URL fija del modelo `/invocations`, puerto local 18080; sin query, fragmento ni userinfo. |
| `E022_MODEL_SHA256` | Pin exacto del model.tar.gz de arriba; establecer solo después de verificar/importar el artefacto. |
| `E022_PREPROCESSING_SHA256` | Pin exacto de inference.py de arriba, no versión inventada. |
| `PDF_E022_LOCAL_SYNTHETIC` | Selección explícita `1` para permitir HTTP de loopback en este entorno sintético. |
| `NODE_ENV` | Solo development/test permite la excepción HTTP; producción mantiene HTTPS. |

No se requiere configurar `MODEL_INFERENCE` legacy/EchoNext ni AWS. Identidad, storage y DB sintéticos siguen a cargo del padre. `AVAILABLE` depende de configuración explícita y procedencia verificada por el operador, no de un healthcheck del constructor; no configurar/afirmar disponibilidad real por pasar tests HTTP simulados.

El score válido se devuelve con modelVersion `sha256:<hash del TAR>` y preprocessingReference `sha256:<hash de inference.py>`. Mini permanece NOT_AVAILABLE. No normalizar/imputar/estandarizar en TS: ya lo hace inference.py; no convertir score a FEVI numérica ni inventar umbral clínico.

## Gates de entrega que permanecen

1. Revisión independiente del nuevo preflight/contexto/identidad/deadline antes de activar cualquier paso real; esta reparación no constituye aprobación de runtime.
2. Build y Python/contrato/privacidad del wrapper observados, no solo preparación de archivos.
3. Importación completa con hashes/allowlist y arranque nonroot/readonly observados, logs sanitizados y salidas conservadas.
4. Smoke numérico real y PDF combinado real ejecutados con respuesta scored validada y rechazo de señal vacía sin score.
5. Prueba de app real usando las factories TS y el archivo sintético, persistencia/tenant, after/run y resultado visible rebrand. El smoke Python no prueba por sí solo el cableado TS/Next ni DB.
6. `npm run check`, SQL/tenant, E2E/browser y revisión independiente son del padre; no están sustituidos por estos checks focales. No afirmar flujo completo ni validación clínica.
