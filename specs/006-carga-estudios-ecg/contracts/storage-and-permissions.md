# Contrato: bucket de estudios y permisos

## Bucket

- Nombre: `medicia-studies-${environment}-${account_id}` (por ahora `medicia-studies-dev-896618135592`). Lo crea `infra/modules/study-storage/` desde `infra/environments/dev`.
- Privado, con bloqueo de acceso público completo y propiedad `BucketOwnerEnforced`.
- Cifrado en reposo SSE-S3 (`AES256`).
- Política con un único `Deny` para el tráfico sin TLS y ninguna `Allow`.
- **Sin versionado**: eliminar un objeto lo borra de forma definitiva.
- Ciclo de vida: abortar subidas multiparte incompletas a 1 día. Sin vencimiento de objetos.
- `force_destroy = false` y `prevent_destroy = true`.
- Solo guarda objetos `studies/<tenantId>/<studyId>.ecg1`. Nunca artefactos de modelos (esos van en `medicia-models-…`).

## Quién puede qué

- **Aplicación** (usuario IAM `medicia-dev-app`, política en línea del módulo `identity`):
  - `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre `arn:aws:s3:::medicia-studies-dev-<cuenta>/studies/*`.
  - `s3:ListBucket` sobre `arn:aws:s3:::medicia-studies-dev-<cuenta>` con condición `StringLike` de `s3:prefix` igual a `studies/*` (solo para `studies:reconcile`).
  - Nada más sobre S3. Esta política solo tiene efecto si el límite `medicia-dev-boundary` incluye las mismas acciones.
- **Límite de la aplicación** (`medicia-dev-boundary`, `infra/bootstrap/permissions-boundary.tf`): suma un statement con esos mismos permisos de S3. Por la vía de administración.
- **Operador** (`terraform-dev`, `infra/bootstrap/operator-policy.tf`):
  - Puede crear, configurar y planificar el bucket de estudios (el ARN se suma a los statements que hoy cubren el bucket de modelos).
  - **No puede leer ni borrar los estudios**: un `Deny` explícito sobre `s3:GetObject`, `s3:GetObjectVersion`, `s3:DeleteObject` y `s3:DeleteObjectVersion` en `arn:aws:s3:::medicia-studies-dev-<cuenta>/*`, que gana a cualquier `Allow` (también a uno que el operador se escriba en la política del bucket).
  - Se verifica que la política administrada siga por debajo de los 6.144 caracteres.
- **Plan de CI** (`medicia-dev-plan`): lectura de la configuración del bucket de estudios (las mismas acciones de lectura que ya tiene para los otros buckets). Sin lectura de objetos.
- **SageMaker y su rol de ejecución:** sin acceso al bucket de estudios. La 008 enviará los datos al punto de inferencia desde la aplicación, no desde SageMaker.

## Aplicación de los cambios

1. Rotación de administración (consola como administrador): `terraform -chdir=infra/bootstrap apply`.
2. `terraform -chdir=infra/environments/dev apply`.
3. Migración de Prisma y variables de entorno (`STUDY_STORAGE=s3`, `STUDIES_BUCKET`, `AWS_REGION`).

## Verificaciones (pruebas de Terraform)

- El bucket es privado, cifrado, sin versionado, con TLS obligatorio y `prevent_destroy`.
- El límite y la política de la aplicación no incluyen comodines ni `s3:*`, y no tocan el bucket de modelos.
- El operador tiene el `Deny` de lectura y borrado de estudios; la política administrada del operador no supera el tamaño máximo.
- El plan de CI no puede leer objetos del bucket de estudios.
