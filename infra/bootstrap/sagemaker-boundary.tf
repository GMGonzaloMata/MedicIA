# Política límite (permissions boundary) del rol de ejecución de SageMaker.
# Es el techo de permisos solo de ese rol y es distinta de medicia-dev-boundary, que fija el techo del rol de
# plan y del usuario de la aplicación (permissions-boundary.tf). El operador solo puede crear el rol de ejecución
# con este límite y no puede editar ni borrar esta política (ver operator-policy.tf).

locals {
  # Fuente única de lo que puede hacer el rol de ejecución: leer artefactos, descargar la imagen de su modelo y
  # escribir sus registros.
  # El módulo infra/modules/sagemaker-execution-role repite esta lista y sus pruebas fijan la misma, así el límite
  # nunca queda por debajo del permiso del rol. Con la descarga de la imagen de EchoNext-Mini desde ECR (005).
  execution_role_statements = [
    {
      Sid      = "LeerArtefactosDeModelos"
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = ["${local.models_bucket_arn}/*"]
    },
    {
      Sid      = "ListarElBucketDeModelos"
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = [local.models_bucket_arn]
    },
    {
      # SageMaker escribe los registros de cada punto de inferencia en /aws/sagemaker/Endpoints/<nombre>.
      Sid    = "EscribirRegistrosDePuntosDeInferencia"
      Effect = "Allow"
      Action = [
        "logs:CreateLogGroup",
        "logs:CreateLogStream",
        "logs:PutLogEvents",
      ]
      Resource = [
        "arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/sagemaker/Endpoints/medicia-${var.environment}-*",
        "arn:aws:logs:${var.region}:${var.account_id}:log-group:/aws/sagemaker/Endpoints/medicia-${var.environment}-*:*",
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
      Resource = [local.ecr_repository_arn]
    },
    {
      # AWS no permite limitar el token de autenticación de ECR a un recurso.
      Sid      = "ObtenerElTokenDeEcr"
      Effect   = "Allow"
      Action   = ["ecr:GetAuthorizationToken"]
      Resource = ["*"]
    },
  ]
}

resource "aws_iam_policy" "sagemaker_boundary" {
  name = "medicia-${var.environment}-sagemaker-boundary"

  # No cambiar la descripción: en IAM fuerza reemplazar la política, y reemplazarla exige quitarla de los roles
  # que la usan como límite, algo que el operador no puede hacer.
  description = "Techo de permisos del rol de ejecución de SageMaker: leer artefactos de modelos y escribir sus registros."

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.execution_role_statements
  })
}
