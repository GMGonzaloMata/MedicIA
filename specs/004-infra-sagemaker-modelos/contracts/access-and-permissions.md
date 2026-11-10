# Contrato: permisos y orden de los pasos

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R3, R4, R5, R9) | **Base**: [../../003-infra-base-cognito/contracts/ci-and-access.md](../../003-infra-base-cognito/contracts/ci-and-access.md)

Define qué puede hacer cada identidad con los recursos nuevos y en qué orden se otorgan los permisos. Ninguna automatización de CI aplica cambios (FR-020).

## Rol de ejecución `medicia-dev-sagemaker-execution`

- **Quién lo asume:** únicamente `sagemaker.amazonaws.com`, con `aws:SourceAccount` igual a `896618135592` y `aws:SourceArn` de esta cuenta y región.
- **Permisos, todos con acción enumerada:**
  - `s3:GetObject` sobre `arn:aws:s3:::medicia-models-dev-896618135592/*`.
  - `s3:ListBucket` sobre `arn:aws:s3:::medicia-models-dev-896618135592`.
  - `logs:CreateLogGroup`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre `arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*` y sus flujos.
- **Prohibido (lo verifica una prueba):** acciones con `*`, el servicio `*`, otros buckets, otros grupos de registros, otro principal en la confianza.
- **Límite:** `medicia-dev-sagemaker-boundary`, con las mismas sentencias. Un rol sin ese límite no puede crearse con la política del operador.

## Política límite `medicia-dev-sagemaker-boundary`

- Creada por `infra/bootstrap`, que aplica un administrador.
- Es el techo solo del rol de ejecución. No se asigna al rol de plan ni al usuario de la aplicación.
- Debe incluir, como mínimo, todo lo que el rol necesita; una prueba compara ambas listas.

## Operador `terraform-dev` (política `medicia-dev-terraform-operator`)

Cambios respecto de la 003, aplicados por un administrador:

- **Agrega:**
  - Crear, configurar y borrar el bucket `medicia-models-dev-*` (el borrado sigue protegido por `prevent_destroy` y las versiones): crear, versionado, cifrado, ciclo de vida, bloqueo público, propiedad, política, etiquetas y lectura de su configuración. Sin acceso a otros buckets.
  - `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion` y `s3:ListBucket` sobre ese bucket, para subir y verificar artefactos.
  - `iam:CreateRole`, `iam:PutRolePolicy` y `iam:PutRolePermissionsBoundary` sobre `role/medicia-dev-sagemaker-execution`, solo con `iam:PermissionsBoundary` igual a `medicia-dev-sagemaker-boundary`.
- **Conserva:** que los demás roles y usuarios `medicia-dev-*` solo se crean con `medicia-dev-boundary`.
- **Suma al `Deny`:** el ARN de `medicia-dev-sagemaker-boundary` en las acciones que editan o borran políticas.
- **No incluye:** `s3:DeleteObject`, `s3:DeleteObjectVersion`, ninguna acción de `sagemaker:*` y ningún `iam:PassRole`. Los permisos de SageMaker se otorgan con el primer modelo.

## Rol de plan `medicia-dev-plan` y su límite

- **Agrega lectura (y nada más):**
  - Sobre el bucket de modelos: `s3:ListBucket` y las acciones `s3:Get*` enumeradas de su configuración (versionado, cifrado, ciclo de vida, bloqueo público, política, etiquetas, ubicación, propiedad).
  - Sobre `role/medicia-dev-sagemaker-execution`: `iam:GetRole`, `iam:GetRolePolicy`, `iam:ListRolePolicies`, `iam:ListAttachedRolePolicies`, `iam:ListRoleTags` e `iam:ListInstanceProfilesForRole`.
- **Dónde:** en `plan_read_statements`, la fuente única que usan el rol de plan y `medicia-dev-boundary`, para que el techo nunca quede por debajo de lo que el rol necesita (R4).
- **No agrega:** escrituras, `s3:GetObject` sobre los artefactos, ni acciones de SageMaker (no hay recursos de SageMaker en esta entrega).
- **Efecto en la aplicación:** ninguno. El usuario `medicia-dev-app` comparte el límite, pero su política en línea no cambia.

## Orden de los pasos

1. **Administrador** (usuario raíz con MFA o un administrador): aplica `infra/bootstrap`. Crea el límite nuevo, ajusta la política del operador y amplía la lectura del plan.
2. **Operador**: aplica `infra/environments/dev`. Crea el bucket y el rol.
3. **Responsable**: sube los artefactos al bucket, con sus credenciales, cuando haya un modelo (fuera de esta entrega).
4. **Propuesta de cambio**: el plan de CI ya puede leer los recursos nuevos. Abrir la propuesta antes del paso 1 hace fallar el plan de CI.

## Errores esperados si se rompe el orden

- Operador antes del paso 1: `AccessDenied` al crear el bucket o `iam:CreateRole` sin el límite nuevo.
- Propuesta antes del paso 1: el plan de CI falla con `AccessDenied` al leer el bucket o el rol.
- Crear el rol sin `permissions_boundary`: `AccessDenied` por la condición. Es el comportamiento buscado.

## Qué verifica la revisora de infraestructura

- Ninguna acción comodín en el rol de ejecución, su límite ni las sentencias nuevas del operador, salvo las ya admitidas de la 003.
- El rol de ejecución no puede asumirlo otro principal ni leer otro bucket.
- El bucket sigue privado y cifrado, y el `Deny` por TLS permanece.
- El plan no propone puntos de inferencia encendidos que no estén pedidos en la propuesta.
- Un plan que reemplaza o destruye el bucket se señala como bloqueante.
