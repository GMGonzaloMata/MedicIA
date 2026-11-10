---

description: "Lista de tareas de la infraestructura base de SageMaker"
---

# Tasks: Infraestructura base de SageMaker

**Input**: Documentos de diseño en `/specs/004-infra-sagemaker-modelos/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos. La spec exige comprobaciones automáticas sobre el plan, sin crear recursos (FR-013, FR-018, SC-004, SC-006). Son pruebas `terraform test` en modo `plan`, con proveedor simulado, que corren sin credenciales.

**Organization**: Las tareas se agrupan por historia de usuario. Antes de ellas hay una fase fundacional, porque ningún recurso nuevo puede crearse hasta que un administrador aplique los permisos de `infra/bootstrap` (límite nuevo, política del operador y lectura del plan). Orden: **Fundacional → US1 → US2 → US3 → US4**. US2 necesita el bucket de US1 (el rol lee de él), US3 necesita el rol de US2 y el bucket de US1, y US4 (CI, guía y revisión) cierra sobre el código ya escrito.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US4).
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal o en la consola de AWS. El agente no corre `git commit`, `terraform apply`, `terraform destroy`, `terraform import` ni `terraform state`: se detiene en esa tarea e indica el comando exacto. Sí puede correr `terraform init -backend=false`, `fmt`, `validate`, `test` y `providers lock`. `terraform plan` y los comandos de AWS los corre el responsable, porque necesitan credenciales.
- **[Administrador]**: lo hace el responsable con el perfil de administración (usuario raíz con MFA o un administrador), por la vía de "Cambiar los permisos del operador" de `infra/README.md`, porque el operador no puede editar sus propias políticas.

## Path Conventions

- Todo el código vive en `infra/`, según [plan.md](plan.md). No se toca `src/` ni `tests/`.
- Los comandos se ejecutan desde la raíz del repositorio con `-chdir=<carpeta>` y el perfil `medicia-dev` (`$env:AWS_PROFILE = "medicia-dev"` en PowerShell).
- Estilo: guía de HashiCorp (`terraform-style-guide`): archivos estándar, dos espacios, nombres en minúscula con guion bajo, variables y salidas con tipo y descripción. Ningún archivo `.tf` contiene secretos. Las pruebas viven en la carpeta `tests/` de su módulo o raíz.
- Archivos de bloqueo: `terraform providers lock -platform=linux_amd64 -platform=windows_amd64`, como en la 003.
- **Puntos de commit:** al cerrar cada fase el agente se detiene y avisa que es un buen momento para que el responsable haga `git commit` (el agente no lo ejecuta).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: leer las guías y comprobar el punto de partida.

- [X] T001 Leer, antes de escribir HCL: las skills `terraform-style-guide`, `terraform-skill` (referencias de seguridad y de pruebas) y `terraform-test`; `.agents/reviewers/infrastructure.md`; los archivos de la 003 que se extienden: `infra/bootstrap/operator-policy.tf`, `infra/bootstrap/permissions-boundary.tf`, `infra/bootstrap/github-oidc.tf`, `infra/bootstrap/state-bucket.tf`, `infra/bootstrap/tests/access.tftest.hcl`, `infra/modules/identity/tests/identity.tftest.hcl` y `infra/README.md`; y [research.md](research.md) y los dos contratos de esta funcionalidad.
- [X] T002 [P] Comprobar que `terraform version` informa 1.15.x y que `terraform -chdir=infra/bootstrap init -backend=false` y `terraform -chdir=infra/bootstrap test` pasan sin cambios (punto de partida limpio de la 003). Si algo falla, detenerse y avisar.
- [ ] T003 [Responsable] Con el perfil `medicia-dev`, ejecutar `terraform -chdir=infra/bootstrap plan` y `terraform -chdir=infra/environments/dev plan`: ambos deben informar 0 cambios antes de empezar. Confirmar que el presupuesto `medicia-dev-mensual` sigue activo (`aws budgets describe-budgets --account-id 896618135592`).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: los permisos de `infra/bootstrap` que bloquean todo lo demás: política límite del rol de ejecución, política del operador acotada y lectura del plan de CI (R3, R4, R5). Cubre las historias 2 y 4 en lo que tienen de permisos, y se aplica antes que cualquier recurso nuevo.

**⚠️ CRÍTICO**: sin esta fase aplicada por un administrador, el operador no puede crear el bucket ni el rol, y el plan de CI falla.

### Tests ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T004 [P] Crear `infra/bootstrap/tests/sagemaker-boundary.tftest.hcl` con `mock_provider "aws" {}` y `command = plan`. Aserciones sobre `jsondecode(aws_iam_policy.sagemaker_boundary.policy)`: el nombre es `medicia-dev-sagemaker-boundary`; hay exactamente tres declaraciones, todas `Allow` (leer objetos, listar el bucket y escribir registros, porque cada una apunta a un recurso distinto); las acciones de S3 son exactamente `s3:GetObject` (recurso `arn:aws:s3:::medicia-models-dev-896618135592/*`) y `s3:ListBucket` (recurso `arn:aws:s3:::medicia-models-dev-896618135592`); las acciones de registros son exactamente `logs:CreateLogGroup`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre `arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*` y `arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*:*`; ninguna acción contiene `*`; ningún recurso es `*`; no hay otros servicios. Una ejecución comprueba que `length(aws_iam_policy.sagemaker_boundary.policy)` y `length(aws_iam_policy.boundary.policy)` son menores a 6144 (límite de IAM para una política administrada; ver "Pendientes de verificar" en `research.md`). Esta lista de acciones es la misma que fijará la prueba del módulo del rol (T023); mantenerlas iguales. Debe fallar mientras no exista el código.
- [X] T005 [P] Ampliar `infra/bootstrap/tests/access.tftest.hcl`, siguiendo su estilo, con una ejecución por punto: (a) la política del operador tiene una declaración `Allow` con `iam:CreateRole`, `iam:PutRolePolicy` y `iam:PutRolePermissionsBoundary` solo sobre `arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution` con la condición `iam:PermissionsBoundary` igual a `arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary`; (b) la declaración existente `CrearRolesIamConLimite` sigue con la condición igual al valor único `arn:aws:iam::896618135592:policy/medicia-dev-boundary` (no una lista); (c) el bucket `arn:aws:s3:::medicia-models-dev-896618135592` figura en la lista de recursos de `GestionarElBucketDelEstado` (sin acciones nuevas en esa declaración) y existe una declaración corta aparte sobre él con exactamente `s3:CreateBucket`, `s3:DeleteBucket`, `s3:DeleteBucketPolicy`, `s3:PutBucketOwnershipControls`, `s3:PutBucketPolicy` y `s3:PutBucketPublicAccessBlock`; ninguna acción de S3 de esas declaraciones es comodín; (i) `length(aws_iam_policy.operator.policy)` es menor a 6144 (tope de una política administrada); (d) las acciones sobre `arn:aws:s3:::medicia-models-dev-896618135592/*` son exactamente `s3:GetObject`, `s3:GetObjectVersion` y `s3:PutObject`; (e) ninguna declaración `Allow` del operador contiene `s3:DeleteObject`, `s3:DeleteObjectVersion`, `iam:PassRole` ni acciones `sagemaker:`; (f) el `Deny` de `ProtegerLasPoliticasDeAcceso` incluye el ARN de `medicia-dev-sagemaker-boundary` además de los dos existentes; (g) la política del rol de plan tiene, además de lo existente, una declaración sobre el bucket de modelos y otra sobre `role/medicia-dev-sagemaker-execution` cuyas acciones empiezan todas con `s3:Get`, `s3:List`, `iam:Get` o `iam:List` y ninguna contiene `*`; (h) `aws_iam_policy.boundary` incluye esas mismas declaraciones de lectura (fuente única). Debe fallar mientras no se modifique el código.

### Implementation

- [X] T006 Modificar `infra/bootstrap/locals.tf`: agregar `models_bucket_name` igual a `"medicia-models-${var.environment}-${var.account_id}"`, `models_bucket_arn` igual a `"arn:aws:s3:::${local.models_bucket_name}"`, `execution_role_arn` igual a `"arn:aws:iam::${var.account_id}:role/medicia-${var.environment}-sagemaker-execution"` y `sagemaker_boundary_policy_arn` igual a `"arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-sagemaker-boundary"`. Todos se arman con cadenas conocidas, no con atributos de recursos, como los existentes. Comentar que el nombre del bucket y del rol deben coincidir con los de `infra/modules/model-artifacts` y `infra/modules/sagemaker-execution-role`.
- [X] T007 Crear `infra/bootstrap/sagemaker-boundary.tf`: un valor local `execution_role_statements` (fuente única de los permisos del rol, con las tres declaraciones de T004 y `Sid` `LeerArtefactosDeModelos` y `EscribirRegistrosDePuntosDeInferencia`) y `aws_iam_policy.sagemaker_boundary` con nombre `medicia-${var.environment}-sagemaker-boundary`, una descripción fija (cambiarla fuerza reemplazar la política, como indica el comentario de `operator-policy.tf`) y `policy = jsonencode({ Version = "2012-10-17", Statement = local.execution_role_statements })`. Comentario de cabecera: es el techo solo del rol de ejecución, y distinto de `medicia-dev-boundary`. Depende de T006.
- [X] T008 Modificar `infra/bootstrap/operator-policy.tf` según [contracts/access-and-permissions.md](contracts/access-and-permissions.md): (1) sumar `local.models_bucket_arn` a la lista `Resource` de `GestionarElBucketDelEstado` (cambiar su `Sid` a `GestionarLosBucketsDeEstadoYModelos` y ajustar las pruebas existentes que lo citen) sin tocar sus acciones, y agregar aparte la declaración corta `CrearYConfigurarElBucketDeModelos` sobre `local.models_bucket_arn` con exactamente `s3:CreateBucket`, `s3:DeleteBucket`, `s3:DeleteBucketPolicy`, `s3:PutBucketOwnershipControls`, `s3:PutBucketPolicy` y `s3:PutBucketPublicAccessBlock` (así la política del operador no supera el tope de 6.144 caracteres); (2) agregar `SubirYLeerArtefactosDeModelos` sobre `"${local.models_bucket_arn}/*"` con exactamente `s3:GetObject`, `s3:GetObjectVersion` y `s3:PutObject` (sin borrado); (3) agregar `CrearElRolDeEjecucionConSuLimite` con `iam:CreateRole`, `iam:PutRolePolicy` y `iam:PutRolePermissionsBoundary` sobre `local.execution_role_arn` y la condición `StringEquals` de `iam:PermissionsBoundary` con `local.sagemaker_boundary_policy_arn`; (4) agregar `local.sagemaker_boundary_policy_arn` a los recursos del `Deny` `ProtegerLasPoliticasDeAcceso`; (5) no tocar `CrearRolesIamConLimite`, no agregar `iam:PassRole` ni acciones de `sagemaker:`, y no cambiar la descripción de la política. Actualizar el comentario de cabecera con el límite nuevo. Depende de T006 y T007.
- [X] T009 Modificar `infra/bootstrap/github-oidc.tf`: agregar a `local.plan_read_statements` la declaración `LeerElBucketDeModelos` (`s3:ListBucket` y las `s3:Get*` enumeradas de configuración del bucket, sin `s3:GetObject`, sobre `local.models_bucket_arn`) y `LeerElRolDeEjecucion` (`iam:GetRole`, `iam:GetRolePolicy`, `iam:ListRolePolicies`, `iam:ListAttachedRolePolicies`, `iam:ListRoleTags` e `iam:ListInstanceProfilesForRole` sobre `local.execution_role_arn`). Como esa lista alimenta al rol de plan y a `medicia-dev-boundary`, el techo crece solo con estas lecturas (R4). Depende de T006.
- [X] T010 [P] Modificar `infra/bootstrap/outputs.tf`: agregar `sagemaker_boundary_policy_arn` y `models_bucket_name` (no sensibles, con tipo y descripción).
- [X] T011 Ejecutar `terraform -chdir=infra/bootstrap init -backend=false`, `fmt -recursive`, `validate` y `test`: las pruebas de T004 y T005 y las existentes deben pasar. Si la política límite supera 6144 caracteres, acortar acciones agrupando por prefijo común (nunca con comodines) y avisar. Depende de T004 a T010.
- [X] T012 [Administrador] Revisar el plan antes de aplicar: `terraform -chdir=infra/bootstrap plan` con el perfil de administración. Debe proponer **crear** `aws_iam_policy.sagemaker_boundary` y **cambiar en el lugar** la política del operador, `medicia-dev-boundary` y la política en línea del rol de plan (`lectura-del-plan`), y nada más; ninguna destrucción ni reemplazo. Si propone reemplazar la política del operador, detenerse y avisar (la descripción no debe haber cambiado). Depende de T011.
- [X] T013 [Administrador] Aplicar: `terraform -chdir=infra/bootstrap apply`, siguiendo "Cambiar los permisos del operador" de `infra/README.md`. Depende de T012.
- [X] T014 [Responsable] Comprobar con el perfil `medicia-dev`: `terraform -chdir=infra/bootstrap plan` informa 0 cambios, y `aws iam get-policy --policy-arn arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary` devuelve la política. Registrar el resultado y la fecha en `research.md`, sección "Pendientes de verificar", incluido el tamaño final de `medicia-dev-boundary`. Depende de T013.

**Checkpoint**: los permisos están aplicados. El operador puede crear el bucket y el rol, y el plan de CI puede leerlos. Punto de commit sugerido.

---

## Phase 3: User Story 1 - Crear el almacenamiento privado de artefactos de modelos (Priority: P1) 🎯 MVP

**Goal**: el responsable crea un bucket privado, cifrado, con versiones y protegido contra el borrado, para los artefactos de los modelos.

**Independent Test**: escenarios 1 y 3 de [quickstart.md](quickstart.md): las pruebas del módulo pasan, el bucket se crea, una segunda ejecución propone 0 cambios y el operador puede subir y leer pero no borrar un artefacto.

### Tests for User Story 1 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T015 [US1] Crear `infra/modules/model-artifacts/tests/model-artifacts.tftest.hcl` con `mock_provider "aws" {}`, `command = plan` y variables `environment = "dev"` y `account_id = "896618135592"`. Una ejecución por punto, con aserciones literales: el bucket se llama `medicia-models-dev-896618135592` con `force_destroy = false`; las cuatro opciones de `aws_s3_bucket_public_access_block` son `true`; `aws_s3_bucket_ownership_controls` tiene `object_ownership = "BucketOwnerEnforced"`; el versionado es `Enabled`; el cifrado por defecto es `AES256`; la regla de ciclo de vida vence las versiones no vigentes a los 90 días y aborta las cargas multiparte incompletas a los 7; la política del bucket, decodificada, tiene exactamente una declaración, de efecto `Deny`, sobre `s3:*`, con la condición `Bool` de `aws:SecureTransport` igual a `"false"`, sobre el bucket y sus objetos, y ninguna declaración `Allow` (sin acceso desde otras cuentas ni público); la salida `bucket_arn` es `arn:aws:s3:::medicia-models-dev-896618135592`. Otra ejecución con `environment = "prod"` espera el fallo de la validación de la variable (`expect_failures = [var.environment]`). Debe fallar mientras no exista el código.

### Implementation for User Story 1

- [X] T016 [P] [US1] Crear `infra/modules/model-artifacts/terraform.tf` con `required_version = "~> 1.15"` y `aws` `~> 6.72`, igual que el módulo `identity`.
- [X] T017 [P] [US1] Crear `infra/modules/model-artifacts/variables.tf` con `environment` (string, validación para que solo acepte `dev`) y `account_id` (string, validación con `^[0-9]{12}$`), con tipo y descripción. El bucket lleva el ID de cuenta en el nombre porque los nombres de bucket son globales.
- [X] T018 [US1] Crear `infra/modules/model-artifacts/main.tf`, siguiendo el patrón de `infra/bootstrap/state-bucket.tf`: `aws_s3_bucket.this` con `bucket = "medicia-models-${var.environment}-${var.account_id}"`, `force_destroy = false` y `lifecycle { prevent_destroy = true }`; `aws_s3_bucket_public_access_block.this` con las cuatro opciones en `true`; `aws_s3_bucket_ownership_controls.this` con `BucketOwnerEnforced`; `aws_s3_bucket_versioning.this` con `Enabled`; `aws_s3_bucket_server_side_encryption_configuration.this` con `AES256` y el mismo comentario de SSE-S3 frente a KMS (R2); `aws_s3_bucket_lifecycle_configuration.this` con la regla `vencer-versiones-no-vigentes` (90 días, `filter {}`) y `abort_incomplete_multipart_upload` de 7 días; y `aws_s3_bucket_policy.this` con `jsonencode`, una declaración `Deny` de `s3:*` sobre el bucket y `"${arn}/*"` cuando `aws:SecureTransport` es `false`, con ARN armados con el nombre conocido y `depends_on` del bloqueo de acceso público. Comentario de cabecera: solo artefactos de modelos, nunca datos de pacientes (FR-004). Depende de T016 y T017.
- [X] T019 [P] [US1] Crear `infra/modules/model-artifacts/outputs.tf` con `bucket_name` y `bucket_arn` (no sensibles, con tipo y descripción). `bucket_arn` se arma con el nombre conocido.
- [X] T020 [US1] Modificar `infra/environments/dev/main.tf`: agregar `module "model_artifacts"` con `source = "../../modules/model-artifacts"`, `environment = "dev"` y `account_id = "896618135592"`. Modificar `infra/environments/dev/outputs.tf`: agregar `models_bucket_name` con el valor del módulo. Depende de T019.
- [X] T021 [US1] Ejecutar `terraform -chdir=infra/modules/model-artifacts init -backend=false`, `fmt`, `validate` y `test` (las pruebas de T015 deben pasar), `terraform -chdir=infra/modules/model-artifacts providers lock -platform=linux_amd64 -platform=windows_amd64`, y `terraform -chdir=infra/environments/dev init -backend=false`, `validate` y `providers lock` con las mismas plataformas. Depende de T015 a T020.

**Checkpoint**: el módulo del bucket está probado y conectado. El bucket se crea junto con el rol en T029, porque comparten una sola aplicación. Punto de commit sugerido.

---

## Phase 4: User Story 2 - Crear el rol de ejecución de SageMaker con el mínimo permiso (Priority: P1)

**Goal**: el responsable crea el rol de ejecución, que solo SageMaker puede asumir, con permiso de leer los artefactos y escribir registros, y con su límite propio.

**Independent Test**: escenario 5 de [quickstart.md](quickstart.md): las pruebas del módulo pasan, el rol existe con su límite y el operador no puede crear roles sin límite ni con el límite equivocado.

### Tests for User Story 2 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T022 [US2] Crear `infra/modules/sagemaker-execution-role/tests/execution-role.tftest.hcl` con `mock_provider "aws" {}`, `command = plan` y variables `environment = "dev"`, `account_id = "896618135592"`, `region = "sa-east-1"`, `artifacts_bucket_arn = "arn:aws:s3:::medicia-models-dev-896618135592"` y `permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"`. Aserciones: el rol se llama `medicia-dev-sagemaker-execution` y su `permissions_boundary` es la variable; la política de confianza, decodificada, tiene una sola declaración `Allow` de `sts:AssumeRole` con `Principal.Service` igual a `sagemaker.amazonaws.com` y ningún otro principal, con `aws:SourceAccount` igual a `896618135592` y `aws:SourceArn` igual a `arn:aws:sagemaker:sa-east-1:896618135592:*` (con `ArnLike`); la política en línea, decodificada, tiene exactamente las mismas tres declaraciones que `medicia-dev-sagemaker-boundary` en la prueba T004 (misma lista de acciones y de recursos, escrita como constante idéntica); ninguna acción contiene `*`; ningún recurso es `*`; todo recurso de S3 empieza con el ARN del bucket; todo recurso de registros empieza con `arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-`; no hay acciones de otros servicios. Otra ejecución con `permissions_boundary_arn` que no sea el ARN de una política de IAM espera el fallo de la validación. Debe fallar mientras no exista el código.

### Implementation for User Story 2

- [X] T023 [P] [US2] Crear `infra/modules/sagemaker-execution-role/terraform.tf` con `required_version = "~> 1.15"` y `aws` `~> 6.72`.
- [X] T024 [P] [US2] Crear `infra/modules/sagemaker-execution-role/variables.tf` con `environment` (solo `dev`), `account_id` (`^[0-9]{12}$`), `region` (string, por defecto `sa-east-1`), `artifacts_bucket_arn` (string, validación con `^arn:aws:s3:::.+$`) y `permissions_boundary_arn` (string, validación con `^arn:aws:iam::[0-9]{12}:policy/.+$`, como el módulo `identity`), con tipo y descripción.
- [X] T025 [US2] Crear `infra/modules/sagemaker-execution-role/main.tf` con `aws_iam_role.this` (nombre `medicia-${var.environment}-sagemaker-execution`, `permissions_boundary = var.permissions_boundary_arn`, descripción fija, `assume_role_policy` con `jsonencode`: `sts:AssumeRole` para `Service = "sagemaker.amazonaws.com"` con `StringEquals` de `aws:SourceAccount` y `ArnLike` de `aws:SourceArn` igual a `arn:aws:sagemaker:${var.region}:${var.account_id}:*`) y `aws_iam_role_policy.this` (nombre `artefactos-y-registros`) con las tres declaraciones exactas de T004: `s3:GetObject` sobre `"${var.artifacts_bucket_arn}/*"` y `s3:ListBucket` sobre `var.artifacts_bucket_arn`; `logs:CreateLogGroup`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre los grupos `/aws/sagemaker/Endpoints/medicia-${var.environment}-*` y sus flujos. Comentar que la lista debe coincidir con `infra/bootstrap/sagemaker-boundary.tf` y que no incluye ECR (R10). Depende de T023 y T024.
- [X] T026 [P] [US2] Crear `infra/modules/sagemaker-execution-role/outputs.tf` con `role_arn` y `role_name` (no sensibles). Armarlos con el nombre conocido, no con atributos del recurso, para que se puedan usar en pruebas de la raíz.
- [X] T027 [US2] Modificar `infra/environments/dev/main.tf`: agregar `module "sagemaker_execution_role"` con `source = "../../modules/sagemaker-execution-role"`, `environment = "dev"`, `account_id = "896618135592"`, `artifacts_bucket_arn = module.model_artifacts.bucket_arn` y `permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"` (literal con comentario: lo crea `infra/bootstrap`, como el límite de `identity`). Modificar `outputs.tf`: agregar `sagemaker_execution_role_arn`. Depende de T026 y T020.
- [X] T028 [US2] Ejecutar `terraform -chdir=infra/modules/sagemaker-execution-role init -backend=false`, `fmt`, `validate`, `test` (las pruebas de T022 deben pasar) y `providers lock -platform=linux_amd64 -platform=windows_amd64`, y `terraform -chdir=infra/environments/dev init -backend=false`, `fmt`, `validate`. Depende de T022 a T027.
- [X] T029 [Responsable] Crear el bucket y el rol: `terraform -chdir=infra/environments/dev init`, `terraform -chdir=infra/environments/dev plan` (revisar que crea solo el bucket con sus seis configuraciones, el rol y su política, sin modelos ni puntos de inferencia, y que no toca la identidad) y `terraform -chdir=infra/environments/dev apply`. Depende de T028 y de T014.
- [X] T030 [Responsable] Verificar según los escenarios 3, 4 y 5 de [quickstart.md](quickstart.md): el plan informa 0 cambios (SC-002); `aws s3api get-public-access-block`, `get-bucket-encryption` y `get-bucket-versioning` confirman el bucket; `aws iam get-role --role-name medicia-dev-sagemaker-execution` muestra el límite; subir y listar un archivo de prueba funciona y borrarlo con `aws s3 rm` falla con acceso denegado; crear un rol de prueba sin límite o con `medicia-dev-sagemaker-boundary` fuera del rol de ejecución falla. El archivo de prueba lo elimina el administrador. `aws sagemaker list-endpoints --region sa-east-1` no lista nada. Anotar cuánto tardó todo el recorrido desde la guía (SC-001: menos de 20 minutos). Depende de T029.
- [X] T031 [US2] Registrar en `research.md` el resultado de T030 (sección "Pendientes de verificar"), incluidos el cierre de la condición `aws:SourceArn` de la confianza y cualquier acción que haya faltado en los permisos. Si algún resultado contradice el plan, volver a `speckit-plan`. Depende de T030.

**Checkpoint**: el bucket y el rol existen y cumplen el contrato. US1 y US2 juntas son el producto mínimo de la entrega. Punto de commit sugerido.

---

## Phase 5: User Story 3 - Estructura lista para sumar un modelo, apagado por defecto (Priority: P2)

**Goal**: el responsable deja una estructura en la que sumar un modelo es agregar una entrada al catálogo, y todo punto de inferencia nace apagado.

**Independent Test**: escenario 6 de [quickstart.md](quickstart.md): con el catálogo vacío el plan propone 0 modelos y 0 puntos de inferencia; con una entrada de ejemplo solo en la prueba, 0 puntos apagada y exactamente 1 encendida.

### Tests for User Story 3 ⚠️

> **NOTA: escribir primero y comprobar que FALLAN antes de implementar.**

- [X] T032 [US3] Crear `infra/modules/model-endpoints/tests/model-endpoints.tftest.hcl` con `mock_provider "aws" {}`, `command = plan` y variables comunes `environment = "dev"`, `artifacts_bucket_name = "medicia-models-dev-896618135592"` y `execution_role_arn = "arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"`. Una ejecución por punto de [contracts/model-catalog.md](contracts/model-catalog.md): (a) `models = {}`: 0 modelos, 0 configuraciones y 0 puntos de inferencia (SC-006); (b) una entrada `ecg-ejemplo` (`image_uri = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/ejemplo:1"`, `model_data_key = "ecg-ejemplo/1/model.tar.gz"`, `model_version = "1.0.0"`) sin `enabled`: 1 modelo, 1 configuración y 0 puntos de inferencia, con `instance_type` por defecto `ml.t2.medium` y `model_data_url` igual a `s3://medicia-models-dev-896618135592/ecg-ejemplo/1/model.tar.gz`; (c) la misma con `enabled = true`: exactamente 1 punto de inferencia llamado `medicia-dev-ecg-ejemplo`; (d) dos entradas, una encendida y otra apagada: solo la encendida tiene punto de inferencia (FR-012); (e) `instance_type = "ml.p3.2xlarge"` y `"ml.m5.xlarge"` esperan el fallo de la validación de `var.models`; (f) las claves `Ecg`, `1ecg`, `a` y una de 25 caracteres esperan el fallo, y una de 24 caracteres pasa; (g) `model_data_key = "/x/model.tar.gz"` espera el fallo; (h) el modelo, la configuración y el punto de inferencia llevan la etiqueta `ModelVersion` igual a `1.0.0`. Debe fallar mientras no exista el código.
- [X] T033 [P] [US3] Crear `infra/environments/dev/tests/catalog.tftest.hcl` con `mock_provider "aws" {}` y `command = plan`, copiando de `infra/modules/identity/tests/identity.tftest.hcl` los `override_resource` y `override_data` que el módulo `identity` necesita para planificar. Una ejecución con los valores por defecto afirma que `module.model_endpoints.model_names` y `module.model_endpoints.enabled_endpoint_names` están vacíos (catálogo vacío, SC-006). Otra ejecución con `variables { models = { ecg-ejemplo = {...} } }` (la entrada de ejemplo solo vive en la prueba) afirma 1 nombre de modelo y 0 puntos encendidos, y otra con `enabled = true` afirma 1 punto encendido. Debe fallar mientras no exista el código.

### Implementation for User Story 3

- [X] T034 [P] [US3] Crear `infra/modules/model-endpoints/terraform.tf` con `required_version = "~> 1.15"` y `aws` `~> 6.72`.
- [X] T035 [P] [US3] Crear `infra/modules/model-endpoints/variables.tf` con `environment` (solo `dev`), `artifacts_bucket_name` (string), `execution_role_arn` (string, validación con `^arn:aws:iam::[0-9]{12}:role/.+$`) y `models`: `map(object({ image_uri = string, model_data_key = string, model_version = string, instance_type = optional(string, "ml.t2.medium"), enabled = optional(bool, false) }))` con `default = {}` y tres validaciones con mensajes en español: las claves cumplen `^[a-z][a-z0-9-]{1,23}$` (el mensaje explica el tope de 24 caracteres por el sufijo único de `name_prefix`, ver R6); `instance_type` está en `["ml.t2.medium", "ml.c5.large", "ml.m5.large"]` y el mensaje las lista; `model_data_key` no empieza con `/`. La cantidad de instancias NO es una variable: vale 1.
- [X] T036 [US3] Crear `infra/modules/model-endpoints/main.tf` según [contracts/model-catalog.md](contracts/model-catalog.md): `aws_sagemaker_model.this` con `for_each = var.models`, nombre `medicia-${var.environment}-${each.key}`, `execution_role_arn`, `primary_container { image = each.value.image_uri, model_data_url = "s3://${var.artifacts_bucket_name}/${each.value.model_data_key}" }` y etiqueta `ModelVersion`; `aws_sagemaker_endpoint_configuration.this` con `for_each = var.models`, `name_prefix = "medicia-${var.environment}-${each.key}-"`, `lifecycle { create_before_destroy = true }` y `production_variants` con `variant_name = "AllTraffic"`, `model_name`, `initial_instance_count = 1` e `instance_type = each.value.instance_type`, y la etiqueta `ModelVersion`; y `aws_sagemaker_endpoint.this` con `for_each = { for nombre, modelo in var.models : nombre => modelo if modelo.enabled }`, nombre `medicia-${var.environment}-${each.key}`, `endpoint_config_name` de la configuración correspondiente y la etiqueta `ModelVersion`. Comentario de cabecera: el punto de inferencia es lo único que cobra por hora; encenderlo y apagarlo es cambiar `enabled`. No crear ningún otro recurso de SageMaker. Depende de T034 y T035.
- [X] T037 [P] [US3] Crear `infra/modules/model-endpoints/outputs.tf` con `model_names` (lista de nombres de los modelos) y `enabled_endpoint_names` (lista de nombres de los puntos de inferencia encendidos), no sensibles, con tipo y descripción.
- [X] T038 [US3] Crear `infra/environments/dev/variables.tf` con la variable `models` (mismo tipo que el módulo, `default = {}`) y comentario: el catálogo del entorno, vacío en esta entrega; sumar un modelo es agregar una entrada aquí, y no se usan archivos `.tfvars`. Modificar `infra/environments/dev/main.tf` con `module "model_endpoints"` (`source = "../../modules/model-endpoints"`, `environment = "dev"`, `artifacts_bucket_name = module.model_artifacts.bucket_name`, `execution_role_arn = module.sagemaker_execution_role.role_arn`, `models = var.models`) y `outputs.tf` con `enabled_endpoint_names`. Depende de T037 y T027.
- [X] T039 [US3] Ejecutar `terraform -chdir=infra/modules/model-endpoints init -backend=false`, `fmt`, `validate`, `test` y `providers lock -platform=linux_amd64 -platform=windows_amd64`; luego `terraform -chdir=infra/environments/dev init -backend=false`, `fmt`, `validate` y `test` (las pruebas de T032 y T033 deben pasar). Depende de T032 a T038.
- [X] T040 [Responsable] Con el perfil `medicia-dev`: `terraform -chdir=infra/environments/dev plan` debe proponer 0 recursos nuevos (solo, a lo sumo, cambios en las salidas). Si aparece cualquier modelo o punto de inferencia, detenerse. Si el plan solo cambia salidas, ejecutar `terraform -chdir=infra/environments/dev apply` para registrarlas. Depende de T039.

**Checkpoint**: la estructura está lista, el catálogo vacío no crea nada y sumar un modelo es una entrada. Punto de commit sugerido.

---

## Phase 6: User Story 4 - Revisar cada cambio y documentar permisos y costos (Priority: P2)

**Goal**: cada cambio pasa por las comprobaciones de CI, la guía documenta permisos, orden de pasos y costos, y los controles de costo y de artefactos son automáticos.

**Independent Test**: escenario 7 de [quickstart.md](quickstart.md): una propuesta de prueba que incumple una regla hace fallar el flujo, y el plan de CI calcula los recursos nuevos con 0 cambios.

- [X] T041 [US4] Modificar `.github/workflows/infra.yml`: agregar `infra/modules/model-artifacts`, `infra/modules/sagemaker-execution-role` e `infra/modules/model-endpoints` a los bucles de `init -backend=false` y `validate`, de `tflint` y de comprobación de `.terraform.lock.hcl`; agregar esos tres módulos y `infra/environments/dev` al bucle de `terraform test`. Mantener fijadas las versiones de las acciones. Depende de T039.
- [X] T042 [US4] Modificar `.github/workflows/infra.yml`: agregar el paso `Guarda de costo (FR-012, FR-013)` después de la guarda del contrato del grupo de usuarios, con el mismo estilo (patrones con clases de caracteres, mensajes `::error::` en español): falla si `git grep -lE '^[[:space:]]*resource[[:space:]]+"aws_sagemaker_endpoint"' -- 'infra/*.tf' ':!infra/modules/model-endpoints/*'` encuentra un archivo; falla si `git grep -nE '^[[:space:]]*resource[[:space:]]+"aws_sagemaker_(notebook_instance|domain|user_profile|space|app)"' -- 'infra/*.tf'` encuentra algo (recursos que cobran por tiempo y están fuera de alcance); falla si `git grep -nE '"ml\.(p[0-9]|g[0-9]|trn|inf|dl)' -- 'infra/*.tf'` encuentra familias con GPU o aceleradores (decisión de costo aparte); y falla si `infra/modules/model-artifacts/main.tf` no contiene `prevent_destroy = true` (`terraform test` no lo ve, FR-003). Agregar en el comentario del paso que la guarda de etiquetas existente sobre `providers.tf` cubre FR-016, porque las etiquetas de los recursos nuevas vienen de `default_tags`. Probar los patrones a mano contra el árbol actual: no deben encontrar nada.
- [X] T043 [US4] Modificar `.github/workflows/infra.yml`, en el paso de archivos prohibidos: agregar a la expresión de `git ls-files` (ahora sobre todo el repositorio, no solo `infra .github`) las extensiones de artefactos de modelos `pt`, `pth`, `onnx`, `safetensors`, `h5`, `ckpt`, `joblib`, `pkl`, `pickle`, `tgz` y `tar.gz` con mensaje `Hay artefactos de modelos versionados (FR-005)`. Antes de editar, ejecutar `git ls-files` con ese patrón y confirmar que no hay coincidencias; si las hubiera, detenerse y avisar. Mantener los patrones con clases de caracteres.
- [X] T044 [US4] Actualizar `infra/README.md` (FR-021, FR-022, SC-008), en español rioplatense y sin tablas (usar listas): (a) en "Estructura", los tres módulos nuevos y los archivos nuevos de `bootstrap`; (b) una sección "Base de SageMaker" con qué es, que no despliega modelos y que el costo adicional con todo apagado es de centavos; (c) "Orden de los pasos" de [contracts/access-and-permissions.md](contracts/access-and-permissions.md): primero el administrador aplica `bootstrap`, después el operador `environments/dev`, y la propuesta de cambio después de ambos, con los errores esperados si se rompe el orden (incluido el de credenciales vencidas o ausentes, que Terraform informa sin dejar cambios a medias); (d) "Subir un artefacto" con `aws s3 cp` y el rechazo de borrado, y la advertencia de no subir datos de pacientes ni versionar artefactos; (e) "Costos de un punto de inferencia" con una lista por tipo permitido (`ml.t2.medium` 0,089 USD por hora, 2,14 por día, 64,97 al mes; `ml.c5.large` 0,157, 3,77 y 114,61; `ml.m5.large` 0,184, 4,42 y 134,32), la fecha de la lista de precios (2026-11-09), cómo repetir la consulta a la lista oficial de AWS (`index.json` de `AmazonSageMaker` para `sa-east-1`, usos `SAE1-Host:<tipo>`) y el recordatorio de que el uso previsto es encenderlo solo mientras se usa; (f) "Sumar un modelo" con la entrada de ejemplo del contrato, que primero requiere los permisos de SageMaker del operador y la decisión de ECR (R5, R10), y la revisión de cuota y disponibilidad en `sa-east-1`; (g) "Encender y apagar" con el cambio de `enabled`, el apagado de emergencia con `aws sagemaker delete-endpoint` y cómo ver qué hay encendido (`aws sagemaker list-endpoints --region sa-east-1`); (h) la advertencia de licencia de modelos de investigación (EchoNext-Mini: acuerdo de uso de PhysioNet y solicitud de patente de Columbia) y que todo resultado de un modelo es un posible hallazgo, nunca un diagnóstico; (i) en "Cambiar los permisos del operador", los permisos agregados por esta funcionalidad y la sentencia de SageMaker que se otorgará con el primer modelo (acciones sobre `medicia-dev-*`, `iam:PassRole` solo hacia `sagemaker.amazonaws.com` y `sagemaker:CreateEndpointConfig` con la condición `sagemaker:InstanceTypes`). Depende de T041.
- [X] T045 [P] [US4] Actualizar `memory/project-structure.md` y `memory/architecture.md`: reflejar los tres módulos nuevos, el bucket de artefactos, el rol de ejecución con su límite y el catálogo de modelos apagado por defecto, sin tablas y sin contradecir la constitución. Mantener `memory/architecture.md` en línea con el resto: SageMaker se consume mediante un adaptador y esta entrega solo prepara la base.
- [X] T046 [P] [US4] Actualizar `.agents/reviewers/infrastructure.md` con los criterios de revisión de [contracts/access-and-permissions.md](contracts/access-and-permissions.md), sección "Qué verifica la revisora de infraestructura": comodines en el rol de ejecución y en el límite, principal de confianza, bucket privado y cifrado, puntos de inferencia encendidos no pedidos y reemplazo o destrucción del bucket como bloqueante.
- [ ] T047 [Responsable] Abrir una propuesta de cambio con esta rama (después de T014) y verificar el escenario 7 de [quickstart.md](quickstart.md): corren `static` y `plan`, el plan informa 0 cambios y el resumen lo muestra; una propuesta de prueba con `"s3:*"` en el rol de ejecución o con un `aws_sagemaker_endpoint` fuera de su módulo hace fallar el flujo. Descartar las propuestas de prueba. Depende de T041 a T046.

**Checkpoint**: las comprobaciones, la guía y la revisión están en su lugar. Punto de commit sugerido.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: verificación final de toda la entrega.

- [X] T048 Ejecutar `terraform fmt -check -recursive infra` y, para cada directorio (`infra/bootstrap`, `infra/environments/dev`, `infra/modules/identity`, `infra/modules/model-artifacts`, `infra/modules/sagemaker-execution-role`, `infra/modules/model-endpoints`), `init -backend=false`, `validate` y `test`. Si `tflint` y `trivy` están instalados, ejecutarlos como en `infra.yml`; si no, informar que solo corren en CI. Depende de T047.
- [X] T049 Búsqueda de artefactos y secretos (SC-005): `git ls-files` no lista archivos de pesos de modelos ni `*.tfstate*`, `*.tfplan`, `*.tfvars` ni `.terraform/`, y una búsqueda de `AKIA` más 16 caracteres y de claves privadas en el contenido versionado no encuentra nada; revisar también las salidas de las pruebas. Depende de T048.
- [X] T050 Ejecutar `npm run check` para confirmar que la aplicación no se vio afectada (no se tocó `src/`). Informar si no pudo ejecutarse.
- [X] T051 Recorrer los escenarios 1 y 6 de [quickstart.md](quickstart.md) en lo que no necesita AWS y confirmar que los contratos de [contracts/model-catalog.md](contracts/model-catalog.md) y [contracts/access-and-permissions.md](contracts/access-and-permissions.md) coinciden con el código. Si hay diferencias, corregir el código o el contrato. Depende de T048.
- [ ] T052 [Responsable] Después de una semana, comprobar en la facturación de la cuenta que el gasto adicional de esta base es menor a 1 USD (SC-003) y que `aws sagemaker list-endpoints --region sa-east-1` sigue vacío.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. **Bloquea** todas las historias, porque el operador no puede crear el bucket ni el rol hasta que el administrador aplique T013.
- **US1 (Phase 3)**: puede escribirse y probarse apenas empieza la Phase 2 (T015 a T021 no necesitan AWS), pero no se aplica hasta T014.
- **US2 (Phase 4)**: depende de US1 (el rol recibe el ARN del bucket) y de la Phase 2. La aplicación real (T029) crea US1 y US2 juntas.
- **US3 (Phase 5)**: depende de US1 y US2 (necesita el nombre del bucket y el ARN del rol).
- **US4 (Phase 6)**: T041 a T043 dependen del código de los módulos; T044 a T046 pueden empezar antes de cerrar US3 pero se terminan después.
- **Polish (Phase 7)**: depende de todo lo anterior.

### Within Each Phase

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Dentro de un módulo: `terraform.tf` y `variables.tf` antes de `main.tf`; `outputs.tf` antes de conectar la raíz.
- Los pasos de [Responsable] y [Administrador] se detienen y esperan; el agente indica el comando exacto.

### Parallel Opportunities

- T004 y T005 (pruebas de `bootstrap`) entre sí, y T010 con T007 a T009.
- T016, T017 y T019 de US1 (archivos distintos).
- T023, T024 y T026 de US2.
- T032 y T033 de US3 entre sí, y T034, T035 y T037.
- T045 y T046 de US4 con T044.

---

## Parallel Example: Foundational

```text
# Pruebas de bootstrap juntas:
Task: "Crear infra/bootstrap/tests/sagemaker-boundary.tftest.hcl"
Task: "Ampliar infra/bootstrap/tests/access.tftest.hcl"
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Setup y Foundational: permisos aplicados por el administrador (T014).
2. US1 y US2: bucket y rol creados en una sola aplicación (T029).
3. **Detenerse y validar** con los escenarios 3, 4 y 5.
4. Después, US3 (catálogo apagado) y US4 (CI, guía y revisión).

### Entrega incremental

1. Fundacional → permisos aplicados, el plan de CI puede leer lo nuevo.
2. US1 + US2 → base creada y verificada.
3. US3 → estructura para sumar modelos, sin crear ninguno.
4. US4 → comprobaciones automáticas y guía de costos y permisos.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- Esta entrega NO crea ningún modelo, configuración de modelo ni punto de inferencia (FR-011). La entrada de ejemplo existe solo dentro de las pruebas y nunca se versiona como valor del catálogo.
- El operador no recibe permisos de SageMaker en esta entrega (R5).
- El cómputo con GPU y la inferencia sin servidor quedan fuera (R7).
- Ningún comando de la lista reservada (`git commit`, `terraform apply`, `destroy`, `import`, `state`, Prisma) lo ejecuta el agente.
- Evitar: tareas vagas, conflictos en un mismo archivo, comodines de acción y artefactos o secretos en el repositorio.
