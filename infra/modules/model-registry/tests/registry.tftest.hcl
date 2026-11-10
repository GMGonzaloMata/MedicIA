# Pruebas del repositorio de imágenes de un modelo (005, FR-018, R5).
# Corren con el proveedor simulado: no tocan AWS ni piden credenciales.

mock_provider "aws" {}

variables {
  environment = "dev"
  account_id  = "896618135592"
  name        = "echonext-mini"
}

run "repositorio_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_ecr_repository.this.name == "medicia-dev-echonext-mini"
    error_message = "El repositorio debe llamarse medicia-dev-echonext-mini (así lo esperan las políticas de infra/bootstrap)."
  }

  assert {
    condition     = output.repository_arn == "arn:aws:ecr:sa-east-1:896618135592:repository/medicia-dev-echonext-mini"
    error_message = "El ARN debe armarse con el nombre conocido."
  }

  assert {
    condition     = output.repository_url == "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini"
    error_message = "La URL debe ser <cuenta>.dkr.ecr.<región>.amazonaws.com/<nombre>."
  }
}

run "etiquetas_inmutables_escaneo_y_cifrado" {
  command = plan

  assert {
    condition     = aws_ecr_repository.this.image_tag_mutability == "IMMUTABLE"
    error_message = "Las etiquetas deben ser inmutables: una versión publicada no cambia."
  }

  assert {
    condition     = one(aws_ecr_repository.this.image_scanning_configuration).scan_on_push == true
    error_message = "Debe escanear vulnerabilidades al subir."
  }

  assert {
    condition     = one(aws_ecr_repository.this.encryption_configuration).encryption_type == "AES256"
    error_message = "Debe cifrar en reposo."
  }

  assert {
    condition     = aws_ecr_repository.this.force_delete == false
    error_message = "No debe poder destruirse con imágenes adentro."
  }
}

run "ciclo_de_vida_conserva_las_ultimas_imagenes" {
  command = plan

  assert {
    condition     = length(jsondecode(aws_ecr_lifecycle_policy.this.policy).rules) == 2
    error_message = "Debe haber dos reglas: sin etiqueta y las últimas N."
  }

  assert {
    condition = anytrue([
      for r in jsondecode(aws_ecr_lifecycle_policy.this.policy).rules :
      r.selection.tagStatus == "untagged" && r.selection.countType == "sinceImagePushed" && r.selection.countNumber == 7
    ])
    error_message = "Las imágenes sin etiqueta deben vencer a los 7 días."
  }

  assert {
    condition = anytrue([
      for r in jsondecode(aws_ecr_lifecycle_policy.this.policy).rules :
      r.selection.tagStatus == "any" && r.selection.countType == "imageCountMoreThan" && r.selection.countNumber == 10
    ])
    error_message = "Por defecto se conservan las últimas 10 imágenes."
  }

  # ECR exige que la regla "any" tenga la prioridad más baja (el número más alto).
  assert {
    condition = (
      [for r in jsondecode(aws_ecr_lifecycle_policy.this.policy).rules : r.rulePriority if r.selection.tagStatus == "any"][0]
      > [for r in jsondecode(aws_ecr_lifecycle_policy.this.policy).rules : r.rulePriority if r.selection.tagStatus == "untagged"][0]
    )
    error_message = "La regla tagStatus any debe ir en la última prioridad."
  }
}

run "cantidad_de_imagenes_a_conservar_configurable" {
  command = plan

  variables {
    keep_last_images = 3
  }

  assert {
    condition = anytrue([
      for r in jsondecode(aws_ecr_lifecycle_policy.this.policy).rules :
      r.selection.tagStatus == "any" && r.selection.countNumber == 3
    ])
    error_message = "keep_last_images debe reflejarse en la política de ciclo de vida."
  }
}

run "cantidad_de_imagenes_invalida" {
  command = plan

  variables {
    keep_last_images = 0
  }

  expect_failures = [var.keep_last_images]
}

run "nombre_invalido" {
  command = plan

  variables {
    name = "EchoNext"
  }

  expect_failures = [var.name]
}

run "entorno_no_permitido" {
  command = plan

  variables {
    environment = "prod"
  }

  expect_failures = [var.environment]
}

run "cuenta_invalida" {
  command = plan

  variables {
    account_id = "123"
  }

  expect_failures = [var.account_id]
}
