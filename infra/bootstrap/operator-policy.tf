# Política del operador (el responsable que aplica los cambios). Reemplaza a AdministratorAccess (FR-020).
# Es un punto de partida: se ajusta con el uso real (T046). Mientras no se adjunte, no cambia ningún permiso.
# Nota aceptada para desarrollo: el operador puede editar roles y políticas con prefijo medicia-dev-,
# incluida esta política. La contención es que no tiene otros servicios ni otros prefijos.

locals {
  iam_prefix = "medicia-${var.environment}-"
}

resource "aws_iam_policy" "operator" {
  name        = "medicia-${var.environment}-terraform-operator"
  description = "Permisos mínimos para aplicar infra/: estado remoto, Cognito y el IAM propio del entorno."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Infra/bootstrap administra el propio bucket: el plan lee toda su configuración
        # y el apply la modifica. Sin crear ni borrar el bucket (eso queda protegido).
        Sid    = "GestionarElBucketDelEstado"
        Effect = "Allow"
        Action = [
          "s3:DeleteBucketPolicy",
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
          "s3:PutBucketPolicy",
          "s3:PutBucketPublicAccessBlock",
          "s3:PutBucketTagging",
          "s3:PutBucketVersioning",
          "s3:PutEncryptionConfiguration",
          "s3:PutLifecycleConfiguration",
        ]
        Resource = [local.state_bucket_arn]
      },
      {
        # Incluye los objetos .tflock del bloqueo nativo de S3.
        Sid      = "LeerYEscribirElEstado"
        Effect   = "Allow"
        Action   = ["s3:DeleteObject", "s3:GetObject", "s3:PutObject"]
        Resource = ["${local.state_bucket_arn}/*"]
      },
      {
        # AWS no permite limitar la creación de un grupo de usuarios a un recurso.
        Sid      = "CrearGrupoDeUsuarios"
        Effect   = "Allow"
        Action   = ["cognito-idp:CreateUserPool"]
        Resource = ["*"]
      },
      {
        Sid      = "GestionarCognito"
        Effect   = "Allow"
        Action   = ["cognito-idp:*"]
        Resource = ["arn:aws:cognito-idp:${var.region}:${var.account_id}:userpool/*"]
      },
      {
        Sid    = "GestionarUsuariosIamDelEntorno"
        Effect = "Allow"
        Action = [
          "iam:CreateAccessKey",
          "iam:CreateUser",
          "iam:DeleteAccessKey",
          "iam:DeleteUser",
          "iam:DeleteUserPolicy",
          "iam:GetUser",
          "iam:GetUserPolicy",
          "iam:ListAccessKeys",
          "iam:ListAttachedUserPolicies",
          "iam:ListGroupsForUser",
          "iam:ListUserPolicies",
          "iam:ListUserTags",
          "iam:PutUserPolicy",
          "iam:TagUser",
          "iam:UntagUser",
          "iam:UpdateAccessKey",
          "iam:UpdateUser",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:user/${local.iam_prefix}*"]
      },
      {
        Sid    = "GestionarRolesIamDelEntorno"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:DeleteRolePolicy",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "iam:ListRolePolicies",
          "iam:ListRoleTags",
          "iam:PutRolePolicy",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:UpdateRole",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:role/${local.iam_prefix}*"]
      },
      {
        Sid    = "GestionarPoliticasIamDelEntorno"
        Effect = "Allow"
        Action = [
          "iam:CreatePolicy",
          "iam:CreatePolicyVersion",
          "iam:DeletePolicy",
          "iam:DeletePolicyVersion",
          "iam:GetPolicy",
          "iam:GetPolicyVersion",
          "iam:ListPolicyTags",
          "iam:ListPolicyVersions",
          "iam:TagPolicy",
          "iam:UntagPolicy",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:policy/${local.iam_prefix}*"]
      },
      {
        Sid    = "GestionarElProveedorDeGitHub"
        Effect = "Allow"
        Action = [
          "iam:AddClientIDToOpenIDConnectProvider",
          "iam:CreateOpenIDConnectProvider",
          "iam:DeleteOpenIDConnectProvider",
          "iam:GetOpenIDConnectProvider",
          "iam:ListOpenIDConnectProviderTags",
          "iam:RemoveClientIDFromOpenIDConnectProvider",
          "iam:TagOpenIDConnectProvider",
          "iam:UntagOpenIDConnectProvider",
          "iam:UpdateOpenIDConnectProviderThumbprint",
        ]
        Resource = [local.github_oidc_provider_arn]
      },
    ]
  })
}
