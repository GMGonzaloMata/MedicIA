# Modelo de datos: Infraestructura base y servicio de identidad

**Plan**: [plan.md](plan.md) | **Investigación**: [research.md](research.md)

Esta funcionalidad no agrega tablas ni modifica la base de datos. Lo que se modela son los recursos de AWS que describe `infra/`, quién los crea y qué datos sensibles guardan. Los nombres de recursos de Terraform siguen la guía de estilo de HashiCorp: minúsculas con guion bajo.

## Entorno

- **Qué es:** una copia completa y aislada de la infraestructura. Hoy existe `dev`. Producción queda reservado y no se crea.
- **Atributos:**
  - `environment`: nombre (`dev`).
  - `account_id`: cuenta de AWS del entorno (`896618135592`).
  - `region`: `sa-east-1`.
- **Reglas:**
  - Cada entorno tiene su propia cuenta, su propio estado y su propia raíz de Terraform.
  - El proveedor rechaza cualquier otra cuenta (`allowed_account_ids`).

## Estado remoto

- **Recurso:** bucket de S3 `medicia-tfstate-<entorno>-<id de cuenta>`, creado por `infra/bootstrap`.
- **Atributos de seguridad:**
  - Bloqueo total de acceso público.
  - Versionado, con vencimiento de versiones no vigentes a los 90 días.
  - Cifrado SSE-S3 por defecto.
  - Política que rechaza el acceso sin TLS.
  - `prevent_destroy = true`.
- **Objetos que contiene:**
  - `bootstrap/terraform.tfstate`: estado del arranque.
  - `environments/dev/terraform.tfstate`: estado del entorno.
  - Objetos `.tflock` temporales mientras hay una operación.
- **Contiene secretos:** sí (ver R9). Por eso no se comparte y nunca va a git.

## Fases del arranque

El estado de `infra/bootstrap` pasa por dos fases y por eso su historia importa:

- **Fase 1, estado local:** el bucket todavía no existe. El estado vive en un archivo local ignorado por git.
- **Fase 2, estado remoto:** el responsable copia `backend.tf.example` a `backend.tf` y migra. Desde ahí el estado vive en el bucket.
- **Transición:** la fase 1 termina cuando `terraform init -migrate-state` copia el estado y se borra el archivo local. No se vuelve a la fase 1 salvo para recrear desde cero.

## Proveedor de identidad de GitHub y rol de plan

- **Recursos** (en `infra/bootstrap`):
  - Un proveedor OIDC de IAM para `https://token.actions.githubusercontent.com`, con `client_id_list = ["sts.amazonaws.com"]`.
  - Un rol `medicia-dev-plan` con política de confianza y una política de permisos de solo lectura.
- **Confianza:**
  - Acción `sts:AssumeRoleWithWebIdentity`.
  - `aud` igual a `sts.amazonaws.com`.
  - `sub` igual al valor exacto del repositorio (formato con identificadores, ver R10).
- **Permisos:** lectura del estado y descripción de los recursos de Cognito e IAM. Ninguna acción de escritura.
- **Relación:** lo asume el trabajo `plan` del flujo de infraestructura.

## Política del operador

- **Recurso:** política administrada `medicia-dev-terraform-operator` en `infra/bootstrap`.
- **Alcance:** el estado remoto, Cognito y la gestión de los usuarios y políticas IAM con prefijo `medicia-dev-`.
- **Relación:** el responsable la asigna a `terraform-dev` y retira `AdministratorAccess`. La asignación es manual.

## Servicio de identidad

- **Recurso:** `aws_cognito_user_pool.this`, dentro de `modules/identity`.
- **Atributos principales:**
  - `name`: `medicia-<entorno>`.
  - `user_pool_tier`: `ESSENTIALS`.
  - `username_attributes`: `["email"]`, sin distinguir mayúsculas.
  - `auto_verified_attributes`: `["email"]`.
  - `mfa_configuration`: `OFF`.
  - `password_policy`: mínimo 8 caracteres y una mayúscula, sin exigir otra cosa.
  - `schema`: `email` y `name`, ambos obligatorios.
  - `deletion_protection`: `ACTIVE`.
- **Estado de vida:** existe o no existe. Reemplazarlo borra a todos sus usuarios, por eso está protegido (R7).
- **Sin recursos asociados:** no hay dominio, no hay interfaz alojada y no hay proveedores externos.

## Cliente de aplicación

- **Recurso:** `aws_cognito_user_pool_client.app`, uno solo.
- **Atributos principales:**
  - `generate_secret`: `true`.
  - `explicit_auth_flows`: solo `ALLOW_USER_PASSWORD_AUTH`.
  - `prevent_user_existence_errors`: `ENABLED`.
  - Validez de tokens: 5 minutos para el de identidad y el de acceso, y el mínimo permitido para el de renovación, que no se usa.
  - Sin OAuth: `allowed_oauth_flows_user_pool_client = false`.
- **Datos sensibles:** `client_secret`.
- **Relación:** pertenece al grupo de usuarios.

## Usuario de la aplicación y su permiso

- **Recursos:**
  - `aws_iam_user.app` llamado `medicia-dev-app`.
  - `aws_iam_user_policy.app` con un solo permiso.
  - `aws_iam_access_key.app`.
- **Permiso:** `cognito-idp:AdminSetUserPassword` sobre el ARN del grupo, y ninguna otra acción.
- **Datos sensibles:** el identificador y el secreto de la clave de acceso.
- **Rotación:** reemplazo de la clave de acceso (R8).

## Datos de conexión

- **Salidas del entorno:**
  - Libres de consultar: `region`, `user_pool_id`, `user_pool_client_id`.
  - Sensibles, solo con consulta explícita: `user_pool_client_secret`, `app_access_key_id` (se trata como sensible junto con el secreto) y `app_secret_access_key`.
- **Destino:** el archivo local de entorno del responsable, ignorado por git (`.env.local`). Las correspondencias con las variables de la aplicación están en [contracts/identity-service.md](contracts/identity-service.md).

## Relaciones

- El entorno `dev` contiene el estado remoto, el proveedor de identidad de GitHub, el rol de plan, la política del operador y el servicio de identidad.
- El servicio de identidad contiene un cliente y se conecta con un único usuario de aplicación.
- El rol de plan lee el estado del entorno y describe el servicio de identidad.
- El estado remoto contiene los secretos del cliente y del usuario de la aplicación.
