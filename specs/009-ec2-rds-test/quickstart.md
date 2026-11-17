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
| Activación explícita FR-016/017 (T032–T034) | Implementador: gate5/5, host44/44, dev30/30, omisión real host1/1, unitarias afectadas121/121; diferencial19 del harness con expect_failures (11dev+8host), stdout/stderr/exit idénticos, no diagnóstico CLI exhaustivo; cuatro init offline, dos validate y fmt/whitespace exit0. Capacidad guards PASS, sin tamaño actual numérico impreso | T3 estática independiente favorable sin must-fix, comparación propia76/76 candidate+76/76 base, IAM/TLS/guards preservados; dinámica UNAVAILABLE, T035 no completamente aprobado. Fuente congelada, sin corrección requerida; cobertura porcentual shell/HCL no medida ni aceptación AWS |
| Productor de paquetes | 61 casos distintos aprobados en corridas separadas, no una única suite de 61 | Dos casos exclusivos Linux, revisión independiente y release Linux real |
| Cobertura CI | 13 casos aprobados independientemente; listas existentes preservadas y tres módulos demo incluidos | Ejecución GitHub y calidad global del proyecto |

El registro canónico con atribución, fallos históricos y límites es `../../odd/tasks/ec2-rds-test.md`. No transformar evidencia SELF/padre en independiente, casillas históricas en pruebas ejecutadas ni mocks en conectividad real. La comprobación actual de `tsc --noEmit --incremental false` conserva 43 diagnósticos fuera del delta; el fixture nuevo quedó sin diagnósticos TypeScript y con lint aprobado después de dos correcciones locales. No hay `npm run check` global aprobado: no se ejecutaron typegen ni suites que cargan el entorno del proyecto o requieren una DB descartable. Generar Prisma en el worktree del rebranding no acredita un build Linux ni resuelve por sí solo la calidad de esta rama.

Los ciclos detenidos de C1, composición y paquete permanecen detenidos: esta guía no los reinicia ni cambia sus presupuestos. No repetir pruebas aprobadas solo por actualizar documentación. No se añaden campañas de carga, alta disponibilidad ni mejoras opcionales de producción.

## 1. Prerrequisitos

- Padre lee spec/plan/tasks/análisis antes de autorizar superficies de código.
- Terraform 1.15.1 y provider compatible con locks existentes; verificar docs/schema actual antes de código, sin upgrade. Docs Next instaladas antes de cualquier edición Next.
- Para **activar app**, no para provisionar sola: build Linux amd64 compatible; humano ejecuta `npx prisma generate` allí antes del paquete. Hostname DuckDNS registrado y secretos cargados fuera de Terraform/chat. No generación por agente ni wrapper.
- Para **provisionar**: responsable confirma cuenta/recursos existentes sin pegar estado, permisos por la vía humana existente, AMI/evidencia, engine menor y snapshot aprobados. Modo `app_enabled=false` y `accept_acme_terms=false`; no requiere hostname/release/checksum ni valores de secretos app.
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

Preparar fixtures solo con autorización específica y conforme a la política del ejecutor. T032–T034 usó un fixture nuevo mínimo de archivos públicos en `node_modules/.cache/medicia-app-activation/`, dependencias/providers existentes, entorno hijo sanitizado y config Vitest con `envDir=false`, sin setup global app. Init offline `-backend=false -input=false -lockfile=readonly` con filesystem mirror exclusivo, sin downloads/backend/AWS ni env/state/tfvars privados. No reutilizar ni repetir por este cambio documental; esa autorización no modifica la política del verificador independiente. Test siempre mock_provider aws y command=plan para reglas conocidas, valores computados con overrides explícitos; no usar provider real ni apply implícito. Mock no prueba IAM efectivo ni disponibilidad cloud. Guards estáticas comprueban prevent_destroy, exclusión de secretos/comandos reservados y listas CI nuevas.

Antes de integrar código: `npm run check`; si cambia flujo/UI también `npm run test:e2e` y next-dev-loop cuando haya app corriendo. Estos comandos escriben generated outputs fuera de specs: no ejecutados en planificación. CI debe incluir módulos nuevos en init/validate/tflint/test/locks, conservar trivy/guardas/plan humano autorizado y nunca aplicar. No medir >=80 % cobertura sin runner real.

## 3. Secuencia humana de despliegue

1. Aprobar precios fechados completos, duración y cierre de D8; comprobar cuenta, cuotas, AMI, engine y ausencia de solapamiento. No asumir documentación histórica como inventario.
2. Padre dispone evidencia dinámica no disponible de T3/T035 (estática favorable, sin aprobación completa); resolver permisos restringidos por la vía administrativa existente, sin reiniciar bootstrap ni reabrir autoridad IAM. Operador revisa plan completo dev; bloquear sustitución/borrado ajeno y exposición de datos. Ningún agente ejecuta plan cloud ni apply aquí.
3. Provisionar con `demo.enabled=true`, `app_enabled=false`, `accept_acme_terms=false` y las entradas del ejemplo siguiente, conservando base dev. Tras prerrequisitos completos (incluidos paquetes/Node/launcher/CA; no se probó ausencia de efectos RPM) el bootstrap habilita/inicia solo SSM y termina, sin instalar unidades/config app ni arrancar runtime/web/DNS/ACME. SSM real aún depende de EIP/rutas/paquetes/permisos; mocks/apply no acreditan su salud.
4. Para activar posteriormente: construir/validar/publicar paquete Linux real y checksum fuera de EC2; preparar hostname, configuración/referencias aprobadas y secretos por canal seguro. Humano prepara usuario DB limitado y ejecuta `npx prisma migrate deploy` por conexión privada en entorno adecuado; no user-data/scripts/npm lifecycle. Cliente Prisma generado por humano antes del build. Cambiar `app_enabled=true` con campos app reales requiere nuevo plan privado completo y puede reemplazar EC2; no basta iniciar servicios en el host inerte. No copiar .env ni credenciales locales al host.
5. Comprobar DuckDNS→EIP, HTTP challenge/redirect y certificado confiable. La emisión inicial requiere opt-in/contacto explícitos; habilitar el timer solo después de que el servicio inicial termine correctamente. Certbot usa `/opt/certbot/bin/certbot` y configuración/estado propios de MedicIA: no ejecutar una renovación genérica contra configuración global. El procedimiento humano de validación de renovación compatible con ese ownership sigue pendiente; no sustituirlo por un comando supuesto. Fallo bloquea publicación, no habilita cookie insegura.
6. Tras G-ML, preparar imágenes/pesos reales externamente, entrada FEVI sin placeholders, habilitar ambos endpoints explícitamente con plan y costo aprobados; completar integración app G-APP antes de declarar demo completa.

### Handoff para quien ejecuta Terraform

**Estos comandos son del responsable AWS, no del agente, y no autorizan un apply mientras sigan pendientes IAM/revisión y los controles anteriores.** No necesitás acceso a su cuenta para preparar el código. Tu compañero completa estos datos fuera del repositorio y del chat:

| Campo del objeto `demo` | Dato real que debe aportar |
| --- | --- |
| `enabled`, `environment` | Opt-in aprobado para `dev`; `enabled` default false, `environment` default dev |
| `app_enabled` | **Default true si se omite**: conserva flujo activo previo. False explícito para infraestructura sin app |
| `ami_id`, `ami_evidence` | ID regional oficial AWS, procedencia/editor, x86_64 y release exacto `2023.12.20261021`; no AMI personalizada ni identificador inventado |
| `engine_version` | Menor PostgreSQL 17 disponible y aprobado en su región |
| `final_snapshot_identifier` | Nombre propio válido y único, conforme a `variables.tf` |
| `public_hostname` | Solo para activar: hostname DuckDNS ya registrado y autorizado; omitir en infraestructura sola |
| `release_key`, `release_sha256` | Solo para activar: paquete real Linux x64 Node24 y SHA-256; omitir en infraestructura sola, sin fixture |
| `accept_acme_terms` | False obligatorio en infraestructura sola; true solo con aceptación humana explícita y contacto privado válido antes de emisión |

**Ejemplo mínimo de infraestructura sola**, para el archivo privado `/ruta/privada/demo.tfvars`. Cada `<...>` es una entrada humana obligatoria por reemplazar; no es un ID/cuenta ficticio ni un valor listo para planificar. Se omiten `public_hostname`, `release_key`, `release_sha256` y contacto ACME; `environment` conserva su default dev.

```hcl
demo = {
  enabled                   = true
  app_enabled               = false
  ami_id                    = "<ID_AMI_OFICIAL_REGIONAL_APROBADO>"
  ami_evidence              = "<EVIDENCIA_HUMANA_EDITOR_ID_REGION_X86_64_RELEASE_Y_REPOS_2023.12.20261021>"
  engine_version            = "<VERSION_MENOR_POSTGRESQL_17_APROBADA>"
  final_snapshot_identifier = "<SNAPSHOT_UNICO_CON_PREFIJO_medicia-dev-demo>"
  accept_acme_terms         = false
}
```

Snapshot real único `medicia-dev-demo*`, máximo255 caracteres, sin `--` ni guion final; versión menor PostgreSQL17 verificada regionalmente. Strings app no vacíos siguen validándose incluso en false. False+ACME true se rechaza con `Infraestructura sola requiere accept_acme_terms=false.` ACME false por sí solo no impide arranque app si `app_enabled` queda omitido/true.

En infraestructura sola `demo.public_hostname`, `demo.public_url` y `demo.release_key` son null; IDs/EIP, metadata DB, bucket y referencias de secretos siguen disponibles, no sus valores. `demo.enabled=false` mantiene el output demo null y no debe usarse para intentar eliminar una DB protegida. Permisos, referencias runtime existentes y guards no se vuelven opcionales; no se necesita endpoint encendido.

**Reemplazo, no activación en sitio:** `user_data_replace_on_change=true` permanece. False→true, true→false, cambios de release/hostname o adoptar el gate incluso con default true pueden reemplazar EC2, interrumpir SSM/web y perder estado local/certificados; prever nuevo arranque/reasociación EIP. No es un mecanismo de apagado en sitio ni rollback sin interrupción. RDS conserva sus protecciones. Revisar explícitamente ese efecto en cada nuevo plan, sin manipular estado ni copiar certificados para evitarlo.

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

**Qué sigue siendo externo:** para activar, construir/publicar release/checksum reales, cargar secretos app/DuckDNS por canal seguro y preparar usuario DB limitado/migraciones humanas; no usar master como usuario app, reseeding, limpieza de datos ni guards debilitados. `DATABASE_URL` conserva exactamente un `sslmode=verify-full` y un `sslrootcert=/etc/pki/rds/global-bundle.pem`, con hostname RDS real. RDS sigue privada/TLS, cifrada, backup7días/snapshot/protecciones: 5432 solo SG app, acceso EC2/SSM privado, nunca 22/3000/5432 públicos.

Solo **en modo activo tras su plan aprobado**, si el arranque falla por insumos/EIP ausentes, seguir la recuperación de [deployment.md](contracts/deployment.md); el timer DNS no reinicia app. No aplicar esa secuencia al host inerte, donde no se instalaron esas unidades. El contrato conserva texto de planificación del delta; la tabla y ejemplo actuales de esta guía reflejan T032–T034 implementados, sin atribuir aceptación independiente. Primer arranque/HTTPS/DB en AWS los valida el responsable después. Aportar/validar ambos modelos e integración G-APP sigue siendo externo para la demo completa, no prerrequisito de provisión.

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

Ninguna comprobación integrada está aprobada todavía. Esta es la secuencia de aceptación de la **demo activa** después del despliegue humano, no un prerrequisito de modelos completos para provisionar ni una nueva ronda local de mocks. En modo infraestructura no se espera web/DNS/ACME. T3 tiene estática favorable sin must-fix pero dinámica no disponible y T035 sin aprobación completa; fallos Linux históricos y calidad global siguen abiertos; no se convierten en PASS ni se eliminan gates humanos por separar etapas:

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
- **TLS pendiente de integración:** el runtime exige exactamente un `sslmode=verify-full` y un `sslrootcert=/etc/pki/rds/global-bundle.pem`. La autorización acotada registrada en `odd/tasks/local-infra-closure.md` permitió corregir el rechazo de duplicados: regresión RED observada y 71/71 pruebas focales PASS, con revisión estática independiente favorable. Esto no acredita una conexión real, los negativos de CA/hostname ni otros overrides del parser PostgreSQL. T018 sigue abierto; la ejecución independiente del verificador no estuvo disponible por su restricción de aislamiento.
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
