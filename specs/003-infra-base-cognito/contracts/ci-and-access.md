# Contrato: revisión en CI y accesos

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R9, R10, R11, R13)

Define el flujo de comprobaciones de `infra/`, la confianza entre GitHub y AWS, y los permisos de cada identidad. Ningún paso del flujo aplica cambios a AWS (FR-018).

## Flujo `.github/workflows/infra.yml`

- **Cuándo corre:** en propuestas de cambio y en `main`, solo si cambian archivos de `infra/` o el propio flujo.
- **Permisos por defecto:** `contents: read`.
- **Concurrencia:** una ejecución por rama; la nueva cancela la anterior, porque el plan no modifica nada.

### Trabajo `static`

No usa credenciales de AWS. Pasos, en orden:

1. Instalar Terraform 1.15.1.
2. `terraform fmt -check -recursive infra`.
3. `terraform init -backend=false` y `terraform validate` en `bootstrap`, `environments/dev` y `modules/identity`.
4. `tflint` con el complemento de AWS, en cada directorio.
5. `terraform test` en `modules/identity`.
6. `trivy config infra` y `trivy fs --scanners secret infra`, con `.trivyignore`.
7. Búsqueda de archivos prohibidos: falla si `git ls-files` incluye `*.tfstate`, `*.tfstate.*`, `*.tfplan`, `*.tfvars` o `.terraform/`, o si el contenido versionado coincide con el patrón de un identificador de clave de acceso (`AKIA` más 16 caracteres) o con una clave privada. La búsqueda se limita a `infra/` y `.github/`, y los patrones se escriben con clases de caracteres para que el propio flujo no coincida.
8. Comprobar que cada raíz tenga su `.terraform.lock.hcl` versionado.
9. Guarda del contrato: falla si `infra/` contiene una declaración `resource "aws_cognito_user_pool_domain"` o `resource "aws_cognito_identity_provider"`, o más de una `resource "aws_cognito_user_pool_client"`.
10. Guarda de no aplicar: falla si algún archivo de `.github/workflows/` contiene `terraform apply`, `destroy`, `import` o `state`. Los patrones se escriben con clases de caracteres para que la guarda no coincida con su propio texto.
11. Guarda de etiquetas: falla si `providers.tf` de `bootstrap` o de `environments/dev` no declara `default_tags` con `Project`, `Environment` y `ManagedBy`.

Si cualquier paso falla, la propuesta no puede incorporarse (historia 4, escenario 2).

### Trabajo `plan`

- **Condición:** corre solo si la propuesta viene de este mismo repositorio. En una propuesta desde un fork se omite.
- **Permisos del trabajo:** `contents: read` e `id-token: write`.
- **Pasos:**
  1. Asumir el rol de plan con `aws-actions/configure-aws-credentials`, usando la variable del repositorio `INFRA_PLAN_ROLE_ARN` y la región `sa-east-1`.
  2. Mostrar el valor del `sub` de la sesión (primera ejecución, para confirmar R10).
  3. `terraform init` y `terraform plan -lock=false -input=false` en `environments/dev`.
  4. Volcar el plan al resumen del trabajo (`GITHUB_STEP_SUMMARY`). Los valores sensibles salen enmascarados.
- **Qué no hace:** no guarda el plan como archivo, no comenta la propuesta y no tiene ningún paso de `apply`.
- **Dependencia:** corre después de `static`.

### Reglas del flujo

- Las acciones de terceros se fijan por versión exacta (R11), y las actualizaciones van en un cambio aparte.
- No hay ningún secreto de GitHub con claves de AWS. La única variable es el ARN del rol, que no es un secreto.
- Un plan que propone destruir o reemplazar el grupo de usuarios se señala como bloqueante en la revisión de la revisora de infraestructura. El plan de CI lo muestra, pero la decisión de aplicarlo es del responsable.

## Confianza de GitHub con AWS

- **Proveedor de identidad:** `https://token.actions.githubusercontent.com`, con `client_id_list = ["sts.amazonaws.com"]`.
- **Política de confianza del rol `medicia-dev-plan`:**
  - Acción: `sts:AssumeRoleWithWebIdentity`.
  - Condición de audiencia: `token.actions.githubusercontent.com:aud` igual a `sts.amazonaws.com`.
  - Condición de sujeto, con `StringEquals`: `token.actions.githubusercontent.com:sub` igual a `repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request`.
- **Por qué un valor exacto:** sin comodines, un repositorio renombrado o recreado con el mismo nombre no obtiene acceso. El valor se confirma con la primera ejecución (R10).
- **Efecto de la confianza:** el rol solo puede asumirse desde propuestas de cambio de este repositorio. La rama principal no puede asumirlo, porque `main` solo corre las comprobaciones estáticas.

## Permisos de cada identidad

- **Rol `medicia-dev-plan` (solo lectura):**
  - `s3:ListBucket` sobre el bucket del estado y `s3:GetObject` sobre las claves de estado del entorno `dev`.
  - Acciones `Describe*`, `Get*` y `List*` de Cognito e IAM que usa el refresco de los recursos de esta funcionalidad.
  - Ninguna acción de escritura, ninguna acción sobre otros servicios y ningún acceso a otros buckets.
- **Usuario `medicia-dev-app` (la aplicación local):**
  - `cognito-idp:AdminSetUserPassword` sobre el grupo de usuarios, y nada más.
- **Operador `terraform-dev` (el responsable), con la política `medicia-dev-terraform-operator`:**
  - Lectura y escritura del estado, incluidos los objetos de bloqueo.
  - Gestión de Cognito.
  - Gestión de usuarios, políticas y claves IAM con prefijo `medicia-dev-`, y del rol y el proveedor de identidad de GitHub.
  - Sin acceso a otros servicios.
  - Requiere MFA, igual que hoy.
- **Cuenta raíz:** sin claves de acceso. Solo se usa desde la consola, con MFA.

## Qué verifica la revisora de infraestructura

Además de lo que ya cubre `.agents/reviewers/infrastructure.md`, en esta funcionalidad se revisa de forma especial:

- La confianza de OIDC usa el sujeto exacto, con `StringEquals`, y la audiencia.
- El rol de plan no tiene acciones de escritura ni acceso a datos de otros buckets.
- El flujo no contiene ningún paso que aplique, destruya o modifique el estado.
- El grupo de usuarios conserva `deletion_protection` y `prevent_destroy`.
