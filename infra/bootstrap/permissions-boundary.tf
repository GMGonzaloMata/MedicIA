# Política límite (permissions boundary): el techo de permisos del rol de plan y del usuario de la aplicación.
# Sin ella, quien pueda crear o editar usuarios y roles con prefijo medicia-dev- podría darse permisos
# de administrador. El operador solo puede crear o modificar principales que lleven este límite, y no puede
# editar ni borrar esta política (ver operator-policy.tf).

locals {
  # Se arma con cadenas conocidas, no con el atributo del recurso, para poder decodificarla en las pruebas.
  boundary_policy_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-boundary"
}

resource "aws_iam_policy" "boundary" {
  name        = "medicia-${var.environment}-boundary"
  description = "Techo de permisos de los principales del entorno: lectura, fijar contraseñas en el grupo de usuarios y guardar estudios."

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      local.plan_read_statements,
      [
        {
          # Lo único que escribe la aplicación: fijar la contraseña elegida al verificar el correo.
          Sid      = "FijarContrasenaEnElGrupo"
          Effect   = "Allow"
          Action   = ["cognito-idp:AdminSetUserPassword"]
          Resource = ["arn:aws:cognito-idp:${var.region}:${var.account_id}:userpool/*"]
        },
        {
          # Los estudios de ECG (006): la aplicación guarda, lee y borra los objetos del prefijo studies/. Es la
          # misma lista que concede infra/modules/identity al usuario de la aplicación; sin ella allá, esta no tiene
          # efecto, y sin esta, aquella tampoco. Nunca el bucket de artefactos de modelos.
          Sid      = "GuardarLeerYBorrarEstudios"
          Effect   = "Allow"
          Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
          Resource = ["${local.studies_bucket_arn}/studies/*"]
        },
        {
          Sid      = "ListarEstudiosParaConciliar"
          Effect   = "Allow"
          Action   = ["s3:ListBucket"]
          Resource = [local.studies_bucket_arn]
          Condition = {
            StringLike = {
              "s3:prefix" = ["studies/*"]
            }
          }
        },
      ],
    )
  })
}
