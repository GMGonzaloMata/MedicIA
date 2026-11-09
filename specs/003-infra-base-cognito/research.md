# Investigación: Infraestructura base y servicio de identidad

**Plan**: [plan.md](plan.md) | **Especificación**: [spec.md](spec.md)

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. Al final hay una lista de lo que no se pudo verificar y debe comprobarse al implementar.

## R1. Versiones de herramientas

- **Decisión:** Terraform 1.15.x fijado con `required_version = "~> 1.15"` y el proveedor de AWS con `version = "~> 6.72"`. El archivo `.terraform.lock.hcl` de cada raíz se versiona y fija la versión exacta.
- **Por qué:** en la máquina del responsable está instalado Terraform 1.15.1, y la última versión publicada del proveedor de AWS es la 6.72.0 (2026-11-04). Fijar ambas cumple FR-015.
- **Alternativas descartadas:** OpenTofu (la constitución dice Terraform); versiones sin fijar (cualquier actualización del proveedor puede cambiar un plan sin que cambie el código).
- **Regla de actualización:** una subida de Terraform o del proveedor va en un cambio separado, con su propio plan revisado.

## R2. Estado remoto: S3 con bloqueo nativo

- **Decisión:** backend `s3` con `encrypt = true` y `use_lockfile = true`. Sin tabla de DynamoDB.
- **Por qué:** desde Terraform 1.10 el bloqueo se guarda como un objeto en el mismo bucket. Hay menos recursos, no hay costo adicional y alcanza para un solo operador. La skill `terraform-skill` lo marca como la opción recomendada.
- **Alternativas descartadas:** DynamoDB (recurso extra sin ganancia), HCP Terraform (sale de AWS y agrega una cuenta y un servicio externos).
- **Consecuencia:** quien opera el estado necesita `s3:GetObject`, `s3:PutObject` y `s3:DeleteObject` sobre el bucket, porque el bloqueo se crea y se borra como objeto.

## R3. Bucket del estado: cifrado, versiones y costo

- **Decisión:** el bucket del estado tiene bloqueo de acceso público, versionado, cifrado SSE-S3 (AES-256) por defecto, una política que rechaza el acceso sin TLS, `prevent_destroy = true` y una regla que elimina las versiones no vigentes a los 90 días.
- **Por qué SSE-S3 y no una clave propia de KMS:** una clave propia de KMS cuesta unos 1 USD al mes y SC-007 pide menos de 1 USD al mes en total. SSE-S3 cifra en reposo sin costo. Una clave propia se evalúa con producción.
- **Nombre del bucket:** `medicia-tfstate-dev-<id de la cuenta>`. El sufijo evita choques, porque los nombres de bucket son globales.
- **Alternativas descartadas:** sin versiones (no permite recuperar un estado dañado); MFA Delete (Terraform no puede activarlo y exige la cuenta raíz).
- **Registro de accesos del bucket:** no se activa en desarrollo. Queda anotado como excepción del análisis de seguridad (ver R11).

## R4. Dos raíces de Terraform y un módulo

- **Decisión:** tres piezas dentro de `infra/`:
  - `bootstrap/`: raíz que se aplica una vez por cuenta. Crea el bucket del estado, el proveedor de identidad de GitHub, el rol de solo lectura del plan y la política del operador.
  - `modules/identity/`: módulo con el grupo de usuarios de Cognito, su cliente, el usuario IAM de la aplicación y su permiso.
  - `environments/dev/`: raíz del entorno de desarrollo, que llama al módulo.
- **Por qué:** separar el arranque del entorno evita el problema del huevo y la gallina (el estado necesita un bucket que todavía no existe). El módulo permite crear producción más adelante con otra raíz `environments/prod/` y otra cuenta, sin copiar código. Cada raíz tiene su propio estado (FR-002).
- **Alternativas descartadas:** una sola raíz con workspaces (los workspaces no aíslan permisos entre entornos, según la skill); un módulo para el bucket (se usa una sola vez por cuenta, sería una capa sin necesidad).
- **Estado de cada raíz:** `bootstrap/terraform.tfstate` y `environments/dev/terraform.tfstate` dentro del mismo bucket, con claves distintas.

## R5. Arranque en dos fases

- **Decisión:**
  1. Primera fase: el responsable aplica `bootstrap/` sin bloque `backend`. El estado queda en un archivo local, ignorado por git.
  2. Segunda fase: copia `backend.tf.example` a `backend.tf` (se versiona) y ejecuta `terraform init -migrate-state`. El estado pasa al bucket que acaba de crear y el archivo local se borra.
- **Por qué:** es el método habitual cuando el bucket del estado lo crea el mismo código. Una vez migrado, repetir el arranque propone 0 cambios (FR-004, SC-002).
- **Recreación desde cero:** se documenta cómo volver a la primera fase, quitando `backend.tf` temporalmente.
- **Alternativa descartada:** crear el bucket con la CLI de AWS. Dejaría el recurso fuera del código y rompería FR-001.

## R6. Servicio de identidad: configuración y nivel de plan

- **Decisión:** un grupo de usuarios con los argumentos de [contracts/identity-service.md](contracts/identity-service.md), un único cliente y ningún dominio. Nivel de plan `ESSENTIALS` fijado de forma explícita.
- **Argumentos confirmados en la documentación del proveedor:**
  - `deletion_protection` (`ACTIVE` o `INACTIVE`) y `user_pool_tier` (`LITE`, `ESSENTIALS` o `PLUS`).
  - `username_configuration.case_sensitive`, `auto_verified_attributes`, `mfa_configuration` (`OFF`), `password_policy` con `minimum_length` y los cuatro `require_*`.
  - `verification_message_template.default_email_option` (`CONFIRM_WITH_CODE`), `email_configuration.email_sending_account` (`COGNITO_DEFAULT`).
  - En el cliente: `generate_secret`, `explicit_auth_flows`, `id_token_validity` (mínimo 5 minutos), `token_validity_units`, `enable_token_revocation`.
- **Por qué `ESSENTIALS`:** es el nivel por defecto de los grupos nuevos y cubre el ingreso con usuario y contraseña. Fijarlo evita que un cambio futuro del valor por defecto reemplace el grupo.
- **Sin dominio:** no existe ningún recurso de dominio ni de interfaz alojada, así que no hay forma de registrarse por fuera del cliente (FR-010).
- **Código de 6 dígitos:** el código por correo es numérico de 6 dígitos por defecto y no se configura. La prueba comprueba `default_email_option = "CONFIRM_WITH_CODE"`.

## R7. Protección contra el reemplazo del grupo

- **Decisión:** `deletion_protection = "ACTIVE"` en el grupo y, además, `lifecycle { prevent_destroy = true }`.
- **Por qué los dos:** cambiar el esquema de atributos de un grupo obliga a reemplazarlo y eso borra a todos sus usuarios (FR-012). `prevent_destroy` frena el plan antes de aplicar, y la protección de Cognito frena un borrado hecho por la API o la consola.
- **Consecuencia para liberar recursos (FR-021):** para destruir el entorno de desarrollo hay que quitar a propósito el `prevent_destroy` del código y poner la protección en `INACTIVE`. Esa es la decisión explícita que pide el spec, y queda en la guía.
- **Reglas del esquema:** los atributos obligatorios `email` y `name` se declaran con `schema` y no se vuelven a tocar. Cualquier cambio de esquema se revisa como riesgo bloqueante.

## R8. Identidad de la aplicación local

- **Decisión (aclarada en la sesión 2026-11-09):** un usuario IAM `medicia-dev-app` con una política en línea cuyo único permiso es `cognito-idp:AdminSetUserPassword` sobre el ARN de este grupo. Su clave de acceso la crea Terraform y se obtiene con una consulta explícita.
- **Por qué:** es el permiso más acotado posible y sirve para la operación de la funcionalidad 002 (R18).
- **Riesgo conocido:** la clave de acceso y el secreto del cliente quedan dentro del estado. Ver R9.
- **Rotación:** se reemplaza la clave con `terraform apply -replace=aws_iam_access_key.app`, que ejecuta solo el responsable.
- **Producción:** se reemplaza por un rol del servidor sin claves, en la funcionalidad del servidor.

## R9. Secretos dentro del estado

- **Hecho:** el secreto del cliente de Cognito y la clave de acceso del usuario de la aplicación se guardan en el estado aunque estén marcados como sensibles. `sensitive = true` solo oculta la salida.
- **Mitigaciones elegidas:**
  - El bucket del estado es privado, cifrado, versionado y con TLS obligatorio.
  - El estado nunca está en git y `.gitignore` lo declara.
  - Solo el responsable y el rol de plan de solo lectura pueden leer el bucket.
  - Las salidas sensibles se piden de forma explícita con `terraform output -raw`.
- **Riesgo residual:** el rol de plan de CI lee el estado, así que una propuesta de cambio de este mismo repositorio que modifique el flujo podría intentar mostrar secretos. Se acepta en desarrollo porque hay un solo operador y se reduce con R10. Se revisa antes de sumar a más personas o crear producción.
- **Alternativa descartada:** no crear la clave de acceso con Terraform y generarla a mano. Mantendría la clave fuera del estado, pero el secreto del cliente de Cognito igualmente quedaría adentro, y la clave manual no sería reproducible.

## R10. Plan en CI con un rol de solo lectura (OIDC)

- **Decisión (aclarada en la sesión 2026-11-09):** GitHub Actions asume un rol de AWS mediante OIDC, sin claves guardadas. El rol solo puede leer, y el plan se ejecuta con `-lock=false`.
- **Formato del identificador del sujeto:** este repositorio (`GMGonzaloMata/MedicIA`, id 1443385030, creado el 2026-11-02) es posterior al 2026-07-15, por lo que GitHub emite el formato inmutable con identificadores numéricos: `repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request` (el caso de propuestas de cambio es una inferencia de la documentación, que solo muestra ramas). La confianza usa ese valor exacto, con `StringEquals`, y exige `aud = sts.amazonaws.com`. Un renombrado o una recreación del repositorio no hereda el acceso.
- **Verificación pendiente:** la primera propuesta de cambio imprime el valor real del `sub` (no es secreto) para confirmarlo antes de dejarlo fijo.
- **Propuestas desde forks:** el repositorio es público. En propuestas de forks GitHub no entrega el permiso `id-token`, y además el trabajo del plan se salta si la propuesta no viene de este repositorio.
- **Permisos del rol:**
  - Lectura del estado: `s3:GetObject` y `s3:ListBucket` sobre el bucket del estado.
  - Descripción de recursos: acciones `Describe*`, `Get*` y `List*` limitadas a Cognito y a IAM, sin la política administrada `ReadOnlyAccess`.
  - **Por qué no `ReadOnlyAccess`:** incluye `s3:GetObject` sobre todos los buckets de la cuenta. Cuando exista el bucket de estudios, el plan de CI podría leer datos clínicos.
- **Por qué `-lock=false`:** con bloqueo nativo, planificar escribe un objeto de bloqueo, y el rol no tiene permiso de escritura.
- **Alcance del plan:** CI planifica solo `environments/dev`. `bootstrap/` pasa por formato, validación, análisis, pruebas y revisión, pero su plan lo corre el responsable, porque incluye al propio rol.

## R11. Comprobaciones automáticas

- **Decisión:** un flujo propio `.github/workflows/infra.yml`, con los pasos:
  - `terraform fmt -check -recursive`.
  - `terraform init -backend=false` y `terraform validate` en cada raíz y en el módulo.
  - `tflint` con el complemento de AWS.
  - `trivy config` y `trivy fs --scanners secret` sobre `infra/`, con `.trivyignore` para las excepciones justificadas (SSE-S3 en lugar de clave propia, sin registro de accesos del bucket en desarrollo).
  - `terraform test` del módulo de identidad.
  - Una búsqueda que falla si hay archivos de estado o de plan versionados.
  - El plan de `environments/dev` con el rol de solo lectura.
- **Por qué Trivy y no Checkov:** una sola herramienta cubre configuración y secretos. Es lo que pide el criterio de la revisora de infraestructura (`trivy config` o `checkov`).
- **Disparo:** en propuestas de cambio y en la rama principal, solo cuando cambia `infra/` o el propio flujo. El flujo no tiene ningún paso de `apply`.
- **Versiones fijadas:** `hashicorp/setup-terraform@v4`, `aws-actions/configure-aws-credentials@v6` y `aquasecurity/trivy-action@v0.36.0`, y Terraform 1.15.1.
- **Alternativa descartada:** agregar estos pasos al flujo `ci.yml` existente. Correría las pruebas de la aplicación en cambios de infraestructura y viceversa.

## R12. Verificar el contrato sin crear recursos

- **Decisión (aclarada en la sesión 2026-11-09):** pruebas `terraform test` en modo `plan`, con un proveedor simulado (`mock_provider "aws"`), sobre el módulo de identidad. Cada punto del contrato de la 002 tiene al menos una aserción.
- **Por qué:** corren en CI sin credenciales y sin costo, y fallan si alguien cambia un argumento del contrato.
- **Límite conocido:** un proveedor simulado devuelve valores aleatorios para lo calculado. Por eso la política del usuario de la aplicación se arma con `jsonencode` y no con `aws_iam_policy_document`, y los valores que dependen de otro recurso (el ARN del grupo) se fijan con `override_resource` durante el plan.
- **Cambios hechos en la consola:** los detecta el plan real de CI, no estas pruebas.
- **Alternativa descartada:** consultar el servicio real con un script después de aplicar. Se puede sumar más adelante.

## R13. Cuenta y entorno

- **Decisión:** el proveedor declara `allowed_account_ids = ["896618135592"]` y el bucket del estado tiene una precondición que rechaza una identidad de cuenta raíz. Todos los recursos llevan `default_tags` con `Project`, `Environment` y `ManagedBy` (FR-016).
- **Por qué:** evita aplicar por error en la otra cuenta del responsable (`365816237483`) o con la cuenta raíz.
- **Permisos del operador:** el arranque crea una política administrada `medicia-dev-terraform-operator`, limitada a lo que esta funcionalidad gestiona, para reemplazar `AdministratorAccess` en `terraform-dev`. Se prueba al final: si falla, `AdministratorAccess` con MFA se mantiene hasta ajustarla.
- **Requisitos previos que Terraform no automatiza (FR-005):** MFA de la cuenta raíz, la identidad de trabajo y la alerta de costos. La guía los lista con comandos de solo lectura para comprobarlos.

## R14. Cosas que no se incluyen

- Entorno de producción, S3 de estudios, RDS, EC2, SageMaker, SES y dominio, según el spec.
- El presupuesto de AWS ya existe, creado a mano (`medicia-dev-mensual`, 20 USD). Pasarlo a Terraform queda para una etapa posterior.
- Credenciales temporales del operador (IAM Identity Center): se evalúa cuando haya más personas.

## Pendiente de verificar al implementar

- **Valor real del `sub` de OIDC** en las propuestas de cambio (R10).
- **Sin cambios perpetuos del esquema:** que el bloque `schema` de `email` y `name` no genere un diff en cada plan (algunos atributos estándar lo hacen si faltan las restricciones de longitud).
- **`USER_PASSWORD_AUTH` en `ESSENTIALS`:** confirmarlo en el primer ingreso real.
- **Costo mensual real** de Cognito `ESSENTIALS` con el uso de desarrollo (se espera 0 USD bajo el nivel gratuito) y de S3.
- **Lista exacta de acciones de solo lectura** del rol de plan: se ajusta con el primer plan en CI.
- **Política del operador:** puede requerir iteraciones.
- **Fecha de vencimiento de los créditos** de la cuenta (página de Créditos).
- **Subida de `aquasecurity/trivy-action`:** confirmar la versión en el momento de implementar.

## Resultados de la implementación

Se registran a medida que se cierran las tareas de [tasks.md](tasks.md).

- **T005, requisitos previos de la cuenta (2026-11-09):**
  - **Identidad:** `aws sts get-caller-identity` con el perfil `medicia-dev` devuelve la cuenta `896618135592` y el usuario `terraform-dev`, no la raíz. Cumple.
  - **Cuenta raíz:** `AccountMFAEnabled` igual a 1 y `AccountAccessKeysPresent` igual a 0. Tiene MFA y no tiene claves de acceso. Cumple.
  - **Alerta de costos:** existe el presupuesto `medicia-dev-mensual`, de 20 USD, con periodo mensual. Cumple.
- **T006, limpieza de la cuenta (2026-11-09):** el responsable confirmó haberla hecho. Verificado en solo lectura: el único perfil local es `medicia-dev` (ya no existe `default`), y el único usuario IAM de la cuenta es `terraform-dev` (`santiDev` fue eliminado).
- **T015 y T016, arranque del estado remoto (2026-11-09):**
  - **Fase 1:** el `plan` propuso 6 recursos a crear, 0 a cambiar y 0 a destruir (bucket, versionado, cifrado, bloqueo de acceso público, ciclo de vida y política). El `apply` terminó con `Apply complete! Resources: 6 added, 0 changed, 0 destroyed.` La regla de ciclo de vida tardó 1 minuto en crearse.
  - **Fase 2:** `init -migrate-state` copió el estado al bucket (`bootstrap/terraform.tfstate`, 11.414 bytes, el mismo tamaño que el archivo local). El versionado del bucket está en `Enabled`. Se borraron el estado local y su copia.
  - **Repetición:** `terraform plan` informó `No changes`, es decir, 0 cambios (SC-002).
  - **Bloqueo con dos procesos:** no se probó. Queda sin verificar de forma práctica; el bloqueo está configurado con `use_lockfile = true` y se comprobará la primera vez que dos operaciones coincidan o en el simulacro de recreación (T052).
- **T017, sin estado en el repositorio (2026-11-09):** `git ls-files` no lista ningún `*.tfstate*`, `*.tfplan`, `*.tfvars` ni `.terraform/`. `git status` solo muestra `infra/bootstrap/backend.tf` como archivo nuevo. No queda ningún archivo de estado local.
- **T018 a T026, código de US2 (2026-11-09):**
  - **Pruebas del contrato:** 17 ejecuciones en `infra/modules/identity/tests/identity.tftest.hcl`. Fallaron antes de escribir el módulo y pasan después. Con tres valores cambiados a propósito (longitud de la contraseña, flujos de ingreso y acción del permiso) fallaron 3 pruebas, y el módulo se restauró.
  - **Aserciones con conjuntos:** las listas de atributos y flujos se comparan con `toset(...)`, porque comparar una lista con una tupla literal falla por tipos.
  - **Plan real de solo lectura contra AWS (`environments/dev`):** `Plan: 5 to add, 0 to change, 0 to destroy`. Crea el grupo (`medicia-dev`, nivel `ESSENTIALS`, protección `ACTIVE`, sin segundo factor), el cliente (con secreto, solo `ALLOW_USER_PASSWORD_AUTH`, token de identidad de 5 minutos, `prevent_user_existence_errors` en `ENABLED`), el usuario `medicia-dev-app`, su política y su clave de acceso. El proveedor real aceptó todos los valores, incluido el esquema de atributos con restricciones de longitud.
  - **Bloqueo de versiones:** `.terraform.lock.hcl` con `hashicorp/aws` 6.72.0 y los hashes de Linux y Windows en `bootstrap`, `environments/dev` y también en `modules/identity`, para que la prueba del módulo en CI use la misma versión.
- **T027 a T029, servicio de identidad creado (2026-11-09):**
  - **Aplicación:** el responsable aplicó `environments/dev` con `5 to add, 0 to change, 0 to destroy` (grupo, cliente, usuario, política y clave de acceso).
  - **Repetición:** `terraform plan -detailed-exitcode` informa `No changes` y código de salida 0 (SC-002). El bloque `schema` no genera cambios perpetuos: queda resuelto ese pendiente de R6.
  - **Cognito real, consultado en solo lectura:**
    - Hay 1 grupo en `sa-east-1` con 1 cliente, y no tiene dominio (`Domain` nulo): no existe interfaz alojada (FR-010).
    - Grupo: nivel `ESSENTIALS`, `DeletionProtection` en `ACTIVE`, `MfaConfiguration` en `OFF`, ingreso con `email` y verificación automática de `email`, sin distinguir mayúsculas (`CaseSensitive` en `false`), registro abierto (`AllowAdminCreateUserOnly` en `false`).
    - Contraseña: mínimo 8, `RequireUppercase` en `true` y las otras tres reglas en `false`, igual que la política de la aplicación.
    - Atributos obligatorios: `email` y `name`; `sub` aparece también porque Cognito lo exige siempre.
    - Cliente: único, con secreto, solo `ALLOW_USER_PASSWORD_AUTH`, `PreventUserExistenceErrors` en `ENABLED` y token de identidad de 5 minutos.
  - **Consola (verificado por el responsable):** un solo grupo `medicia-dev`, un solo cliente `medicia-dev-app`, sin dominio. El usuario IAM `medicia-dev-app` tiene una única política en línea (`cognito-set-user-password`), sin acceso a la consola y con una clave de acceso activa y sin usar.
  - **Pendiente con el servicio real:** que `USER_PASSWORD_AUTH` funcione en el nivel `ESSENTIALS` en un ingreso real. Se comprueba en T032.
  - **Detalle nuevo:** la consola de Cognito tiene una pestaña "Secretos del cliente", que permite administrar secretos sin recrear el cliente. Se evalúa para la guía de recuperación del secreto (T047).
- **T030 a T032, conexión de la aplicación y recorrido real (2026-11-09):**
  - **Conexión:** las siete variables quedaron en `.env.local` con los comandos de T030. El primer intento escribió líneas vacías porque PowerShell no reemplaza `$d` dentro de `-chdir=$d`; la guía debe usar `"-chdir=$d"` entre comillas y no escribir nada si falta algún valor.
  - **Recorrido real:** el registro, la verificación con elección de contraseña y el ingreso funcionan de punta a punta contra el servicio creado, incluido `USER_PASSWORD_AUTH` en el nivel `ESSENTIALS` (queda resuelto ese pendiente de R6).
  - **Diagnóstico del primer fallo:** el ingreso devolvía el mensaje general por un conflicto de cuenta en la base local (ver el hallazgo en `specs/002-ingreso-sesion/research.md`), no por la infraestructura.
  - **Dato de AWS:** `get-access-key-last-used` se actualiza con demora (hasta una hora), por lo que no sirve para comprobar un uso reciente de la clave.
  - **R4 y R10:** confirmados por el responsable (cuenta sin verificar rechazada; la cookie de sesión funciona en `http://localhost`).
- **T034, búsqueda de secretos (2026-11-09):**
  - **Valores reales:** se buscaron, sin imprimirlos, el secreto del cliente, el secreto de la clave de la aplicación y su identificador. En el árbol de trabajo solo aparecen en `.env.local` (ignorado por git), y en el historial de git hay 0 commits que los toquen.
  - **Patrones:** 0 claves privadas versionadas en `infra/` y `.github/`, y 0 archivos de estado, plan o variables versionados.
  - **Falso positivo conocido:** el patrón de clave de acceso (`AKIA` más 16 caracteres) coincide en `.agents/skills/terraform-skill/references/security-compliance.md` y en su copia de `.claude/`, línea 402. Es `AKIAIOSFODNN7EXAMPLE`, la clave de ejemplo de la documentación de AWS, no una clave real. La guarda de CI (T040) busca solo en `infra/` y `.github/` y no la toma.
- **Limpieza de las pruebas (2026-11-09):** se borraron la cuenta de diagnóstico y la de prueba sin verificar. En el grupo queda 1 usuario, el del responsable.

### T042 a T045: acceso de CI verificado (2026-11-09)

- **T042:** el plan de `infra/bootstrap` agregó solo 4 recursos (proveedor de GitHub, rol `medicia-dev-plan`, su política en línea y la política `medicia-dev-terraform-operator`) y 2 salidas. Se aplicó sin cambios ni destrucciones.
- **R10 confirmado:** el paso "Mostrar el sujeto del token" imprimió `sub` = `repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request`, `aud` = `sts.amazonaws.com` e `iss` = `https://token.actions.githubusercontent.com`. Coincide con `github_oidc_subject`, sin ajustes.
- **T044:** en un PR desde la misma rama, `Comprobaciones estáticas` (incluidos `tflint` y `trivy`, sin ajustes al `.trivyignore`) y `Plan de solo lectura` pasaron en verde. En el `push` a `main`, `plan` se omite, como está diseñado.
- **T045:** `aws iam simulate-principal-policy` sobre el rol de plan: `s3:GetObject` permitido; `s3:PutObject`, `s3:DeleteObject`, `cognito-idp:DeleteUserPool` e `iam:CreateUser` en `implicitDeny`.
- **Sin probar en la práctica:** el caso de una propuesta desde un fork. Se apoya en el `if` del trabajo `plan` (`head.repo.full_name == github.repository`) y no se puede simular sin un fork.

### T046: operador sin AdministratorAccess (2026-11-09)

- `terraform-dev` quedó solo con la política `medicia-dev-terraform-operator` (sin `AdministratorAccess`).
- `plan` de `infra/environments/dev`: "No changes" a la primera.
- `plan` de `infra/bootstrap`: falló con `AccessDenied` en `s3:GetBucketPolicy`. Esa raíz administra la configuración del propio bucket y el operador solo tenía permisos sobre los objetos. Se agregó a `operator-policy.tf` la declaración `GestionarElBucketDelEstado` (lectura de toda la configuración del bucket más las escrituras que usa la raíz; sin crear ni borrar el bucket).
- Como el plan fallaba antes de poder aplicar la corrección, se aplicó con `-refresh=false` (el operador puede editar su propia política). Después, `plan` completo: "No changes".
- Lección: para una raíz que administra un recurso, el operador necesita leer toda la configuración de ese recurso, no solo usarlo.
- Para cambios que exijan permisos nuevos y rompan el refresco, el camino sin volver a ser administrador es `apply -refresh=false`.

### T050: comprobación final (2026-11-09)

- `terraform fmt -check -recursive infra`: sin diferencias.
- `validate`: correcto en `bootstrap`, `modules/identity` y `environments/dev`.
- `terraform test`: 15 pruebas en `bootstrap` y 17 en `modules/identity`, todas en verde.
- Los tres `.terraform.lock.hcl` están versionados.
- `npm run check`: en verde (no se tocó código de la aplicación).
- Nota: `init -backend=false` falla localmente en `bootstrap` y `environments/dev` si el directorio ya tiene un backend inicializado y la terminal no tiene credenciales de AWS (intenta leer el backend en caché). En una copia limpia funciona, y en CI también. No es un defecto del código.

### T051: revisión de infraestructura y de seguridad (2026-11-09)

Se ejecutó la revisión de seguridad (`security-reviewer`) y la de infraestructura. El subagente `infra-reviewer` no estaba registrado en la sesión (los agentes se cargan al iniciar), así que se aplicaron sus criterios (`.claude/agents/infra-reviewer.md` y `.agents/reviewers/infrastructure.md`) con un agente general. No fue el subagente oficial. Sin hallazgos bloqueantes de código; hallazgos y resolución:

- **La política del operador equivalía a administrador (importante, ambas revisiones).** Podía editar su propia política (`CreatePolicyVersion` sobre `medicia-dev-*`) y crear usuarios con políticas en línea y claves. Decisión del responsable: cerrarlo ahora. Se agregó la política límite `medicia-dev-boundary` (techo del rol de plan y del usuario de la aplicación: lectura más `AdminSetUserPassword`), la condición `iam:PermissionsBoundary` para crear o modificar usuarios y roles, y un `Deny` sobre las políticas del operador y del límite y sobre quitar el límite. Con pruebas y mutaciones verificadas. Consecuencia: cambiar los permisos del operador exige una vía de administración aparte (README, "Cambiar los permisos del operador"); el atajo `apply -refresh=false` de T046 ya no existe.
- **Guarda de no aplicar (corregida).** La expresión no detectaba `terraform -chdir=... apply`, la forma que usa el propio flujo. Ahora admite opciones intermedias y `force-unlock`; se comprobó contra casos y contra el propio flujo.
- **Acciones de GitHub fijadas por SHA de commit** (con la versión en un comentario), porque el trabajo `plan` recibe credenciales por OIDC. Se actualizan en cambios separados (FR-015). No pude verificar que cada etiqueta no haya sido reescrita antes de resolverla.
- **Filtro de rutas** ampliado a `.github/workflows/**`.
- **Guarda de etiquetas** ahora busca dentro del bloque `default_tags`.
- **Limpieza:** línea suelta en `.trivyignore`; cabecera engañosa de `backend.tf`; comentario que justifica `cognito-idp:*` (acotado a los grupos de esta cuenta y región).
- **MFA:** el contrato decía "Requiere MFA, igual que hoy", pero la política no lo exige y las claves de la CLI no usan MFA. Se corrigió el contrato.
- **Pendiente, aceptado para desarrollo:** una propuesta del mismo repositorio puede modificar el flujo y leer el estado de dev (rol de plan con acceso al estado, que contiene secretos; además `DescribeUserPoolClient` devuelve el secreto del cliente). Antes de sumar colaboradores o crear producción: Environment de GitHub con revisor obligatorio y cambio del `sub` a `environment:`.
- **Pendiente, validar a mano:** protección de la rama `main` que exija los trabajos de `infra.yml`; propuestas desde forks (no probadas); que la raíz no tenga claves de acceso.
- **Sin cubrir:** `tflint` y `trivy` no se corrieron localmente; el CI los ejecuta.

### Política límite aplicada y verificada (2026-11-09)

- Primer plan de `bootstrap` con la descripción de la política del operador cambiada: proponía reemplazarla (1 to destroy). La descripción de una política de IAM fuerza el reemplazo, y destruirla exige desadjuntarla, algo que el operador no puede hacer. No se aplicó; se devolvió la descripción original y quedó un comentario en `operator-policy.tf`.
- Plan corregido: 1 para crear (límite), 2 cambios en el lugar (política del operador y rol de plan), 0 para destruir. Aplicado en dos pasos con `-target` (política y límite primero) para evitar la carrera de permisos del rol. Plan posterior: "No changes".
- `environments/dev`: 1 cambio en el lugar (el límite en `medicia-dev-app`). `aws iam get-user` devuelve `medicia-dev-boundary`.
- Prueba directa del `Deny`: `iam:CreatePolicyVersion` sobre la política del operador desde `terraform-dev` falla con "explicit deny in an identity-based policy".
- `iam:SimulatePrincipalPolicy` ya no está permitido para `terraform-dev` (antes lo cubría `AdministratorAccess`). No se agregó: las simulaciones requieren la vía de administración.
