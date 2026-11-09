# Pruebas del bucket que guarda el estado remoto (FR-003, FR-004).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.

mock_provider "aws" {}

# La identidad que aplica no es la cuenta raíz. Se fija para no depender de valores aleatorios del simulacro.
override_data {
  target = data.aws_caller_identity.current
  values = {
    arn = "arn:aws:iam::896618135592:user/terraform-dev"
  }
}

run "bucket_con_nombre_esperado" {
  command = plan

  assert {
    condition     = aws_s3_bucket.state.bucket == "medicia-tfstate-dev-896618135592"
    error_message = "El bucket del estado debe llamarse medicia-tfstate-dev-896618135592."
  }

  assert {
    condition     = aws_s3_bucket.state.force_destroy == false
    error_message = "El bucket del estado no debe permitir force_destroy."
  }
}

run "versionado_activado" {
  command = plan

  assert {
    condition     = one(aws_s3_bucket_versioning.state.versioning_configuration).status == "Enabled"
    error_message = "El versionado del bucket del estado debe estar en Enabled."
  }
}

run "cifrado_en_reposo" {
  command = plan

  assert {
    condition = one(
      one(aws_s3_bucket_server_side_encryption_configuration.state.rule).apply_server_side_encryption_by_default
    ).sse_algorithm == "AES256"
    error_message = "El cifrado por defecto del bucket del estado debe ser AES256 (SSE-S3)."
  }
}

run "sin_acceso_publico" {
  command = plan

  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_acls == true
    error_message = "block_public_acls debe ser true."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.state.block_public_policy == true
    error_message = "block_public_policy debe ser true."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.state.ignore_public_acls == true
    error_message = "ignore_public_acls debe ser true."
  }

  assert {
    condition     = aws_s3_bucket_public_access_block.state.restrict_public_buckets == true
    error_message = "restrict_public_buckets debe ser true."
  }
}

run "vencimiento_de_versiones_no_vigentes" {
  command = plan

  assert {
    condition     = one(one(aws_s3_bucket_lifecycle_configuration.state.rule).noncurrent_version_expiration).noncurrent_days == 90
    error_message = "Las versiones no vigentes del estado deben vencer a los 90 días."
  }
}

run "politica_exige_tls" {
  command = plan

  assert {
    condition = anytrue([
      for statement in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      statement.Effect == "Deny" && statement.Condition.Bool["aws:SecureTransport"] == "false"
    ])
    error_message = "La política del bucket debe negar el acceso sin TLS (aws:SecureTransport igual a false)."
  }

  assert {
    condition = anytrue([
      for statement in jsondecode(aws_s3_bucket_policy.state.policy).Statement :
      contains(statement.Resource, "arn:aws:s3:::medicia-tfstate-dev-896618135592/*")
    ])
    error_message = "La negación sin TLS debe cubrir los objetos del bucket del estado."
  }
}

run "rechaza_la_cuenta_raiz" {
  command = plan

  override_data {
    target = data.aws_caller_identity.current
    values = {
      arn = "arn:aws:iam::896618135592:root"
    }
  }

  expect_failures = [
    aws_s3_bucket.state,
  ]
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
