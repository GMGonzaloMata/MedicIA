data "aws_caller_identity" "current" {}

# Bucket que guarda el estado remoto de Terraform. El estado contiene secretos
# (por ejemplo el secreto del cliente de Cognito), por eso es privado, cifrado y versionado.
resource "aws_s3_bucket" "state" {
  bucket        = local.state_bucket_name
  force_destroy = false

  lifecycle {
    prevent_destroy = true

    precondition {
      condition     = !endswith(data.aws_caller_identity.current.arn, ":root")
      error_message = "No se aplica con la cuenta raíz. Usá un usuario IAM de trabajo, como terraform-dev."
    }
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id

  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id

  # SSE-S3: cifra en reposo sin costo. Una clave propia de KMS cuesta unos 1 USD al mes
  # y queda para el entorno de producción (ver research.md, R3).
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket = aws_s3_bucket.state.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id

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
  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource = [
          local.state_bucket_arn,
          "${local.state_bucket_arn}/*",
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
  depends_on = [aws_s3_bucket_public_access_block.state]
}
