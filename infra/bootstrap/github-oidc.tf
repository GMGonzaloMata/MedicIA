# Acceso de solo lectura para el plan que corre en CI (FR-017, FR-018).
# GitHub se identifica con un token de corta duración: no hay claves de AWS guardadas en GitHub.

locals {
  github_oidc_host = "token.actions.githubusercontent.com"

  # Se arman con cadenas conocidas, no con atributos de otros recursos, para poder decodificarlos en las pruebas.
  github_oidc_provider_arn = "arn:aws:iam::${var.account_id}:oidc-provider/${local.github_oidc_host}"

  # Lectura de solo lo que usa el plan. Una sola fuente: la usan el rol de plan y la política límite,
  # para que el límite nunca quede por debajo de lo que el rol necesita.
  plan_read_statements = [
    {
      Sid      = "ListarElBucketDelEstado"
      Effect   = "Allow"
      Action   = ["s3:ListBucket"]
      Resource = [local.state_bucket_arn]
    },
    {
      Sid      = "LeerElEstadoDelEntorno"
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = ["${local.state_bucket_arn}/environments/${var.environment}/*"]
    },
    {
      # Acciones que usa el refresco del grupo de usuarios y su cliente. Una por una, sin comodines.
      Sid    = "LeerCognito"
      Effect = "Allow"
      Action = [
        "cognito-idp:DescribeUserPool",
        "cognito-idp:DescribeUserPoolClient",
        "cognito-idp:GetUserPoolMfaConfig",
        "cognito-idp:ListTagsForResource",
        "cognito-idp:ListUserPoolClients",
        "cognito-idp:ListUserPools",
      ]
      Resource = ["arn:aws:cognito-idp:${var.region}:${var.account_id}:userpool/*"]
    },
    {
      # Acciones que usa el refresco del usuario de la aplicación, su política y su clave.
      Sid    = "LeerIamDelEntorno"
      Effect = "Allow"
      Action = [
        "iam:GetUser",
        "iam:GetUserPolicy",
        "iam:ListAccessKeys",
        "iam:ListAttachedUserPolicies",
        "iam:ListUserPolicies",
        "iam:ListUserTags",
      ]
      Resource = ["arn:aws:iam::${var.account_id}:user/medicia-${var.environment}-*"]
    },
    {
      # Configuración del bucket de artefactos de modelos (lo que lee el refresco del bucket). Nunca sus objetos.
      Sid    = "LeerElBucketDeModelos"
      Effect = "Allow"
      Action = [
        "s3:GetAccelerateConfiguration",
        "s3:GetBucketAcl",
        "s3:GetBucketCORS",
        "s3:GetBucketLocation",
        "s3:GetBucketLogging",
        "s3:GetBucketObjectLockConfiguration",
        "s3:GetBucketOwnershipControls",
        "s3:GetBucketPolicy",
        "s3:GetBucketPublicAccessBlock",
        "s3:GetBucketRequestPayment",
        "s3:GetBucketTagging",
        "s3:GetBucketVersioning",
        "s3:GetBucketWebsite",
        "s3:GetEncryptionConfiguration",
        "s3:GetLifecycleConfiguration",
        "s3:GetReplicationConfiguration",
        "s3:ListBucket",
      ]
      Resource = [local.models_bucket_arn]
    },
    {
      # Acciones que usa el refresco del rol de ejecución de SageMaker y su política en línea.
      Sid    = "LeerElRolDeEjecucion"
      Effect = "Allow"
      Action = [
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListInstanceProfilesForRole",
        "iam:ListRolePolicies",
        "iam:ListRoleTags",
      ]
      Resource = [local.execution_role_arn]
    },
  ]
}

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://${local.github_oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
}

resource "aws_iam_role" "plan" {
  name        = "medicia-${var.environment}-plan"
  description = "Plan de solo lectura de infra/ desde las propuestas de cambio de GitHub. No puede modificar nada."

  # Techo de permisos: aunque alguien le agregue una política, no supera el límite.
  permissions_boundary = local.boundary_policy_arn

  # Sujeto y audiencia exactos con StringEquals: un repositorio renombrado o recreado no obtiene acceso.
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = "sts:AssumeRoleWithWebIdentity"
        Principal = {
          Federated = local.github_oidc_provider_arn
        }
        Condition = {
          StringEquals = {
            "${local.github_oidc_host}:aud" = "sts.amazonaws.com"
            "${local.github_oidc_host}:sub" = var.github_oidc_subject
          }
        }
      },
    ]
  })

  depends_on = [aws_iam_openid_connect_provider.github, aws_iam_policy.boundary]
}

resource "aws_iam_role_policy" "plan_read" {
  name = "lectura-del-plan"
  role = aws_iam_role.plan.id

  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = local.plan_read_statements
  })
}
