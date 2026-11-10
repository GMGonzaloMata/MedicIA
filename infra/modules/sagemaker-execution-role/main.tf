# Rol que SageMaker asume para ejecutar un modelo: lee su artefacto, descarga su imagen y escribe sus registros.
# Mínimo privilegio: sin comodines, sin otros buckets y sin otros servicios.

locals {
  # Se arman con cadenas conocidas, no con atributos del recurso, para poder usarlos en las pruebas.
  role_name = "medicia-${var.environment}-sagemaker-execution"
  role_arn  = "arn:aws:iam::${var.account_id}:role/${local.role_name}"

  # Grupos de registros que SageMaker crea para los puntos de inferencia del entorno.
  log_group_arn = "arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/sagemaker/Endpoints/medicia-${var.environment}-*"
}

resource "aws_iam_role" "this" {
  name        = local.role_name
  description = "Rol de ejecución de SageMaker: lee artefactos de modelos y escribe sus registros."

  # Sin este límite el operador no puede crear el rol (lo exige su política). Es el techo de los permisos de abajo.
  permissions_boundary = var.permissions_boundary_arn

  # Solo SageMaker, y solo para recursos de esta cuenta y región (evita el "confused deputy").
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRole"
        Principal = {
          Service = "sagemaker.amazonaws.com"
        }
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = var.account_id
          }
          ArnLike = {
            "aws:SourceArn" = "arn:aws:sagemaker:${var.region}:${var.account_id}:*"
          }
        }
      },
    ]
  })
}

resource "aws_iam_role_policy" "this" {
  name = "artefactos-y-registros"
  role = aws_iam_role.this.id

  # Esta lista debe coincidir con infra/bootstrap/sagemaker-boundary.tf: el límite es su techo, y lo que
  # exceda el límite no se concede. Incluye la descarga de la imagen desde ECR (005).
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "LeerArtefactosDeModelos"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${var.artifacts_bucket_arn}/*"]
      },
      {
        Sid      = "ListarElBucketDeModelos"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.artifacts_bucket_arn]
      },
      {
        Sid    = "EscribirRegistrosDePuntosDeInferencia"
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents",
        ]
        Resource = [
          local.log_group_arn,
          "${local.log_group_arn}:*",
        ]
      },
      {
        # Descargar la imagen del modelo: solo de su repositorio y sin escribir nada.
        Sid    = "DescargarLaImagenDelModelo"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:GetDownloadUrlForLayer",
        ]
        Resource = [var.ecr_repository_arn]
      },
      {
        # AWS no permite limitar el token de autenticación de ECR a un recurso.
        Sid      = "ObtenerElTokenDeEcr"
        Effect   = "Allow"
        Action   = ["ecr:GetAuthorizationToken"]
        Resource = ["*"]
      },
    ]
  })
}
