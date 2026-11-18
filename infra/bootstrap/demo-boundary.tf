# Techo EC2 independiente: nunca concatenar estas declaraciones al límite compartido.
# El rol/perfil y su política efectiva pertenecen a demo-host (T014), no a bootstrap.
variable "demo_runtime" {
  description = "Referencias exactas no sensibles aprobadas por administrador; null hasta disponer de pool, secretos runtime y release reales. Nunca valores secretos."
  type = object({
    user_pool_arn       = string
    secret_arns         = set(string)
    release_key         = string
    model_endpoint_arns = set(string)
  })
  default = null

  validation {
    condition = var.demo_runtime == null ? true : (
      can(regex("^arn:aws:cognito-idp:${var.region}:${var.account_id}:userpool/[A-Za-z0-9_-]+$", var.demo_runtime.user_pool_arn))
      && length(var.demo_runtime.secret_arns) == 2
      && alltrue([for a in var.demo_runtime.secret_arns : can(regex("^arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:medicia-${var.environment}-demo/(app|duckdns)-[A-Za-z0-9]{6}$", a))])
      && toset([for a in var.demo_runtime.secret_arns : try(regex("/(app|duckdns)-", a)[0], "invalid")]) == toset(["app", "duckdns"])
      && can(regex("^releases/[A-Za-z0-9][A-Za-z0-9/_.-]+[.]tar[.]gz$", var.demo_runtime.release_key))
      && !strcontains(var.demo_runtime.release_key, "..")
      && !strcontains(var.demo_runtime.release_key, "//")
      && length(var.demo_runtime.model_endpoint_arns) >= 1 && length(var.demo_runtime.model_endpoint_arns) <= 2
      && alltrue([for a in var.demo_runtime.model_endpoint_arns : can(regex("^arn:aws:sagemaker:${var.region}:${var.account_id}:endpoint/medicia-${var.environment}-[a-z0-9-]+$", a))])
    )
    error_message = "demo_runtime requiere pool exacto, dos secretos app/duckdns del entorno, release versionado sin traversal y uno o dos endpoints exactos, sin comodines."
  }
}

locals {
  demo_boundary_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-demo-boundary"
  demo_role_arn     = "arn:aws:iam::${var.account_id}:role/medicia-${var.environment}-demo-web"
  demo_profile_arn  = "arn:aws:iam::${var.account_id}:instance-profile/medicia-${var.environment}-demo-web"
  demo_releases_arn = "arn:aws:s3:::medicia-releases-${var.environment}-${var.account_id}"
  demo_ec2_prefix   = "arn:aws:ec2:${var.region}:${var.account_id}"
  demo_rds_arns     = [for t in ["db", "pg", "subgrp", "snapshot"] : "arn:aws:rds:${var.region}:${var.account_id}:${t}:medicia-${var.environment}-demo*"]
  demo_secret_arns  = [for n in ["app", "duckdns"] : "arn:aws:secretsmanager:${var.region}:${var.account_id}:secret:medicia-${var.environment}-demo/${n}-??????"]
  demo_resource_tag = { StringEquals = { "aws:ResourceTag/Deployment" = "ec2-rds-demo" } }
  demo_request_tag  = { StringEquals = { "aws:RequestTag/Deployment" = "ec2-rds-demo" } }
}

resource "aws_iam_policy" "demo_boundary" {
  name        = "medicia-${var.environment}-demo-boundary"
  description = "Techo exclusivo del rol web EC2 de la demo: runtime exacto y canales SSM, sin estado ni master RDS."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid       = "EstadoDelAgente"
        Effect    = "Allow"
        Action    = ["ssm:UpdateInstanceInformation"]
        Resource  = ["${local.demo_ec2_prefix}:instance/*"]
        Condition = local.demo_resource_tag
      },
      {
        # Estas tres APIs no admiten recursos. No son permisos del iniciador SSM.
        Sid      = "CanalesDelAgente"
        Effect   = "Allow"
        Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel"]
        Resource = ["*"]
      },
      {
        Sid      = "AbrirCanalDeSesion"
        Effect   = "Allow"
        Action   = ["ssmmessages:OpenDataChannel"]
        Resource = ["arn:aws:ssm:${var.region}:${var.account_id}:session/*"]
      },
      {
        Sid      = "NuncaEstado"
        Effect   = "Deny"
        Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
        Resource = [local.state_bucket_arn, "${local.state_bucket_arn}/*"]
      },
      ], flatten([for runtime in var.demo_runtime[*] : [
        {
          Sid      = "PoolExacto"
          Effect   = "Allow"
          Action   = ["cognito-idp:AdminSetUserPassword"]
          Resource = [runtime.user_pool_arn]
        },
        {
          Sid      = "Estudios"
          Effect   = "Allow"
          Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
          Resource = ["${local.studies_bucket_arn}/studies/*"]
        },
        {
          Sid       = "ConciliarEstudios"
          Effect    = "Allow"
          Action    = ["s3:ListBucket"]
          Resource  = [local.studies_bucket_arn]
          Condition = { StringLike = { "s3:prefix" = ["studies/*"] } }
        },
        {
          Sid      = "SecretosRuntimeExactos"
          Effect   = "Allow"
          Action   = ["secretsmanager:GetSecretValue"]
          Resource = sort(tolist(runtime.secret_arns))
        },
        {
          Sid      = "ReleaseExacto"
          Effect   = "Allow"
          Action   = ["s3:GetObject"]
          Resource = ["${local.demo_releases_arn}/${runtime.release_key}"]
        },
        {
          Sid      = "InferenciaExacta"
          Effect   = "Allow"
          Action   = ["sagemaker:InvokeEndpoint"]
          Resource = sort(tolist(runtime.model_endpoint_arns))
        },
    ]]))
  })
}
