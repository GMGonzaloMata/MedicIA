# Bucket privado de artefactos de modelos (pesos y código de inferencia). Solo artefactos de modelos:
# nunca datos de pacientes ni estudios (FR-004). Sigue el patrón del bucket del estado de infra/bootstrap.

locals {
  # Se arman con cadenas conocidas, no con atributos del recurso: así se pueden verificar en las pruebas.
  bucket_name = "medicia-models-${var.environment}-${var.account_id}"
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

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  # SSE-S3: cifra en reposo sin costo. Una clave propia de KMS cuesta unos 1 USD al mes
  # y queda para el entorno de producción (ver research.md, R2).
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    id     = "vencer-versiones-no-vigentes"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }

  # La regla actúa sobre versiones, así que el versionado tiene que existir antes.
  depends_on = [aws_s3_bucket_versioning.this]
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
