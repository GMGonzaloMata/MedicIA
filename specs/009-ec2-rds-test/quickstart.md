# Demo EC2/RDS — entrega local y aceptación funcional

Hay implementación local de red, RDS, host, composición, CI y productor de paquetes. **No hay despliegue AWS ni demo integrada aprobados.** Esta guía separa evidencia observada, operaciones del responsable y dependencias pendientes. El alcance es una demo con datos sintéticos, no preparación para producción; seguridad, aislamiento entre clínicas y preservación de recursos existentes siguen siendo obligatorios. No registrar secretos, payloads, estudios ni planes sensibles en artefactos públicos.

## Estado local: reutilizar lo que ya pasó

| Entrega | Evidencia retenida | Qué sigue pendiente |
| --- | --- | --- |
| Red / RDS | 25 / 31 mocks aprobados y controles locales de formato/validación; revisión funcional independiente admitida | Conectividad, disponibilidad de versión/región y permisos efectivos en AWS |
| Host y renovación C1 | 8 unitarias del implementador y 35 mocks Terraform ejecutados por el padre, ambos con exit 0 y stderr vacío; guardas de capacidad con y sin opt-in aprobadas | Arranque Linux/systemd, emisión real y comparación independiente del último candidato |
| Preservación C1 | SELF confirma seis comentarios trasladados, 502 bytes retirados y resto del bootstrap idéntico | Últimos intentos independientes terminaron en preparación/comunicación: cero hashes; no equivalen a aprobación |
| Bootstrap estándar FR-015 | 18 casos enfocados y suite afectada de 116 aprobados; 36 mocks Terraform, init/fmt/validate exit 0; 20 mediciones nativas de 15.512–15.532 caracteres base64 frente a cinco guardas estrictas `<21844` | Verificador genérico independiente: 18/18 aprobados, cero pendientes, hashes/13 templates/IAM7/EC2/encoding/cinco guardas intactos. Native records revisados, no ejecutados por él; paquetes/launcher/CA/arranque Linux reales no probados. No cierra ciclos históricos ni acredita AWS |
| Composición dev | Init/validate y 15 mocks aprobados por el padre; módulos demo apagados por defecto | Verificación independiente no ejecutada por fallos de preparación; no prueba host ni nube |
| Productor de paquetes | 61 casos distintos aprobados en corridas separadas, no una única suite de 61 | Dos casos exclusivos Linux, revisión independiente y release Linux real |
| Cobertura CI | 13 casos aprobados independientemente; listas existentes preservadas y tres módulos demo incluidos | Ejecución GitHub y calidad global del proyecto |

El registro canónico con atribución, fallos históricos y límites es `../../odd/tasks/ec2-rds-test.md`. No transformar evidencia SELF/padre en independiente, casillas históricas en pruebas ejecutadas ni mocks en conectividad real. La comprobación actual de `tsc --noEmit --incremental false` conserva 43 diagnósticos fuera del delta; el fixture nuevo quedó sin diagnósticos TypeScript y con lint aprobado después de dos correcciones locales. No hay `npm run check` global aprobado: no se ejecutaron typegen ni suites que cargan el entorno del proyecto o requieren una DB descartable. Generar Prisma en el worktree del rebranding no acredita un build Linux ni resuelve por sí solo la calidad de esta rama.

Los ciclos detenidos de C1, composición y paquete permanecen detenidos: esta guía no los reinicia ni cambia sus presupuestos. No repetir pruebas aprobadas solo por actualizar documentación. No se añaden campañas de carga, alta disponibilidad ni mejoras opcionales de producción.

## 1. Prerrequisitos

- Padre lee spec/plan/tasks/análisis antes de autorizar superficies de código.
- Terraform 1.15.1 y provider compatible con locks existentes; verificar docs/schema actual antes de código, sin upgrade. Docs Next instaladas antes de cualquier edición Next.
- Linux amd64 compatible para build; humano ejecuta `npx prisma generate` allí antes del paquete. No se ejecuta por agente ni wrapper.
- Responsable confirma cuenta/recursos existentes sin pegar estado; administra permisos nuevos primero. Hostname DuckDNS registrado, secretos cargados fuera de Terraform/chat y engine menor aprobado.
- FR-015: seleccionar ID fijo regional de AMI **oficial AL2023 x86_64 estándar**, con `system-release` y repos **exactamente `2023.12.20261021`**. El instalador actual rechaza otros releases, aunque sean más nuevos; no usa `latest` ni cambia repos. `ami_evidence` registra editor/procedencia verificable, ID, región, arquitectura y release: es evidencia humana, no una atestación automática. No fabricar una AMI ni instalar herramientas a mano. El código prepara las herramientas en la futura EC2 y pasó pruebas locales simuladas; [plan FR-015](plan.md) y [research D9](research.md) distinguen ese resultado de compatibilidad Linux real. Release Linux y artefactos ML siguen siendo externos.
- Para FEVI: G-ML → refinamiento G-APP → código verificado; su ausencia no frena red/base/host.

## 2. Verificación local de implementación

Para futuros cambios de comportamiento, usar tests mock y observar el fallo esperado antes del código. Los módulos ya existen y la tabla anterior registra sus resultados. Los comandos siguientes se conservan como referencia para cambios autorizados: **no son una orden de volver a ejecutar todas las suites** ni rehabilitan ciclos agotados.

```sh
terraform -chdir=infra/modules/demo-network test
terraform -chdir=infra/modules/demo-database test
terraform -chdir=infra/modules/demo-host test
terraform -chdir=infra/bootstrap test
terraform -chdir=infra/environments/dev test
terraform fmt -check -recursive infra
```

Con providers ya disponibles y autorización de escritura local limitada, inicializar cada raíz/módulo con `init -backend=false -input=false -lockfile=readonly`, luego `validate`. Caches/scratch fuera del árbol, sin conectarse al backend ni AWS. Init puede descargar providers: no hacerlo sin autorización correspondiente. Test siempre mock_provider aws y command=plan para reglas conocidas, valores computados con overrides explícitos; no usar provider real ni apply implícito. Mock no prueba IAM efectivo ni disponibilidad cloud. Guards estáticas comprueban prevent_destroy, exclusión de secretos/comandos reservados y listas CI nuevas.

Antes de integrar código: `npm run check`; si cambia flujo/UI también `npm run test:e2e` y next-dev-loop cuando haya app corriendo. Estos comandos escriben generated outputs fuera de specs: no ejecutados en planificación. CI debe incluir módulos nuevos en init/validate/tflint/test/locks, conservar trivy/guardas/plan humano autorizado y nunca aplicar. No medir >=80 % cobertura sin runner real.

## 3. Secuencia humana de despliegue

1. Aprobar precios fechados completos, duración y cierre de D8; comprobar cuenta, cuotas, AMI, engine y ausencia de solapamiento. No asumir documentación histórica como inventario.
2. Administrador revisa/aplica bootstrap y deja permisos restringidos. Operador revisa plan completo dev; bloquear sustitución/borrado de servicios existentes y exposición de datos. Ningún agente ejecuta plan cloud ni apply aquí.
3. Provisionar infraestructura nueva; preparación automática de herramientas del host desde la imagen estándar no acredita arranque ni integraciones. Humano prepara usuario DB limitado y ejecuta `npx prisma migrate deploy` por conexión privada SSM en entorno adecuado; no ponerlo en user-data, scripts ni npm lifecycle. Cliente Prisma ya generado antes del build.
4. Construir/validar paquete Linux fuera de EC2; subir release/checksum mediante operación humana, cargar secretos por canal seguro y activar servicio. No copiar .env ni credenciales locales al host.
5. Comprobar DuckDNS→EIP, HTTP challenge/redirect y certificado confiable. La emisión inicial requiere opt-in/contacto explícitos; habilitar el timer solo después de que el servicio inicial termine correctamente. Certbot usa `/opt/certbot/bin/certbot` y configuración/estado propios de MedicIA: no ejecutar una renovación genérica contra configuración global. El procedimiento humano de validación de renovación compatible con ese ownership sigue pendiente; no sustituirlo por un comando supuesto. Fallo bloquea publicación, no habilita cookie insegura.
6. Tras G-ML, preparar imágenes/pesos reales externamente, entrada FEVI sin placeholders, habilitar ambos endpoints explícitamente con plan y costo aprobados; completar integración app G-APP antes de declarar demo completa.

### Handoff para quien ejecuta Terraform

**Estos comandos son del responsable AWS, no del agente, y no autorizan un apply mientras sigan pendientes IAM/revisión y los controles anteriores.** No necesitás acceso a su cuenta para preparar el código. Tu compañero completa estos datos fuera del repositorio y del chat:

| Campo del objeto `demo` | Dato real que debe aportar |
| --- | --- |
| `enabled`, `environment` | Opt-in aprobado para `dev`; el default sigue desactivado |
| `ami_id`, `ami_evidence` | ID regional oficial AWS, procedencia/editor, x86_64 y release exacto `2023.12.20261021`; no AMI personalizada ni identificador inventado |
| `engine_version` | Menor PostgreSQL 17 disponible y aprobado en su región |
| `final_snapshot_identifier` | Nombre propio válido y único, conforme a `variables.tf` |
| `public_hostname` | Hostname DuckDNS ya registrado y autorizado |
| `release_key`, `release_sha256` | Paquete real Linux x64 Node24 preconstruido y su SHA-256; no un fixture |
| `accept_acme_terms` | Aceptación humana explícita antes de emisión; no marcarla automáticamente |

Debe conservar **todos los valores operativos de la raíz dev existente**, además del nuevo objeto `demo`. Un tfvars mínimo que omita el catálogo o recursos anteriores puede proponer borrados: no usarlo como sustituto de la configuración real. Los nombres/rutas siguientes son marcadores para archivos privados del responsable, no archivos generados ni valores listos para aplicar:

```sh
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -var-file='/ruta/privada/base-dev.tfvars' -var-file='/ruta/privada/demo.tfvars' -out='/ruta/privada/demo.tfplan'
# Solo después de revisar el plan completo y resolver IAM/preservación:
terraform -chdir=infra/environments/dev apply '/ruta/privada/demo.tfplan'
```

Usar el backend, identidad y cuenta ya revisados por el responsable: no inventar otro backend, migrar estado ni usar `-target` para ocultar efectos. El plan guardado puede contener datos sensibles; mantenerlo fuera de Git y no compartirlo en chat. Un plan que borra, reemplaza o modifica recursos ajenos se rechaza. Bootstrap IAM se revisa por separado; no se aplica desde esta guía mientras su autoridad siga pendiente.

**Qué prepara EC2 automáticamente:** RPM oficiales del release fijado para Node24 (alternativa `/usr/bin/node`), AWS CLI2, SSM, Nginx, CA/utilidades y biblioteca `python3-certbot`; launcher propio `/opt/certbot/bin/certbot` con `certbot.main:main`, actualmente `certbot 2.6.0`; bundle RDS público descargado por HTTPS y validado como certificados antes de instalarlo. No instala la aplicación con npm, no compila, no genera Prisma ni ejecuta migraciones. No instala el wrapper global Certbot, plugins Nginx, pip ni timers de distribución.

**Límites y errores:** OS/release incompatible, fallo de paquetes/red/CA o paths/configuración ajenos detienen el bootstrap antes de habilitar servicios de la aplicación, con `medicia bootstrap: prerequisites/services failed` por stderr; no se adopta ni borra configuración ajena para pasar. La preparación usa intentos/timeouts finitos para la carrera inicial de EIP. No sustituye la recuperación runtime/web existente ni garantiza disponibilidad. El manifiesto/dependencias/scriptlets reales de `python3-certbot` en AL2023 siguen sin verificarse: si requiere el wrapper excluido o crea configuración global, se debe detener, no forzar la instalación ni eliminar archivos. La simulación no acredita firmas RPM, permisos Linux, parser Certbot, systemd ni CA real.

**Qué sigue siendo externo:** construir/publicar release y checksum reales, cargar secretos app/DuckDNS por canal seguro, preparar usuario DB limitado y migraciones humanas, y aportar/validar los dos modelos e integración G-APP. Terraform no inventa esos valores. Si el primer arranque falla porque aún no estaban disponibles o EIP no estaba asociada, seguir la recuperación de [deployment.md](contracts/deployment.md); no asumir que el timer DNS reinicia la app. El primer arranque/HTTPS/DB en AWS se valida por el responsable después, no por el usuario sin acceso a esa cuenta.

### Empaquetado offline T016 (fuente local; no evidencia de build/host)

```sh
bash infra/scripts/package-demo.sh --help
bash infra/scripts/package-demo.sh /ruta/staging-linux /ruta/externa/demo-v1.tar.gz
```

Requiere proceso Node24 Linux x64 y staging preconstruido, sin escrituras concurrentes,
preparado fuera del checkout. No instala ni compila, no genera Prisma, no usa AWS y no
publica remotamente. No usa standalone: incluye `.next`, dependencias runtime,
`public`/config necesarios y cliente previamente generado por humano para `next start`.
Debe contener archivos no vacíos `release.json`, `.next/BUILD_ID`,
`node_modules/next/dist/bin/next`, `generated/prisma/client.ts`.
Manifest exacto mínimo: `{"platform":"linux","arch":"x64","node":24}`.
Esto declara plataforma; no demuestra ABI de dependencias nativas ni procedencia del build.

Salida: archivo ustar gzip y `<OUTPUT>.sha256` con digest hex y newline sobre bytes
finales. Éxito: exit0, stdout `medicia package: created`; rechazo: exit1, stderr
`medicia package: rejected`; uso inválido: exit2 y uso por stderr. `--help`: exit0 y
`Usage: package-demo.sh INPUT OUTPUT.tar.gz` por stdout. Sin otras salidas previstas.
Padre del output debe existir y estar fuera del input; ambos outputs deben estar ausentes.
No se reemplazan archivos de operador ni se modifica input. Solo se limpia staging propio.

Formato deliberadamente limitado: ASCII imprimible, nombres de hasta 100 bytes,
hasta 100000 entradas (límite existente del consumidor), archivos/directorios sin links (incluye hardlinks),
sin PAX/longnames. Rechaza segmentos inseguros, `.env*`, credenciales/estado/tests,
caches y rutas típicas de secretos/datos clínicos. No sanitiza ni excluye silenciosamente:
los links `.bin` de una instalación npm ordinaria también se rechazan; humano debe
preparar un staging compatible sin debilitar el consumidor. Límites inclusivos:
128 MiB gzip / 512 MiB tar expandido, incluidos headers/padding. Valida nuevamente los
bytes gzip finales antes de crear outputs exclusivos; no extrae archivos.

**Límites de evidencia**: heurísticas de nombres no certifican ausencia de datos clínicos
ni secretos arbitrariamente renombrados. Responsable audita staging y dependencias antes
de empaquetar. Fixtures sintéticos Windows con doble explícito de identidad Linux/Node24
no son prueba C3 de build Linux real, arranque, systemd ni despliegue. Compatibilidad del
archivo sintético se comprueba ejecutando como datos solo el validador del consumidor
existente; no se ejecuta/importa bootstrap. Colisiones concurrentes se prueban mediante
fault injection determinista sobre publicación exclusiva; no son evidencia de filesystem Linux.
Casos grandes preparados: 512 MiB expandido exacto y overflow, 100000/100001 entradas,
y gzip válido de 128 MiB exacto/overflow usando comentario sintético grande (doble zlib,
no cambio de límites). Requieren ejecución separada: hasta unos 3 GiB de memoria pico,
menos de 1 GiB de datos temporales y 100000 archivos; metadata Windows puede tardar minutos.
Los cuatro casos grandes tienen resultados aprobados retenidos en corridas separadas; el caso de 100000 entradas requirió ampliar únicamente el timeout de limpieza del fixture. No volver a ejecutarlos como preparación de este handoff. Dos casos exclusivos Linux, revisión independiente y ABI reales siguen pendientes de evidencia.

## 4. Aceptación funcional mínima de la demo

Ninguna comprobación integrada está aprobada todavía. Esta es la secuencia de aceptación después del despliegue humano, no una nueva ronda local de mocks:

1. **Recursos propios:** el plan conserva los servicios previos; solo aparecen cambios autorizados. RDS y archivos privados, sin publicar puertos 22/3000/5432 a Internet.
2. **Arranque y conexiones:** tras asociar EIP, SSM permite comprobar el intento actual de runtime/web/DNS. Release y configuración se cargan sin secretos en salidas. Si el arranque inicial falló antes de EIP, usar la recuperación ya definida en [el contrato de despliegue](contracts/deployment.md), sin inventar otra ni asumir que el timer DNS recupera la app.
3. **HTTPS y sesión:** DuckDNS apunta a EIP, navegador externo sin advertencias, HTTP no sirve la aplicación inseguramente; login, navegación y logout con cuenta sintética. Emisión ACME exitosa antes de habilitar su timer.
4. **Persistencia y aislamiento:** guardar/reabrir un estudio sintético y su onda, incluso después de reiniciar web. Sin sesión o desde otra clínica no se leen ni modifican recursos; acceso anónimo directo a archivos rechazado. App→RDS privada con cadena/hostname válidos.
5. **Dos servicios reales desde la app:** seleccionar y completar un caso compatible por EchoNext y otro por FEVI completo; conservar identidad/versiones y no fabricar hallazgos ante entrada incompatible o error. Dos endpoints publicados o una invocación FEVI fuera de la app no satisfacen esta aceptación.
6. **Cierre controlado:** responsable, duración, costo y cierre selectivo acordados; conservar recursos ajenos. Sin promesa de operación productiva.

### Dependencias que impiden ejecutar esa aceptación

- **Responsable AWS / operación:** confirmar cuenta-región, inventario que se preserva, costo/duración/cierre, hostname e ID fijo de AMI oficial AL2023 x86_64 con `system-release`/repos exactamente `2023.12.20261021` para la preparación automática. No requiere AMI personalizada; compatibilidad real de paquetes/launcher Certbot y arranque Linux se comprueban tras ejecución humana. Resolver la revisión/autoridad IAM pendiente por su vía humana antes de instalar permisos; `infra/README.md` y los otros seis archivos IAM continúan congelados.
- **Release real:** staging/build Linux x64 Node24, cliente Prisma generado allí por humano, versión/checksum y publicación privada. Responsable para usuario DB limitado, migraciones y carga de secretos por canal seguro; no pedir sus valores en chat. Un fixture sintético o un cliente generado en Windows no reemplazan ese artefacto.
- **G-ML → G-APP:** recibir contrato de entrada/salida FEVI, selección/compatibilidad E022, versiones y huellas de imagen/pesos y requisitos de serving. La app actual es monomodelo; después corresponde el refinamiento de integración de [inference-readiness.md](contracts/inference-readiness.md), no cambiar solo un nombre de endpoint. Esto no bloquea preparar red/RDS/host, pero sí la demo completa de dos servicios.
- **TLS pendiente:** la inspección de los drivers instalados respalda la configuración nominal `verify-full` con CA fija, no una conexión real ni los negativos de CA/hostname. Existe una discrepancia entre validación runtime y parser PostgreSQL para parámetros duplicados/overrides. No se corrigió el runtime protegido ni se acreditó T018; no aceptar configuración ambigua ni declarar esa brecha resuelta por documentación.
- **Prueba y calidad pendientes:** se conservan las revisiones independientes faltantes y los fallos globales registrados. Este alcance de demo no los convierte en PASS ni autoriza despliegue, publicación, cambios de permisos o comandos reservados.

La matriz siguiente conserva los controles y pendientes del alcance existente; no implica ejecutarlos ahora ni amplía la demo a una campaña de producción.

| Control | Resultado exigido |
| --- | --- |
| Navegador externo | HTTPS sin advertencia, login/navegar/logout; cookie Secure/HttpOnly/SameSite conservada |
| Sin sesión / clínica ajena | Rechazo sin datos/modificaciones; no acceso directo S3 ni DB pública |
| Red/host | SSM funciona, sin 22/3000/5432 Internet; master secret y estado denegados al rol web |
| Persistencia | Guardar y reabrir estudio sintético tras reinicio web; DB TLS correcto, CA/hostname inválidos fallan |
| Runtime negativo | Secreto ausente/checksum inválido: no arranque/falso éxito, release anterior intacto, sin secretos en logs |
| Inferencia | Caso válido e inválido por cada servicio, selección explícita, resultado por contrato, versión exacta y FAILED sin hallazgos ante error |
| Renovación/DNS | Validación de renovación compatible con configuración/estado propios pendiente de procedimiento humano; cambio hostname exige revalidar DNS/certificado antes de compartir |
| Preservación | Revisión de plan completo y segunda comprobación humana sin cambios ajenos al alcance; outputs locales anteriores permanecen |

Registrar control, fecha, responsable, resultado observado/pendiente sin valores sensibles. SC-002/003/005 y G-CLOUD quedan pendientes hasta pruebas autorizadas reales.

## 5. Cierre y recuperación

Responsable apaga endpoints por catálogo y revisa costos residuales (EBS/EIP/RDS/backups/secretos/releases). No basta detener RDS indefinidamente: puede reiniciarse automáticamente. Guardar snapshot final; eliminación definitiva solo de nuevos recursos tras plan completo y autorización específica para protecciones. Nunca destruir raíz dev completa ni buckets/Cognito previos. Rollback de release al checksum anterior es independiente de DB; no revertir migraciones o estado automáticamente.
