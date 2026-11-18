# Unidad IAM demo: contención y PRESERVE (009, T003/T004).
# Solo políticas bootstrap; el rol/perfil efectivo se compone después en demo-host.
# El proveedor simulado y command=plan son obligatorios; nunca consultar AWS.

mock_provider "aws" {}

override_data {
  target = data.aws_caller_identity.current
  values = {
    arn = "arn:aws:iam::896618135592:user/terraform-dev"
  }
}

run "limite_ec2_sin_runtime_por_defecto" {
  command = plan

  assert {
    condition     = aws_iam_policy.demo_boundary.name == "medicia-dev-demo-boundary" && aws_iam_policy.demo_boundary.name != aws_iam_policy.boundary.name
    error_message = "EC2 requiere un límite distinto del compartido con la app local y plan."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      alltrue([for a in s.Action : startswith(a, "ssm:") || startswith(a, "ssmmessages:")])
      if s.Effect == "Allow"
    ])
    error_message = "Sin referencias aprobadas no debe conceder permisos runtime ni inventar ARNs."
  }
}

run "runtime_solo_referencias_exactas" {
  command = plan

  variables {
    demo_runtime = {
      user_pool_arn       = "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_DEMO"
      secret_arns         = ["arn:aws:secretsmanager:sa-east-1:896618135592:secret:medicia-dev-demo/app-AbCd12", "arn:aws:secretsmanager:sa-east-1:896618135592:secret:medicia-dev-demo/duckdns-EfGh34"]
      release_key         = "releases/1.0.0/web.tar.gz"
      model_endpoint_arns = ["arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"]
    }
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      toset(s.Resource) == var.demo_runtime.secret_arns && toset(s.Action) == toset(["secretsmanager:GetSecretValue"])
      if s.Sid == "SecretosRuntimeExactos"
    ]) && length([for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement : s if s.Sid == "SecretosRuntimeExactos"]) == 1
    error_message = "Solo los dos secretos runtime exactos, nunca el master administrado por RDS."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:s3:::medicia-releases-dev-896618135592/releases/1.0.0/web.tar.gz"])
      if s.Sid == "ReleaseExacto"
    ]) && anytrue([for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement : s.Sid == "NuncaEstado" && s.Effect == "Deny" && contains(s.Resource, "arn:aws:s3:::medicia-tfstate-dev-896618135592/*")])
    error_message = "EC2 solo descarga el release seleccionado y tiene Deny de estado."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      toset(s.Resource) == var.demo_runtime.model_endpoint_arns && toset(s.Action) == toset(["sagemaker:InvokeEndpoint"])
      if s.Sid == "InferenciaExacta"
      ]) && alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      toset(s.Resource) == toset([var.demo_runtime.user_pool_arn]) && toset(s.Action) == toset(["cognito-idp:AdminSetUserPassword"])
      if s.Sid == "PoolExacto"
    ])
    error_message = "Inferencia y Cognito deben limitarse a las referencias exactas de la demo."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.demo_boundary.policy).Statement :
      !contains(s.Action, "ssm:StartSession") && !contains(s.Action, "ssm:GetParameter")
      && (!contains(s.Resource, "*") || toset(s.Action) == toset(["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel"]))
    ])
    error_message = "Solo tres canales sin resource scope usan *; no conceder permisos del iniciador ni Parameter Store."
  }
}

run "operador_demo_contenido" {
  command = plan

  variables {
    # Referencia sintética de fixture, nunca AMI de despliegue.
    demo_ami_arn = "arn:aws:ec2:sa-east-1::image/ami-0123456789abcdef0"
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_demo_network.policy).Statement :
      s.Sid == "ImagenAprobada" && toset(s.Resource) == toset([var.demo_ami_arn])
      ]) && anytrue([
      for s in jsondecode(aws_iam_policy.operator_demo_network.policy).Statement :
      s.Sid == "CrearInstanciaDemo"
      && try(s.Condition.StringEquals["ec2:InstanceType"], "") == "t3.small"
      && try(s.Condition.StringEquals["ec2:MetadataHttpTokens"], "") == "required"
      && try(s.Condition.StringEquals["ec2:InstanceProfile"], "") == "arn:aws:iam::896618135592:instance-profile/medicia-dev-demo-web"
      && try(s.Condition.StringEquals["aws:RequestTag/Deployment"], "") == "ec2-rds-demo"
    ])
    error_message = "El lanzamiento requiere AMI aprobada, perfil exacto, tipo demo, IMDSv2 y tag dedicado."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement :
      s.Effect == "Allow" && toset(s.Action) == toset(["iam:PassRole"])
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-demo-web"])
      && try(s.Condition.StringEquals["iam:PassedToService"], "") == "ec2.amazonaws.com"
    ]) && length([for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement : s if contains(s.Action, "iam:PassRole")]) == 1
    error_message = "PassRole debe existir una sola vez, solo rol web y solo EC2."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-demo-web"])
      && try(s.Condition.StringEquals["iam:PermissionsBoundary"], "") == "arn:aws:iam::896618135592:policy/medicia-dev-demo-boundary"
      if s.Effect == "Allow" && contains(s.Action, "iam:CreateRole")
      ]) && anytrue([
      for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement :
      s.Effect == "Deny" && toset(s.Action) == toset(["iam:CreateRole", "iam:PutRolePolicy", "iam:PutRolePermissionsBoundary"])
      && toset(s.Resource) == toset(["arn:aws:iam::896618135592:role/medicia-dev-demo-web"])
      && try(s.Condition.StringNotEquals["iam:PermissionsBoundary"], "") == "arn:aws:iam::896618135592:policy/medicia-dev-demo-boundary"
    ])
    error_message = "El rol web solo se crea/modifica con su límite, incluso frente al Allow genérico heredado."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement : s.Action if s.Effect == "Allow"]) :
      !strcontains(a, "*") && !contains(["secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "secretsmanager:PutSecretValue", "secretsmanager:UpdateSecret", "ssm:StartSession"], a)
      ]) && alltrue([
      for s in jsondecode(aws_iam_policy.operator_demo.policy).Statement :
      !contains(s.Resource, "arn:aws:s3:::medicia-studies-dev-896618135592/*") && !contains(s.Resource, "arn:aws:s3:::medicia-studies-dev-896618135592/studies/*")
      if s.Effect == "Allow"
    ])
    error_message = "La política demo no concede valores secretos, sesiones ni objetos de estudios."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.operator_demo_network.policy).Statement :
      alltrue([for a in s.Action : !strcontains(a, "*") && startswith(a, "ec2:")])
      && (!contains(s.Resource, "*") || s.Sid == "MetadataEc2")
      && (s.Sid == "MetadataEc2" || s.Sid == "MetadataVpc" || can(s.Condition) || (
        s.Sid == "ImagenAprobada" && toset(s.Action) == toset(["ec2:RunInstances"])
        && toset(s.Resource) == toset([var.demo_ami_arn])
      ))
    ])
    error_message = "La red demo requiere acciones enumeradas y creación/gestión condicionadas; global solo metadata EC2."
  }

  assert {
    condition = alltrue([
      for p in [aws_iam_policy.operator.policy, aws_iam_policy.operator_demo.policy, aws_iam_policy.operator_demo_network.policy, aws_iam_policy.demo_boundary.policy, aws_iam_policy.boundary.policy] : length(p) < 6144
    ])
    error_message = "Todas las políticas administradas deben caber en 6.144 caracteres."
  }
}

run "rechazar_master_como_runtime" {
  command = plan
  variables {
    demo_runtime = {
      user_pool_arn       = "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_DEMO"
      secret_arns         = ["arn:aws:secretsmanager:sa-east-1:896618135592:secret:rds!db-master-AbCd12", "arn:aws:secretsmanager:sa-east-1:896618135592:secret:medicia-dev-demo/duckdns-EfGh34"]
      release_key         = "releases/1.0.0/web.tar.gz"
      model_endpoint_arns = ["arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"]
    }
  }
  expect_failures = [var.demo_runtime]
}

run "plan_puede_refrescar_metadata_demo" {
  command = plan

  assert {
    condition = alltrue([
      for a in ["ec2:DescribeVpcs", "ec2:DescribeInstances", "rds:DescribeDBInstances", "secretsmanager:DescribeSecret", "iam:GetInstanceProfile"] :
      contains(flatten([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : s.Action]), a)
    ])
    error_message = "El plan necesita metadata EC2/RDS/secretos/perfil demo antes del primer plan dev."
  }
}

run "politicas_demo_reservadas_solo_administrador" {
  command = plan

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Sid == "ProtegerLasPoliticasDeAcceso"
      && s.Effect == "Deny"
      && alltrue([
        for r in [
          "arn:aws:iam::896618135592:policy/medicia-dev-demo-boundary",
          "arn:aws:iam::896618135592:policy/medicia-dev-terraform-operator-demo",
          "arn:aws:iam::896618135592:policy/medicia-dev-terraform-operator-demo-network",
        ] : contains(s.Resource, r)
      ])
      && toset(s.Action) == toset([
        "iam:CreatePolicy", "iam:CreatePolicyVersion", "iam:DeletePolicy",
        "iam:DeletePolicyVersion", "iam:SetDefaultPolicyVersion",
      ])
    ])
    error_message = "El Deny existente debe proteger los nombres reservados del límite EC2 y de la política demo antes de conceder permisos nuevos."
  }

  assert {
    condition     = length(aws_iam_policy.operator.policy) < 6144
    error_message = "La protección demo no puede superar el tope de 6.144 caracteres de IAM."
  }
}

run "preservar_el_techo_compartido_sin_secretos_ni_ssm" {
  command = plan

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_policy.boundary.policy).Statement : s.Action]) :
      (!startswith(a, "secretsmanager:") || contains(["secretsmanager:DescribeSecret", "secretsmanager:GetResourcePolicy"], a))
      && !startswith(a, "ssm:") && !startswith(a, "ssmmessages:") && !startswith(a, "ec2messages:")
      && a != "iam:PassRole"
    ])
    error_message = "El límite compartido solo admite metadata de secretos, nunca valores/escrituras, canales SSM ni PassRole de la demo."
  }

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:s3:::medicia-studies-dev-896618135592/studies/*"])
      if contains(s.Action, "s3:PutObject") || contains(s.Action, "s3:DeleteObject")
    ])
    error_message = "Las escrituras previas del usuario local siguen limitadas al prefijo studies/."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.boundary.policy).Statement :
      s.Sid == "InvocarModelo" && s.Effect == "Allow"
      && toset(s.Action) == toset(["sagemaker:InvokeEndpoint"])
      && toset(s.Resource) == toset(["arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"])
    ])
    error_message = "La invocación local previa de EchoNext debe conservar su acción y ARN exactos."
  }
}

run "preservar_plan_y_deny_de_estudios" {
  command = plan

  assert {
    condition = alltrue([
      for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement :
      toset(s.Resource) == toset(["arn:aws:s3:::medicia-tfstate-dev-896618135592/environments/dev/*"])
      if contains(s.Action, "s3:GetObject")
    ])
    error_message = "El plan conserva su lectura heredada de estado, no obtiene objetos de estudios ni de releases."
  }

  assert {
    condition = alltrue([
      for a in flatten([for s in jsondecode(aws_iam_role_policy.plan_read.policy).Statement : s.Action]) :
      !contains(["secretsmanager:GetSecretValue", "secretsmanager:BatchGetSecretValue", "iam:PassRole", "ssm:GetParameter", "ssm:GetParameters", "ssm:GetParametersByPath", "ssm:StartSession"], a)
    ])
    error_message = "El plan no puede obtener valores secretos, pasar roles ni iniciar sesiones SSM."
  }

  assert {
    condition = anytrue([
      for s in jsondecode(aws_iam_policy.operator.policy).Statement :
      s.Sid == "NoLeerNiBorrarEstudios" && s.Effect == "Deny"
      && toset(s.Action) == toset(["s3:GetObject", "s3:GetObjectVersion", "s3:DeleteObject", "s3:DeleteObjectVersion"])
      && toset(s.Resource) == toset(["arn:aws:s3:::medicia-studies-dev-896618135592/*"])
    ])
    error_message = "La contención demo debe conservar intacto el Deny previo de estudios del operador."
  }

  assert {
    condition     = aws_iam_role.plan.permissions_boundary == "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
    error_message = "El plan debe conservar su límite anterior, nunca usar el futuro límite EC2."
  }
}
