# Fixtures sintéticos: 17.1 NO afirma disponibilidad regional ni recomienda esa versión.
# Cada run tiene estado independiente para observar todos los RED funcionales.
test {
  parallel = false
}
mock_provider "aws" {}

variables {
  database_security_group_id = "sg-0123456789abcdef0"
  database_subnet_ids        = ["subnet-0123456789abcdef0", "subnet-1123456789abcdef0"]
  engine_version             = "17.1"
  final_snapshot_identifier  = "medicia-dev-demo-final-test"
}

override_resource {
  target          = aws_db_instance.demo
  override_during = plan
  values = {
    address = "db.example.invalid"
    master_user_secret = [{
      secret_arn    = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:rds!db-fixture"
      kms_key_id    = "fixture-key"
      secret_status = "active"
    }]
  }
}

run "encrypted_storage" {
  state_key = "encryption"
  command   = plan
  assert {
    condition     = aws_db_instance.demo.storage_encrypted
    error_message = "RDS debe cifrar almacenamiento en reposo."
  }
}
run "single_az" {
  state_key = "single_az"
  command   = plan
  assert {
    condition     = !aws_db_instance.demo.multi_az
    error_message = "Dos subredes no deben habilitar RDS Multi-AZ."
  }
}
run "backup_seven_days" {
  state_key = "backup"
  command   = plan
  assert {
    condition     = aws_db_instance.demo.backup_retention_period == 7
    error_message = "D4 requiere backup de siete días."
  }
}
run "managed_master" {
  state_key = "master"
  command   = plan
  assert {
    condition     = aws_db_instance.demo.manage_master_user_password && aws_db_instance.demo.password == null && aws_db_instance.demo.password_wo == null
    error_message = "RDS administra master; Terraform no transporta contraseñas."
  }
}
run "not_public" {
  state_key = "public"
  command   = plan
  assert {
    condition     = !aws_db_instance.demo.publicly_accessible
    error_message = "RDS nunca debe ser público."
  }
}
run "private_network_binding" {
  state_key = "network"
  command   = plan
  assert {
    condition = (aws_db_subnet_group.demo.subnet_ids == toset(var.database_subnet_ids) &&
      aws_db_instance.demo.db_subnet_group_name == aws_db_subnet_group.demo.name &&
      aws_db_instance.demo.vpc_security_group_ids == toset([var.database_security_group_id]) &&
    aws_db_instance.demo.port == 5432)
    error_message = "RDS usa las dos subredes privadas y el SG DB de demo-network, nunca el SG app/default."
  }
}
run "force_tls" {
  state_key = "tls"
  command   = plan
  assert {
    condition = (aws_db_parameter_group.demo.family == "postgres17" &&
      aws_db_instance.demo.parameter_group_name == aws_db_parameter_group.demo.name &&
      length(aws_db_parameter_group.demo.parameter) == 1 &&
    alltrue([for p in aws_db_parameter_group.demo.parameter : p.name == "rds.force_ssl" && p.value == "1" && p.apply_method == "pending-reboot"]))
    error_message = "Parameter group PostgreSQL 17 dedicado fuerza TLS y queda asociado a RDS."
  }
}
run "planned_capacity" {
  state_key = "capacity"
  command   = plan
  assert {
    condition = (aws_db_instance.demo.engine == "postgres" && aws_db_instance.demo.engine_version == var.engine_version &&
      aws_db_instance.demo.instance_class == "db.t4g.micro" && aws_db_instance.demo.allocated_storage == 20 &&
    aws_db_instance.demo.storage_type == "gp3" && !aws_db_instance.demo.allow_major_version_upgrade)
    error_message = "D4 fija PostgreSQL 17 exacto suministrado, db.t4g.micro y 20 GiB gp3 sin upgrade mayor."
  }
}
run "deletion_and_snapshot" {
  state_key = "deletion"
  command   = plan
  assert {
    condition = (aws_db_instance.demo.deletion_protection && !aws_db_instance.demo.skip_final_snapshot &&
      aws_db_instance.demo.final_snapshot_identifier == var.final_snapshot_identifier &&
    !aws_db_instance.demo.delete_automated_backups && aws_db_instance.demo.copy_tags_to_snapshot)
    error_message = "Protección de borrado, snapshot final nombrado y backups preservados; sin limpieza automática."
  }
}
run "metadata_outputs" {
  state_key = "outputs"
  command   = plan
  assert {
    condition = (output.database_identifier == "medicia-dev-demo" && output.database_address == "db.example.invalid" &&
      output.database_port == 5432 && output.database_name == "medicia" &&
    output.master_secret_arn == "arn:aws:secretsmanager:sa-east-1:123456789012:secret:rds!db-fixture")
    error_message = "Composición recibe solo identificador, address, puerto, nombre y ARN master, nunca credenciales."
  }
}
run "authorization_tags" {
  state_key = "tags"
  command   = plan
  assert {
    condition = alltrue([for tags in [aws_db_instance.demo.tags, aws_db_subnet_group.demo.tags, aws_db_parameter_group.demo.tags] :
      lookup(tags, "Project", "") == "medicia" && lookup(tags, "Environment", "") == "dev" &&
    lookup(tags, "ManagedBy", "") == "terraform" && lookup(tags, "Deployment", "") == "ec2-rds-demo"])
    error_message = "Cada recurso etiquetable conserva tags compatibles con autorización demo."
  }
}

run "reject_environment" {
  state_key = "environment_invalid"
  command   = plan
  variables { environment = "prod" }
  expect_failures = [var.environment]
}
run "reject_engine_major_only" {
  state_key = "engine_major_only"
  command   = plan
  variables { engine_version = "17" }
  expect_failures = [var.engine_version]
}
run "reject_engine_other_major" {
  state_key = "engine_other"
  command   = plan
  variables { engine_version = "16.1" }
  expect_failures = [var.engine_version]
}
run "reject_engine_suffix" {
  state_key = "engine_suffix"
  command   = plan
  variables { engine_version = "17.latest" }
  expect_failures = [var.engine_version]
}
run "reject_missing_subnet" {
  state_key = "subnet_missing"
  command   = plan
  variables { database_subnet_ids = ["subnet-0123456789abcdef0"] }
  expect_failures = [var.database_subnet_ids]
}
run "reject_duplicate_subnets" {
  state_key = "subnet_duplicate"
  command   = plan
  variables { database_subnet_ids = ["subnet-0123456789abcdef0", "subnet-0123456789abcdef0"] }
  expect_failures = [var.database_subnet_ids]
}
run "reject_malformed_subnet" {
  state_key = "subnet_malformed"
  command   = plan
  variables { database_subnet_ids = ["subnet-0123456789abcdef0", "subnet-notvalid"] }
  expect_failures = [var.database_subnet_ids]
}
run "reject_malformed_sg" {
  state_key = "sg_malformed"
  command   = plan
  variables { database_security_group_id = "sg-notvalid" }
  expect_failures = [var.database_security_group_id]
}
run "reject_empty_snapshot" {
  state_key = "snapshot_empty"
  command   = plan
  variables { final_snapshot_identifier = "" }
  expect_failures = [var.final_snapshot_identifier]
}
run "reject_snapshot_double_hyphen" {
  state_key = "snapshot_double"
  command   = plan
  variables { final_snapshot_identifier = "medicia-dev-demo--final" }
  expect_failures = [var.final_snapshot_identifier]
}
run "reject_snapshot_trailing_hyphen" {
  state_key = "snapshot_trailing"
  command   = plan
  variables { final_snapshot_identifier = "medicia-dev-demo-final-" }
  expect_failures = [var.final_snapshot_identifier]
}
run "reject_snapshot_outside_demo" {
  state_key = "snapshot_prefix"
  command   = plan
  variables { final_snapshot_identifier = "unrelated-final" }
  expect_failures = [var.final_snapshot_identifier]
}
run "reject_snapshot_too_long" {
  state_key = "snapshot_long"
  command   = plan
  variables { final_snapshot_identifier = "medicia-dev-demo${join("", [for i in range(240) : "a"])}" }
  expect_failures = [var.final_snapshot_identifier]
}

# Límites suplementarios GREEN; no se atribuye RED retrospectivo a estos casos.
run "reject_no_subnets" {
  state_key = "subnets_empty"
  command   = plan
  variables { database_subnet_ids = [] }
  expect_failures = [var.database_subnet_ids]
}
run "reject_three_subnets" {
  state_key = "subnets_three"
  command   = plan
  variables { database_subnet_ids = ["subnet-01234567", "subnet-11234567", "subnet-21234567"] }
  expect_failures = [var.database_subnet_ids]
}
run "reject_empty_sg" {
  state_key = "sg_empty"
  command   = plan
  variables { database_security_group_id = "" }
  expect_failures = [var.database_security_group_id]
}
run "reject_empty_version" {
  state_key = "version_empty"
  command   = plan
  variables { engine_version = "" }
  expect_failures = [var.engine_version]
}
run "valid_custom_metadata_and_snapshot_maximum" {
  state_key = "custom"
  command   = plan
  variables {
    database_security_group_id = "sg-1234abcd"
    database_subnet_ids        = ["subnet-1234abcd", "subnet-abcd1234"]
    engine_version             = "17.99"
    final_snapshot_identifier  = "medicia-dev-demo${join("", [for i in range(239) : "a"])}"
  }
  assert {
    condition = (aws_db_instance.demo.engine_version == "17.99" && !aws_db_instance.demo.auto_minor_version_upgrade &&
      aws_db_instance.demo.vpc_security_group_ids == toset(["sg-1234abcd"]) &&
      aws_db_subnet_group.demo.subnet_ids == toset(["subnet-1234abcd", "subnet-abcd1234"]) &&
    length(aws_db_instance.demo.final_snapshot_identifier) == 255)
    error_message = "IDs legacy válidos, versión exacta sintética sin upgrade menor automático y snapshot máximo 255 se conservan."
  }
}
run "valid_snapshot_prefix_boundary" {
  state_key = "snapshot_min"
  command   = plan
  variables { final_snapshot_identifier = "medicia-dev-demo" }
  assert {
    condition     = aws_db_instance.demo.final_snapshot_identifier == "medicia-dev-demo"
    error_message = "El prefijo demo completo es un identificador sintácticamente válido; el humano confirma unicidad."
  }
}

# Lifecycle no es un atributo evaluable en plan: verificación estructural, no RED artificial.
run "static_destroy_and_secret_surface_guards" {
  state_key = "static"
  command   = plan
  assert {
    condition     = can(regex("(?s)resource \\\"aws_db_instance\\\" \\\"demo\\\".*lifecycle\\s*\\{\\s*prevent_destroy\\s*=\\s*true", file("${path.module}/main.tf")))
    error_message = "La instancia RDS debe conservar lifecycle prevent_destroy literal."
  }
  assert {
    condition = (toset(flatten(regexall("output \\\"([^\\\"]+)\\\"", file("${path.module}/outputs.tf")))) ==
    toset(["database_address", "database_identifier", "database_name", "database_port", "master_secret_arn"]))
    error_message = "Solo cinco outputs metadata autorizados; nunca master value ni connection secret."
  }
  assert {
    condition = (length(regexall("(?m)^\\s*(password|password_wo|secret_string|secret_binary)\\s*=", file("${path.module}/main.tf"))) == 0 &&
      length(regexall("(?m)^\\s*data\\s+\\\"", file("${path.module}/main.tf"))) == 0 &&
    length(regexall("(?m)^resource\\s+\\\"", file("${path.module}/main.tf"))) == 3)
    error_message = "Solo instancia, subnet group y parameter group: sin data lookups ni recursos/valores de secretos."
  }
}
