# EC2 + RDS privada: handoff al responsable AWS

**T4 / S1–S2, Spec Kit 009 T036:** preparar infraestructura para trabajar y pulir rebranding sin exigir la aceptación completa de modelos. `app_enabled` está implementado y comprobado localmente; T3 tiene estática independiente favorable sin must-fix, pero dinámica no disponible y T035 sin aprobación completa. **No hay aprobación de deploy/merge ni aceptación AWS.** Fuente congelada para revisión; este cambio es solo documental.

## 1. Elegir el modo explícitamente

| Configuración | Comportamiento implementado |
| --- | --- |
| `demo.enabled=false` (default) | Sin módulos demo; output `demo` null. No usarlo para intentar borrar una DB existente. |
| `demo.enabled=true`, `app_enabled` omitido o `true` | Modo activo previo: exige hostname/release/checksum reales e intenta arrancar runtime/web/DNS; ACME requiere opt-in/contacto. |
| `demo.enabled=true`, `app_enabled=false` | Provisión sin app: conserva prerrequisitos completos; después habilita/inicia solo `amazon-ssm-agent.service` y termina antes de usuario/config/unidades app, proxy, DNS/ACME/timers o fetches runtime. |

La preparación sigue siendo **completa**: paquetes, Node, launcher Certbot y CA, entre otros. False evita la activación app posterior, no los efectos de RPM; su ausencia no fue probada.

En modo infraestructura se pueden omitir `public_hostname`, `release_key` y `release_sha256`; si no están vacíos conservan sus validaciones. `accept_acme_terms=false` es obligatorio: la combinación contradictoria se rechaza con `Infraestructura sola requiere accept_acme_terms=false.` **ACME false por sí solo no desactiva la app.**

Los outputs `demo.public_hostname`, `demo.public_url` y `demo.release_key` son null en ese modo; IDs/EIP, metadata DB, bucket y referencias de secretos siguen disponibles, sin valores secretos. No se exige endpoint encendido ni cargar secretos app para provisionar; sí referencias y dependencias existentes válidas, permisos revisados y guardas completas. Ver [entradas](../../infra/environments/dev/variables.tf), [outputs](../../infra/environments/dev/outputs.tf) y [bootstrap](../../infra/modules/demo-host/templates/user-data.sh.tftpl).

## 2. Ejemplo mínimo privado para infraestructura

Contenido de `/ruta/privada/demo.tfvars` **del responsable, no para copiar sin completar**. Cada `<...>` es una entrada humana por reemplazar, no un identificador AWS ficticio ni un valor listo para planificar. Se omiten los tres campos app y el contacto ACME; `environment` conserva su default `dev`.

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

- AMI oficial AL2023 x86_64 fija, no personalizada/latest; evidencia humana verificable y `system-release`/repos exactamente `2023.12.20261021`. No instalar herramientas a mano para sortear rechazos.
- Motor PostgreSQL `17.x` menor disponible/aprobado. Snapshot único `medicia-dev-demo*`, máximo255 caracteres, sin `--` ni guion final.
- **Conservar todos los valores base dev y catálogo previos.** Este objeto no reemplaza `/ruta/privada/base-dev.tfvars`. Confirmar identidad/cuenta/región del provider existente, inventario/propiedad, CIDR, cuotas, AMI/motor y dependencias; no inventar cuenta ni habilitar modelos para pasar el plan.

## 3. Plan completo privado — solo responsable, después de los gates

Antes de ejecutar: resolver revisión independiente y autoridad IAM por la vía existente, completar presupuesto D8 con precios fechados, duración/cierre/responsables y aprobación de gasto. No reabrir ciclos agotados ni ampliar permisos ante AccessDenied. Terraform1.15.1/AWS6.72.0 y locks existentes; backend remoto cifrado/con bloqueo, sin reiniciarlo ni migrar estado. [Guards y costos](../../infra/README.md).

Comandos exactos del [quickstart](../../specs/009-ec2-rds-test/quickstart.md), desde raíz; rutas marcadoras privadas externas al repositorio. **No ejecutados aquí ni autorización de aplicar ahora.**

```sh
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev validate
terraform -chdir=infra/environments/dev plan -var-file='/ruta/privada/base-dev.tfvars' -var-file='/ruta/privada/demo.tfvars' -out='/ruta/privada/demo.tfplan'
```

Revisar **todo** el plan guardado y restringir su acceso: puede contener datos sensibles; nunca Git/chat/artefactos públicos. Rechazar cambios ajenos en backend, Cognito, estudios, modelos o usuario/claves. Sin `-target`, otro backend ni aprobación automática. Reemplazos EC2 propios requieren evaluación explícita, no aprobación implícita. Segunda comprobación humana y aprobación del artefacto exacto antes de:

```sh
terraform -chdir=infra/environments/dev apply '/ruta/privada/demo.tfplan'
```

Cambiar código/entradas exige otro plan revisado. Apply no demuestra salud de prerrequisitos/SSM, conexión DB ni disponibilidad web. SSM depende de paquetes, EIP/rutas/permisos reales e identidad humana autorizada; no se garantiza por mocks.

## 4. RDS privada y activación posterior

RDS conserva `publicly_accessible=false`, TLS obligatorio, cifrado, backup7días, snapshot final y protecciones de borrado. 5432 acepta **solo SG app**; acceso mediante EC2/SSM y conexión/túnel privado autorizado. Nunca abrir 5432 a Internet ni publicar 22/3000. No usar el master como usuario app, exponer credenciales ni debilitar guards. [RDS](../../infra/modules/demo-database/main.tf) / [red](../../infra/modules/demo-network/main.tf).

Para activar más adelante, el responsable debe preparar:

1. Hostname DuckDNS registrado; paquete **real** Linux x64 Node24, dependencias runtime/cliente Prisma generado por humano, `release_key` versionada y SHA-256 del paquete publicado privadamente. [Empaquetado](../../specs/009-ec2-rds-test/quickstart.md).
2. Configuración/referencias Cognito/S3/EchoNext y permisos runtime exactos aprobados; secretos app/DuckDNS cargados por canal seguro fuera de Terraform/Git/chat. Usuario PostgreSQL limitado y migraciones humanas por conexión privada. `npx prisma generate` en build Linux y `npx prisma migrate deploy` son reservados al responsable, nunca agente/bootstrap/npm lifecycle. No reseeding ni limpieza de datos.
3. `DATABASE_URL` con hostname RDS exacto y exactamente un `sslmode=verify-full` y `sslrootcert=/etc/pki/rds/global-bundle.pem`; no overrides inseguros. [Runtime](../../infra/modules/demo-host/templates/runtime.sh.tftpl).
4. Cambiar `app_enabled=true`, aportar los tres campos app y revisar **otro plan privado completo**. HTTPS requiere aceptación ACME explícita/contacto privado y comprobación DNS/certificado/sesión antes de compartir URL.

**No es activación en sitio:** se conserva `user_data_replace_on_change=true`. Activar/desactivar, cambiar release/hostname o adoptar el nuevo gate incluso con default true puede reemplazar EC2, interrumpir SSM/web y perder estado local/certificados; prever nuevo arranque/reasociación EIP. RDS conserva sus protecciones. `false` no es un comando de apagado de apps existentes ni rollback sin interrupción. No manipular estado/copiar certificados para evitar reemplazo. [Semántica EC2](../../infra/modules/demo-host/main.tf).

Solo después del plan activo aprobado y del arranque correspondiente aplicar la recuperación runtime/DNS y secuencia ACME del [runbook](../../specs/009-ec2-rds-test/contracts/deployment.md), paso a paso y deteniéndose ante error; no aplicarlas al host inerte, donde esas unidades no se instalan. Exigir resultados del intento actual, no solo exit0 de consulta. Fallos de OS/paquetes/CA requieren inspección, no instalaciones manuales ni apropiación/borrado de configuración ajena. Rollback de release no revierte DB; ningún cierre/cleanup está autorizado por esta guía.

## 5. Evidencia retenida y siguiente paso

T032–T034: gate **5/5**, mocks host **44/44**, dev **30/30**, omisión real host **1/1**, unitarias afectadas **121/121**. Diferencial **19** casos (11dev+8host): comparación del harness con `expect_failures`, stdout/stderr/exit idénticos; **no diagnóstico CLI exhaustivo**. Cuatro init offline, dos validate, fmt/whitespace exit0. Guards de capacidad PASS, sin tamaño actual numérico impreso; no nueva medición. Son resultados retenidos del implementador, no prueba nueva/cloud; cobertura porcentual shell/HCL no medida. [Registro Spec Kit](../../specs/009-ec2-rds-test/tasks.md).

T3: estática independiente favorable sin must-fix; comparación propia 76/76 candidate y 76/76 base, IAM/TLS/guards preservados. **Dinámica UNAVAILABLE; T035 no completamente aprobado.** No se requiere corrección de fuente ni se reabren pruebas. Los dos tests exclusivos Linux antiguos y calidad global/`npm run check` siguen abiertos, sin nuevas ejecuciones ni rehabilitar Linux/C1/paquete/composición/IAM. No hay aceptación AWS/DB/TLS integrada ni deploy ready. La aceptación completa de modelos **no es prerrequisito de provisión**: G-ML→G-APP→G-CLOUD y dos servicios reales siguen para la demo completa, no se simulan ni se habilitan por este handoff. [Dependencias de inferencia](../../specs/009-ec2-rds-test/contracts/inference-readiness.md).

### CI Linux aislada preparada (S1–S2)

`.github/workflows/ci.yml` agrega `infra-linux`, independiente de `check`/`e2e`, sin cambiarlos ni alterar eventos/permisos globales: todas las PR y pushes a `main`. Node24/acciones existentes, permiso solo `contents: read`, sin servicios, DB, secretos, OIDC ni AWS; `npm ci --ignore-scripts` evita lifecycle/Prisma implícito. `vitest.infra-ci.config.mts` usa Node y `envDir:false`, sin setup de aplicación/DB. Ejecuta deliberadamente el contrato nuevo, `demo-activation.test.ts` y, por separado, solo colon/FIFO/backslash/control de `demo-package.test.ts`; exige **2 aprobados**, sin suite pesada ni ausencia silenciosa.

Evidencia local nueva: RED **2 fallos esperados + 3 aprobados**; GREEN **18/18** contratos (`infra-ci` + `demo-ci`) con la configuración no-env. Huellas por secciones preservan los jobs previos y la cabecera; `infra.yml` no se modificó. **Activación y los 2 casos de paquete Linux no se ejecutaron aquí; ejecución remota pendiente de commit/publicación humanos.** No se creó PR ni se disparó CI. La revisión independiente del cambio CI sigue pendiente; estos contratos no sustituyen dinámica nativa independiente, calidad global ni aceptación AWS.

`infra.yml` conserva sus mocks host/dev en `static` y su job `plan` separado con AWS/OIDC: publicar una PR que toque workflows puede activar también ese flujo existente. La preparación del nuevo job no autoriza publicación, plan privado ni apply, y no levanta ninguno de los gates/advertencias de activación anteriores.

**Siguiente paso:** padre dispone la limitación dinámica de T3/T035 y la revisión CI; responsable completa entradas reales y gates humanos antes del plan privado. T4 documenta S1–S2; tracking ODD/mirror y decisión de cierre pertenecen al padre.
