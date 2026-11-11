data "aws_region" "current" {}

# Grupo de usuarios de Cognito. Cumple "Configuración requerida del grupo de usuarios"
# del contrato de la funcionalidad 002 (specs/002-ingreso-sesion/contracts/identity-provider.md).
# Los puntos se verifican en tests/identity.tftest.hcl.
resource "aws_cognito_user_pool" "this" {
  name                     = "medicia-${var.environment}"
  user_pool_tier           = "ESSENTIALS"
  username_attributes      = ["email"]
  auto_verified_attributes = ["email"]
  mfa_configuration        = "OFF"
  deletion_protection      = var.protect_user_pool ? "ACTIVE" : "INACTIVE"

  # El correo no distingue mayúsculas al ingresar.
  username_configuration {
    case_sensitive = false
  }

  # Registro abierto: cualquier persona puede crear su cuenta.
  admin_create_user_config {
    allow_admin_create_user_only = false
  }

  # La verificación del correo es por código numérico. El largo del código lo define Cognito.
  verification_message_template {
    default_email_option = "CONFIRM_WITH_CODE"
  }

  # Remitente por defecto de Cognito, con un tope diario bajo. Alcanza para desarrollo.
  email_configuration {
    email_sending_account = "COGNITO_DEFAULT"
  }

  # Misma política que la aplicación: mínimo 8 caracteres y una mayúscula, sin exigir nada más.
  # Ver src/modules/users/domain/password-policy.ts.
  password_policy {
    minimum_length    = 8
    require_uppercase = true
    require_lowercase = false
    require_numbers   = false
    require_symbols   = false
  }

  account_recovery_setting {
    recovery_mechanism {
      name     = "verified_email"
      priority = 1
    }
  }

  # Atributos obligatorios. Cambiar el esquema de un grupo existente obliga a reemplazarlo
  # y eso borra a todos sus usuarios: cualquier cambio acá se revisa como riesgo bloqueante.
  schema {
    name                = "email"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = "0"
      max_length = "2048"
    }
  }

  schema {
    name                = "name"
    attribute_data_type = "String"
    required            = true
    mutable             = true

    string_attribute_constraints {
      min_length = "0"
      max_length = "2048"
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Único cliente de la aplicación. No hay otro cliente, dominio ni interfaz alojada:
# no existe otra forma de registrarse.
resource "aws_cognito_user_pool_client" "app" {
  name         = "medicia-${var.environment}-app"
  user_pool_id = aws_cognito_user_pool.this.id

  # Cliente confidencial: tiene secreto.
  generate_secret = true

  # Solo ingreso con usuario y contraseña. Sin credenciales de renovación: la aplicación
  # no usa los tokens más allá del ingreso.
  explicit_auth_flows = ["ALLOW_USER_PASSWORD_AUTH"]

  # No revela si un correo tiene cuenta.
  prevent_user_existence_errors = "ENABLED"

  enable_token_revocation              = true
  allowed_oauth_flows_user_pool_client = false

  # Vida mínima permitida para los tokens: 5 minutos. El de renovación no se usa;
  # 60 minutos es el mínimo que acepta el proveedor.
  id_token_validity      = 5
  access_token_validity  = 5
  refresh_token_validity = 60

  token_validity_units {
    id_token      = "minutes"
    access_token  = "minutes"
    refresh_token = "minutes"
  }
}

# Identidad con la que el servidor local fija la contraseña al verificar el correo (R18 de la 002).
# Su único permiso es esa operación sobre este grupo. En producción se reemplaza por un rol del servidor.
resource "aws_iam_user" "app" {
  name = "medicia-${var.environment}-app"

  # Techo de permisos: aunque se le agregue otra política, no puede superar el límite.
  permissions_boundary = var.permissions_boundary_arn
}

resource "aws_iam_user_policy" "app" {
  name = "cognito-set-user-password"
  user = aws_iam_user.app.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "cognito-idp:AdminSetUserPassword"
        Resource = aws_cognito_user_pool.this.arn
      },
    ]
  })
}

# Acceso de la aplicación al bucket de estudios. Solo existe si se pasa el bucket. El techo de permisos
# (medicia-dev-boundary, en infra/bootstrap) debe incluir las mismas acciones; si no, esta política no tiene efecto.
# El prefijo studies/ no es la barrera entre clínicas: eso lo resuelve la aplicación en cada operación.
resource "aws_iam_user_policy" "studies" {
  count = var.studies_bucket_arn == "" ? 0 : 1

  name = "studies-bucket-access"
  user = aws_iam_user.app.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "GuardarLeerYBorrarEstudios"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["${var.studies_bucket_arn}/studies/*"]
      },
      {
        # Solo para conciliar archivos sin registro (npm run studies:reconcile).
        Sid      = "ListarEstudiosParaConciliar"
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = [var.studies_bucket_arn]
        Condition = {
          StringLike = {
            "s3:prefix" = ["studies/*"]
          }
        }
      },
    ]
  })
}

# Invocar el punto de inferencia de EchoNext-Mini (008). Una sola acción sobre un solo recurso: la aplicación no puede
# crear, cambiar ni listar nada de SageMaker. El límite de permisos (medicia-dev-boundary, en infra/bootstrap) debe
# incluir la misma acción y el mismo recurso; si no, esta política no tiene efecto. Quién puede pedir un análisis lo
# decide la aplicación en cada operación, no IAM.
resource "aws_iam_user_policy" "model_endpoint" {
  count = var.model_endpoint_arn == "" ? 0 : 1

  name = "model-endpoint-invoke"
  user = aws_iam_user.app.name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "InvocarModelo"
        Effect   = "Allow"
        Action   = ["sagemaker:InvokeEndpoint"]
        Resource = [var.model_endpoint_arn]
      },
    ]
  })
}

# La clave de acceso queda en el estado, que es privado y cifrado (research.md, R9).
resource "aws_iam_access_key" "app" {
  user = aws_iam_user.app.name
}
