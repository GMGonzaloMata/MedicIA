# Segunda política del operador: SageMaker, entrega del rol de ejecución y ECR (005).
#
# Se separa de operator-policy.tf porque una política administrada de IAM admite hasta 6.144 caracteres y la
# primera ya está cerca del tope. Se adjunta a terraform-dev junto con la primera, por la vía de administración
# (infra/README.md, "Cambiar los permisos del operador"). El operador no puede editarla ni borrarla: el ARN figura
# en el Deny ProtegerLasPoliticasDeAcceso de operator-policy.tf.
#
# Mínimo privilegio: acciones enumeradas, recursos con el prefijo medicia-dev-, sin comodines de acciones ni de
# servicio. Las excepciones con Resource "*" existen porque AWS no permite limitar esas acciones a un recurso.

resource "aws_iam_policy" "operator_ml" {
  name = "medicia-${var.environment}-terraform-operator-ml"

  # No cambiar la descripción: en IAM fuerza reemplazar la política, y destruirla exige desadjuntarla
  # de terraform-dev, algo que el operador no puede hacer.
  description = "Permisos del operador para SageMaker, entregar el rol de ejecución y gestionar ECR del entorno."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Modelos, configuraciones y puntos de inferencia del entorno. InvokeEndpoint permite probar el modelo.
        Sid    = "GestionarSageMakerDelEntorno"
        Effect = "Allow"
        Action = [
          "sagemaker:AddTags",
          "sagemaker:CreateEndpoint",
          "sagemaker:CreateEndpointConfig",
          "sagemaker:CreateModel",
          "sagemaker:DeleteEndpoint",
          "sagemaker:DeleteEndpointConfig",
          "sagemaker:DeleteModel",
          "sagemaker:DeleteTags",
          "sagemaker:DescribeEndpoint",
          "sagemaker:DescribeEndpointConfig",
          "sagemaker:DescribeModel",
          "sagemaker:InvokeEndpoint",
          "sagemaker:ListTags",
          "sagemaker:UpdateEndpoint",
        ]
        Resource = [
          "${local.sagemaker_arn_prefix}:endpoint/${local.iam_prefix}*",
          "${local.sagemaker_arn_prefix}:endpoint-config/${local.iam_prefix}*",
          "${local.sagemaker_arn_prefix}:model/${local.iam_prefix}*",
        ]
      },
      {
        # Los listados no admiten limitar el recurso.
        Sid    = "ListarSageMaker"
        Effect = "Allow"
        Action = [
          "sagemaker:ListEndpointConfigs",
          "sagemaker:ListEndpoints",
          "sagemaker:ListModels",
        ]
        Resource = ["*"]
      },
      {
        # Defensa adicional: un modelo sin aislamiento de red no se puede crear. Es un Deny con la clave en falso
        # y no un Allow con la clave en verdadero: si AWS no evalúa esta clave en CreateModel, el Deny no hace nada
        # y no rompe el despliegue. El aislamiento también lo exige el módulo model-endpoints y lo prueban sus tests.
        Sid      = "NoCrearModelosSinAislamientoDeRed"
        Effect   = "Deny"
        Action   = ["sagemaker:CreateModel"]
        Resource = ["*"]
        Condition = {
          Bool = {
            "sagemaker:NetworkIsolation" = "false"
          }
        }
      },
      {
        # Entregar a SageMaker únicamente el rol de ejecución. Es la protección contra escalar privilegios.
        Sid      = "EntregarElRolDeEjecucionASageMaker"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [local.execution_role_arn]
        Condition = {
          StringEquals = {
            "iam:PassedToService" = "sagemaker.amazonaws.com"
          }
        }
      },
      {
        # Crear y configurar los repositorios de imágenes del entorno.
        Sid    = "GestionarRepositoriosDeImagenes"
        Effect = "Allow"
        Action = [
          "ecr:CreateRepository",
          "ecr:DeleteLifecyclePolicy",
          "ecr:DeleteRepository",
          "ecr:DescribeRepositories",
          "ecr:GetLifecyclePolicy",
          "ecr:GetRepositoryPolicy",
          "ecr:ListTagsForResource",
          "ecr:PutImageScanningConfiguration",
          "ecr:PutImageTagMutability",
          "ecr:PutLifecyclePolicy",
          "ecr:TagResource",
          "ecr:UntagResource",
        ]
        Resource = [local.ecr_repository_arn_pattern]
      },
      {
        # Subir y leer imágenes. Sin ecr:BatchDeleteImage: una imagen publicada es una versión trazable, y las viejas
        # vencen con la política de ciclo de vida del repositorio.
        Sid    = "SubirYLeerImagenes"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability",
          "ecr:BatchGetImage",
          "ecr:CompleteLayerUpload",
          "ecr:DescribeImages",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:ListImages",
          "ecr:PutImage",
          "ecr:UploadLayerPart",
        ]
        Resource = [local.ecr_repository_arn_pattern]
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
