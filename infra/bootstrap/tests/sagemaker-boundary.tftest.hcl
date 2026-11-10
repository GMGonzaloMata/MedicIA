# Pruebas de la política límite del rol de ejecución de SageMaker (FR-007, FR-008, FR-018, SC-004).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.
# La lista de acciones y de recursos es la misma que fija infra/modules/sagemaker-execution-role/tests:
# si una cambia, la otra debe cambiar con ella, para que el límite nunca quede por debajo del permiso del rol.

mock_provider "aws" {}

override_data {
  target = data.aws_caller_identity.current
  values = {
    arn = "arn:aws:iam::896618135592:user/terraform-dev"
  }
}

run "limite_de_sagemaker_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_iam_policy.sagemaker_boundary.name == "medicia-dev-sagemaker-boundary"
    error_message = "La política límite del rol de ejecución debe llamarse medicia-dev-sagemaker-boundary."
  }

  assert {
    condition     = aws_iam_policy.sagemaker_boundary.name != aws_iam_policy.boundary.name
    error_message = "El límite del rol de ejecución debe ser distinto del de la aplicación y el plan de CI."
  }
}

# Leer artefactos y escribir registros, nada más. Son tres declaraciones porque cada una apunta a un recurso distinto.
run "limite_de_sagemaker_con_permisos_exactos" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement :
      s.Effect == "Allow" && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "El límite solo puede permitir, con acciones y recursos explícitos."
  }

  assert {
    condition     = length(jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement) == 3
    error_message = "El límite debe tener exactamente tres declaraciones: leer objetos, listar el bucket y escribir registros."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement :
      toset(s.Action) == toset(["s3:GetObject"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592/*"])
    ])
    error_message = "Debe poder leer (s3:GetObject) solo los objetos del bucket de artefactos."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement :
      toset(s.Action) == toset(["s3:ListBucket"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592"])
    ])
    error_message = "Debe poder listar (s3:ListBucket) solo el bucket de artefactos."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement :
      toset(s.Action) == toset(["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"])
      && toset(s.Resource) == toset([
        "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*",
        "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-*:*",
      ])
    ])
    error_message = "Debe poder escribir registros (crear grupo, crear flujo y poner eventos) solo en los grupos de puntos de inferencia medicia-dev-."
  }
}

run "limite_de_sagemaker_sin_comodines" {
  command = plan

  # Ninguna acción con comodín. El comodín solo aparece al final del nombre de un recurso (/* o medicia-dev-*).
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement : s.Action]) :
      !strcontains(a, "*")
    ])
    error_message = "El límite no puede tener acciones ni servicios con comodín."
  }

  assert {
    condition = alltrue([
      for r in flatten([for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement : s.Resource]) :
      r != "*" && (
        startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")
        || startswith(r, "arn:aws:logs:sa-east-1:896618135592:log-group:/aws/sagemaker/Endpoints/medicia-dev-")
      )
    ])
    error_message = "Los recursos del límite se limitan al bucket de artefactos y a los registros de los puntos de inferencia; ningún otro almacenamiento."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.sagemaker_boundary.policy).Statement : s.Action]) :
      contains(["s3", "logs"], split(":", a)[0])
    ])
    error_message = "El límite solo puede usar s3 y logs."
  }
}

# Una política administrada de IAM admite hasta 6.144 caracteres (sin espacios).
run "politicas_limite_dentro_del_tope_de_iam" {
  command = plan

  assert {
    condition     = length(aws_iam_policy.sagemaker_boundary.policy) < 6144
    error_message = "La política límite del rol de ejecución supera el tope de 6.144 caracteres de IAM."
  }

  assert {
    condition     = length(aws_iam_policy.boundary.policy) < 6144
    error_message = "La política límite medicia-dev-boundary supera el tope de 6.144 caracteres de IAM."
  }
}
