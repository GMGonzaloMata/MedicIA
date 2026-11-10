# Política del operador (el responsable que aplica los cambios). Reemplaza a AdministratorAccess (FR-020).
#
# Contención de IAM: el operador gestiona usuarios y roles con prefijo medicia-dev-, pero:
#   - solo puede crearlos o darles políticas si llevan la política límite medicia-dev-boundary
#     (condición iam:PermissionsBoundary), así que nada de lo que cree supera ese techo;
#   - el rol de ejecución de SageMaker lleva su propia política límite (medicia-dev-sagemaker-boundary);
#   - no puede editar ni borrar la propia política del operador ni las políticas límite (Deny), ni quitar
#     el límite a nadie.
# Consecuencia: cambiar esta política o el límite exige una vía de administración aparte (el usuario raíz
# con MFA, o un administrador). Ver infra/README.md, "Cambiar los permisos del operador".

locals {
  iam_prefix = "medicia-${var.environment}-"

  # Se arman con cadenas conocidas, no con atributos del recurso, para poder decodificarlos en las pruebas.
  operator_policy_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-terraform-operator"
}

resource "aws_iam_policy" "operator" {
  name = "medicia-${var.environment}-terraform-operator"

  # No cambiar la descripción: en IAM fuerza reemplazar la política, y destruirla exige desadjuntarla
  # de terraform-dev, algo que el operador no puede hacer.
  description = "Permisos mínimos para aplicar infra/: estado remoto, Cognito y el IAM propio del entorno."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Infra/bootstrap administra el propio bucket: el plan lee toda su configuración y el apply
        # cambia versionado, cifrado, etiquetas y ciclo de vida. La política del bucket y el bloqueo de
        # acceso público NO están acá: con ellas el operador podría darse acceso al estado (que contiene
        # secretos) saltándose el límite. Esos cambios van por la vía de administración (README).
        Sid    = "GestionarLosBucketsDeEstadoYModelos"
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
          "s3:PutBucketTagging",
          "s3:PutBucketVersioning",
          "s3:PutEncryptionConfiguration",
          "s3:PutLifecycleConfiguration",
        ]
        # El bucket de artefactos de modelos comparte esta lista (lectura, versionado, cifrado, ciclo de vida y
        # etiquetas) para no repetir las acciones y no superar el tope de tamaño de una política administrada.
        Resource = [local.state_bucket_arn, local.models_bucket_arn]
      },
      {
        # Crear, borrar y fijar política, bloqueo de acceso público y propiedad: solo el bucket de artefactos.
        # Terraform no puede crearlo sin estos permisos. Se acepta, a diferencia del bucket del estado, porque no
        # guarda secretos; las pruebas y el análisis de seguridad de CI fallan si deja de ser privado o cifrado (R5).
        Sid    = "CrearYConfigurarElBucketDeModelos"
        Effect = "Allow"
        Action = [
          "s3:CreateBucket",
          "s3:DeleteBucket",
          "s3:DeleteBucketPolicy",
          "s3:PutBucketOwnershipControls",
          "s3:PutBucketPolicy",
          "s3:PutBucketPublicAccessBlock",
        ]
        Resource = [local.models_bucket_arn]
      },
      {
        # Subir y leer artefactos con las credenciales del responsable. Sin borrado: un artefacto puede ser
        # costoso de reconseguir, y las versiones viejas vencen solas.
        Sid      = "SubirYLeerArtefactosDeModelos"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"]
        Resource = ["${local.models_bucket_arn}/*"]
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
        # Comodín justificado: Terraform gestiona el grupo y el cliente con decenas de acciones
        # (Create, Update, Describe, Set, Tag...) y enumerarlas deja el plan roto con cada versión
        # nueva del proveedor. El alcance ya está acotado a los grupos de esta cuenta y región.
        # Las pruebas lo admiten solo para cognito-idp:*. Producción debería enumerarlas.
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
          "iam:TagUser",
          "iam:UntagUser",
          "iam:UpdateAccessKey",
          "iam:UpdateUser",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:user/${local.iam_prefix}*"]
      },
      {
        # Crear un usuario, darle una política o ponerle un límite solo se permite con la política límite.
        Sid    = "CrearUsuariosIamConLimite"
        Effect = "Allow"
        Action = [
          "iam:CreateUser",
          "iam:PutUserPermissionsBoundary",
          "iam:PutUserPolicy",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:user/${local.iam_prefix}*"]
        Condition = {
          StringEquals = {
            "iam:PermissionsBoundary" = local.boundary_policy_arn
          }
        }
      },
      {
        Sid    = "GestionarRolesIamDelEntorno"
        Effect = "Allow"
        Action = [
          "iam:DeleteRole",
          "iam:DeleteRolePolicy",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListAttachedRolePolicies",
          "iam:ListInstanceProfilesForRole",
          "iam:ListRolePolicies",
          "iam:ListRoleTags",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateAssumeRolePolicy",
          "iam:UpdateRole",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:role/${local.iam_prefix}*"]
      },
      {
        # Crear un rol, darle una política o ponerle un límite solo se permite con la política límite.
        # Cambiar quién asume un rol (UpdateAssumeRolePolicy) no lleva condición: todo rol medicia-dev-* nace con el límite.
        Sid    = "CrearRolesIamConLimite"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:PutRolePermissionsBoundary",
          "iam:PutRolePolicy",
        ]
        Resource = ["arn:aws:iam::${var.account_id}:role/${local.iam_prefix}*"]
        Condition = {
          StringEquals = {
            "iam:PermissionsBoundary" = local.boundary_policy_arn
          }
        }
      },
      {
        # El rol de ejecución de SageMaker solo se crea con su propio límite, no con el de la aplicación y el plan.
        # Se limita a ese rol: así el operador no puede ponerle este límite a otro (por ejemplo, al rol de plan).
        Sid    = "CrearElRolDeEjecucionConSuLimite"
        Effect = "Allow"
        Action = [
          "iam:CreateRole",
          "iam:PutRolePermissionsBoundary",
          "iam:PutRolePolicy",
        ]
        Resource = [local.execution_role_arn]
        Condition = {
          StringEquals = {
            "iam:PermissionsBoundary" = local.sagemaker_boundary_policy_arn
          }
        }
      },
      {
        # Las políticas del propio operador y de los límites quedan fuera por el Deny de más abajo.
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
      {
        # Un Deny gana a cualquier Allow: el operador no puede darse permisos editando las políticas que lo limitan.
        Sid    = "ProtegerLasPoliticasDeAcceso"
        Effect = "Deny"
        Action = [
          "iam:CreatePolicyVersion",
          "iam:DeletePolicy",
          "iam:DeletePolicyVersion",
          "iam:SetDefaultPolicyVersion",
        ]
        Resource = [
          local.operator_policy_arn,
          local.boundary_policy_arn,
          local.sagemaker_boundary_policy_arn,
        ]
      },
      {
        Sid    = "ProtegerElLimiteDeLosPrincipales"
        Effect = "Deny"
        Action = [
          "iam:DeleteRolePermissionsBoundary",
          "iam:DeleteUserPermissionsBoundary",
        ]
        Resource = [
          "arn:aws:iam::${var.account_id}:role/${local.iam_prefix}*",
          "arn:aws:iam::${var.account_id}:user/${local.iam_prefix}*",
        ]
      },
    ]
  })
}
