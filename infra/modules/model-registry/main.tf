# Repositorio privado de ECR con la imagen de inferencia de un modelo (005). Guarda solo imágenes de modelos: nunca
# datos de pacientes ni pesos (los pesos van en el bucket de artefactos).

locals {
  # Se arman con cadenas conocidas, no con atributos del recurso: así se pueden verificar en las pruebas y en las
  # políticas de infra/bootstrap, que repiten el nombre.
  repository_name = "medicia-${var.environment}-${var.name}"
  repository_arn  = "arn:aws:ecr:${var.region}:${var.account_id}:repository/${local.repository_name}"
  repository_url  = "${var.account_id}.dkr.ecr.${var.region}.amazonaws.com/${local.repository_name}"
}

resource "aws_ecr_repository" "this" {
  name = local.repository_name

  # Etiquetas inmutables: una versión publicada siempre apunta a la misma imagen. Es la base de la trazabilidad
  # (Principio IV): el catálogo referencia la imagen por su etiqueta de versión.
  image_tag_mutability = "IMMUTABLE"

  # No se puede destruir con imágenes adentro sin vaciarlo antes a propósito.
  force_delete = false

  image_scanning_configuration {
    scan_on_push = true
  }

  # AES-256 gestionado por AWS: cifra en reposo sin costo. Una clave propia de KMS queda para producción.
  encryption_configuration {
    encryption_type = "AES256"
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  repository = aws_ecr_repository.this.name

  # El orden importa: "any" debe ir en la última prioridad. Un modelo en uso necesita que su versión siga acá:
  # con más de keep_last_images versiones nuevas, la más vieja vence.
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Borrar las imágenes sin etiqueta a los 7 días"
        selection = {
          tagStatus   = "untagged"
          countType   = "sinceImagePushed"
          countUnit   = "days"
          countNumber = 7
        }
        action = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Conservar solo las últimas ${var.keep_last_images} imágenes"
        selection = {
          tagStatus   = "any"
          countType   = "imageCountMoreThan"
          countNumber = var.keep_last_images
        }
        action = { type = "expire" }
      },
    ]
  })
}
