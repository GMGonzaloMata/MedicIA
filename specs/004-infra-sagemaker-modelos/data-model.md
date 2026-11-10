# Modelo de datos: Infraestructura base de SageMaker

**Plan**: [plan.md](plan.md) | **Investigación**: [research.md](research.md)

Esta funcionalidad no agrega tablas ni modifica la base de datos. Lo que se modela son los recursos de AWS que describe `infra/`, quién los crea y qué relación tienen. Los nombres de recursos de Terraform siguen la guía de estilo de HashiCorp: minúsculas con guion bajo. Todos los recursos llevan las etiquetas `Project`, `Environment` y `ManagedBy` por `default_tags` (FR-016).

## Bucket de artefactos

- **Recurso:** bucket de S3 `medicia-models-<entorno>-<id de cuenta>`, creado por el módulo `model-artifacts` desde `environments/dev`.
- **Atributos de seguridad:**
  - Bloqueo total de acceso público y propiedad forzada del propietario (sin ACL).
  - Versionado, con vencimiento de versiones no vigentes a los 90 días y aborto de cargas multiparte incompletas a los 7.
  - Cifrado SSE-S3 por defecto.
  - Política con una sola sentencia `Deny` para el acceso sin TLS y ninguna sentencia `Allow`.
  - `prevent_destroy = true` y `force_destroy = false`.
- **Contenido:** artefactos de modelos empaquetados (pesos y código de inferencia). Nunca datos de pacientes ni estudios (FR-004).
- **Quién escribe:** el responsable, a mano, con sus credenciales (sube y lee, no borra). Quién lee: el rol de ejecución.
- **Contiene secretos:** no. Puede contener artefactos de acceso restringido, por eso es privado.

## Rol de ejecución

- **Recurso:** rol de IAM `medicia-<entorno>-sagemaker-execution`, creado por el módulo `sagemaker-execution-role`.
- **Confianza:** solo `sagemaker.amazonaws.com`, acotada a esta cuenta con `aws:SourceAccount` y `aws:SourceArn`.
- **Permisos (política en línea):**
  - `s3:GetObject` sobre las claves del bucket de artefactos y `s3:ListBucket` sobre el bucket.
  - `logs:CreateLogGroup`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre los grupos de registros de puntos de inferencia `medicia-<entorno>-*`.
- **Límite de permisos:** `medicia-<entorno>-sagemaker-boundary`, con las mismas tres declaraciones.
- **Reglas:**
  - Sin acciones ni servicios comodín, sin acceso a otros buckets.
  - Solo se crea con el límite propio (condición `iam:PermissionsBoundary` en la política del operador).
  - Los permisos de ECR para descargar la imagen quedan para el primer modelo (R10).

## Política límite de SageMaker

- **Recurso:** política administrada `medicia-<entorno>-sagemaker-boundary`, creada por `infra/bootstrap` (la aplica un administrador).
- **Función:** techo de permisos del rol de ejecución. Es distinta de `medicia-<entorno>-boundary`, que es el techo del rol de plan y del usuario de la aplicación.
- **Reglas:** el operador no puede editarla ni borrarla (`Deny`), y solo puede ponerla al rol de ejecución.

## Catálogo de modelos

- **Qué es:** la variable `models` de `environments/dev`, un mapa de nombre corto a entrada. En esta entrega vale `{}`.
- **Entrada:**
  - `image_uri` (obligatorio): imagen del contenedor de inferencia.
  - `model_data_key` (obligatorio): clave del artefacto dentro del bucket de artefactos.
  - `model_version` (obligatorio): versión exacta del modelo; se etiqueta en los recursos para la trazabilidad de los análisis (constitución IV).
  - `instance_type` (opcional, default `ml.t2.medium`): uno de `ml.t2.medium`, `ml.c5.large` o `ml.m5.large`.
  - `enabled` (opcional, default `false`): interruptor del punto de inferencia.
- **Contrato detallado:** [contracts/model-catalog.md](contracts/model-catalog.md).

## Recursos de una entrada del catálogo

- **Modelo de SageMaker** `medicia-<entorno>-<nombre>-<resumen>` (el resumen de 8 caracteres cambia con la imagen, el artefacto o el rol): referencia la imagen, el artefacto y el rol de ejecución. Siempre existe mientras la entrada exista. No cobra.
- **Configuración del punto de inferencia:** una instancia del tipo elegido, referencia el modelo. Siempre existe con la entrada. No cobra.
- **Punto de inferencia:** el servicio encendido. Existe solo si `enabled` es `true`. **Cobra por hora mientras existe.**
- **Relaciones:** entrada → modelo → configuración → punto de inferencia; todos usan el mismo rol de ejecución y el mismo bucket.

## Estados de una entrada

- **Apagada (`enabled = false`):** existen el modelo y la configuración, no el punto de inferencia. Costo de cómputo cero.
- **Encendida (`enabled = true`):** existe además el punto de inferencia. Cobra por hora según el tipo (ver [research.md](research.md), R7).
- **Transiciones:** apagada a encendida y de vuelta con un solo cambio revisable de `enabled`. Apagar destruye únicamente el punto de inferencia; el bucket, el rol y las demás entradas no se alteran (FR-012).
- **Quitar una entrada:** destruye su modelo y su configuración. Si estaba encendida, hay que apagarla antes y revisar el plan.

## Permisos por identidad (resumen)

- **Operador (`terraform-dev`):** crea el bucket y el rol de ejecución con su límite, sube y lee artefactos. Sin permisos de SageMaker hasta el primer modelo (R5).
- **Rol de plan (`medicia-dev-plan`):** lectura del bucket y del rol de ejecución, y nada más que lectura.
- **Usuario de la aplicación (`medicia-dev-app`):** sin cambios.
- **Detalle:** [contracts/access-and-permissions.md](contracts/access-and-permissions.md).
