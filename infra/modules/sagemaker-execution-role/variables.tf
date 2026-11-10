variable "environment" {
  type        = string
  description = "Entorno de despliegue. Por ahora solo existe dev."

  validation {
    condition     = var.environment == "dev"
    error_message = "El entorno debe ser dev."
  }
}

variable "account_id" {
  type        = string
  description = "ID de la cuenta de AWS (12 dígitos). Acota la confianza del rol a esta cuenta."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de cuenta debe tener 12 dígitos."
  }
}

variable "region" {
  type        = string
  description = "Región de AWS donde viven los puntos de inferencia y sus grupos de registros."
  default     = "sa-east-1"
}

variable "artifacts_bucket_arn" {
  type        = string
  description = "ARN del bucket de artefactos de modelos, el único bucket que el rol puede leer."

  validation {
    condition     = can(regex("^arn:aws:s3:::.+$", var.artifacts_bucket_arn))
    error_message = "El ARN del bucket debe tener el formato arn:aws:s3:::nombre."
  }
}

variable "permissions_boundary_arn" {
  type        = string
  description = "ARN de la política límite del rol (medicia-dev-sagemaker-boundary, creada por infra/bootstrap)."

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/.+$", var.permissions_boundary_arn))
    error_message = "El límite de permisos debe ser el ARN de una política de IAM."
  }
}

variable "ecr_repository_arn" {
  type        = string
  description = "ARN del repositorio de ECR con la imagen del modelo, el único del que el rol puede descargar."

  validation {
    condition     = can(regex("^arn:aws:ecr:[a-z0-9-]+:[0-9]{12}:repository/[a-z0-9][a-z0-9/_-]*$", var.ecr_repository_arn))
    error_message = "El ARN del repositorio debe tener el formato arn:aws:ecr:<región>:<cuenta>:repository/<nombre>, sin comodines."
  }
}
