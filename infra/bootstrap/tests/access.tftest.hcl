# Pruebas del acceso de CI y de la política del operador (FR-017, FR-018, FR-020).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.
# Las políticas se decodifican en el plan, así que sus ARN se arman con cadenas conocidas.

mock_provider "aws" {}

override_data {
  target = data.aws_caller_identity.current
  values = {
    arn = "arn:aws:iam::896618135592:user/terraform-dev"
  }
}

run "proveedor_de_github" {
  command = plan

  assert {
    condition     = aws_iam_openid_connect_provider.github.url == "https://token.actions.githubusercontent.com"
    error_message = "El proveedor de identidad debe ser el de GitHub Actions."
  }

  assert {
    condition     = toset(aws_iam_openid_connect_provider.github.client_id_list) == toset(["sts.amazonaws.com"])
    error_message = "La única audiencia admitida debe ser sts.amazonaws.com."
  }
}

run "rol_de_plan_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_iam_role.plan.name == "medicia-dev-plan"
    error_message = "El rol de plan debe llamarse medicia-dev-plan."
  }
}

run "confianza_con_sujeto_exacto" {
  command = plan

  # Una sola declaración, solo para asumir el rol con la identidad web de GitHub.
  assert {
    condition     = length(jsondecode(aws_iam_role.plan.assume_role_policy).Statement) == 1
    error_message = "La política de confianza debe tener una única declaración."
  }

  assert {
    condition = (
      jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Effect == "Allow"
      && jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Action == "sts:AssumeRoleWithWebIdentity"
    )
    error_message = "La confianza debe permitir solo sts:AssumeRoleWithWebIdentity."
  }

  assert {
    condition = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Principal == {
      Federated = "arn:aws:iam::896618135592:oidc-provider/token.actions.githubusercontent.com"
    }
    error_message = "El único principal debe ser el proveedor de identidad de GitHub de esta cuenta."
  }

  # Solo StringEquals: sin StringLike ni otros operadores que admitan comodines.
  assert {
    condition     = keys(jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition) == ["StringEquals"]
    error_message = "La confianza debe usar únicamente la condición StringEquals."
  }

  assert {
    condition = jsondecode(aws_iam_role.plan.assume_role_policy).Statement[0].Condition.StringEquals == {
      "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
      "token.actions.githubusercontent.com:sub" = "repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request"
    }
    error_message = "La confianza debe fijar la audiencia y el sujeto exacto de las propuestas de cambio de este repositorio."
  }

  assert {
    condition     = !strcontains(var.github_oidc_subject, "*")
    error_message = "El sujeto de GitHub no admite comodines."
  }
}

run "rol_de_plan_solo_lectura" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      s.Effect == "Allow" && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "Toda declaración del rol de plan debe permitir y listar acciones y recursos explícitos."
  }

  # Solo lectura: Describe, Get o List de Cognito e IAM, más leer el estado. Sin comodines.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : s.Action]) :
      can(regex("^(s3:(GetObject|ListBucket)|(cognito-idp|iam):(Describe|Get|List)[A-Za-z]*)$", a))
    ])
    error_message = "El rol de plan solo puede tener acciones Describe, Get o List de Cognito e IAM y s3:GetObject y s3:ListBucket, sin comodines."
  }

  # Lo que toca S3 se limita al bucket del estado.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      alltrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592")])
      if anytrue([for a in s.Action : startswith(a, "s3:")])
    ])
    error_message = "Las acciones de S3 del rol de plan deben limitarse al bucket del estado."
  }

  # Los objetos que puede leer son solo los del estado del entorno dev.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:s3:::medicia-tfstate-dev-896618135592/environments/dev/*"])
      if contains(s.Action, "s3:GetObject")
    ])
    error_message = "s3:GetObject solo puede aplicar a las claves environments/dev/ del bucket del estado."
  }

  # Hay al menos una declaración de cada tipo: la política no está vacía.
  assert {
    condition = (
      anytrue([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : contains(s.Action, "s3:GetObject")])
      && anytrue([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : contains(s.Action, "s3:ListBucket")])
    )
    error_message = "El rol de plan debe poder leer el estado: s3:ListBucket y s3:GetObject."
  }
}

run "politica_del_operador_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_iam_policy.operator.name == "medicia-dev-terraform-operator"
    error_message = "La política del operador debe llamarse medicia-dev-terraform-operator."
  }
}

run "politica_del_operador_sin_comodines" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow" && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "Toda declaración del operador debe permitir y listar acciones y recursos explícitos."
  }

  # Ninguna acción "*" ni servicio "*". La única acción con comodín es todo Cognito (cognito-idp:*).
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator.policy).Statement : s.Action]) :
      a != "*" && !startswith(a, "*") && (!endswith(a, ":*") || a == "cognito-idp:*")
    ])
    error_message = "El operador no puede tener acciones ni servicios con comodín, salvo cognito-idp:*."
  }

  # Los únicos servicios son el estado (s3), Cognito e IAM.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator.policy).Statement : s.Action]) :
      contains(["s3", "cognito-idp", "iam"], split(":", a)[0])
    ])
    error_message = "El operador solo puede usar s3, cognito-idp e iam."
  }

  # Ningún recurso "*" salvo en la creación de un grupo de usuarios, que AWS no permite limitar.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      !contains(s.Resource, "*") || toset(s.Action) == toset(["cognito-idp:CreateUserPool"])
    ])
    error_message = "El recurso * solo se admite para cognito-idp:CreateUserPool."
  }
}

run "politica_del_operador_limita_iam_y_estado" {
  command = plan

  # IAM: solo recursos con el prefijo medicia-dev- o el proveedor de identidad de GitHub.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      alltrue([
        for r in s.Resource :
        can(regex("^arn:aws:iam::896618135592:(user|role|policy)/medicia-dev-[A-Za-z0-9_*-]+$", r))
        || r == "arn:aws:iam::896618135592:oidc-provider/token.actions.githubusercontent.com"
      ])
      if anytrue([for a in s.Action : startswith(a, "iam:")])
    ])
    error_message = "Los recursos IAM del operador deben limitarse al prefijo medicia-dev- y al proveedor de GitHub."
  }

  # Estado: solo el bucket del estado.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      alltrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592")])
      if anytrue([for a in s.Action : startswith(a, "s3:")])
    ])
    error_message = "Las acciones de S3 del operador deben limitarse al bucket del estado."
  }

  # Cognito: solo grupos de esta cuenta y región.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      alltrue([for r in s.Resource : r == "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/*"])
      if anytrue([for a in s.Action : startswith(a, "cognito-idp:")]) && !contains(s.Action, "cognito-idp:CreateUserPool")
    ])
    error_message = "Las acciones de Cognito del operador deben limitarse a los grupos de esta cuenta y región."
  }

  # Puede leer, escribir y borrar objetos del estado, incluidos los de bloqueo.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      contains(s.Action, "s3:PutObject") && contains(s.Action, "s3:DeleteObject") && contains(s.Action, "s3:GetObject")
    ])
    error_message = "El operador debe poder leer, escribir y borrar objetos del estado (incluye los de bloqueo)."
  }
}
