# Pruebas del bucket de estudios de ECG. Corren con el proveedor simulado: no tocan AWS ni piden credenciales.
# Contrato: specs/006-carga-estudios-ecg/contracts/storage-and-permissions.md.

mock_provider "aws" {}

variables {
  environment = "dev"
  account_id  = "896618135592"
}

run "bucket_privado_y_protegido" {
  command = plan

  assert {
    condition     = aws_s3_bucket.this.bucket == "medicia-studies-dev-896618135592"
    error_message = "El bucket debe llamarse medicia-studies-dev-896618135592."
  }

  assert {
    condition     = aws_s3_bucket.this.force_destroy == false
    error_message = "El bucket no puede borrarse con estudios dentro."
  }

  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.this.block_public_acls,
      aws_s3_bucket_public_access_block.this.block_public_policy,
      aws_s3_bucket_public_access_block.this.ignore_public_acls,
      aws_s3_bucket_public_access_block.this.restrict_public_buckets,
    ])
    error_message = "Las cuatro opciones de bloqueo de acceso público deben estar en true."
  }

  assert {
    condition     = aws_s3_bucket_ownership_controls.this.rule[0].object_ownership == "BucketOwnerEnforced"
    error_message = "La propiedad de los objetos debe estar forzada al propietario (sin ACL)."
  }
}

# El bucket no tiene versionado a propósito: eliminar un estudio debe borrarlo de verdad (FR-015, SC-005).
# Terraform test no puede afirmar que un recurso no existe; lo vigila la guarda de CI de .github/workflows/infra.yml.

run "cifrado_y_ciclo_de_vida" {
  command = plan

  assert {
    condition     = one(aws_s3_bucket_server_side_encryption_configuration.this.rule).apply_server_side_encryption_by_default[0].sse_algorithm == "AES256"
    error_message = "El cifrado por defecto debe ser SSE-S3 (AES256)."
  }

  assert {
    condition     = one(aws_s3_bucket_lifecycle_configuration.this.rule).abort_incomplete_multipart_upload[0].days_after_initiation == 1
    error_message = "Las cargas multiparte incompletas deben abortarse al día."
  }

  # Sin vencimiento de objetos: la conservación se define antes de operar con datos reales (principio VI).
  assert {
    condition     = length(one(aws_s3_bucket_lifecycle_configuration.this.rule).expiration) == 0
    error_message = "Los estudios no pueden vencer solos: la conservación todavía no está definida."
  }

  assert {
    condition     = length(one(aws_s3_bucket_lifecycle_configuration.this.rule).noncurrent_version_expiration) == 0
    error_message = "Sin versionado no hay versiones no vigentes que vencer."
  }
}

run "politica_solo_exige_tls" {
  command = plan

  assert {
    condition     = length(jsondecode(aws_s3_bucket_policy.this.policy).Statement) == 1
    error_message = "La política del bucket debe tener exactamente una declaración."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Effect == "Deny"
    error_message = "La única declaración debe ser un Deny."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Action == "s3:*"
    error_message = "El Deny debe cubrir s3:*."
  }

  assert {
    condition     = jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false"
    error_message = "El Deny debe aplicar cuando aws:SecureTransport es false."
  }

  assert {
    condition = toset(jsondecode(aws_s3_bucket_policy.this.policy).Statement[0].Resource) == toset([
      "arn:aws:s3:::medicia-studies-dev-896618135592",
      "arn:aws:s3:::medicia-studies-dev-896618135592/*",
    ])
    error_message = "El Deny debe cubrir el bucket y sus objetos."
  }

  assert {
    condition     = length([for s in jsondecode(aws_s3_bucket_policy.this.policy).Statement : s if s.Effect == "Allow"]) == 0
    error_message = "La política no puede tener declaraciones Allow (ni acceso público ni de otras cuentas)."
  }
}

run "salidas" {
  command = plan

  assert {
    condition     = output.bucket_arn == "arn:aws:s3:::medicia-studies-dev-896618135592"
    error_message = "bucket_arn debe armarse con el nombre conocido."
  }

  assert {
    condition     = output.bucket_name == "medicia-studies-dev-896618135592"
    error_message = "bucket_name debe ser medicia-studies-dev-896618135592."
  }
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
