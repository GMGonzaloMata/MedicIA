---

description: "Lista de tareas de la infraestructura base y el servicio de identidad"
---

# Tasks: Infraestructura base y servicio de identidad

**Input**: Documentos de diseño en `/specs/003-infra-base-cognito/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos. La spec exige que cada punto del contrato se verifique de forma automática (FR-020, SC-003) y que el rol de CI y la política del operador no tengan permisos de más. Son pruebas `terraform test` en modo `plan`, con proveedor simulado, que corren sin credenciales.

**Organization**: Las tareas se agrupan por historia de usuario. Las fases siguen el orden de dependencia técnica: **US1 → US2 → US3 → US4**. La razón es que el entorno de desarrollo (US2) guarda su estado en el bucket que crea US1, la conexión de la aplicación (US3) necesita el servicio ya creado, y el flujo de CI (US4) necesita el estado remoto, el entorno y un rol de AWS que se crea en el mismo arranque de US1.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US4).
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal o en la consola de AWS. El agente no corre `git commit`, `terraform apply`, `terraform destroy`, `terraform import` ni `terraform state`, ni escribe `.env*`: se detiene en esa tarea e indica el comando o el cambio exacto. Sí puede correr `terraform init -backend=false`, `fmt`, `validate`, `test` y `providers lock`.

## Path Conventions

- Todo el código de infraestructura vive en `infra/`, según [plan.md](plan.md). No se toca `src/` ni `tests/`.
- Los comandos se ejecutan desde la raíz del repositorio con `-chdir=<carpeta>` y el perfil `medicia-dev` (`$env:AWS_PROFILE = "medicia-dev"` en PowerShell).
- Estilo: guía de HashiCorp (`terraform-style-guide`): archivos estándar, dos espacios, nombres en minúscula con guion bajo, variables y salidas con tipo y descripción. Ningún archivo `.tf` contiene secretos.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: reglas de git, herramientas de análisis y lectura de las guías.

- [X] T001 Leer, antes de escribir HCL: las skills `terraform-style-guide`, `terraform-skill` (referencias `state-management.md`, `security-compliance.md` y `testing-frameworks.md`) y `terraform-test`; `.agents/reviewers/infrastructure.md`; el contrato de la 002 en `specs/002-ingreso-sesion/contracts/identity-provider.md`; y la documentación de `terraform test` con proveedores simulados (`https://developer.hashicorp.com/terraform/language/tests/mocking`).
- [X] T002 [P] Actualizar `.gitignore` con una sección "terraform": `*.tfstate`, `*.tfstate.*`, `.terraform/`, `*.tfplan`, `crash.log`, `crash.*.log`, `*.tfvars`, `*.tfvars.json`, `override.tf`, `override.tf.json`, `*_override.tf` y `*_override.tf.json`. NO ignorar `.terraform.lock.hcl`: debe versionarse (FR-014).
- [X] T003 [P] Crear `infra/.tflint.hcl` con el complemento `aws` de `terraform-linters/tflint-ruleset-aws` fijado por versión exacta, y las reglas `terraform_naming_convention`, `terraform_documented_variables`, `terraform_documented_outputs`, `terraform_typed_variables` y `terraform_required_version`.
- [ ] T004 [Responsable] (opcional) Instalar `tflint` y `trivy` en la máquina local, por ejemplo con `winget`, para poder reproducir las comprobaciones de CI antes de subir un cambio. Sin ellos las comprobaciones corren solo en CI.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: comprobar y registrar los requisitos previos de la cuenta antes de crear recursos (FR-005).

**⚠️ CRÍTICO**: no se aplica nada hasta cerrar esta fase.

- [X] T005 Ejecutar los comandos de solo lectura de "Requisitos previos" de [quickstart.md](quickstart.md): `aws sts get-caller-identity` (cuenta `896618135592`, usuario `terraform-dev`, no la raíz) y `aws iam get-account-summary` (`AccountMFAEnabled` igual a 1) y `aws budgets describe-budgets --account-id 896618135592` (debe listar el presupuesto `medicia-dev-mensual`, la alerta de costos que exige FR-005). Registrar el resultado y la fecha en `research.md`, sección "Pendiente de verificar al implementar". Si el responsable indica que la raíz no tiene claves de acceso en la consola, anotarlo también.
- [X] T006 [Responsable] Cerrar la limpieza de la cuenta que quedó abierta: (a) revisar el usuario IAM `santiDev` (sin MFA, sin uso desde hace unos 186 días) y eliminarlo si no se usa; (b) borrar el bloque `[default]` de `C:\Users\gonza\.aws\credentials` y de `config`; (c) guardar la clave de `terraform-dev` en el gestor de contraseñas y borrar el `.csv` descargado.

**Checkpoint**: la cuenta cumple los requisitos y se puede crear el estado remoto.

---

## Phase 3: User Story 1 - Preparar el entorno de desarrollo y su estado remoto (Priority: P1) 🎯 MVP

**Goal**: el responsable crea, una sola vez, el bucket del estado remoto, privado, cifrado, con versiones y con bloqueo, y migra el estado del arranque a él.

**Independent Test**: seguir los pasos del escenario 1 de [quickstart.md](quickstart.md): el bucket existe, el arranque se repite con 0 cambios y un segundo proceso es rechazado por el bloqueo.

### Tests for User Story 1 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T007 [US1] Crear `infra/bootstrap/tests/state-bucket.tftest.hcl` con `mock_provider "aws" {}` y `command = plan`. Aserciones: el bucket se llama `medicia-tfstate-dev-896618135592`; el versionado queda en `Enabled`; el cifrado por defecto es `AES256`; las cuatro opciones de bloqueo de acceso público (`block_public_acls`, `block_public_policy`, `ignore_public_acls`, `restrict_public_buckets`) son `true`; existe una regla de ciclo de vida que vence las versiones no vigentes a los 90 días; la política del bucket contiene una declaración `Deny` con la condición `aws:SecureTransport` igual a `false` (la política se arma con `jsonencode`, no con `aws_iam_policy_document`, para poder decodificarla en la prueba, y sus ARN se construyen con el nombre conocido del bucket, `arn:aws:s3:::${local.state_bucket_name}`, y no con atributos del recurso, que son desconocidos en el plan y impedirían decodificarla). Debe fallar mientras no exista el código.

### Implementation for User Story 1

- [X] T008 [P] [US1] Crear `infra/bootstrap/terraform.tf`: `required_version = "~> 1.15"` y `required_providers` con `aws` de `hashicorp/aws`, `version = "~> 6.72"`.
- [X] T009 [P] [US1] Crear `infra/bootstrap/variables.tf` con tres variables, todas con tipo y descripción: `environment` (string, por defecto `dev`, con validación para que solo acepte `dev`), `region` (string, por defecto `sa-east-1`) y `account_id` (string, por defecto `896618135592`).
- [X] T010 [US1] Crear `infra/bootstrap/providers.tf`: proveedor `aws` con `region = var.region`, `allowed_account_ids = [var.account_id]` y `default_tags` con `Project = "medicia"`, `Environment = var.environment` y `ManagedBy = "terraform"` (FR-016). Depende de T009.
- [X] T011 [US1] Crear `infra/bootstrap/state-bucket.tf` con: `data "aws_caller_identity" "current"`; un valor local `state_bucket_name`, declarado en `infra/bootstrap/locals.tf` según la guía de HashiCorp, igual a `medicia-tfstate-${var.environment}-${var.account_id}`; el bucket con ese nombre, `force_destroy = false`, `lifecycle { prevent_destroy = true }` y una `precondition` que falla si el ARN de la identidad termina en `:root`; `aws_s3_bucket_versioning` con `status = "Enabled"`; `aws_s3_bucket_server_side_encryption_configuration` con `sse_algorithm = "AES256"`; `aws_s3_bucket_public_access_block` con las cuatro opciones en `true`; `aws_s3_bucket_lifecycle_configuration` con `noncurrent_version_expiration` de 90 días; y `aws_s3_bucket_policy` con `jsonencode` que niega `s3:*` sin TLS (`aws:SecureTransport` igual a `false`) sobre el bucket y sus objetos. Depende de T008 y T010.
- [X] T012 [P] [US1] Crear `infra/bootstrap/outputs.tf` con `state_bucket_name`, `state_bucket_arn` y `region`, cada una con tipo y descripción. Ninguna es sensible.
- [X] T013 [P] [US1] Crear `infra/bootstrap/backend.tf.example` con el bloque `terraform { backend "s3" { bucket = "medicia-tfstate-dev-896618135592", key = "bootstrap/terraform.tfstate", region = "sa-east-1", encrypt = true, use_lockfile = true } }` y un comentario que explique que se copia a `backend.tf` en la fase 2 del arranque (R5).
- [X] T014 [US1] Desde la raíz del repositorio ejecutar `terraform -chdir=infra/bootstrap init -backend=false`, `fmt`, `validate` y `test`: las pruebas de T007 deben pasar. Luego `terraform -chdir=infra/bootstrap providers lock -platform=linux_amd64 -platform=windows_amd64` para que `.terraform.lock.hcl` sirva en CI (Linux) y en la máquina local (Windows). Depende de T007 a T013.
- [X] T015 [Responsable] Fase 1 del arranque: `terraform -chdir=infra/bootstrap init`, `terraform -chdir=infra/bootstrap plan`, revisar que crea solo el bucket y sus configuraciones, y ejecutar `terraform -chdir=infra/bootstrap apply`. Depende de T014 y de T006.
- [X] T016 [Responsable] Fase 2 del arranque: copiar `infra/bootstrap/backend.tf.example` a `infra/bootstrap/backend.tf`, ejecutar `terraform -chdir=infra/bootstrap init -migrate-state` y aceptar copiar el estado, borrar el archivo `terraform.tfstate` local, y ejecutar `terraform -chdir=infra/bootstrap plan`, que debe informar 0 cambios (SC-002). Comprobar el bloqueo: con un `plan` en curso en una terminal, otro en una segunda debe ser rechazado. Depende de T015.
- [X] T017 [US1] Registrar en `research.md` el resultado de T015 y T016 y comprobar que no hay estado en el repositorio: `git ls-files` no debe listar ningún `*.tfstate*`, `*.tfplan`, `*.tfvars` ni `.terraform/`, y `git status` solo muestra `backend.tf` como archivo nuevo. Depende de T016.

**Checkpoint**: el estado remoto existe, está protegido y se puede usar con bloqueo. US1 funciona por sí sola.

---

## Phase 4: User Story 2 - Crear el servicio de identidad conforme al contrato (Priority: P1)

**Goal**: el responsable crea el grupo de usuarios de Cognito con su cliente, y el usuario de la aplicación con su único permiso, configurados como exige el contrato de la 002.

**Independent Test**: escenario 2 de [quickstart.md](quickstart.md): las pruebas del contrato pasan, el plan se aplica y una segunda ejecución propone 0 cambios.

### Tests for User Story 2 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T018 [US2] Crear `infra/modules/identity/tests/identity.tftest.hcl` con `mock_provider "aws" {}`, `command = plan`, variables `environment = "dev"` y `protect_user_pool = true`, y `override_resource` con `override_during = plan` para fijar el ARN del grupo de usuarios (la política del usuario depende de él). Una ejecución por punto de [contracts/identity-service.md](contracts/identity-service.md), con estas aserciones literales: `username_attributes` es `["email"]` y `username_configuration.case_sensitive` es `false`; `admin_create_user_config.allow_admin_create_user_only` es `false`; `auto_verified_attributes` es `["email"]` y `verification_message_template.default_email_option` es `CONFIRM_WITH_CODE`; los atributos obligatorios son exactamente `email` y `name`; `password_policy` tiene `minimum_length = 8`, `require_uppercase = true`, `require_lowercase = false`, `require_numbers = false` y `require_symbols = false`; `mfa_configuration` es `OFF`; `email_configuration.email_sending_account` es `COGNITO_DEFAULT`; `deletion_protection` es `ACTIVE`; el cliente tiene `generate_secret = true`, `explicit_auth_flows` igual a `["ALLOW_USER_PASSWORD_AUTH"]` (sin `ALLOW_REFRESH_TOKEN_AUTH`), `prevent_user_existence_errors = "ENABLED"`, `id_token_validity = 5` con `token_validity_units.id_token = "minutes"` y `allowed_oauth_flows_user_pool_client = false`; y la política del usuario `medicia-dev-app`, decodificada, tiene una sola declaración con una sola acción, `cognito-idp:AdminSetUserPassword`, y un solo recurso, el ARN del grupo. Otra ejecución con `protect_user_pool = false` comprueba que `deletion_protection` pasa a `INACTIVE`. Debe fallar mientras no exista el código.

### Implementation for User Story 2

- [X] T019 [P] [US2] Crear `infra/modules/identity/terraform.tf` con `required_version = "~> 1.15"` y `aws` `~> 6.72`.
- [X] T020 [P] [US2] Crear `infra/modules/identity/variables.tf`: `environment` (string, con validación para que solo acepte `dev` por ahora) y `protect_user_pool` (bool, por defecto `true`), con tipo y descripción.
- [X] T021 [US2] Crear `infra/modules/identity/main.tf` con: `aws_cognito_user_pool.this` (nombre `medicia-${var.environment}`, `user_pool_tier = "ESSENTIALS"`, `username_attributes = ["email"]`, `username_configuration { case_sensitive = false }`, `auto_verified_attributes = ["email"]`, `mfa_configuration = "OFF"`, `deletion_protection = var.protect_user_pool ? "ACTIVE" : "INACTIVE"`, `admin_create_user_config { allow_admin_create_user_only = false }`, `verification_message_template { default_email_option = "CONFIRM_WITH_CODE" }`, `email_configuration { email_sending_account = "COGNITO_DEFAULT" }`, `password_policy` con `minimum_length = 8`, `require_uppercase = true`, `require_lowercase = false`, `require_numbers = false` y `require_symbols = false`, `account_recovery_setting` con `verified_email` y prioridad 1, dos bloques `schema` para `email` y `name` con `attribute_data_type = "String"`, `required = true`, `mutable = true` y `string_attribute_constraints` de `min_length = "0"` y `max_length = "2048"`, y `lifecycle { prevent_destroy = true }`); `aws_cognito_user_pool_client.app` (`generate_secret = true`, `explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]`, `prevent_user_existence_errors = "ENABLED"`, `id_token_validity = 5`, `access_token_validity = 5`, `refresh_token_validity = 60`, `token_validity_units` con `id_token = "minutes"`, `access_token = "minutes"` y `refresh_token = "minutes"`, `enable_token_revocation = true`, `allowed_oauth_flows_user_pool_client = false`); `aws_iam_user.app` (`medicia-${var.environment}-app`); `aws_iam_user_policy.app` con `jsonencode`, una sola declaración `Allow` con la acción `cognito-idp:AdminSetUserPassword` y el recurso `aws_cognito_user_pool.this.arn`; y `aws_iam_access_key.app`. NO crear `aws_cognito_user_pool_domain`, proveedores de identidad externos ni otro cliente (FR-010). Depende de T019 y T020.
- [X] T022 [P] [US2] Crear `infra/modules/identity/outputs.tf` con `region`, `user_pool_id`, `user_pool_arn` y `user_pool_client_id` (no sensibles) y `user_pool_client_secret`, `app_access_key_id` y `app_secret_access_key` con `sensitive = true`, todas con tipo y descripción. `region` sale de `data "aws_region"`; agregar ese data source a `main.tf` es parte de esta tarea.
- [X] T023 [P] [US2] Crear `infra/environments/dev/terraform.tf` (igual que en el arranque) y `infra/environments/dev/providers.tf` con `region = "sa-east-1"`, `allowed_account_ids = ["896618135592"]` y los mismos `default_tags` de T010.
- [X] T024 [P] [US2] Crear `infra/environments/dev/backend.tf` con el backend `s3`: `bucket = "medicia-tfstate-dev-896618135592"`, `key = "environments/dev/terraform.tfstate"`, `region = "sa-east-1"`, `encrypt = true` y `use_lockfile = true`.
- [X] T025 [US2] Crear `infra/environments/dev/main.tf` con `module "identity"` (`source = "../../modules/identity"`, `environment = "dev"`) y `infra/environments/dev/outputs.tf` que repite las seis salidas del módulo, con `sensitive = true` en las tres sensibles. Depende de T022.
- [X] T026 [US2] Ejecutar `terraform -chdir=infra/modules/identity init -backend=false`, `fmt`, `validate` y `test`: las pruebas de T018 deben pasar. Ejecutar `terraform -chdir=infra/environments/dev init -backend=false`, `fmt` y `validate`, y `providers lock -platform=linux_amd64 -platform=windows_amd64` en `infra/environments/dev`. Depende de T018 a T025.
- [X] T027 [Responsable] Crear el servicio: `terraform -chdir=infra/environments/dev init`, `terraform -chdir=infra/environments/dev plan` (revisar que crea el grupo, el cliente, el usuario, su política y su clave, y nada más) y `terraform -chdir=infra/environments/dev apply`. Depende de T026 y de T016.
- [X] T028 [Responsable] Comprobar el resultado: `terraform -chdir=infra/environments/dev plan` informa 0 cambios (SC-002); en la consola de Cognito hay un solo grupo y un solo cliente, sin dominio; el usuario `medicia-dev-app` tiene una única acción permitida. Si el plan propone cambios en cada ejecución (por ejemplo, por el bloque `schema`), detenerse y avisar para corregirlo antes de seguir.
- [X] T029 [US2] Registrar en `research.md` el resultado de T027 y T028 en la sección "Pendiente de verificar al implementar" (esquema sin cambios perpetuos, nivel `ESSENTIALS`). Si algún resultado contradice el plan, volver a `speckit-plan`. Depende de T028.

**Checkpoint**: el servicio de identidad existe y cumple el contrato. US1 y US2 juntas son el producto mínimo.

---

## Phase 5: User Story 3 - Conectar la aplicación sin guardar secretos en el repositorio (Priority: P2)

**Goal**: la aplicación inicia en modo `cognito` con los datos de conexión que entrega Terraform, sin que ninguno quede en archivos versionados.

**Independent Test**: escenario 3 de [quickstart.md](quickstart.md): con las variables cargadas en `.env.local`, la aplicación inicia con el servicio real, y una búsqueda de secretos en los archivos versionados no encuentra nada.

### Implementation for User Story 3

- [X] T030 [Responsable] Consultar los datos de conexión y escribirlos en `.env.local` (los agentes no escriben `.env*`). Libres: `terraform -chdir=infra/environments/dev output region`, `user_pool_id` y `user_pool_client_id`. Sensibles, de a uno y solo en tu terminal: `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret`, `app_access_key_id` y `app_secret_access_key`. Variables a escribir: `IDENTITY_PROVIDER=cognito`, `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`, `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY`. No pegar ningún valor en un chat, un registro ni un commit. Depende de T028.
- [ ] T031 [Responsable] (opcional) Documentar `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` como comentarios en `.env.example`, que los agentes no pueden escribir. Aclarar que solo se usan con `IDENTITY_PROVIDER=cognito` y que en producción se reemplazan por un rol del servidor.
- [X] T032 [Responsable] Con `npm run dev` corriendo y la aplicación en modo `cognito`, recorrer el escenario 4 de [quickstart.md](quickstart.md) (SC-006): registrarse con un correo real y recibir el código de 6 dígitos, verificar y elegir la contraseña repetida, ingresar y ver el estado vacío de la 002, recuperar la contraseña y cerrar sesión. Anotar tres resultados: si el SDK funciona sin credenciales de AWS para las operaciones públicas (R3 de la 002), cómo responde una cuenta sin verificar (R4) y si la cookie `Secure` funciona en `http://localhost` (R10). Depende de T030.
- [X] T033 [US3] Con los resultados de T032, registrar en `specs/002-ingreso-sesion/research.md` los puntos marcados **a verificar** (R3, R4 y R10), y marcar como completas T072, T080 y T083 en `specs/002-ingreso-sesion/tasks.md` con una referencia a esta funcionalidad (T080: permiso `cognito-idp:AdminSetUserPassword` por T021; T083: política de contraseña por T021). Si algún resultado contradice el plan de la 002, volver a `speckit-plan` de esa funcionalidad.
- [X] T034 [US3] Comprobar que no hay secretos en los archivos versionados con una búsqueda por patrón (sin conocer el valor): identificadores de clave de acceso (`AKIA` seguido de 16 caracteres), claves privadas (el encabezado `BEGIN` de una clave privada) y los archivos prohibidos de T017. Buscar solo en `infra/`, `.github/` y los archivos de configuración de la raíz, no en `specs/`, que describe esos patrones. Si hay una coincidencia, corregirla antes de seguir (SC-004). Depende de T030.

**Checkpoint**: el ingreso real de la 002 funciona contra el servicio creado, y las pendientes de la 002 quedan cerradas.

---

## Phase 6: User Story 4 - Revisar cada cambio de infraestructura antes de aplicarlo (Priority: P2)

**Goal**: cada cambio de `infra/` pasa por formato, validación, análisis de seguridad, pruebas y un plan de solo lectura antes de llegar a `main`, y ninguna automatización aplica cambios.

**Independent Test**: escenario 5 de [quickstart.md](quickstart.md): una propuesta de prueba con un permiso `"*"` o con un secreto falla las comprobaciones, y un cambio que reemplaza el grupo de usuarios es frenado.

### Tests for User Story 4 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T035 [US4] Crear `infra/bootstrap/tests/access.tftest.hcl` con `mock_provider "aws" {}` y `command = plan`. Aserciones sobre el rol `medicia-dev-plan`: la política de confianza, decodificada, tiene la acción `sts:AssumeRoleWithWebIdentity`, el principal federado es el proveedor de GitHub, la condición `StringEquals` fija `token.actions.githubusercontent.com:aud` en `sts.amazonaws.com` y `token.actions.githubusercontent.com:sub` en `repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request`, sin comodines; los permisos solo contienen acciones que empiezan con `Describe`, `Get` o `List` más `s3:GetObject` y `s3:ListBucket` limitados al bucket del estado (ningún `Put`, `Delete`, `Create` ni `*`). Sobre la política del operador: ninguna declaración con acción `*` o con servicio `*`, y los recursos IAM limitados al prefijo `medicia-dev-`. Para poder decodificar las políticas en el plan, los ARN del proveedor de GitHub, del bucket y de los recursos con prefijo se construyen con cadenas conocidas (por ejemplo `arn:aws:iam::${var.account_id}:oidc-provider/token.actions.githubusercontent.com`) y no con atributos de otros recursos. Debe fallar mientras no exista el código.

### Implementation for User Story 4

- [X] T036 [US4] Crear `infra/bootstrap/github-oidc.tf` con: `aws_iam_openid_connect_provider.github` (`url = "https://token.actions.githubusercontent.com"`, `client_id_list = ["sts.amazonaws.com"]`); `aws_iam_role.plan` llamado `medicia-${var.environment}-plan` con la confianza de T035 (valor del `sub` en una variable `github_oidc_subject` de `variables.tf`, con la descripción de cómo se confirma, R10); y `aws_iam_role_policy.plan_read` con `jsonencode`: `s3:ListBucket` sobre el bucket del estado, `s3:GetObject` sobre `environments/dev/*` del estado, y las acciones `Describe*`, `Get*` y `List*` de `cognito-idp` y de `iam` que usa el refresco de los recursos de esta funcionalidad. Sin la política administrada `ReadOnlyAccess` (R10). Depende de T035.
- [X] T037 [US4] Crear `infra/bootstrap/operator-policy.tf` con `aws_iam_policy.operator` llamada `medicia-${var.environment}-terraform-operator`: lectura, escritura y borrado de objetos del bucket del estado (incluye los `.tflock`); `cognito-idp:*` limitado a grupos de la región y la cuenta; gestión de usuarios, políticas en línea y claves IAM con prefijo `medicia-dev-`, y del rol y el proveedor de GitHub de T036. Sin acciones ni servicios `*` (T035). Es el punto de partida: se ajusta en T046. Depende de T036.
- [X] T038 [US4] Agregar a `infra/bootstrap/outputs.tf` las salidas `plan_role_arn` y `operator_policy_arn`, con tipo y descripción. Depende de T036 y T037.
- [X] T039 [US4] Ejecutar en `infra/bootstrap` `terraform init -backend=false`, `fmt`, `validate` y `test` (deben pasar las pruebas de T007 y T035). Depende de T035 a T038.
- [X] T040 [US4] Crear `.github/workflows/infra.yml` según [contracts/ci-and-access.md](contracts/ci-and-access.md): disparadores `pull_request` y `push` a `main`, solo con cambios en `infra/**` o en el propio flujo, `permissions: contents: read` y concurrencia por rama. Trabajo `static` sin credenciales de AWS: `hashicorp/setup-terraform@v4` con Terraform `1.15.1`; `terraform fmt -check -recursive infra`; `terraform init -backend=false` y `validate` en `infra/bootstrap`, `infra/environments/dev` y `infra/modules/identity`; `tflint --init` y `tflint` en cada directorio; `terraform test` en el módulo y en `infra/bootstrap`; `aquasecurity/trivy-action@v0.36.0` con `trivy config` y `trivy fs --scanners secret` sobre `infra`; una comprobación de archivos prohibidos (`git ls-files` con `*.tfstate*`, `*.tfplan`, `*.tfvars*`, `.terraform/`, patrón `AKIA` y claves privadas, buscados solo en `infra/` y `.github/`, y con los patrones escritos con clases de caracteres, como `[-]{5}BEGIN`, para que el propio flujo no se encuentre a sí mismo); una guarda del contrato que falla si `infra/` contiene una declaración `resource "aws_cognito_user_pool_domain"` o `resource "aws_cognito_identity_provider"`, o más de una `resource "aws_cognito_user_pool_client"`; la comprobación de que cada raíz tenga su `.terraform.lock.hcl` versionado; una guarda que falla si algún archivo de `.github/workflows/` contiene `terraform apply`, `terraform destroy`, `terraform import` o `terraform state` (FR-018, SC-005), con los patrones escritos como `terraform[[:space:]]+apply` para que no coincidan con la propia guarda; y una guarda de etiquetas que falla si el `providers.tf` de `infra/bootstrap` o de `infra/environments/dev` no declara `default_tags` con `Project`, `Environment` y `ManagedBy` (FR-016). Trabajo `plan` después de `static`, con `if: github.event.pull_request.head.repo.full_name == github.repository`, `permissions: contents: read` e `id-token: write`: `aws-actions/configure-aws-credentials@v6` con `role-to-assume: ${{ vars.INFRA_PLAN_ROLE_ARN }}` y `aws-region: sa-east-1`; un paso que muestre el valor del `sub` de la sesión; `terraform init` y `terraform plan -lock=false -input=false` en `infra/environments/dev`; y el plan volcado en `GITHUB_STEP_SUMMARY`. Ningún paso de `apply`, `destroy`, `import` ni `state`, y ningún secreto de GitHub con claves de AWS (FR-018). Depende de T039.
- [X] T041 [US4] Crear `infra/.trivyignore` con las excepciones justificadas de R3 y R11 (SSE-S3 en lugar de una clave propia de KMS, y sin registro de accesos del bucket en desarrollo), cada una con un comentario que explique el motivo. Si `trivy` está instalado (T004), ejecutar `trivy config infra` para ver los hallazgos reales; si no, ajustar el archivo con la primera ejecución de CI (T044). Depende de T040.
- [X] T042 [Responsable] Aplicar el acceso de CI y la política del operador: `terraform -chdir=infra/bootstrap plan`, revisar que solo agrega el proveedor de GitHub, el rol de plan, la política del operador y sus salidas, y `terraform -chdir=infra/bootstrap apply`. Depende de T039 y de T016.
- [X] T043 [Responsable] Crear la variable del repositorio `INFRA_PLAN_ROLE_ARN` (Settings → Secrets and variables → Actions → Variables, pestaña Variables) con el valor de `terraform -chdir=infra/bootstrap output -raw plan_role_arn`. No es un secreto. Depende de T042.
- [X] T044 [Responsable] Abrir una propuesta de cambio de prueba que toque `infra/` y comprobar el escenario 5 de [quickstart.md](quickstart.md): corren `static` y `plan`, el plan aparece en el resumen y el `sub` impreso coincide con el configurado. Si difiere, avisar para corregir juntos `github_oidc_subject` en `infra/bootstrap/variables.tf` y la aserción del `sub` en `infra/bootstrap/tests/access.tftest.hcl` (T035), y repetir T042. Si el plan falla por permisos que faltan al rol, avisar para agregarlos en T036. Depende de T040 a T043.
- [X] T045 [Responsable] Pruebas negativas del escenario 5, en propuestas de cambio descartables: (a) un permiso con `"*"` en la política de la aplicación debe hacer fallar `trivy` o las pruebas; (b) un archivo con un patrón de clave de acceso debe hacer fallar la comprobación de archivos prohibidos; (c) un cambio que reemplaza el grupo de usuarios debe quedar frenado por `prevent_destroy`; (d) una propuesta desde un fork debe omitir el trabajo `plan`. Registrar el resultado en `research.md`. Depende de T044.
- [X] T046 [Responsable] Reducir los permisos de `terraform-dev`: asignarle la política `medicia-dev-terraform-operator` (con `terraform -chdir=infra/bootstrap output -raw operator_policy_arn`), correr un `plan` de `infra/environments/dev` y de `infra/bootstrap` con ella, y solo si ambos funcionan retirar `AdministratorAccess`. Si falta algún permiso, avisar para ajustar `infra/bootstrap/operator-policy.tf` y repetir; hasta entonces se conserva `AdministratorAccess` con MFA. Depende de T042.

**Checkpoint**: las cuatro historias funcionan. Cada propuesta de cambio de `infra/` pasa por las comprobaciones y nada se aplica por una automatización.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: guía de operación, documentación del proyecto, revisión final y comprobaciones de costo.

- [X] T047 Crear `infra/README.md` en español rioplatense (FR-021) con las secciones: requisitos previos de la cuenta y sus comprobaciones de solo lectura; arranque en dos fases; uso diario (`plan` y `apply` del entorno, y qué corre en CI); conexión de la aplicación (las siete variables y los comandos `terraform output -raw`); recreación desde cero (incluye quitar `backend.tf` para volver a la fase 1 del arranque); desbloqueo del estado con `terraform force-unlock` y cómo comprobar antes que no hay una operación en curso; qué hacer si se pierde el secreto del cliente (crear uno nuevo sin perder las cuentas); rotación de la clave de la aplicación con `terraform apply -replace=module.identity.aws_iam_access_key.app`; liberación de recursos al terminar, quitando a propósito `prevent_destroy` y poniendo `protect_user_pool = false`; el tope diario bajo del correo por defecto; la advertencia de que el estado contiene secretos; la regla de que las actualizaciones de Terraform y de los proveedores van en cambios separados de los funcionales (FR-015); y una sección de solución de problemas que explica que con credenciales vencidas o ausentes los comandos fallan con un mensaje claro sin dejar cambios a medias, cómo renovar la sesión del perfil `medicia-dev` y cómo comprobarla con `aws sts get-caller-identity`. Cada comando que modifica infraestructura real se marca como del responsable.
- [X] T048 [P] Actualizar `memory/project-structure.md` para que el árbol de `infra/` refleje el diseño real (`bootstrap/`, `modules/identity/`, `environments/dev/`) y agregar `.github/workflows/infra.yml`.
- [X] T049 [P] Actualizar `memory/architecture.md`, sección "Infraestructura como código": el flujo de CI de `infra/` (comprobaciones estáticas y plan de solo lectura por OIDC), el acceso al estado y que el estado contiene secretos. Sin tablas: usar listas.
- [ ] T050 Ejecutar la comprobación final desde la raíz: `terraform fmt -check -recursive infra`, y `init -backend=false`, `validate` y `test` en `infra/bootstrap`, `infra/modules/identity` e `infra/environments/dev`; confirmar que cada raíz tiene su `.terraform.lock.hcl` y que `npm run check` sigue en verde (no se tocó código de la aplicación). Depende de T047 a T049.
- [ ] T051 Ejecutar la skill `review-changes` sobre los cambios de `infra/` y del flujo de CI (revisora de infraestructura y revisora de seguridad). Corregir los hallazgos bloqueantes que estén dentro del alcance, volver a ejecutar T050 y repetir una sola vez la revisora afectada. Informar lo que quede pendiente. Depende de T050.
- [ ] T052 [Responsable] (opcional) Simulacro de recreación (SC-001): en una cuenta o un entorno descartable, seguir solo `infra/README.md` y medir que se llega al servicio creado en menos de 30 minutos, sin ningún paso no documentado. Depende de T047.
- [ ] T053 [Responsable] Una semana después de aplicar, comprobar en Facturación que el gasto del entorno de desarrollo es menor a 1 USD (SC-007) y anotar en `spec.md` (supuesto "Cuenta de desarrollo") la fecha de vencimiento de los créditos que muestra la página de Créditos. Depende de T027.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de nada del código. Bloquea los pasos del responsable que crean recursos (T015 en adelante).
- **US1 (Phase 3)**: el código (T007 a T014) depende de Setup. T015 y T016 dependen de Foundational (T006).
- **US2 (Phase 4)**: el código (T018 a T026) puede escribirse en paralelo con US1, porque solo hace referencia al nombre del bucket. Aplicarlo (T027) depende de T016.
- **US3 (Phase 5)**: depende de T028 (servicio creado y comprobado).
- **US4 (Phase 6)**: el código (T035 a T041) depende de US1 y puede escribirse en paralelo con US2. Aplicarlo (T042) depende de T016. La verificación en CI (T044 a T045) depende de T040 a T043 y de T028 (el plan necesita el entorno aplicado).
- **Polish (Phase 7)**: depende de todas las historias.

### Within Each User Story

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Las pruebas de Terraform viven junto a su módulo o raíz, en `infra/**/tests/`, según la excepción de la constitución v1.6.1.
- Archivos de versiones y variables antes de los recursos; recursos antes de las salidas; salidas antes del entorno que las repite.
- Las tareas sobre el mismo archivo van en orden: `infra/bootstrap/outputs.tf` (T012, T038) y `infra/bootstrap/variables.tf` (T009, T036).
- Los pasos del responsable (T015, T016, T027, T028, T042 a T046) se ejecutan en el orden indicado: cada `apply` depende de que el plan anterior se haya revisado.

### Parallel Opportunities

- **Setup:** T002 y T003 en paralelo.
- **US1:** T008, T009, T012 y T013 en paralelo (archivos distintos); T011 después de T008 y T010.
- **US2:** T019, T020, T022, T023 y T024 en paralelo; T021 después de T019 y T020; T025 después de T022.
- **US1 y US2:** todo el código de ambas puede escribirse a la vez.
- **Polish:** T048 y T049 en paralelo.

### Parallel Example: US2

```text
Task: "Crear infra/modules/identity/terraform.tf"        (T019)
Task: "Crear infra/modules/identity/variables.tf"       (T020)
Task: "Crear infra/modules/identity/outputs.tf"         (T022)
Task: "Crear infra/environments/dev/terraform.tf y providers.tf" (T023)
Task: "Crear infra/environments/dev/backend.tf"         (T024)
```

---

## Implementation Strategy

### MVP First (US1 y US2)

1. Completar Setup y Foundational.
2. Completar US1: bucket del estado y migración.
3. Completar US2: servicio de identidad creado y con el contrato verificado.
4. **Detenerse y validar:** las pruebas de contrato pasan y el plan del entorno propone 0 cambios.

### Incremental Delivery

1. US1 + US2 → el servicio de identidad existe y cumple el contrato (producto mínimo).
2. US3 → la aplicación ingresa de verdad contra el servicio; se cierran las pendientes de la 002.
3. US4 → cada cambio futuro de `infra/` queda revisado por CI y por la revisora.
4. Polish → guía, documentación del proyecto y revisión final.

### Puntos de commit sugeridos

- Al terminar Setup (T001 a T003).
- Al terminar el código de US1 (T014), antes de aplicar nada.
- Después de T017: resultado del arranque y `backend.tf` migrado.
- Al terminar el código de US2 (T026), antes de aplicar.
- Después de T029: resultado del servicio creado.
- Después de T034: cierre de US3 y de las pendientes de la 002.
- Al terminar el código de US4 (T041), antes de aplicar el acceso de CI.
- Después de T046: cierre de US4, con las correcciones que haya pedido el flujo.
- Con las correcciones de `review-changes`, al final.

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] relaciona cada tarea con la historia de la spec.
- Ningún `apply`, `destroy`, `import` ni `state` lo ejecuta el agente: siempre se detiene e indica el comando.
- No pegar secretos en el chat ni en registros: los valores sensibles se consultan solo en la terminal del responsable.
- Si un resultado real contradice una decisión de `research.md`, se vuelve a `speckit-plan` antes de seguir.
- Evitar tareas vagas, conflictos en un mismo archivo y dependencias entre historias que rompan su independencia.
