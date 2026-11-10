# Bucket privado de los estudios de ECG (specs/006-carga-estudios-ecg). Guarda un objeto por estudio, con la
# clave studies/<clínica>/<estudio>.ecg1, que la aplicación arma en el servidor. Nunca artefactos de modelos:
# esos van en el bucket de infra/modules/model-artifacts. Sigue el patrón de ese módulo, con estas diferencias:
# - SIN versionado: eliminar un estudio debe borrarlo de verdad (FR-015 y SC-005). Con versionado quedarían
#   versiones recuperables. Una guarda de CI falla si alguien agrega aws_s3_bucket_versioning.
# - Sin vencimiento de objetos: los plazos de conservación se definen antes de operar con datos reales
#   (principio VI de la constitución).
# El acceso por clínica lo resuelve la aplicación en cada operación; el prefijo de la clave no es la barrera.

locals {
  # Se arman con cadenas conocidas, no con atributos del recurso: así se pueden verificar en las pruebas.
  bucket_name = "medicia-studies-${var.environment}-${var.account_id}"
  bucket_arn  = "arn:aws:s3:::${local.bucket_name}"
}

resource "aws_s3_bucket" "this" {
  bucket        = local.bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # SSE-S3: cifra en reposo sin costo. Una clave propia de KMS cuesta unos 1 USD al mes y queda para
  # el entorno de producción. La aplicación además pide AES256 en cada subida.
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # La aplicación sube con una sola solicitud, así que esto es solo un resguardo contra subidas multiparte
  # abandonadas. No hay vencimiento de objetos.
  rule {
    id     = "abortar-subidas-incompletas"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id

  # Una sola declaración Deny para el tráfico sin TLS. Sin ninguna Allow: nadie de otra cuenta ni el público
  # accede al bucket; las identidades de esta cuenta entran por sus propias políticas de IAM.
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          local.bucket_arn,
          "${local.bucket_arn}/*",
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
    ]
  })

  # Evita el conflicto de AWS al aplicar la política y el bloqueo de acceso público a la vez.
  depends_on = [aws_s3_bucket_public_access_block.this]
}
