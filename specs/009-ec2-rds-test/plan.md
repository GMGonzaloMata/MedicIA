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

Decisión técnica del padre A/A1: `public_hostname` obligatorio valida un único label minúsculo de 1–63 caracteres bajo DuckDNS; no cambia `HOSTNAME=127.0.0.1`. DNS consume `/run/medicia/current/duckdns`, sin repetir Secrets Manager ni introducir valores en Terraform. Servicio root separado con límite 45 s y timer 60 s después del boot/cada 5 min; no depende de runtime ni lo reactiva. Script y contrato privado: [deployment.md](contracts/deployment.md#operación-dns-t015a).

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

## Complexity Tracking

Sin violaciones justificadas. Tres módulos responden a límites de seguridad y pruebas diferentes; no ALB, NAT, ASG, cola ni cluster añadido. La sugerencia de 400 líneas no justifica omitir tests, comprimir políticas o mezclar contratos.
