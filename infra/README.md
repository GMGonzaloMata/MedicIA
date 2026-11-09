# Infraestructura de MedicIA

Esta carpeta define con Terraform la infraestructura de AWS del entorno de desarrollo: el almacenamiento remoto del estado, el servicio de identidad (Amazon Cognito) y los accesos que usan la aplicación y la revisión en CI. Todo es reproducible y se revisa como cualquier otro cambio.

Especificación y decisiones: [specs/003-infra-base-cognito/](../specs/003-infra-base-cognito/).

## Reglas que no se negocian

- **El estado nunca va a git.** Vive en un bucket privado, cifrado y versionado. El estado contiene secretos (por ejemplo el secreto del cliente de Cognito y la clave de la aplicación): quien pueda leerlo, puede leerlos.
- **Los comandos que modifican infraestructura real los ejecuta solo el responsable del proyecto** desde su terminal: `apply`, `destroy`, `import` y `state`. Los agentes y el CI solo corren `fmt`, `validate`, `test` y `plan`. En esta guía, esos comandos están marcados con **(responsable)**.
- **Ningún secreto en el repositorio.** Los datos de conexión de la aplicación se piden a Terraform y van a `.env.local`, que git ignora.
- **Un entorno separado desde el principio.** Hoy solo existe `dev`. Producción tendrá su propia cuenta y su propio arranque.

## Estructura

- `bootstrap/`: el bucket del estado, el acceso de CI (rol `medicia-dev-plan` y proveedor de GitHub), la política del operador y la política límite de permisos. Es la única raíz que arranca con estado local.
- `modules/identity/`: el grupo de usuarios de Cognito, su cliente de aplicación y el usuario de IAM que usa el servidor. Incluye sus pruebas.
- `environments/dev/`: el entorno de desarrollo, que usa el módulo de identidad.
- `.tflint.hcl` y `.trivyignore`: reglas del análisis estático y sus excepciones justificadas.

Los comandos de esta guía se ejecutan desde la raíz del repositorio con `-chdir`. El perfil de AWS es `medicia-dev`:

```powershell
$env:AWS_PROFILE = "medicia-dev"
```

## Requisitos previos de la cuenta

- Cuenta `896618135592` en plan pago, con el presupuesto `medicia-dev-mensual` creado.
- Usuario `terraform-dev` con MFA y el perfil `medicia-dev` configurado en `sa-east-1`.
- La cuenta raíz con MFA y sin claves de acceso.
- Terraform 1.15.x instalado.

Comprobaciones de solo lectura, antes de crear nada:

- `aws sts get-caller-identity` muestra la cuenta `896618135592` y el usuario `terraform-dev`, no la raíz.
- `aws iam get-account-summary --query "SummaryMap.AccountMFAEnabled"` devuelve `1`.
- En la consola, la página de credenciales de seguridad de la cuenta raíz no muestra claves de acceso.

## Arranque en dos fases

El bucket del estado no puede guardar su propio estado antes de existir, así que `bootstrap` se arranca en dos fases.

**Fase 1: estado local.** Si existe `infra/bootstrap/backend.tf`, no lo uses todavía (renombralo o borralo).

```powershell
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply   # (responsable)
```

**Fase 2: migrar el estado al bucket.**

```powershell
Copy-Item infra/bootstrap/backend.tf.example infra/bootstrap/backend.tf
terraform -chdir=infra/bootstrap init -migrate-state   # (responsable) aceptá copiar el estado
```

Después borrá el archivo de estado local que quedó (`infra/bootstrap/terraform.tfstate*`; git lo ignora, pero no tiene por qué quedar ahí). Un `plan` posterior tiene que informar 0 cambios.

Las demás raíces (`environments/dev`) ya apuntan al bucket desde el principio, con su propia clave de estado.

## Uso diario

```powershell
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev plan
terraform -chdir=infra/environments/dev apply   # (responsable) solo después de revisar el plan
```

Antes de subir un cambio, desde la raíz:

```powershell
terraform fmt -recursive infra
terraform -chdir=infra/modules/identity test
terraform -chdir=infra/bootstrap test
```

**Qué corre en CI** (`.github/workflows/infra.yml`), solo si el cambio toca `infra/`:

- Trabajo `static`, sin credenciales de AWS: formato, validación, `tflint`, pruebas de Terraform, `trivy` (configuración y secretos), búsqueda de archivos prohibidos, guarda del contrato de Cognito, guarda de etiquetas y una guarda que impide aplicar desde los flujos.
- Trabajo `plan`, solo en propuestas de cambio de este repositorio (no en forks ni en `main`): asume el rol `medicia-dev-plan` por OIDC, con solo lectura, y vuelca el plan en el resumen del trabajo. Nunca aplica.

Un plan que propone destruir o reemplazar el grupo de usuarios es bloqueante en la revisión: la decisión de aplicarlo es del responsable.

## Conexión de la aplicación

La aplicación necesita siete variables en `.env.local` (ese archivo lo escribe el responsable; no se versiona). El detalle del contrato está en [specs/003-infra-base-cognito/contracts/identity-service.md](../specs/003-infra-base-cognito/contracts/identity-service.md).

- `IDENTITY_PROVIDER`: `cognito`.
- `COGNITO_REGION`: `terraform -chdir=infra/environments/dev output -raw region`
- `COGNITO_USER_POOL_ID`: `terraform -chdir=infra/environments/dev output -raw user_pool_id`
- `COGNITO_CLIENT_ID`: `terraform -chdir=infra/environments/dev output -raw user_pool_client_id`
- `COGNITO_CLIENT_SECRET`: `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret` (sensible)
- `AWS_ACCESS_KEY_ID`: `terraform -chdir=infra/environments/dev output -raw app_access_key_id` (sensible)
- `AWS_SECRET_ACCESS_KEY`: `terraform -chdir=infra/environments/dev output -raw app_secret_access_key` (sensible)

Consultá los sensibles de a uno, en tu terminal, y no los pegues en chats, tickets ni capturas.

En PowerShell, si guardás la ruta en una variable, ponela entre comillas: `"-chdir=$d"`. Sin comillas, PowerShell no expande `$d` dentro de `-chdir=$d`, el comando falla y `.env.local` queda con valores vacíos.

El grupo de usuarios conserva el correo por defecto de Cognito, que tiene un tope diario bajo de mensajes (unas decenas por día). Alcanza para desarrollo; si un registro de prueba no recibe el código, puede ser ese tope. El correo propio con SES queda fuera de esta entrega.

### Cambiar de proveedor simulado a Cognito

Si antes usaste `IDENTITY_PROVIDER=fake`, tu base local puede tener cuentas creadas con el proveedor simulado. Al ingresar con Cognito con el mismo correo, el sistema detecta el conflicto y el ingreso falla con el mensaje de credenciales inválidas. Solución: borrá esas filas de sesión y usuario de la base local de desarrollo y registrate de nuevo contra Cognito. Si querés repetir la prueba con el mismo correo, borrá también el usuario del grupo en Cognito.

## Recreación desde cero

Para levantar todo en una cuenta limpia:

1. Quitá `infra/bootstrap/backend.tf` (la fase 1 del arranque usa estado local).
2. Ajustá `account_id` en `infra/bootstrap/variables.tf`, y la cuenta y el bucket en `infra/environments/dev/providers.tf` y `backend.tf`.
3. Seguí "Arranque en dos fases" y luego "Uso diario" para `environments/dev`.
4. Creá la variable de GitHub `INFRA_PLAN_ROLE_ARN` con `terraform -chdir=infra/bootstrap output -raw plan_role_arn` (Settings → Secrets and variables → Actions → pestaña Variables; es un ARN, no un secreto).

## Operación

**Estado bloqueado por un proceso cortado.** El bloqueo es un objeto `.tflock` en el bucket. Antes de forzar nada, comprobá que no haya otra operación en curso (otra terminal, otra persona, un proceso colgado). Solo entonces:

```powershell
terraform -chdir=infra/environments/dev force-unlock <id>   # (responsable) el id lo muestra el error de bloqueo
```

**Se perdió el secreto del cliente.** Se ve de nuevo con `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret` o en la consola de Cognito (grupo → clientes de aplicación → pestaña "Secretos del cliente"). Si querés uno nuevo, reemplazá el cliente:

```powershell
terraform -chdir=infra/environments/dev apply -replace=module.identity.aws_cognito_user_pool_client.app   # (responsable)
```

El cliente nuevo cambia el identificador y el secreto, así que hay que actualizar `COGNITO_CLIENT_ID` y `COGNITO_CLIENT_SECRET`. Las cuentas del grupo no se pierden: pertenecen al grupo, no al cliente.

**Rotar la clave de la aplicación:**

```powershell
terraform -chdir=infra/environments/dev apply -replace=module.identity.aws_iam_access_key.app   # (responsable)
```

Después actualizá `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `.env.local`.

**Cambio hecho a mano en la consola.** El plan de CI muestra la diferencia con el código. Corregilo en el código (si el cambio es deseado) o volvé a aplicar para revertirlo.

### Cambiar los permisos del operador

El operador (`terraform-dev`, con la política `medicia-dev-terraform-operator`) **no puede editar su propia política ni la política límite `medicia-dev-boundary`**: un `Deny` se lo impide a propósito, y solo puede crear usuarios o roles `medicia-dev-*` si llevan ese límite. Así, quien tenga su clave de acceso no puede darse permisos de administrador.

Tampoco puede cambiar la política del bucket del estado ni su bloqueo de acceso público (`aws_s3_bucket_policy` y `aws_s3_bucket_public_access_block` en `state-bucket.tf`): con eso podría darse acceso al estado, que contiene secretos. Esos cambios también van por la vía de administración.

Consecuencia: si el `plan` falla con `AccessDenied` porque falta un permiso, o si hay que cambiar el límite o la política del bucket, hace falta una vía de administración aparte. Se hace así:

1. Corregí `operator-policy.tf` (o `permissions-boundary.tf`) y revisá el cambio en un PR, como cualquier otro.
2. En la consola de AWS, con el usuario raíz y su MFA, **reemplazá** la política de `terraform-dev` (Users → `terraform-dev` → Permissions): quitá `medicia-dev-terraform-operator` y adjuntá `AdministratorAccess`. Hay que quitar la del operador: su `Deny` gana incluso a `AdministratorAccess`, así que con las dos puestas el `apply` falla con "explicit deny". No se puede aplicar con la cuenta raíz: la raíz está bloqueada a propósito para `terraform`.
3. Aplicá `bootstrap` (responsable) con ese perfil y comprobá un `plan` sin cambios.
4. Volvé a adjuntar `medicia-dev-terraform-operator` y quitá `AdministratorAccess`. Los dos pasos juntos.

Mientras `AdministratorAccess` está puesto, quien tenga la clave de `terraform-dev` es administrador de la cuenta. Hacelo de corrido y no lo dejes puesto. Más adelante conviene reemplazar este procedimiento por un rol de administración con MFA, fuera del prefijo `medicia-dev-`.

Los permisos del rol de plan y del usuario de la aplicación nunca superan el límite: si un permiso nuevo no entra en `medicia-dev-boundary`, tampoco lo van a tener, aunque se lo agreguen.

## Liberar los recursos al terminar

El grupo de usuarios y el bucket del estado están protegidos a propósito contra borrados accidentales. Para liberarlos:

1. Agregá `protect_user_pool = false` al bloque `module "identity"` de `environments/dev/main.tf` y aplicá (responsable): apaga la protección de borrado de Cognito. Después quitá el `prevent_destroy` del grupo en `modules/identity/main.tf`.
2. Revisá el plan de destrucción completo antes de ejecutarlo: `terraform -chdir=infra/environments/dev destroy` (responsable).
3. Para el bucket del estado, vaciá primero todas las versiones y luego quitá su `prevent_destroy` en `bootstrap/state-bucket.tf`. Hacelo al final, porque el estado de las demás raíces vive ahí.

Eliminar el grupo borra todas las cuentas de usuarios que contenga.

## Actualizar Terraform y los proveedores

Las actualizaciones de la versión de Terraform, del proveedor de AWS y de los complementos de `tflint` van en un cambio aparte de los cambios funcionales. Así un plan inesperado se atribuye a una sola causa. Subí la versión en `terraform.tf` (y en el flujo de CI), corré `terraform init -upgrade` en cada raíz y versioná los `.terraform.lock.hcl` resultantes.

## El estado contiene secretos

El estado de `environments/dev` incluye el secreto del cliente de Cognito y la clave de acceso de la aplicación. Por eso el bucket es privado, cifrado, versionado y exige TLS, y el rol de CI solo puede leer la clave de estado de `environments/dev/`. Aun así, el rol de CI puede leer esos secretos: es un riesgo aceptado para desarrollo y deberá resolverse antes de producción (por ejemplo, ocultando los secretos del estado o usando un almacén de secretos).

## Solución de problemas

**Credenciales vencidas o ausentes.** Los comandos fallan con un mensaje claro y no dejan cambios a medias. Comprobá la sesión:

```powershell
aws sts get-caller-identity
```

Debe mostrar la cuenta `896618135592` y el usuario `terraform-dev`. Si falla, renová las credenciales del perfil `medicia-dev` (`aws configure --profile medicia-dev`) y volvé a probar.

**`plan` falla con `AccessDenied`.** Mirá la acción que indica el error y agregala a la política correspondiente (el operador, o el rol de plan si falla en CI). Para el operador, ver "Cambiar los permisos del operador".

**El CI falla en `plan` al asumir el rol.** El paso "Mostrar el sujeto del token" imprime el `sub` real. Tiene que coincidir con `github_oidc_subject` en `bootstrap/variables.tf`. Si el repositorio se renombró o se recreó, el `sub` cambia y hay que actualizar la variable y aplicar `bootstrap`.

**El análisis de `trivy` marca un hallazgo.** Corregilo. Si es una excepción deliberada, agregala a `.trivyignore` con un comentario que explique el motivo.
