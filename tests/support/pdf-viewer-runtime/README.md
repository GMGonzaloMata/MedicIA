# Preflight aislado de Next para el viewer PDF

Este subunit de T7 [S1, S6, S7] prepara **solo una página sintética**, no la
aplicación MedicIA. No verifica autenticación, guards, tenants, RSC de la página
real, exclusión de datos privados, viewer, temas, navegador ni modelos. T7 sigue
incompleto. No hay cambios de composición o instrumentación de producción.

## Raíces y única excepción de enlace

- App: `node_modules/.cache/medicia-pdf-runtime/app` de este checkout.
- Único enlace autorizado: `app/node_modules` →
  `C:/Users/lucho/orca/workspaces/MedicIA/Trabajo-lucho/node_modules`.
- Windows usa una **junction** de directorio; no solicita elevación ni reintenta
  un permiso denegado. Otras plataformas usan un enlace de directorio, siempre al
  mismo destino exacto. El precheck nativo actualmente admite Windows y macOS.
- Antes de crear el enlace, el launcher verifica ausencia con `lstat`, destino
  real exacto, paquetes Next 16.4.4/React 19.3.0/React DOM 19.3.0 y binario SWC
  nativo 16.4.4 ya instalado. No copia dependencias ni las instala.
- `dependency-link.json`, fuera del enlace, registra propietario, origen,
  destino, destino resuelto, tipo y fecha. Solo se reutiliza un enlace cuyo
  registro y destino coincidan. Nunca se adopta, reemplaza ni elimina otro path.
- `turbopack.root` es **exactamente la app aislada**.
  `experimental.turbopackAdditionalRoots.registeredDependencies.path` es
  **exactamente el node_modules hermano**, sin raíz común ni aliases de escape.
  Turbopack solo cruza esta raíz adicional en la frontera del enlace autorizado.

El enlace es una capacidad de escritura a nivel del sistema operativo, **no** un
sandbox de solo lectura. El launcher nunca escribe por él; las salidas se
configuran en la app/caché. No se afirma aislamiento de filesystem frente a código
arbitrario ni se autoriza ampliar esta página a dependencias/plugins no revisados.

## Archivos y entorno permitidos

La app solo se sintetiza a partir de cinco cadenas explícitas:
`package.json`, `package-lock.json`, `next.config.mjs`, `app/layout.js` y
`app/page.js`. No existe copia recursiva del proyecto ni lectura de archivos env.
La página muestra `MEDICIA_SYNTHETIC_PREFLIGHT_ONLY`; no expone seed/login/bypass.
Los archivos existentes se comparan con el contenido sintético, nunca se
sobrescriben. Se rechazan nombres inesperados en la raíz y `app/`, y enlaces
adicionales en fuentes/salidas. El enlace de dependencias no se recorre al validar.

Next sigue usando su cargador normal de `.env*`, **sin parchearlo**. La protección
es que su `dir`/cwd solo contiene archivos sintéticos permitidos; `NODE_ENV=test`
no sería suficiente. Para `next dev` programático se fija `NODE_ENV=development`.
El hijo recibe un entorno nuevo: solo `SystemRoot` del padre en Windows; PATH
construido con Node/System32; HOME/USERPROFILE/AppData/XDG/TMP/TEMP/TMPDIR/npm-cache
bajo una ejecución UUID dentro de la caché. No se enumeran valores del entorno
padre ni se heredan NODE_OPTIONS, NODE_PATH, proxies, DB, AWS, tokens, NEXT_PUBLIC
ni sesiones de navegador. CI y el opt-out de telemetría son locales al hijo.

`distDir: runtime-dist` confina las salidas de Next a la app. El lock sintético
local evita buscar/parchear el lock ancestro; no es un lock de distribución ni
se usa para instalar. Solo hay JS, sin intención TypeScript ni loaders/plugins.
La carga del binario nativo ocurre en el hijo sanitizado **antes** de importar
Next; si falla se detiene, sin fallback descargado. CI, modo npm offline e
ignore-scripts agregan defensa; no se invoca ningún package manager. Las reglas
y recordatorios de agentes están deshabilitados mediante opciones documentadas,
sin escribir configuración global. No se abre navegador, HMR ni sesiones guardadas.

## Comandos exactos desde este checkout

Preparar/verificar archivos y enlace, **sin servidor** (límite externo 15 s):

```sh
env -i SystemRoot='C:\Windows' 'C:/Program Files/nodejs/node.exe' -- tests/support/pdf-viewer-runtime/launcher.mjs prepare
```

Preflight pendiente: el padre debe ejecutar **el siguiente comando foreground
con su herramienta `bash_background`**, nunca con `&`, detach o un polling de
herramientas. Este worker no dispone de herramienta background y no lo ejecuta:

```sh
env -i SystemRoot='C:\Windows' 'C:/Program Files/nodejs/node.exe' -- tests/support/pdf-viewer-runtime/launcher.mjs preflight
```

El prefijo `env -i` elimina hooks/secretos heredados antes incluso de iniciar
Node; el proceso supervisor solo usa paths explícitos de caché y no carga Next.
El hijo crea sus propios HOME/TMP/XDG bajo la ejecución UUID.

Se usa el servidor personalizado documentado de Next (`next({ dev: true,
turbopack: true, dir, hostname, port, httpServer })`), no un framework sustituto,
loader parcheado ni webpack. Un hijo IPC propio escucha exclusivamente
`127.0.0.1:0`, asignando un puerto fresco sin carrera de reserva. El padre espera
su mensaje de readiness, solicita `/`, `/_next/mcp` `tools/list` y
`get_compilation_issues` **solo en ese puerto**. Exige el marcador, HTTP 200,
la herramienta esperada y `issues: []`; errores dentro de `content` también fallan.
No sigue redirects, no usa proxies ni descubre servidores ajenos.

Presupuesto: 24 s para readiness/HTTP/compilación y teardown de hasta 3.5 s;
watchdog del hijo a 28 s. Sin reintentos. Envía stop por IPC, cierra conexiones y
Next, espera ACK y exit 0. Si no termina, solo señala el handle del hijo propio;
un kill forzado **no** cuenta como teardown confirmado. El padre debe inspeccionar
el resultado y detenerse ante fallo/denegación, sin killall ni limpieza global.

Cada invocación válida conserva `run-<UUID>/launcher.{stdout,stderr}.log` y
`launcher.exit.json`. Un preflight agrega `owner.json` (PIDs/identidad),
`server.{stdout,stderr}.log`, `ready.json`, respuestas HTTP crudas `.body`,
metadatos `.http.json` y `server.exit.json` con ACK/exit/teardown. No se eliminan
archivos, cachés, enlaces ni logs. Un teardown sin confirmar requiere disposición
del padre; no se infiere que todos los posibles descendientes estén terminados.

## Evidencia actual y límites

- `prepare` observado: exit 0, junction creada y destino resuelto exacto.
- Registro: `node_modules/.cache/medicia-pdf-runtime/dependency-link.json`.
- Evidencia de preparación:
  `node_modules/.cache/medicia-pdf-runtime/run-fd66f406-687d-49ea-8764-1ebcfe1b4565/`.
- Runner de unit tests aislado de dotenv, ya preparado en la caché:
  `node node_modules/.cache/medicia-pdf-runtime/run-unit-check.mjs correction2`
  terminó exit 0: 21 tests PASS. RED: módulo ausente, 0 tests recolectados;
  primer GREEN: 20 PASS/1 FAIL (argumentos de Node); correction1: 21 PASS;
  correction2: 21 PASS tras tipar la frontera dinámica y endurecer validaciones.
  Ambos ciclos están consumidos. Los labels son exclusivos: no volver a usar
  un label ejecutado; los logs no
  se sobrescriben. Config: `unit.config.mjs`, `envDir:false`, solo este test.
- Pruebas: entorno privado con getters que fallarían al leerse, paths prohibidos,
  registro de enlace ajeno, CLI inválido, worker sin IPC, ayuda/import pasivos,
  interpretación MCP y compilación fail-closed. No inician Next ni navegador.
- **No observado todavía:** Next sirviendo la página, resolución de Turbopack a
  través de additionalRoots/junction, disponibilidad MCP en este servidor
  personalizado ni teardown real. La configuración está documentada; su
  viabilidad runtime no se declara probada.
- `npm run check`, E2E, navegador y verificación independiente no se ejecutaron;
  el runner normal carga configuración privada/DB y está fuera de esta unidad.

Guías instaladas leídas: Turbopack y su configuración (incluidas raíces
adicionales), env, runtime, instrumentación, MCP, custom-server, CLI, distDir,
agentRules, agentUpgrade y guía de agentes. Están bajo
`../Trabajo-lucho/node_modules/next/dist/docs/`; no requieren descargas.

Solo después del preflight positivo corresponde delimitar el bootstrap de test
fail-closed y las composiciones de sesión/contexto/estudios, conservando guards
reales, cookies/hash/expiración/revocación y repositorios sintéticos. Este launcher
rechaza esas fuentes adicionales hasta que se autorice otra unidad. Riesgos 2
(activación aislada) y 5 (launcher/entorno) siguen sujetos a verificación del padre.


## Observed preflight failure

The earlier pending/unobserved status is superseded by the single parent execution recorded in `node_modules/.cache/medicia-pdf-runtime/run-0943a7a3-b94f-4789-ae61-3cdeec00dd24/`. The synthetic page returned HTTP 500: Turbopack could not resolve `@swc/helpers/_/_async_iterator` and `_async_to_generator` from the additional dependency root. The launcher exited 1 before MCP requests. The worker acknowledged shutdown but exited via SIGKILL, not exit 0; `teardownConfirmed` is false. The child exit was observed; descendants were not independently audited. No retry or cleanup was performed.

Historical 21 passing unit tests do not prove runtime rendering, dependency isolation or graceful teardown. Independent static review did not approve this feasibility gate. The help's 29-second wording applies neither to preparation nor to recursive filesystem inspection before runtime timers start; do not treat it as an end-to-end deadline guarantee. No actual application, guards, viewer or browser proof exists from this attempt.


## Bounded recovery candidate

After explicit authorization, one correction round adds an `@swc/helpers` alias through the existing owned dependency link, closes all owned HTTP/upgraded sockets before awaiting Next cleanup, and preserves strict exit-0 confirmation. Shutdown logs include resource types only; no forced exit is reported as success. Help now scopes the 29-second runtime deadline to after preparation. The isolated generated config was updated only for that alias; no new link, root expansion or installation occurred. Parent unit evidence: `parent-red` exit 1 (4 failures/19 passes), `parent-green` exit 0 (23 passes). One additional preflight is running; these unit results are not runtime approval.


## Bounded recovery outcome: failed

The single additional preflight finished with exit 1 after approximately 7 seconds. Evidence: `node_modules/.cache/medicia-pdf-runtime/run-3dd84b60-0a95-4355-8fd1-e3e4eea4b4de/`. The page again returned HTTP 500 with unresolved `@swc/helpers` subpaths; the explicit alias did not solve runtime resolution. The owned worker (PID 21544) acknowledged stop but terminated with SIGKILL, `teardownConfirmed:false`. Resource-type diagnostics before forced termination included `FSEventWrap` and pipes; this does not establish the specific owner or root cause of every remaining handle. No MCP request was reached. The authorized correction round and single additional runtime attempt are exhausted. No further retries, repairs, cleanup or installs occurred. The 23 unit passes remain valid only for the unit assertions, not successful Next startup/teardown. Actual application/guard/viewer/browser verification remains blocked.
