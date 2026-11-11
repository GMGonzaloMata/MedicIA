# Pruebas del contrato del servicio de identidad (FR-007 a FR-012, FR-020).
# Cada ejecución corresponde a un punto de specs/003-infra-base-cognito/contracts/identity-service.md,
# que a su vez sale de "Configuración requerida del grupo de usuarios" de la funcionalidad 002.
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.

mock_provider "aws" {}

variables {
  environment              = "dev"
  protect_user_pool        = true
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
}

# El ARN del grupo se conoce recién al aplicar. Se fija aquí para poder decodificar la política del usuario.
override_resource {
  target          = aws_cognito_user_pool.this
  override_during = plan
  values = {
    arn = "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_PRUEBA0001"
  }
}

override_data {
  target = data.aws_region.current
  values = {
    region = "sa-east-1"
  }
}

run "ingreso_con_correo_sin_distinguir_mayusculas" {
  command = plan

  assert {
    condition     = toset(aws_cognito_user_pool.this.username_attributes) == toset(["email"])
    error_message = "El ingreso debe hacerse con correo (username_attributes igual a [\"email\"])."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.username_configuration).case_sensitive == false
    error_message = "El correo no debe distinguir mayúsculas (case_sensitive igual a false)."
  }
}

run "registro_abierto" {
  command = plan

  assert {
    condition     = one(aws_cognito_user_pool.this.admin_create_user_config).allow_admin_create_user_only == false
    error_message = "El registro debe estar abierto (allow_admin_create_user_only igual a false)."
  }
}

run "verificacion_del_correo_por_codigo" {
  command = plan

  assert {
    condition     = toset(aws_cognito_user_pool.this.auto_verified_attributes) == toset(["email"])
    error_message = "Debe verificarse automáticamente el correo."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.verification_message_template).default_email_option == "CONFIRM_WITH_CODE"
    error_message = "La verificación debe ser por código (CONFIRM_WITH_CODE), no por enlace."
  }
}

run "atributos_obligatorios_correo_y_nombre" {
  command = plan

  assert {
    condition     = toset([for atributo in aws_cognito_user_pool.this.schema : atributo.name if atributo.required]) == toset(["email", "name"])
    error_message = "Los únicos atributos obligatorios deben ser email y name."
  }
}

run "politica_de_contrasena_de_8_con_una_mayuscula" {
  command = plan

  assert {
    condition     = one(aws_cognito_user_pool.this.password_policy).minimum_length == 8
    error_message = "La longitud mínima de la contraseña debe ser 8."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.password_policy).require_uppercase == true
    error_message = "La contraseña debe exigir al menos una mayúscula."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.password_policy).require_lowercase == false
    error_message = "La contraseña no debe exigir minúsculas."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.password_policy).require_numbers == false
    error_message = "La contraseña no debe exigir números."
  }

  assert {
    condition     = one(aws_cognito_user_pool.this.password_policy).require_symbols == false
    error_message = "La contraseña no debe exigir símbolos."
  }
}

run "sin_segundo_factor" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.this.mfa_configuration == "OFF"
    error_message = "El segundo factor debe estar desactivado (mfa_configuration igual a OFF)."
  }
}

run "remitente_de_correo_por_defecto" {
  command = plan

  assert {
    condition     = one(aws_cognito_user_pool.this.email_configuration).email_sending_account == "COGNITO_DEFAULT"
    error_message = "El correo de verificación debe salir con el remitente por defecto de Cognito."
  }
}

run "nivel_del_plan_fijado" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.this.user_pool_tier == "ESSENTIALS"
    error_message = "El nivel del grupo debe estar fijado en ESSENTIALS."
  }
}

run "grupo_protegido_contra_el_reemplazo" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool.this.deletion_protection == "ACTIVE"
    error_message = "El grupo de usuarios debe tener deletion_protection en ACTIVE."
  }
}

run "proteccion_se_puede_quitar_a_proposito" {
  command = plan

  variables {
    protect_user_pool = false
  }

  assert {
    condition     = aws_cognito_user_pool.this.deletion_protection == "INACTIVE"
    error_message = "Con protect_user_pool igual a false, deletion_protection debe pasar a INACTIVE."
  }
}

run "cliente_confidencial" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.generate_secret == true
    error_message = "El cliente de la aplicación debe ser confidencial (generate_secret igual a true)."
  }
}

run "cliente_solo_con_usuario_y_contrasena" {
  command = plan

  assert {
    condition     = toset(aws_cognito_user_pool_client.app.explicit_auth_flows) == toset(["ALLOW_USER_PASSWORD_AUTH"])
    error_message = "El cliente solo debe permitir ALLOW_USER_PASSWORD_AUTH, sin credenciales de renovación."
  }
}

run "cliente_oculta_si_el_correo_tiene_cuenta" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.prevent_user_existence_errors == "ENABLED"
    error_message = "prevent_user_existence_errors debe estar en ENABLED."
  }
}

run "cliente_token_de_identidad_de_vida_minima" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.id_token_validity == 5
    error_message = "El token de identidad debe durar 5 minutos, el mínimo permitido."
  }

  assert {
    condition     = one(aws_cognito_user_pool_client.app.token_validity_units).id_token == "minutes"
    error_message = "La unidad de validez del token de identidad debe ser minutes."
  }
}

run "cliente_sin_oauth_ni_interfaz_alojada" {
  command = plan

  assert {
    condition     = aws_cognito_user_pool_client.app.allowed_oauth_flows_user_pool_client == false
    error_message = "El cliente no debe usar OAuth: no hay interfaz alojada ni otra vía de registro."
  }
}

run "usuario_de_la_aplicacion_con_un_solo_permiso" {
  command = plan

  assert {
    condition     = aws_iam_user.app.name == "medicia-dev-app"
    error_message = "El usuario de la aplicación debe llamarse medicia-dev-app."
  }

  assert {
    condition     = length(jsondecode(aws_iam_user_policy.app.policy).Statement) == 1
    error_message = "La política del usuario debe tener una sola declaración."
  }

  assert {
    condition     = jsondecode(aws_iam_user_policy.app.policy).Statement[0].Effect == "Allow"
    error_message = "La declaración debe permitir, no negar."
  }

  assert {
    condition     = jsondecode(aws_iam_user_policy.app.policy).Statement[0].Action == "cognito-idp:AdminSetUserPassword"
    error_message = "La única acción permitida debe ser cognito-idp:AdminSetUserPassword."
  }

  assert {
    condition     = jsondecode(aws_iam_user_policy.app.policy).Statement[0].Resource == "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_PRUEBA0001"
    error_message = "El único recurso permitido debe ser el ARN del grupo de usuarios."
  }

  # El límite de permisos fija el techo del usuario: aunque alguien le agregue una política, no lo supera.
  assert {
    condition     = aws_iam_user.app.permissions_boundary == "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
    error_message = "El usuario de la aplicación debe llevar la política límite medicia-dev-boundary."
  }

  assert {
    condition     = aws_iam_access_key.app.user == "medicia-dev-app"
    error_message = "La clave de acceso debe pertenecer al usuario de la aplicación."
  }
}

run "rechaza_un_entorno_distinto_de_dev" {
  command = plan

  variables {
    environment = "prod"
  }

  expect_failures = [
    var.environment,
  ]
}

run "rechaza_un_limite_de_permisos_que_no_es_una_politica" {
  command = plan

  variables {
    permissions_boundary_arn = "medicia-dev-boundary"
  }

  expect_failures = [
    var.permissions_boundary_arn,
  ]
}

# Acceso de la aplicación al bucket de estudios (specs/006-carga-estudios-ecg/contracts/storage-and-permissions.md).
# Sin el bucket, el usuario conserva su único permiso de Cognito y no gana nada de S3.
run "sin_bucket_de_estudios_no_hay_permisos_de_s3" {
  command = plan

  assert {
    condition     = length(aws_iam_user_policy.studies) == 0
    error_message = "Sin studies_bucket_arn no debe crearse ninguna política de S3."
  }
}

run "con_bucket_de_estudios_solo_guarda_lee_y_borra_estudios" {
  command = plan

  variables {
    studies_bucket_arn = "arn:aws:s3:::medicia-studies-dev-896618135592"
  }

  assert {
    condition     = length(aws_iam_user_policy.studies) == 1 && aws_iam_user_policy.studies[0].user == "medicia-dev-app"
    error_message = "La política de estudios debe colgar del usuario de la aplicación."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_user_policy.studies[0].policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-studies-dev-896618135592/studies/*"])
    ])
    error_message = "Los objetos solo admiten GetObject, PutObject y DeleteObject sobre el prefijo studies/."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_user_policy.studies[0].policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["s3:ListBucket"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-studies-dev-896618135592"])
      && toset(s.Condition.StringLike["s3:prefix"]) == toset(["studies/*"])
    ])
    error_message = "Listar el bucket solo se permite para el prefijo studies/."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_user_policy.studies[0].policy).Statement : s.Action]) :
      !strcontains(a, "*")
    ])
    error_message = "La política de estudios no puede tener acciones con comodín."
  }

  # La política original de Cognito no cambia.
  assert {
    condition     = aws_iam_user_policy.app.name == "cognito-set-user-password"
    error_message = "La política de Cognito del usuario de la aplicación no debe cambiar de nombre."
  }
}

run "rechaza_un_bucket_de_estudios_que_no_es_un_arn_de_s3" {
  command = plan

  variables {
    studies_bucket_arn = "medicia-studies-dev-896618135592"
  }

  expect_failures = [
    var.studies_bucket_arn,
  ]
}

run "sin_punto_de_inferencia_no_hay_politica_de_modelo" {
  command = plan

  assert {
    condition     = length(aws_iam_user_policy.model_endpoint) == 0
    error_message = "Sin model_endpoint_arn no debe crearse ninguna política de SageMaker."
  }

  assert {
    condition     = output.model_access_granted == false
    error_message = "Sin model_endpoint_arn la salida debe indicar que no se concedió el permiso."
  }
}

run "con_punto_de_inferencia_solo_invoca_ese_punto" {
  command = plan

  variables {
    model_endpoint_arn = "arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"
  }

  assert {
    condition     = length(aws_iam_user_policy.model_endpoint) == 1 && aws_iam_user_policy.model_endpoint[0].user == "medicia-dev-app"
    error_message = "La política del modelo debe colgar del usuario de la aplicación."
  }

  assert {
    condition = (
      length(jsondecode(aws_iam_user_policy.model_endpoint[0].policy).Statement) == 1
      && alltrue([
        for s in jsondecode(aws_iam_user_policy.model_endpoint[0].policy).Statement :
        s.Effect == "Allow"
        && toset(s.Action) == toset(["sagemaker:InvokeEndpoint"])
        && toset(s.Resource) == toset(["arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"])
      ])
    )
    error_message = "La única sentencia debe permitir sagemaker:InvokeEndpoint sobre ese punto de inferencia."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_user_policy.model_endpoint[0].policy).Statement : s.Action]) :
      !strcontains(a, "*")
    ])
    error_message = "La política del modelo no puede tener acciones con comodín."
  }

  assert {
    condition     = output.model_access_granted == true
    error_message = "Con model_endpoint_arn la salida debe indicar que se concedió el permiso."
  }

  # Las políticas anteriores no cambian.
  assert {
    condition     = aws_iam_user_policy.app.name == "cognito-set-user-password"
    error_message = "La política de Cognito del usuario de la aplicación no debe cambiar de nombre."
  }
}

run "rechaza_un_punto_de_inferencia_que_no_es_un_arn_de_endpoint" {
  command = plan

  variables {
    model_endpoint_arn = "medicia-dev-echonext-mini"
  }

  expect_failures = [
    var.model_endpoint_arn,
  ]
}

run "rechaza_un_punto_de_inferencia_con_comodin" {
  command = plan

  variables {
    model_endpoint_arn = "arn:aws:sagemaker:sa-east-1:896618135592:endpoint/*"
  }

  expect_failures = [
    var.model_endpoint_arn,
  ]
}
