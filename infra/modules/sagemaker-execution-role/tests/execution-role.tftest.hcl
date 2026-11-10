# Pruebas del rol de ejecución de SageMaker. Corren con el proveedor simulado: no tocan AWS ni piden credenciales.

mock_provider "aws" {}

variables {
  environment              = "dev"
  account_id               = "896618135592"
  region                   = "sa-east-1"
  artifacts_bucket_arn     = "arn:aws:s3:::medicia-models-dev-896618135592"
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
}

run "rol_con_su_limite" {
  command = plan

  assert {
    condition     = aws_iam_role.this.name == "medicia-dev-sagemaker-execution"
    error_message = "El rol debe llamarse medicia-dev-sagemaker-execution."
  }

  assert {
    condition     = aws_iam_role.this.permissions_boundary == "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
    error_message = "El rol debe llevar la política límite de SageMaker."
  }
}

run "solo_sagemaker_asume_el_rol" {
  command = plan

  assert {
    condition     = length(jsondecode(aws_iam_role.this.assume_role_policy).Statement) == 1
    error_message = "La confianza debe tener exactamente una declaración."
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Effect == "Allow"
    error_message = "La declaración de confianza debe ser un Allow."
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Action == "sts:AssumeRole"
    error_message = "La confianza debe permitir solo sts:AssumeRole."
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Principal == { Service = "sagemaker.amazonaws.com" }
    error_message = "Solo sagemaker.amazonaws.com puede asumir el rol, sin ningún otro principal."
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Condition.StringEquals["aws:SourceAccount"] == "896618135592"
    error_message = "La confianza debe limitarse a esta cuenta con aws:SourceAccount."
  }

  assert {
    condition     = jsondecode(aws_iam_role.this.assume_role_policy).Statement[0].Condition.ArnLike["aws:SourceArn"] == "arn:aws:sagemaker:sa-east-1:896618135592:*"
    error_message = "La confianza debe limitarse a SageMaker de esta cuenta y región con aws:SourceArn."
  }
}

run "permisos_iguales_al_limite" {
  command = plan

  # Las tres declaraciones, escritas como constante idéntica a la de infra/bootstrap/tests/sagemaker-boundary.tftest.hcl.
  assert {
    condition     = length(jsondecode(aws_iam_role_policy.this.policy).Statement) == 3
    error_message = "La política del rol debe tener exactamente tres declaraciones."
  }

  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      s.Effect == "Allow" &&
      toset(flatten([s.Action])) == toset(["s3:GetObject"]) &&
      toset(flatten([s.Resource])) == toset(["arn:aws:s3:::medicia-models-dev-896618135592/*"])
    ])
    error_message = "Falta s3:GetObject sobre las claves del bucket de artefactos, o difiere del límite."
  }

  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      s.Effect == "Allow" &&
      toset(flatten([s.Action])) == toset(["s3:ListBucket"]) &&
      toset(flatten([s.Resource])) == toset(["arn:aws:s3:::medicia-models-dev-896618135592"])
    ])
    error_message = "Falta s3:ListBucket sobre el bucket de artefactos, o difiere del límite."
  }

  assert {
    condition = anytrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      s.Effect == "Allow" &&
      toset(flatten([s.Action])) == toset(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]) &&
      toset(flatten([s.Resource])) == toset([
        "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*",
        "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*:*",
      ])
    ])
    error_message = "Faltan los permisos de registros de los puntos de inferencia, o difieren del límite."
  }
}

run "sin_comodines_ni_otros_servicios" {
  command = plan

  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      alltrue([for a in flatten([s.Action]) : !strcontains(a, "*")])
    ])
    error_message = "Ninguna acción puede llevar comodín."
  }

  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      alltrue([for r in flatten([s.Resource]) : r != "*"])
    ])
    error_message = "Ningún recurso puede ser *."
  }

  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      alltrue([for a in flatten([s.Action]) : contains(["s3", "logs"], split(":", a)[0])])
    ])
    error_message = "El rol solo puede usar los servicios s3 y logs."
  }

  assert {
    condition = alltrue([for s in jsondecode(aws_iam_role_policy.this.policy).Statement :
      alltrue([for r in flatten([s.Resource]) :
        startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592") ||
        startswith(r, "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-")
      ])
    ])
    error_message = "Todo recurso debe ser el bucket de artefactos o un grupo de registros de puntos de inferencia del entorno."
  }
}

run "salidas" {
  command = plan

  assert {
    condition     = output.role_arn == "arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"
    error_message = "role_arn debe armarse con el nombre conocido."
  }

  assert {
    condition     = output.role_name == "medicia-dev-sagemaker-execution"
    error_message = "role_name debe ser medicia-dev-sagemaker-execution."
  }
}

run "limite_con_formato_invalido" {
  command = plan

  variables {
    permissions_boundary_arn = "no-es-un-arn"
  }

  expect_failures = [var.permissions_boundary_arn]
}

run "entorno_no_permitido" {
  command = plan

  variables {
    environment = "prod"
  }

  expect_failures = [var.environment]
}
