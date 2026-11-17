# Contrato de despliegue demo

## Terraform → operación

Se mantienen backend.tf, nombres/direcciones de módulos existentes, usuario IAM local, claves y outputs existentes. Nuevo módulo demo se habilita explícitamente; apagado por defecto no elimina recursos previos. No se usa toggle para borrar una DB ya creada: protección de datos bloquea eliminación accidental. Nuevos outputs solo hostname/URL, instance_id, endpoint/puerto/nombre DB sin credenciales, ARN de secretos y bucket/release IDs. No DATABASE_URL, clave privada, token ni valores de secretos.

Entradas: enabled=false, app_enabled=true por defecto, CIDR/subredes/AZ, AMI aprobada amd64, instance_type=t3.small, DB engine menor verificada/class=db.t4g.micro y referencias conocidas. Con enabled=true siempre se requieren AMI/evidencia/motor/snapshot; hostname/release/checksum solo pueden omitirse con app_enabled=false conforme data-model.md. ARN runtime no se relaja ni inventa. No se inventa AMI ni se toma latest sin fijar evidencia. Cuenta/región restringidas por provider existente.

## Separación de provisión y activación — delta FR-016/017 (por implementar)

La semántica siguiente extiende 009; no afirma que el código actual ya la cumpla. El quickstart y handoff previos describen el modo activo acoplado hasta que T032–T036 se implementen/verifiquen y se actualice la operación.

| enabled | app_enabled | Resultado esperado |
| --- | --- | --- |
| false | omitido/true/false | Sin módulos demo, output demo null; comportamiento apagado previo. |
| true | omitido/true | Modo activo previo: hostname/release/checksum obligatorios y guards ACME/contacto intactos. |
| true | false | Infraestructura sola: hostname/release/checksum vacíos admitidos, sin secretos de app/DNS ni endpoint encendido; no publicación ni readiness. |

Infraestructura sola mantiene preparación estándar FR-015 completa y sus rechazos (incluidos ownership/config global/paquetes/CA). No instala paquetes reales durante tests. Tras prerrequisitos exitosos habilita/inicia **solo `amazon-ssm-agent.service`** y termina exit0/stdout vacío/stderr vacío antes de instalar/habilitar/arrancar servicios propios. No crea usuario/config/unidades app, proxy, DNS/ACME/timers ni ejecuta runtime/fetches. Fallo conserva exit1/stdout vacío/stderr `medicia bootstrap: prerequisites/services failed\n`; no sigue a app ni informa salud cloud.

`app_enabled=false` junto a `accept_acme_terms=true` se rechaza, aunque exista contacto: `Infraestructura sola requiere accept_acme_terms=false.` Con strings de app no vacíos se comprueba el formato existente; no aceptar latest o hostname malformado en modo inerte. AMI, evidencia, engine/snapshot y permisos/seguridad no se vuelven opcionales. SSM requiere EIP/rutas/paquetes/permisos reales y humano iniciador autorizado; no se promete conectividad por un mock.

Se conservan recursos/direcciones, metadatos secretos y bucket. IAM/trust/perfil/políticas y SG quedan **byte-idénticos en fuente**; no condicionarlos, reescribirlos ni añadir permisos SSM. La expresión existente `ReleaseExacto` usa release_key: con clave vacía deriva ARN bucket/ sin objeto publicado, nunca wildcard ni release inventado. Esto no acredita aceptación IAM real en AWS; revisar efecto de entradas por vía humana sin ampliar permisos. Las referencias runtime y la fase administrativa existente conservan su autoridad.

**Activación posterior:** suministrar hostname/release/checksum reales, valores secretos fuera de Terraform, DB limitada/migraciones humanas y referencias/permisos previamente aprobados; cambiar app_enabled a true y revisar plan privado completo. `user_data_replace_on_change=true` se conserva: la transición false→true, true→false o cambios de release/hostname pueden **reemplazar EC2**, no ejecutar una activación en sitio. Introducir el nuevo gate puede cambiar también user-data de llamadores activos existentes y proponer reemplazo al adoptar el delta. Prever interrupción SSM/web, nuevo arranque, recreación de estado local/certificados y reasociación EIP; RDS/backup/protecciones permanecen. No aceptar plan automáticamente, copiar certificados/secretos ni manipular estado para evitarlo. Runtime rollback no revierte DB y desactivar no es estrategia de rollback sin interrupción.

En infraestructura sola public_hostname/public_url/release_key de output demo son null, otros metadatos siguen disponibles; no imprimir secretos. La secuencia humana A1 y emisión/renovación descritas debajo solo aplican al modo activo después de su plan aprobado. Ningún comando AWS/Terraform real se ejecuta en este delta local.

## Runtime

- Node: NODE_ENV=production, bind 127.0.0.1:3000. IDENTITY_PROVIDER=cognito, STUDY_STORAGE=s3, MODEL_INFERENCE=sagemaker. Ningún fake satisface aceptación pública.
- AWS_REGION, COGNITO_REGION, COGNITO_USER_POOL_ID, COGNITO_CLIENT_ID, STUDIES_BUCKET y SAGEMAKER_ENDPOINT_NAME EchoNext se suministran desde referencias conocidas. El futuro contrato multi-servicio reemplaza configuración monomodelo solo después de su gate.
- COGNITO_CLIENT_SECRET y DATABASE_URL del usuario DB limitado se leen en runtime con rol EC2 de Secrets Manager. Se valida estructura sin imprimirla; archivo runtime bajo /run con permisos mínimos y sin shell tracing. No AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY ni perfiles copiados a EC2.
- DuckDNS token en secreto separado; servicio DNS lo usa por HTTPS sin exponer URL/token en logs. Solo nombres/ARNs en user-data, sin claves privadas ni secret_string consultado por Terraform.
- Servicio web no lee master RDS ni backend. Preparación/migraciones usan identidad humana privilegiada por túnel SSM; separar permisos IAM del iniciador SSM de permisos de canales del agente EC2. No puerto DB público temporal.
- DATABASE_URL exige TLS con CA confiable RDS y verificación de hostname; probar fallo por CA/hostname inválidos. No sslmode=no-verify ni rejectUnauthorized=false. Revisar semántica pg/Prisma instalada antes del código.

## Publicación y aceptación

80 público solo challenge ACME/redirect; 443 público proxy a loopback. DNS apunta EIP, Certbot HTTP-01 automático y renovación timer con dry-run humano. No publicar URL como lista hasta DNS, certificado y sesión comprobados externamente. Forwarded headers consistentes; solicitudes directas con host/origin ajeno se rechazan, no ampliar allowedOrigins indiscriminadamente. Límite proxy >=3 MB para conservar contrato multipart de Next; no cachear páginas autenticadas ni respuestas clínicas.

Secretos ausentes, checksum inválido, TLS inválido o migraciones pendientes: fallo explícito, sin imprimir valores, sin fallback fake, sin declarar saludable. Bootstrap prepara OS/servicios, pero no ejecuta npm build/install, Prisma generate/migrate/db, Terraform ni AWS mutante para aprovisionar recursos ocultos. DNS update/lecturas runtime son operaciones explícitas del despliegue humano, no ejecutadas por este agente.

## Operación DNS T015a

`public_hostname` es obligatorio en demo-host: un label minúsculo DNS de 1–63 caracteres seguido de `.duckdns.org`, sin guiones extremos, sublabels, query ni URL. Por ejemplo `synthetic-demo.duckdns.org` es solo fixture, no nombre disponible ni registrado. No sustituye el bind Node `HOSTNAME=127.0.0.1`.

Interfaz privada, sin modos ni argumentos: `/usr/local/libexec/medicia-dns`, ejecutable root 0700. Consume exclusivamente el archivo newline root-owned 0600 `/run/medicia/current/duckdns` ya publicado; no vuelve a consultar Secrets Manager ni imprime config. Rechaza archivo ausente/no legible, permisos/owner incorrectos o token vacío, multilínea/no ASCII imprimible. Node24 codifica token en URL enviada por stdin a curl, nunca argv ni export de entorno. Endpoint único `https://www.duckdns.org/update`, `domains` subnombre y token obligatorio, `ip` omitido para autodetect IPv4. Curl ignora curlrc, prohíbe protocolo no HTTPS, deshabilita proxy, verifica CA por defecto; connect timeout 5 s, máximo 20 s, proceso hijo 25 s y servicio 45 s. Sin pipeline que oculte el primer fallo. Solo cuerpo exacto `OK` con exit0 acredita actualización; KO, salida adicional, error o timeout se rechazan.

Salidas exactas: éxito exit0/stdout `medicia dns: updated\n`/stderr vacío; rechazo exit1/stdout vacío/stderr `medicia dns: rejected\n`. No equivale a certificado, registro de dominio ni readiness pública. No hay CLI nueva de aplicación. Timer root `medicia-dns.timer`, primer intento a 60 s y cada 5 min, ordenado tras network-online; no Requires/Wants runtime/web. Bootstrap instala script/unidades y habilita timer, sin instalaciones, upgrades ni cambios al servicio web existente.

### Gate EIP y recuperación humana del arranque

Decisión A1 del padre: EC2 deshabilita IP pública automática, conserva EIP separada asociada después de crear la instancia y no referencia su valor desde user-data. En la topología declarada dedicada sin NAT esto evita publicar IPv4 efímera y condiciona salida IPv4 pública a EIP. Mocks prueban el campo false, no rutas AWS reales ni sincronización de arranque. Antes de token/red el updater falla cerrado; el timer reintenta, nunca recupera runtime.

**Carrera conocida**: runtime oneshot ejecuta dos fetches Secrets Manager y uno S3 antes de publicar token/config; After=network-online no espera EIP y el oneshot no declara Restart. Puede fallar antes de asociación. Tras aprobación/revisión humana del plan, EIP asociada y SSM operativo, el responsable ejecuta en el host esta secuencia controlada (NO ejecutada por el agente):

```sh
sudo systemctl stop medicia.service
sudo systemctl reset-failed medicia-runtime.service medicia.service
sudo systemctl start medicia-runtime.service
sudo systemctl show medicia-runtime.service -p ActiveState -p Result -p ExecMainStatus
sudo systemctl start medicia.service
sudo systemctl status medicia.service --no-pager
sudo systemctl start medicia-dns.service
sudo systemctl show medicia-dns.service -p ActiveState -p Result -p ExecMainStatus
sudo systemctl status medicia-dns.timer --no-pager
sudo journalctl -u medicia-dns.service -n 5 --no-pager
```

Ejecutar cada paso por separado; detenerse si falla start/status o aparecen errores, no encadenar ignorando exit codes ni volcar secretos/configuración. Un oneshot exitoso sin RemainAfterExit puede volver a inactive: exigir Result=success y ExecMainStatus=0 del intento recién iniciado en ambas salidas show; el exit0 de show solo acredita la consulta, no el éxito del servicio. Iniciar web puede volver a ejecutar runtime mediante Wants porque el oneshot no permanece activo; preparación idempotente localmente probada, no promesa de una única invocación ni atomicidad/permisos Linux comprobados. No copiar stdout sensible del host a artefactos públicos. Confirmar DNS OK, estado web y luego los gates TLS/sesión externos antes de declarar operativa la demo. Esta recuperación es humana, no automática ni una modificación de servicios protegidos.

### Contrato AMI y siguiente subunidad

FR-015 sustituye el requisito de imagen personalizada/preinstalada: responsable aporta ID fijo de AMI oficial AL2023 x86_64 y evidencia de editor, arquitectura y `system-release` y repos exactamente `2023.12.20261021` (otro release requiere revisar el pin y sus pruebas), no herramientas manualmente preparadas. Bootstrap instalará prerrequisitos mediante RPM firmados del release de la imagen, con límites finitos; sin latest, cambio de repos, EPEL/snap/Docker/pip ni repuntar Python3. Node24 se selecciona por alternativas y conserva `/usr/bin/node`. Certbot conserva `/opt/certbot/bin/certbot` como launcher propio de `certbot.main:main`, biblioteca `python3-certbot` con wrapper `certbot` excluido, no venv obligatorio; el launcher actual exige `certbot 2.6.0`. Rechazar conflicto global/path ajeno antes o después de paquetes; no borrar cli.ini ni apropiarse de timer/config global. Detalles/fuentes y compatibilidad exacta de paquete aún no comprobada: research D9/plan FR-015; no se acredita AMI/binario Linux concreto.

T015 completa sigue abierta. T015c1 incorpora emisión inicial HTTP-01 y activación explícita; el checkpoint C1/T015c2 añade el timer descrito abajo, sin cambiar emisor ni servicio. accept_acme_terms=false por defecto y acme_contact_email operativo ASCII válido son entradas humanas: código/fixtures no aceptan acuerdos ni ejecutan solicitudes reales. Contacto marcado sensitive para no mostrarlo en CLI Terraform; estado sigue requiriendo protección. DNS OK no acredita certificado, sesión, disponibilidad externa ni autorización AWS.

### Operación proxy T015b

El instalador estándar debe dejar `/usr/sbin/nginx` y usuario/grupo `nginx`; operación exige no tener otro listener en80/443 y que `nginx.service` global esté inactivo/no habilitado. Bootstrap rechaza ese servicio activo/habilitado; **no lo detiene, deshabilita ni modifica**. Tampoco incluye `/etc/nginx` ni sitios ajenos. La unidad propia `medicia-nginx.service` instala configs root 0600 en `/etc/medicia/nginx` root 0700, PID en `/run/medicia-nginx`, temporales privados de worker en `/var/lib/medicia/nginx` y webroot público de challenge en `/var/lib/medicia/acme`. El helper proxy no instala paquetes ni tiene relación inversa con runtime/web/DNS; la nueva preparación de paquetes ocurre antes y por separado.

Interfaz privada root 0700 `/usr/local/libexec/medicia-proxy init|activate`; `--help` devuelve exit0/stdout `Usage: medicia-proxy init|activate\n`. `init` valida config existente sin degradar TLS ni recargar; sin activa prepara challenge-only, valida con Nginx y publica. No requiere certificado ni expone Node por HTTP. Éxito exit0/stdout `medicia proxy: configured\n`, stderr vacío, **no implica servicio arrancado ni certificado**. El arranque de la unidad ejecuta init antes de Nginx, con config explícita y sin logs de requests.

`activate` requiere activa previa y archivos no vacíos `fullchain.pem`/`privkey.pem` bajo `/etc/medicia/letsencrypt/live/<hostname>`; **no los genera ni basta su existencia para acreditar confianza**. Copia TLS candidata, valida `nginx -t`, respalda activa, reemplaza en el mismo filesystem y recarga únicamente `medicia-nginx.service`. Éxito exit0/stdout `medicia proxy: activated\n`, stderr vacío: acredita solicitud local de reload, no handshake, sesión ni readiness externa (reload de Nginx es asíncrono). HTTP conserva challenge y redirige resto a hostname fijo; 443 exige Host esperado, Origin ausente o HTTPS propio, fija forwarded headers, usa loopback:3000, admite 3m y deshabilita buffering/cache de respuestas autenticadas.

Rechazo normal exit1/stdout vacío/stderr `medicia proxy: rejected\n`; validación fallida no publica cambios. Si falla reload restaura config y realiza **una sola recarga compensatoria**. Si no puede confirmar restauración/recarga: exit2/stdout vacío/stderr `medicia proxy: rollback failed; inspect service\n`; responsable inspecciona servicio antes de declarar recuperación. Un mkdir exclusivo serializa operaciones; solo se limpian staging/backup propios. Interrupción abrupta puede dejar lock/staging o backup recuperable: no hay limpieza amplia ni recuperación automática de estado incierto. No se ejecutaron estas operaciones en un host real. Pruebas usan certificados sintéticos e interceptores Nginx/systemd, no equivalen a parser Nginx real, permisos Linux, cadena CA, renovación o certificado público. Gate A1/SSM anterior sigue vigente.

### Emisión inicial T015c1 — pendiente de verificación independiente/host real

Interfaz privada root0700 `/usr/local/libexec/medicia-acme`, sin argumentos; operación humana mediante `sudo systemctl start medicia-acme.service`. Requiere DNS/nginx propios exitosos. Bootstrap instala código/unidad de forma inerte; SOLO con aceptación explícita y contacto válido habilita unidad, prepara padre de logs e inicia emisión después del arranque web. El helper emisor no instala Certbot ni crea cuentas/estado CA con el gate false; preparar paquetes y launcher durante bootstrap no acepta términos ni solicita certificados. Carrera inicial EIP/SSM A1 sigue vigente: tras recuperación y checks DNS/web, el responsable inicia ACME si está optado. Sin Restart automático ni renovación en esta subunidad.

Certbot requiere prerequisito humano adicional: cli.ini predeterminado global ausente. Cada invocación comprueba `/etc/letsencrypt/cli.ini` y defaults del HOME/XDG privado; presencia bloquea sin leer/copiar/borrar contenido. --config no suprime defaults. Nunca adoptar config ajena ni exigir que todo /etc/letsencrypt esté vacío. Namespace `/etc/medicia/letsencrypt`, work `/var/lib/medicia/certbot`, logs privados `/var/log/medicia/certbot`, HOME `/var/lib/medicia/certbot-home`, CLI vacío `/etc/medicia/acme/cli.ini`. Marker root0600 schema1+hostname exacto; contenido previo no reconocido, permisos inseguros o lock existente se rechazan. Solo se elimina lock vacío adquirido por esta ejecución; interrupción puede dejar estado/lock y exige inspección, nunca limpieza amplia.

Helper controla entorno hijo y argumentos, deshabilita directory hooks, restringe cert-name/domains a un hostname y fija servidor ACME producción. --agree-tos solo aparece tras gate true/contacto válido; --keep-until-expiring evita forzar duplicaciones. CLI timeouts máximos300s y unidad360s, sin bucle de reintentos. Logs/salida Certbot no pasan al journal de app ni al stdout del helper; inspección privada de logs solo por responsable.

No deploy-hook de Certbot: se ejecutaría con shell y su error no garantiza exit no-cero. Orquestación Node literal sin shell: certonly exitoso -> live targets dentro del archive del hostname propio -> X509 nativo (SAN único, hostname, fechas y clave concordante) -> medicia-proxy activate. No equivale a validar cadena CA/handshake real. Éxito0/stdout `medicia acme: activated\n`, stderr vacío; rechazo1/stdout vacío/stderr `medicia acme: rejected\n`; incertidumbre2/stdout vacío/stderr `medicia acme: recovery unconfirmed\n`. No declarar recuperación ante2. Certificado/estado CA producido se conserva si falla activación; Nginx mantiene su contrato propio de rollback, no se borra material ni degrada a HTTP de aplicación.

Prueba local writer90/90unitarias,33/33mocks,fmt/validate/lint0 en últimaR2; aggregate sigueFAIL1 por tsc global2/40diagnósticos ajenos a ambosfixtures. BudgetT015c1 **2/2TOTAL usado**: primer bootstrap22932chars y R1 22248 excedían guard21844, ambas fallas preservadas. R2 conserva límite/outerbase64gzip y usa JSON de jsonencode como datos literales seguros y heredocs quoted para nuevohelper/unidad; no minifica código ni cambia seis templates runtime/DNS/host resource body. Parse-only Bash y payloads verbatim probados, no ejecución de bootstrap real. Material X509 de prueba autofirmado efímero/no confianza pública. Independiente y Linux/AMI/Certbot real todavía pendientes; ningún certificado real emitido. Helper no es CLI de aplicación.

### Renovación C1/T015c2 — checkpoint local, no prueba de host real

Bootstrap instala `medicia-acme.timer` root:root0644 de forma inerte antes de daemon-reload. El timer apunta exclusivamente a `medicia-acme.service`: `OnCalendar=*-*-* 00,12:00:00`, `RandomizedDelaySec=1h`, `Persistent=true`. No hay emisor alternativo, flags nuevos, hooks, reinicio de otros servicios ni retry automático de un start inicial fallido. Solo dentro del último gate `accept_acme_terms=true`, un `systemctl start medicia-acme.service` exitoso permite `systemctl enable --now medicia-acme.timer`. Fallo inicial conserva el error visible del bootstrap y no habilita el timer; opt-out no inicia emisión ni habilita timer. No se promete que opt-out deshabilite un timer ya desplegado: esa transición requiere decisión operativa explícita fuera de C1.

Cada ejecución programada reutiliza el helper privado existente, su ownership/lock exclusivo y `certonly --keep-until-expiring`; conserva las salidas/exit0/1/2 documentadas arriba. Incluso si Certbot conserva un certificado vigente, el helper puede volver a activar el proxy propio: se preserva ese comportamiento. Fallos posteriores quedan visibles en el servicio/journal, no acreditan renovación ni salud pública. Persistence puede ejecutar una ocurrencia pendiente al iniciar el timer, pero solo se habilita tras éxito inicial; no sustituye recuperación humana de un fallo inicial.

Tras fallo inicial, el responsable resuelve la causa y los gates DNS/web/EIP y ejecuta en el host, por separado y deteniéndose ante cualquier error:

```sh
sudo systemctl start medicia-acme.service
sudo systemctl show medicia-acme.service -p ActiveState -p Result -p ExecMainStatus
sudo systemctl enable --now medicia-acme.timer
sudo systemctl status medicia-acme.timer --no-pager
```

Exigir start exitoso y `Result=success`/`ExecMainStatus=0` del intento recién iniciado antes de enable; show exit0 solo acredita consulta. No hay recuperación automática autorizada. Estas instrucciones NO fueron ejecutadas por el agente. Los tests C1 ejecutan únicamente el último bloque opt-in real con systemctl sintético; las pruebas anteriores de bootstrap eran solo bash-n. Wiring/mock/guardas no prueban systemd/Linux, scheduling real, permisos, Certbot/CA ni AWS. Evidencia histórica T015c1 anterior se conserva sin reinterpretarla; revisiones y gates globales siguen pendientes del padre.

## Permisos y preservación

Ver D5: rol/perfil EC2 + límite dedicado, política demo operador protegida, PassRole exacto y solo EC2; CI solo lecturas metadata/config desde local.plan_read_statements. No ampliar el límite compartido con GetSecretValue/SSM/escrituras. Humano administrador instala permisos antes del plan de dev. Pruebas fijan que usuario IAM local, outputs sensibles previos y Cognito no se eliminan/rotan y que las políticas previas conservan alcance.

## Release y cierre

Paquete Linux amd64 fuera del árbol; checksum calculado sobre paquete final. Incluye build y dependencias runtime, nunca .env/estado/datos de pruebas; el cliente Prisma lo genera humano ANTES. Host verifica checksum antes de cambiar enlace activo. Volver al release previo no revierte DB; cambios DB necesitan estrategia compatible y aprobación humana.

No cierre por destroy de toda raíz dev. Responsable revisa plan completo y costos residuales, conserva snapshot final y servicios existentes. Quitar protección DB o bucket requiere decisión específica, nunca script de limpieza automática.

## Notas explicativas del bootstrap (S14)

Estos comentarios se trasladan del payload a este contrato, sin cambiar comandos, orden de ejecución, permisos ni controles. Se conserva su texto original para revisión; no constituyen nuevas instrucciones operativas.

```text
# La AMI aprobada debe traer Node24, CLI AWS, agente SSM y CA RDS confiable.
# No instalar/build app ni generar/migrar Prisma en la instancia.
# AMI ownership gate: never stop/disable someone else's service or overwrite its configuration.
# All proxy configuration and writable paths are MedicIA-owned, not the AMI's global sites.
# Starts challenge-only; an existing TLS configuration is validated, never downgraded.
# Sin dependencia Terraform de EIP: si falta token/red, el timer reintenta cerrado.
```
