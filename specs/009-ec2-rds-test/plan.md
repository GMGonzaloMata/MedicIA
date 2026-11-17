# Implementation Plan: Demo EC2/RDS y dos servicios reales

**Branch**: `feature/EC2-RDS` | **Date**: 2026-11-14 | **Spec**: [spec.md](spec.md)
**Input**: S1–S8 en `odd/tasks/ec2-rds-test.md`; delta estándar autorizado S1–S3 en `odd/tasks/ec2-standard-bootstrap.md`; decisiones técnicas en [research.md](research.md).

## Summary

Preparar Terraform desplegable para una demo sintética compartible, sin ejecutar AWS. Ampliar aditivamente `infra/environments/dev`, conservando backend, direcciones de los seis módulos, usuario IAM local y outputs. Crear red dedicada sin NAT, EC2 pública con SSM y rol propio, PostgreSQL privado y HTTPS DuckDNS/Let's Encrypt. Preparar dos servicios SageMaker: EchoNext-Mini y FEVI completo ECGFounder+E022, no tres endpoints. No se considera terminada la demo hasta probar ambos; FEVI externo no bloquea red/host/base.

## Technical Context

- **Language/Version**: HCL Terraform `~> 1.15`; CI fija `1.15.1`; AWS `~> 6.72`, respetar locks existentes sin upgrade. Versiones instaladas locales no verificadas. App TypeScript strict, Next `16.4.4`, React `19.3.0`, Prisma `^7.10.1` según package.json.
- **Primary Dependencies**: AWS EC2/SSM/RDS/Cognito/S3/SageMaker/ECR; Nginx + Certbot para HTTP-01; Node 24 LTS Linux amd64 como objetivo técnico a verificar con engines/lock antes de empaquetar.
- **Storage**: RDS PostgreSQL 17, candidato de versión menor soportada a fijar tras consulta oficial, `db.t4g.micro`, 20 GiB gp3, Single-AZ; S3 existente para estudios/modelos y bucket privado separado de releases web.
- **Testing**: mocks Terraform, assertions de política y guardas estáticas, Vitest/Playwright existentes; código complejo >=80 % cobertura por archivo y rechazo cross-tenant.
- **Target Platform**: cuenta y `sa-east-1` del código actual; no equivalen a inventario AWS comprobado. EC2 Amazon Linux 2023 amd64 `t3.small`, EBS gp3 cifrado 20 GiB; AMI aprobada/fijada antes de ejecutar, sin ID inventado.
- **Project Type**: monolito modular full-stack; no servicios Python aquí.
- **Performance Goals**: demo de baja concurrencia, no SLA ni promesa de capacidad. Conservar timeout actual de inferencia 30 s; medir FEVI antes de decidir si lo cumple. No agregar cola automáticamente.
- **Constraints**: HTTPS obligatorio, secretos solo runtime, sin claves IAM en EC2; nada de builds en la instancia pequeña; Prisma generate/migrate/db solo humano, jamás bootstrap/CI oculto.
- **Scale/Scope**: una EC2 y una RDS, dos subredes DB en AZ distintas no significan Multi-AZ. Dos servicios reales de inferencia preparados externamente, endpoints apagados por defecto.

## Constitution Check

| Gate | Antes de research | Después de diseño |
| --- | --- | --- |
| I: posibles hallazgos, no afirmaciones clínicas sin evidencia | PASS: FR-009/010/013 | PASS: E022 pendiente, fallas sin resultados |
| II: tenant autenticado, S3 privado | PASS: FR-004/005 | PASS: sin cambios a autorización; pruebas de rechazo obligatorias |
| III: monolito hexagonal, SDK solo infraestructura | PASS | PASS: integración futura separada, sin Python |
| IV/V: estados, versión exacta, selección y entrada por tarea | PASS: FR-014 | PASS de diseño condicionado al contrato FEVI; no integración actual declarada |
| VI: solo sintéticos, sin entrenamiento secundario | PASS | PASS; riesgos dev heredados no cerrados ni aptos para pacientes |
| VII: UI accesible si cambia | PASS: sin UI ahora | PASS: unidad futura incluye E2E y revisión visual |
| VIII: strict, validación externa, cobertura | PASS | PASS: pruebas antes de código y gates del contrato |
| Stack/estado remoto/operaciones reservadas | PASS | PASS: sin migración backend ni automatizar Prisma |
| Flujo Spec Kit y check antes de integrar | PASS | PASS: tareas/análisis posteriores; npm check requerido en implementación |

PASS evalúa el diseño, no ejecución, cobertura medida ni aceptación cloud. No hay excepción constitucional solicitada. Falta evidencia externa/provider descrita en research; bloquea únicamente las unidades dependientes.

## Project Structure

### Documentation (this feature)

`spec.md`, `checklists/requirements.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/deployment.md`, `contracts/inference-readiness.md`, `quickstart.md`, `tasks.md`.

### Source Code (repository root; propuesta para autorización posterior)

- `infra/modules/demo-network/{main,variables,outputs,terraform}.tf`, `tests/network.tftest.hcl`: VPC/subredes/rutas/SG.
- `infra/modules/demo-database/{main,variables,outputs,terraform}.tf`, `tests/database.tftest.hcl`: RDS/secret master administrado.
- `infra/modules/demo-host/{main,variables,outputs,terraform}.tf`, `templates/`, `tests/host.tftest.hcl`: EC2/perfil/rol, releases privados, bootstrap y servicios runtime.
- `infra/bootstrap/demo-access.tf`, `demo-boundary.tf`, `operator-policy.tf`, `github-oidc.tf`, `tests/`: permisos nuevos acotados, protección de límites y lecturas.
- `infra/environments/dev/{main,variables,outputs}.tf`, `tests/demo.tftest.hcl`: composición aditiva; backend/providers/terraform existentes sin cambios.
- `infra/scripts/package-demo.sh`, `infra/README.md`, `.github/workflows/infra.yml`: paquete web fuera del árbol, instrucciones, ampliar listas de validación/locks.
- Inferencia condicionada: `infra/modules/sagemaker-execution-role/{variables,main}.tf`, `infra/bootstrap/sagemaker-boundary.tf`, `infra/environments/dev/{main,variables}.tf` y sus tests; reutilizar model-registry/model-endpoints sin copiar recursos.
- App FEVI: primero artefacto de contrato y tareas refinadas en esta feature; superficies candidatas `src/modules/analyses/`, `src/infrastructure/aws/sagemaker/`, `prisma/schema.prisma`, migración nueva, `src/app/(dashboard)/_studies/` y tests correlativos. NO son permiso para edición inmediata ni tarea de implementación sin contrato.

**Structure Decision**: módulos pequeños por red/datos/host; misma raíz dev reduce duplicación y evita leer secretos con terraform_remote_state. A cambio, cada plan completo toca dependencias existentes: revisión humana bloquea reemplazos/destrucciones ajenos al alcance. No renombrar módulos previos, no toggle general que desgestione sus datos.

## Phases and boundaries

1. Permisos y pruebas de contención; luego red, base y host, con tests RED/GREEN en cada unidad.
2. Composición/operación HTTPS y paquete externo Linux; demostración parcial honesta de infraestructura y EchoNext, no aceptación total S7/S8.
3. En paralelo a trabajo independiente, humano ML entrega FEVI validado, contrato y referencias inmutables. Habilitación posterior solo humana con costo aprobado.
4. Ajuste aditivo de catálogo/lectura ECR en rol Y límite; FEVI entrada solo al existir artefactos reales. El módulo actual crea modelo/config incluso con enabled=false: no insertar referencias ficticias.
5. Refinar contrato/tareas app antes de código: selección explícita, validación por tarea, resultados tipados/versionados y persistencia compatible. Si cambia contrato de producto, volver a clarify/plan/analyze del delta con el orquestador.
6. Verificación local, revisión independiente parent-owned, luego ejecución y pruebas cloud humanas. No afirmar demo completa si 3–5 faltan.

## Checkpoint T015a — DNS, no TLS

Decisión técnica del padre A/A1 (modo activo; FR-016 permite vacío en infraestructura sola): `public_hostname` obligatorio al activar valida un único label minúsculo de 1–63 caracteres bajo DuckDNS; no cambia `HOSTNAME=127.0.0.1`. DNS consume `/run/medicia/current/duckdns`, sin repetir Secrets Manager ni introducir valores en Terraform. Servicio root separado con límite 45 s y timer 60 s después del boot/cada 5 min; no depende de runtime ni lo reactiva. Script y contrato privado: [deployment.md](contracts/deployment.md#operación-dns-t015a).

EC2 declara `associate_public_ip_address=false`: sin IPv4 efímera, en la VPC dedicada sin NAT la salida IPv4 pública depende de EIP. No se renderiza EIP en user-data ni se introduce ciclo EC2/EIP. Esto prueba intención de configuración, no rutas/conectividad desplegadas. DNS falla cerrado sin token o ante fallos de red y reintenta por timer.

**Gate humano de arranque A1**: runtime hace fetches AWS antes de publicar el token; su oneshot sin Restart puede fallar antes de EIP aunque network-online esté activo. Después de EIP, el operador debe recuperar runtime/web por SSM según deployment.md y verificar estados; DNS no recupera runtime. T013/T014 siguen abiertas; no se promete arranque automático.

**Sustituido por el delta estándar FR-015:** el responsable selecciona una AMI oficial AL2023 x86_64 con ID fijo y release de repos compatible; no debe construir una imagen personalizada. Bootstrap instalará prerrequisitos desde repos firmados de esa imagen, sin latest, cambios de release ni repuntar Python. `/opt/certbot/bin/certbot` conserva su interfaz, no la obligación de ser un venv. Diseño vigente: D9 y sección siguiente; disponibilidad/paquetes Linux reales aún no acreditados.

T015 permanece abierta: TLS/HTTP-01, Nginx, renovación y prueba externa son la siguiente subunidad. `acme_contact_email` y aceptación explícita de términos con default false son campos futuros, no implementados ni aceptados aquí. No registro de cuenta, emisión, disponibilidad de hostname o demo pública acreditados.

## Checkpoint T015b — configuración proxy antes de emisión

Unidad acotada separada de T015c: Nginx standalone propio en challenge-only inicialmente, validación/activación TLS con restauración acotada, sin tocar runtime/DNS, IAM congelado ni Nginx global de AMI. Prerrequisitos de operación: binario `/usr/sbin/nginx` y usuario/grupo nginx preparados por el nuevo instalador, puertos libres y servicio global inactivo/no habilitado; bootstrap no adopta ni deshabilita un servicio preexistente. Solo paths propios de config/PID/temporales. Contrato privado, salidas exactas y límites: [deployment](contracts/deployment.md#operación-proxy-t015b).

Padre autorizado como ejecutor con background nativo, máximo dos rondas de corrección TOTAL, no reemplazo automático de worker. Primer GREEN local 66 unit/30 mocks/fmt/validate aprobados; verificación independiente final aprobada en TEMP real con los mismos totales. Tras ronda1/2 los controles globales siguen fallidos por 13 lint previos y tipos del proyecto/fixtures protegidos; cero diagnósticos nuevos del proxy. T015 no se cierra, no hay emisión, renovación, ToS aceptados ni certificado público. Interceptores y checks estructurales no prueban parser Nginx, systemd/Linux, cobertura o readiness externa.

## Delta FR-015 — preparación automática desde imagen estándar

**Diseño implementado con checks locales; no evidencia de instalación Linux:** AMI oficial AL2023 x86_64 con ID exacto suministrado por el responsable y repos fijados por esa imagen. El instalador exige `system-release` y repos exactamente `2023.12.20261021`; no acepta automáticamente otro release más nuevo. Launcher fijado a `certbot 2.6.0`. `ami_evidence` pasa a describir editor oficial, arquitectura, release de repos y procedencia del ID; no herramientas preinstaladas. Sin lookup latest, nueva lectura IAM ni cambios al cuerpo EC2/EIP, backend, red, RDS o modelos.

1. Antes de servicios: validar Linux x86_64/AL2023 y repo fijado; rechazar Nginx global activo/habilitado, configuración global Certbot o paths propios ocupados por contenido ajeno. Instalar mediante DNF con comprobación de firma RPM, timeout/reintentos finitos y dependencias débiles desactivadas. Paquetes base Node24, AWS CLI2, SSM, Nginx, CA/openssl y utilidades necesarias; conservar Python del sistema. `alternatives --set node /usr/bin/node-24` y comprobar `/usr/bin/node` major24.
2. Certbot: instalar **solo `python3-certbot`**, excluyendo `certbot` en la transacción DNF. Launcher propio root en `/opt/certbot/bin/certbot`: `/usr/bin/python3`, entrada pública upstream `certbot.main:main`. No pip/venv ni plugin Nginx, timer/config global o eliminación de `cli.ini`. Rechazar conflicto previo o posterior a paquetes; si la biblioteca exige el wrapper excluido, DNF debe fallar antes de la transacción. Reaplicación acepta exclusivamente el launcher propio idéntico, no reemplaza una instalación ajena. Upstream2.6 confirma interfaz/flags; inventario AWS confirma paquetes, **no** cierre exacto de dependencias, archivos o scriptlets AL2023. Compatibilidad de paquete/parser Linux sigue siendo gate humano de ejecución, no aprobación local.
3. CA RDS: URL HTTPS fija oficial, CA/hostname verificados por curl, límites de tiempo/reintentos; bundle no vacío con certificados PEM parseables por OpenSSL antes de instalar root-owned/readable en `/etc/pki/rds/global-bundle.pem`. Archivo temporal propio, sin `-k`, CA falsa ni checksum publicado inventado. La comprobación PEM no acredita procedencia independiente de HTTPS ni corrige el parser TLS runtime protegido.
4. Espera acotada solo en preparación: EIP llega después de crear EC2 sin IPv4 efímera; no agregar dependencia circular. Un fallo impide iniciar servicios propios. No rediseñar recuperación runtime por SSM A1 ni declarar readiness por terminar Terraform.
5. Transporte compacto: sustituir los diez payloads internos base64 por un mapa JSON de rutas/modos/contenidos, renderizado por `jsonencode` en una declaración de una sola línea dentro de un heredoc quoted. Node24 escribe los bytes sin evaluar contenido, fija modos y ownership root. JSON escapa newlines/comillas/backslashes; el prefijo de declaración impide una línea de payload igual al delimitador. Conservar íntegros los trece templates protegidos del snapshot previo y los bloques ACME existentes; nada de minificar helpers. Pruebas compararán contenido instalado exacto, incluidos newlines, y modos. Conservar outer `base64gzip` y **las cinco guardas `<21844`**. Capacidad observada en 36 mocks nativos aprobados: 20 mediciones de 15.512–15.532 caracteres, con cinco guardas estrictas aprobadas para default/opt-in. No prueba Linux/AWS; sin fallback S3/IAM automático.
6. Orden posterior intacto: helpers/unidades propios → daemon-reload → proxy → DNS timer → SSM/web → ACME solo opt-in → renewal timer únicamente tras éxito inicial. Scripts root0700, unidades root0644, config privada root0600; estado Nginx propiedad nginx. Cero npm/build/generate/migrate ni modelos ficticios.

**Superficies T2:** `infra/modules/demo-host/{main,variables}.tf`, `templates/user-data.sh.tftpl`, nuevo `templates/prerequisites.sh`, `tests/host.tftest.hcl`; `infra/environments/dev/{main,variables}.tf` y su test solo si el contrato de entrada lo exige; nuevo `tests/unit/infra/demo-prerequisites.test.ts` y expectativas exclusivamente de transporte en fixtures existentes. Runtime/DNS/proxy/issuer y servicios protegidos no se editan. IAM7/README congelados, estados/secretos y worktree UI fuera.

**Verificación proporcional:** RED por regla solicitada → GREEN instalador simulado/interfaz pública; OS/paquete/firma/red/CA inválidos fallan antes de servicios; reapply/ownership; transporte exacto y ausencia de app/Prisma. Ejecutar controles existentes afectados (incluidas26semánticas runtime y gates DNS/proxy/ACME/renovación), capacidad nativa default/opt-in, fmt/validate offline con dependencias retenidas y `npm run check` si no ejecuta pasos prohibidos ni pruebas de datos reales. Un verificador independiente acotado por riesgos2/3/5 y hook obligatorio review-changes; sin campañas de producción ni reiniciar ciclos históricos. Evaluación nativa según autoridad existente, sin START nuevo para eludir IAM7.

**Constitution Check del delta:** PASS de diseño: stack sin cambio; solo prerequisitos host, sin código Python ML; auth/tenant/datos/contratos científicos intactos; secretos fuera de Terraform; comandos reservados humanos; evidencia local separada de Linux/AWS. Riesgos: item2 (descargas privilegiadas/ownership), item3 (transporte compartido con servicios previos), item5 (bootstrap/dependencias). Ningún PASS de diseño acredita funcionamiento desplegado.

## Delta FR-016/017 — infraestructura sola y activación explícita (US1, P1)

Fuente de intención: `odd/tasks/ec2-rds-activation.md` S1–S2/L2. Specify/clarify extienden 009 manualmente; sin scaffolding, cambio de rama, feature.json ni checklist nuevo. Hooks revisados: solo after_implement, no aplicable a esta planificación. Clarificación técnica resuelta: default true conserva modo activo; false no es apagado en sitio. No pregunta de producto pendiente bajo la obligación de preservar reemplazo existente.

**Diseño mínimo:** reenviar `demo.app_enabled` al host; hacer condicional la obligación de hostname/release/checksum, admitiendo solo vacío o valor conforme en modo inerte. No cambiar expresiones/mensajes activos ni validación runtime_references. Añadir rechazo exacto de ACME contradictorio según data-model. En user-data, después del prerequisites existente y antes de usuario/archivos/unidades propios, un bloque false habilita/inicia SSM y sale exitosamente. Con true prosigue el bloque anterior sin reordenarlo ni cambiar su gate ACME. Prerrequisitos completos/errores FR-015 siguen iguales; no se intenta app/DNS/ACME ni lectura runtime en false.

**Consecuencia operativa obligatoria:** conservar literal `user_data_replace_on_change=true`; introducir el gate o cambiar selector/release/hostname puede reemplazar EC2 también para llamadores previos. Default compatible refiere a validaciones/arranque, no identidad/continuidad ni hash del payload. Plan privado humano debe revisar interrupción, estado local y EIP; RDS no cambia. No automatizar activación in-place, desactivación/rollback ni migraciones.

### Allowlist candidata exacta para autorización T2

| Archivo | Único cambio previsto |
| --- | --- |
| `infra/environments/dev/variables.tf` | optional bool true, guardas condicionales y rechazo ACME contradictorio. |
| `infra/environments/dev/main.tf` | Un argumento app_enabled en módulo demo_host; resto intacto. |
| `infra/environments/dev/outputs.tf` | null hostname/URL/release_key en infraestructura sola; otros outputs intactos. |
| `infra/modules/demo-host/variables.tf` | Bool true no nullable; defaults vacíos y validaciones condicionadas solo de tres strings; rechazo ACME contradictorio. |
| `infra/modules/demo-host/main.tf` | Un argumento app_enabled a templatefile; ningún bloque resource ni IAM/trust se edita. |
| `infra/modules/demo-host/templates/user-data.sh.tftpl` | Salida temprana false después de prerrequisitos, solo enable/start SSM. |
| `infra/environments/dev/tests/demo.tftest.hcl` | Matriz raíz false/true/omitido, entradas/outputs/preservación. |
| `infra/modules/demo-host/tests/host.tftest.hcl` | Matriz host/guardas/render real/capacidad y freeze de recursos. |
| `tests/unit/infra/demo-activation.test.ts` (nuevo) | Ejecutar gate real con dobles locales/sentinels; sin ejecutar instaladores o servicios. |

No autoriza escribirlos en T1. Ni outputs directos host, prerequisites.sh, runtime/TLS, DNS/proxy/issuer/unidades, IAM/bootstrap/README, red/SG/RDS, provider/locks/backend ni app/UI requieren edición. Si la evidencia exige otro archivo, detener y proponerlo al padre, no ampliar implícitamente. Estimación T2: 80–130 líneas fuente y 180–260 pruebas, total aproximado 260–390 líneas; no recortar pruebas para cumplir estimación.

### Casos de aceptación nuevos y preservación

| Caso | Efecto observable y cobertura |
| --- | --- |
| A01 | demo.enabled=true/app_enabled=false, sin hostname/release/checksum, con insumos infraestructura reales representados por fixtures: plan mock válido, tres módulos; outputs candidatos null, IDs DB/SSM/EC2 disponibles. |
| A02 | Ejecutar gate false real con systemctl doble: exit0/stdout/stderr vacíos, llamadas exactas enable/start SSM; cero llamadas app/runtime/Nginx/DNS/ACME/timers/AWS. Sentinels ajenos y datos app previos intactos; no crea sus unidades/config. |
| A03 | Fallo de preparación o enable/start SSM: exit1/stdout vacío/error bootstrap exacto; ninguna operación posterior ni activación. Casos separados para cada etapa, sin alegar systemd real. |
| A04 | app_enabled omitido y true: mismos requisitos activos, orden/arranque previo y opt-in ACME; control de éxito y rechazo por cada hostname/release/checksum/contacto previo. Vacíos siguen rechazados con errores existentes. |
| A05 | Infraestructura sola con terms=true: raíz y host rechazan exactamente `Infraestructura sola requiere accept_acme_terms=false.`; plan rechazado no cambia estado/sentinels ni contadores de servicios. |
| A06 | Infraestructura sola acepta strings vacíos, pero rechaza hostname no conforme, release latest/traversal y checksum inválido no vacíos; sin ampliar ARN/runtime refs. |
| A07 | AMI/evidencia/motor/snapshot inválidos siguen rechazados con false; demo.enabled=false mantiene ningún módulo/output null, catálogo/outputs previos intactos. |
| A08 | Mock host false conserva SSM/políticas/trust/perfil/IMDS/cifrado/capacidad/EIP y ausencia SSH; red/RDS/SG sin diff; bloque EC2 con replace_on_change y outerbase64gzip intacto. Hash/bytes pre-T2 de recursos/helpers protegidos, no solo presencia de cadenas. |
| A09 | Las cinco guardas `<21844` existentes siguen estrictas para activo default/ACME true; añadir comprobación de infraestructura sola sin sustituir/renombrar esas cinco ni elevar límite. Evidencia numérica mock, no AMI real. |

RED antes de fuente para A01–A03/A05 y nuevas reglas; A06 conserva validaciones existentes (ya rechazan esos valores en la base) y se comprueba como PRESERVE junto con A04/A07–A09, sin RED artificial de hashes/lifecycle. Unit usa bloque real extraído de template, no una reproducción de sus decisiones; dobles y sentinels permiten verificar salidas/efectos sin root, red o DB. Mocks de raíz sobrescriben host: no sustituyen pruebas host/render/gate. No afirmar que plan rechazado prueba persistencia cloud; fixture no debe escribir estado real.

### Comandos locales propuestos (no ejecutados en T1)

Preparación autorizada L10: fixture **nuevo**, mínimo y público bajo `node_modules/.cache/medicia-app-activation/`, ignorado por Git; no system-temp ni copia de workspace completo. Copiar solo .tf/.tftest.hcl/templates públicos/locks y tests necesarios, excluyendo backend.tf, estado, tfvars, env y metadata de caches anteriores. Reutilizar únicamente dependencias/binarios instalados, entorno hijo saneado sin credenciales/dotenv, config aislada envDir=false y sin setup global. Init offline `-backend=false -input=false -lockfile=readonly` con filesystem_mirror exclusivo y sin direct/downloads puede preparar este fixture. Mocks `command=plan`, sin provider real. Retener recibos de fallos; no reusar preparaciones/ciclos agotados ni ejecutar contra dev real. Fixtures de tests usan rutas propias ignoradas y teardown; recibos quedan para el padre.

Referencia de argumentos, un comando a la vez: RED enfocado primero, luego GREEN y preservación. El ejecutor de esta unidad resuelve Terraform/Vitest/config por rutas absolutas (no presupone Terraform global ni node_modules copiado dentro del fixture); sus comandos exactos, cwd, stdout/stderr/exit quedan en `node_modules/.cache/medicia-app-activation/receipts/*.command.json` y archivos hermanos:

```sh
node node_modules/vitest/vitest.mjs run --config ./vitest-isolated.config.mjs --configLoader native --project unit tests/unit/infra/demo-activation.test.ts
terraform -chdir=infra/modules/demo-host test -no-color
terraform -chdir=infra/environments/dev test -no-color -filter=tests/demo.tftest.hcl
node node_modules/vitest/vitest.mjs run --config ./vitest-isolated.config.mjs --configLoader native --project unit tests/unit/infra/demo-runtime.test.ts tests/unit/infra/demo-acme.test.ts tests/unit/infra/demo-renewal.test.ts tests/unit/infra/demo-prerequisites.test.ts
terraform -chdir=infra/modules/demo-host validate -no-color
terraform -chdir=infra/environments/dev validate -no-color
terraform fmt -check infra/environments/dev/main.tf infra/environments/dev/variables.tf infra/environments/dev/outputs.tf infra/environments/dev/tests/demo.tftest.hcl infra/modules/demo-host/main.tf infra/modules/demo-host/variables.tf infra/modules/demo-host/tests/host.tftest.hcl
```

`-filter` usa separador nativo (`tests\\demo.tftest.hcl` en Windows); exigir selección >0. Providers/módulos deben estar ya disponibles/inicializados offline por preparación expresamente autorizada; no añadir init/download automático. El runner aislado pendiente es prerequisito técnico, no evidencia de tests ya ejecutados. Nueva unidad no corre package/Linux, global DB/E2E ni emite certificados. Antes de integrar, npm run check constitucional requiere entorno autorizado descartable; no ejecutarlo contra datos retenidos ni declararlo aprobado aquí.

### Resultado local T032–T034 (sin aceptación independiente/cloud)

Fixture nuevo de 76 archivos públicos bajo el cache autorizado; cuatro init offline con mirror local/lock readonly: exit0, stderr vacío, sin backend/downloads. RED raíz: rechazo de tres strings omitidos; dos sondas separadas observaron metadata inerte incorrecta y ACME contradictorio aceptado. Primer unit tuvo un fallo de fixture MSYS (nginx sintético sin shebang); corregido antes de fuente, RED funcional 3 fallos/2 PASS: app boundary alcanzado en false y fallos enable/start SSM ignorados. Recibos iniciales preservados, no reinterpretados como RED válido.

Tras una implementación: gate 5/5, host44/44, raíz30/30, preservación runtime/DNS/proxy/ACME/renewal/prerrequisitos121/121, dos validate y fmt-check exit0/stderr vacío. Sonda adicional host con strings verdaderamente omitidos:1/1. A06 son rechazos previos preservados, no fallos RED inventados. Diagnóstico público ACME en ambas APIs: exit1 y mensaje exacto esperado, sin operaciones reales.

Un diferencial acotado por API contra fuente HEAD en fixture separado: dev11/11 y host8/8, stdout/stderr/exit byte-idénticos; excluye diferencias solicitadas de false. Comparador de preservación inicialmente falló al insertar LF en su expectativa sobre root CRLF; corregido solo el lector, fuente CRLF intacta. Comparación final de bytes aprobada: todos los bloques resource/IAM/trust, helpers/TLS, red/RDS y wiring previo intactos salvo los dos argumentos autorizados; cinco guards originales conservados. Cobertura numérica shell/HCL no medida; no afirmar >=80%. T035/T036 y calidad global/cloud siguen pendientes.

Comandos observados desde la raíz: `node node_modules/.cache/medicia-app-activation/runner.cjs` con acciones `prepare`, `init`, `red`, `sync`, `red-corrected`, `red-rules`, `format`, `green`, `differential`, `preserve`, `final`; orden exacto y argumentos hijos en recibos. No reejecutar para actualizar documentación ni sobrescribir evidencia. Riesgos2/3/5 requieren verificación independiente parent-owned; la autorización local L10 no cambia su política de aislamiento.

**Constitution Check antes/después:** PASS de diseño I–VIII/stack/flujo: sin cambios clínicos/tenant/Prisma/UI, secretos fuera de Terraform, RDS privada/SSM y guards intactos, ninguna excepción solicitada. Riesgos 2/3/5: validación, bootstrap compartido y reemplazo. Pruebas/cobertura/independiente/cloud pendientes; disposición y una eventual corrección independiente son del padre, no autorización de herramientas de review por writer. Análisis cruzado posterior devuelve cobertura FR-016/017 y SC-008/009, conflictos y pendientes, sin reescribir historial ni declarar implementación GREEN.

## Complexity Tracking

Sin violaciones justificadas. Tres módulos responden a límites de seguridad y pruebas diferentes; no ALB, NAT, ASG, cola ni cluster añadido. La sugerencia de 400 líneas no justifica omitir tests, comprimir políticas o mezclar contratos.
