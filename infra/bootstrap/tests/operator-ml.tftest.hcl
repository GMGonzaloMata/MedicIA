# Pruebas de la segunda política del operador (SageMaker, entrega del rol de ejecución y ECR) (005, FR-017, SC-004).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.

mock_provider "aws" {}

override_data {
  target = data.aws_caller_identity.current
  values = {
    arn = "arn:aws:iam::896618135592:user/terraform-dev"
  }
}

run "politica_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_iam_policy.operator_ml.name == "medicia-dev-terraform-operator-ml"
    error_message = "La segunda política del operador debe llamarse medicia-dev-terraform-operator-ml."
  }

  assert {
    condition     = aws_iam_policy.operator_ml.name != aws_iam_policy.operator.name
    error_message = "Debe ser una política distinta de la del operador."
  }
}

run "sin_comodines_de_acciones_ni_de_servicio" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      contains(["Allow", "Deny"], s.Effect) && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "Toda declaración debe listar acciones y recursos explícitos."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action]) :
      !strcontains(a, "*")
    ])
    error_message = "Ninguna acción puede llevar comodín (ni sagemaker:*, ni ecr:*, ni iam:*)."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action]) :
      contains(["sagemaker", "ecr", "iam"], split(":", a)[0])
    ])
    error_message = "Solo puede usar sagemaker, ecr e iam."
  }

  # Recurso *: solo los listados de SageMaker, el token de ECR y el Deny de modelos sin aislamiento.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      !contains(s.Resource, "*") || contains([
        toset(["sagemaker:ListEndpointConfigs", "sagemaker:ListEndpoints", "sagemaker:ListModels"]),
        toset(["ecr:GetAuthorizationToken"]),
        toset(["sagemaker:CreateModel"]),
      ], toset(s.Action))
    ])
    error_message = "El recurso * solo se admite para los listados de SageMaker, ecr:GetAuthorizationToken y el Deny de CreateModel."
  }
}

run "sagemaker_solo_sobre_recursos_del_entorno" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset([
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
      ])
      && toset(s.Resource) == toset([
        "arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-*",
        "arn:aws:sagemaker:sa-east-1:896618135592:endpoint-config/medicia-dev-*",
        "arn:aws:sagemaker:sa-east-1:896618135592:model/medicia-dev-*",
      ])
    ])
    error_message = "Las acciones de SageMaker deben ser exactamente esas catorce y aplicar solo a modelos, configuraciones y puntos de inferencia medicia-dev-."
  }

  # Nada de entrenamiento, notebooks, trabajos de procesamiento ni dominios.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action if s.Effect == "Allow"]) :
      !can(regex("^sagemaker:[A-Za-z]*(Training|Notebook|Processing|Domain|Pipeline|Job|Space|UserProfile|Studio)", a))
    ])
    error_message = "El operador no puede crear entrenamientos, notebooks, trabajos de procesamiento ni dominios."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["sagemaker:ListEndpointConfigs", "sagemaker:ListEndpoints", "sagemaker:ListModels"])
    ])
    error_message = "Debe poder listar modelos, configuraciones y puntos de inferencia."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Deny"
      && toset(s.Action) == toset(["sagemaker:CreateModel"])
      && s.Condition.Bool["sagemaker:NetworkIsolation"] == "false"
    ])
    error_message = "Debe haber un Deny de crear modelos sin aislamiento de red."
  }
}

# La protección principal contra escalar privilegios: solo el rol de ejecución, solo hacia SageMaker.
run "pass_role_solo_del_rol_de_ejecucion" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["iam:PassRole"])
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
      && s.Condition.StringEquals["iam:PassedToService"] == "sagemaker.amazonaws.com"
    ])
    error_message = "iam:PassRole debe aplicar solo al rol de ejecución, con iam:PassedToService = sagemaker.amazonaws.com."
  }

  assert {
    condition = length([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s
      if s.Effect == "Allow" && contains(s.Action, "iam:PassRole")
    ]) == 1
    error_message = "iam:PassRole debe aparecer en una sola declaración."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action if s.Effect == "Allow"]) :
      !startswith(a, "iam:") || a == "iam:PassRole"
    ])
    error_message = "De IAM, esta política solo concede iam:PassRole."
  }
}

run "ecr_solo_sobre_repositorios_del_entorno" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset([
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
      ])
      && toset(s.Resource) == toset(["arn:aws:ecr:sa-east-1:896618135592:repository/medicia-dev-*"])
    ])
    error_message = "La gestión del repositorio debe tener exactamente esas doce acciones y aplicar solo a repositorios medicia-dev-."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset([
        "ecr:BatchCheckLayerAvailability",
        "ecr:BatchGetImage",
        "ecr:CompleteLayerUpload",
        "ecr:DescribeImages",
        "ecr:GetDownloadUrlForLayer",
        "ecr:InitiateLayerUpload",
        "ecr:ListImages",
        "ecr:PutImage",
        "ecr:UploadLayerPart",
      ])
      && toset(s.Resource) == toset(["arn:aws:ecr:sa-east-1:896618135592:repository/medicia-dev-*"])
    ])
    error_message = "Subir y leer imágenes debe aplicar solo a repositorios medicia-dev-."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement :
      s.Effect == "Allow" && toset(s.Action) == toset(["ecr:GetAuthorizationToken"]) && toset(s.Resource) == toset(["*"])
    ])
    error_message = "Debe poder obtener el token de ECR, que AWS no permite limitar a un recurso."
  }

  # Una imagen publicada es una versión trazable: el operador no la borra.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action]) :
      a != "ecr:BatchDeleteImage" && a != "ecr:SetRepositoryPolicy" && a != "ecr:DeleteRepositoryPolicy"
    ])
    error_message = "El operador no puede borrar imágenes ni fijar la política de un repositorio."
  }
}

run "el_operador_no_edita_esta_politica" {
  command = plan

  # El Deny de la primera política incluye esta (si no, la declaración genérica de políticas medicia-dev-* la dejaría editable).
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Deny" && contains(s.Resource, "arn:aws:iam::896618135592:policy/medicia-dev-terraform-operator-ml")
    ])
    error_message = "El Deny ProtegerLasPoliticasDeAcceso debe incluir medicia-dev-terraform-operator-ml."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_ml.policy).Statement : s.Action if s.Effect == "Allow"]) :
      !startswith(a, "iam:") || a == "iam:PassRole"
    ])
    error_message = "Esta política no puede conceder acciones sobre políticas de IAM."
  }
}

# Tope de IAM para una política administrada (6.144 caracteres) en las dos políticas del operador.
run "politicas_del_operador_dentro_del_tope_de_iam" {
  command = plan

  assert {
    condition     = length(aws_iam_policy.operator_ml.policy) < 6144
    error_message = "La segunda política del operador supera el tope de 6.144 caracteres de IAM."
  }

  assert {
    condition     = length(aws_iam_policy.operator.policy) < 6144
    error_message = "La primera política del operador supera el tope de 6.144 caracteres de IAM."
  }
}
