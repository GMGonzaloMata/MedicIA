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

  assert {
    condition     = aws_iam_role.plan.permissions_boundary == "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
    error_message = "El rol de plan debe llevar la política límite medicia-dev-boundary."
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

  # Solo lectura: Describe, Get o List de Cognito e IAM, y Get o List de S3. Sin comodines.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : s.Action]) :
      can(regex("^(s3:(Get|List)[A-Za-z]+|(cognito-idp|iam):(Describe|Get|List)[A-Za-z]*)$", a))
    ])
    error_message = "El rol de plan solo puede tener acciones Describe, Get o List de Cognito e IAM y Get o List de S3, sin comodines."
  }

  # Lo que toca S3 se limita al bucket del estado y al de artefactos de modelos.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      alltrue([
        for r in s.Resource :
        startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592") || startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")
      ])
      if anytrue([for a in s.Action : startswith(a, "s3:")])
    ])
    error_message = "Las acciones de S3 del rol de plan deben limitarse al bucket del estado y al de artefactos."
  }

  # El plan lee la configuración del bucket de artefactos, nunca sus objetos (R4).
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      !contains(s.Action, "s3:GetObject")
      if anytrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")])
    ])
    error_message = "El rol de plan no puede leer objetos del bucket de artefactos, solo su configuración."
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
      contains(["Allow", "Deny"], s.Effect) && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "Toda declaración del operador debe listar acciones y recursos explícitos."
  }

  # Ninguna acción "*" ni servicio "*". La única acción con comodín es todo Cognito (cognito-idp:*).
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator.policy).Statement : s.Action]) :
      !strcontains(a, "*") || a == "cognito-idp:*"
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

  # S3: solo el bucket del estado y el de artefactos de modelos.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      alltrue([
        for r in s.Resource :
        startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592") || startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")
      ])
      if anytrue([for a in s.Action : startswith(a, "s3:")])
    ])
    error_message = "Las acciones de S3 del operador deben limitarse al bucket del estado y al de artefactos."
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

run "politica_limite_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_iam_policy.boundary.name == "medicia-dev-boundary"
    error_message = "La política límite debe llamarse medicia-dev-boundary."
  }
}

# El límite es el techo de lo que pueden tener el rol de plan y el usuario de la aplicación:
# lectura, más fijar contraseñas en el grupo. Nada de escritura ni de otros servicios.
run "politica_limite_solo_lectura_y_fijar_contrasena" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      s.Effect == "Allow" && can(tolist(s.Action)) && can(tolist(s.Resource))
    ])
    error_message = "El límite solo puede permitir, con acciones y recursos explícitos."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.boundary.policy).Statement : s.Action]) :
      can(regex("^(s3:(Get|List)[A-Za-z]+|cognito-idp:(AdminSetUserPassword|(Describe|Get|List)[A-Za-z]*)|iam:(Get|List)[A-Za-z]*)$", a))
    ])
    error_message = "El límite solo admite lectura y cognito-idp:AdminSetUserPassword."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      contains(s.Action, "cognito-idp:AdminSetUserPassword")
    ])
    error_message = "El límite debe permitir fijar contraseñas, que es lo que hace la aplicación."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      alltrue([
        for r in s.Resource :
        startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592") || startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")
      ])
      if anytrue([for a in s.Action : startswith(a, "s3:")])
    ])
    error_message = "Las acciones de S3 del límite deben limitarse al bucket del estado y al de artefactos."
  }

  # El techo crece solo con las lecturas del bucket de artefactos y del rol de ejecución (R4), sin objetos ni escrituras.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      !contains(s.Action, "s3:GetObject")
      if anytrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")])
    ])
    error_message = "El límite no puede permitir leer objetos del bucket de artefactos."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
    ])
    error_message = "El límite debe incluir la lectura del rol de ejecución de SageMaker, para que el plan de CI pueda refrescarlo."
  }

  # Todo lo que tiene el rol de plan cabe dentro del límite.
  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : s.Action]) :
      contains(flatten([for s in jsondecode(aws_iam_policy.boundary.policy).Statement : s.Action]), a)
    ])
    error_message = "Cada acción del rol de plan debe estar permitida por el límite."
  }
}

# Sin esta condición, el operador podría crear un usuario o un rol sin techo y darse todos los permisos.
run "operador_solo_crea_o_modifica_con_limite" {
  command = plan

  # El rol de ejecución de SageMaker lleva su propio límite; todo lo demás, medicia-dev-boundary.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      try(s.Condition.StringEquals["iam:PermissionsBoundary"], "") == (
        toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
        ? "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
        : "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
      )
      if s.Effect == "Allow" && anytrue([
        for a in s.Action : contains([
          "iam:CreateUser",
          "iam:CreateRole",
          "iam:PutUserPolicy",
          "iam:PutRolePolicy",
          "iam:PutUserPermissionsBoundary",
          "iam:PutRolePermissionsBoundary",
        ], a)
      ])
    ])
    error_message = "Crear usuarios o roles y darles políticas exige la condición iam:PermissionsBoundary: medicia-dev-sagemaker-boundary solo para el rol de ejecución y medicia-dev-boundary para el resto."
  }

  # El rol de ejecución existe como declaración propia, solo con esas tres acciones.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"])
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
      && s.Condition.StringEquals["iam:PermissionsBoundary"] == "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
    ])
    error_message = "Debe haber una declaración que cree el rol de ejecución solo con medicia-dev-sagemaker-boundary."
  }

  # La declaración de los demás roles sigue con un único límite (un valor, no una lista).
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow"
      && contains(s.Action, "iam:CreateRole")
      && contains(s.Resource, "arn:aws:iam::896618135592:role/medicia-dev-*")
      && s.Condition.StringEquals["iam:PermissionsBoundary"] == "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
    ])
    error_message = "Los demás roles medicia-dev-* solo pueden crearse con medicia-dev-boundary (un único valor)."
  }

  # Que la condición no sea vacía: tiene que existir una declaración que cree usuarios.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow" && contains(s.Action, "iam:CreateUser")
    ])
    error_message = "El operador debe poder crear el usuario de la aplicación (con límite)."
  }
}

# El operador no puede editar ni borrar las políticas que lo limitan, ni quitar el límite a nadie.
run "operador_no_edita_sus_politicas_de_acceso" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Deny"
      && toset(s.Resource) == toset([
        "arn:aws:iam::896618135592:policy/medicia-dev-terraform-operator",
        "arn:aws:iam::896618135592:policy/medicia-dev-boundary",
        "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary",
      ])
      && alltrue([
        for a in ["iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicy", "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion"] :
        contains(s.Action, a)
      ])
    ])
    error_message = "Debe haber un Deny de crear, crear versiones, borrar y cambiar la versión de las políticas del operador y de los dos límites."
  }

  # Borrar artefactos queda denegado aunque la política del bucket (que el operador puede escribir) lo permitiera.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Deny"
      && toset(s.Action) == toset(["s3:DeleteObject", "s3:DeleteObjectVersion"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592/*"])
    ])
    error_message = "Debe haber un Deny de s3:DeleteObject y s3:DeleteObjectVersion sobre los objetos del bucket de modelos."
  }

  # La declaración genérica de roles medicia-dev-* también alcanza al rol de ejecución: sin este Deny, el operador
  # podría crearlo o cambiarle el límite a medicia-dev-boundary, que es mucho más amplio.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Deny"
      && toset(s.Action) == toset(["iam:CreateRole", "iam:PutRolePermissionsBoundary", "iam:PutRolePolicy"])
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
      && s.Condition.StringNotEquals["iam:PermissionsBoundary"] == "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
    ])
    error_message = "Debe haber un Deny que exija medicia-dev-sagemaker-boundary para crear el rol de ejecución, cambiarle el límite o ponerle políticas."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Deny"
      && contains(s.Action, "iam:DeleteUserPermissionsBoundary")
      && contains(s.Action, "iam:DeleteRolePermissionsBoundary")
    ])
    error_message = "Debe haber un Deny de quitar el límite de permisos a usuarios y roles."
  }
}

# Acciones que permitirían darse acceso por una vía lateral: la política del bucket del estado
# (el estado contiene secretos), pasar roles o adjuntar políticas administradas.
run "operador_sin_vias_laterales_de_escalada" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      !anytrue([
        for a in s.Action :
        contains(["s3:PutBucketPolicy", "s3:DeleteBucketPolicy", "s3:PutBucketPublicAccessBlock"], a)
      ])
      if s.Effect == "Allow" && anytrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-tfstate-dev-896618135592")])
    ])
    error_message = "El operador no puede escribir la política ni el bloqueo de acceso público del bucket del estado."
  }

  assert {
    condition = alltrue([
      for a in flatten([
        for s in jsondecode(aws_iam_policy.operator.policy).Statement : s.Action if s.Effect == "Allow"
      ]) :
      a != "iam:PassRole" && !startswith(a, "iam:Attach") && !startswith(a, "iam:Detach")
    ])
    error_message = "El operador no puede pasar roles ni adjuntar políticas administradas."
  }

  # Lo único que puede escribir sobre el bucket del estado no incluye su política (la declaración compartida con el bucket de artefactos).
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      !contains(s.Resource, "arn:aws:s3:::medicia-tfstate-dev-896618135592")
      || !contains(s.Action, "s3:CreateBucket")
    ])
    error_message = "Crear o borrar buckets no puede aplicarse al bucket del estado."
  }
}


# Bucket de artefactos de modelos (FR-009, FR-019, R5): el operador lo crea y configura, sube y lee artefactos,
# pero no los borra. El bucket del estado conserva sus reglas más estrictas.
run "operador_y_bucket_de_artefactos" {
  command = plan

  # Comparte la declaración de lectura, versionado, cifrado, ciclo de vida y etiquetas del bucket del estado.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      contains(s.Resource, "arn:aws:s3:::medicia-tfstate-dev-896618135592")
      && contains(s.Resource, "arn:aws:s3:::medicia-models-dev-896618135592")
      && contains(s.Action, "s3:PutBucketVersioning")
    ])
    error_message = "El bucket de artefactos debe figurar en la declaración de gestión del bucket del estado."
  }

  # Crear, borrar y fijar política, bloqueo y propiedad: solo sobre el bucket de artefactos.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset([
        "s3:CreateBucket",
        "s3:DeleteBucket",
        "s3:DeleteBucketPolicy",
        "s3:PutBucketOwnershipControls",
        "s3:PutBucketPolicy",
        "s3:PutBucketPublicAccessBlock",
      ])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592"])
    ])
    error_message = "Crear, borrar y fijar política, bloqueo y propiedad debe aplicar solo al bucket de artefactos."
  }

  # Subir y leer artefactos, sin borrarlos.
  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Action) == toset(["s3:GetObject", "s3:GetObjectVersion", "s3:PutObject"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592/*"])
    ])
    error_message = "Los objetos del bucket de artefactos solo admiten s3:GetObject, s3:GetObjectVersion y s3:PutObject."
  }

  # Borrar objetos solo se permite en el bucket del estado (objetos de bloqueo). En el de artefactos no.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      !anytrue([for a in s.Action : startswith(a, "s3:DeleteObject")])
      if s.Effect == "Allow" && anytrue([for r in s.Resource : startswith(r, "arn:aws:s3:::medicia-models-dev-896618135592")])
    ])
    error_message = "El operador no puede borrar objetos ni versiones del bucket de artefactos."
  }

  assert {
    condition = alltrue([
      for a in flatten([
        for s in jsondecode(aws_iam_policy.operator.policy).Statement : s.Action if s.Effect == "Allow"
      ]) :
      !startswith(a, "sagemaker:")
    ])
    error_message = "El operador no tiene permisos de SageMaker hasta el primer modelo (R5)."
  }

  # Tope de IAM para una política administrada.
  assert {
    condition     = length(aws_iam_policy.operator.policy) < 6144
    error_message = "La política del operador supera el tope de 6.144 caracteres de IAM. Reducir acciones repetidas, sin usar comodines."
  }
}

# El plan de CI lee la configuración del bucket de artefactos y el rol de ejecución (R4), y nada más.
run "rol_de_plan_lee_bucket_de_artefactos_y_rol_de_ejecucion" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-models-dev-896618135592"])
      && contains(s.Action, "s3:ListBucket")
      && contains(s.Action, "s3:GetBucketPolicy")
    ])
    error_message = "El rol de plan debe poder listar y leer la configuración del bucket de artefactos."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      s.Effect == "Allow"
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"])
      && toset(s.Action) == toset([
        "iam:GetRole",
        "iam:GetRolePolicy",
        "iam:ListAttachedRolePolicies",
        "iam:ListInstanceProfilesForRole",
        "iam:ListRolePolicies",
        "iam:ListRoleTags",
      ])
    ])
    error_message = "El rol de plan debe poder leer el rol de ejecución, con esas seis acciones."
  }

  # Las lecturas nuevas también están dentro del límite del rol de plan.
  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      anytrue([
        for b in jsondecode(aws_iam_policy.boundary.policy).Statement :
        toset(b.Action) == toset(s.Action) && toset(b.Resource) == toset(s.Resource)
      ])
    ])
    error_message = "Cada declaración del rol de plan debe figurar igual en medicia-dev-boundary (fuente única)."
  }
}
