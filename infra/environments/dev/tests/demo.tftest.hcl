# Root composition only: synthetic metadata, no AWS or host-readiness claim.
mock_provider "aws" {}

# Synthetic operational fixture deliberately omits enabled and ACME acceptance.
variables {
  demo = {
    ami_id                    = "ami-0123456789abcdef0"
    ami_evidence              = "SYNTHETIC fixture only; not human AMI evidence"
    engine_version            = "17.1"
    final_snapshot_identifier = "medicia-dev-demo-synthetic-final"
    public_hostname           = "synthetic-demo.duckdns.org"
    release_key               = "releases/synthetic-1.tar.gz"
    release_sha256            = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
  }
}

override_module {
  target = module.identity
  outputs = {
    app_access_key_id       = "synthetic-access-id"
    app_secret_access_key   = "synthetic-access-secret"
    region                  = "sa-east-1"
    user_pool_arn           = "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_SYNTHETIC"
    user_pool_client_id     = "syntheticclient"
    user_pool_client_secret = "synthetic-client-secret"
    user_pool_id            = "sa-east-1_SYNTHETIC"
  }
}

override_module {
  target = module.demo_network
  outputs = {
    vpc_id                     = "vpc-0123456789abcdef0"
    public_subnet_id           = "subnet-0123456789abcdef0"
    database_subnet_ids        = ["subnet-0123456789abcdef1", "subnet-0123456789abcdef2"]
    app_security_group_id      = "sg-0123456789abcdef0"
    database_security_group_id = "sg-0123456789abcdef1"
  }
}

override_module {
  target = module.demo_database
  outputs = {
    database_address    = "medicia-dev-demo.synthetic.sa-east-1.rds.amazonaws.com"
    database_name       = "medicia"
    database_port       = 5432
    database_identifier = "medicia-dev-demo"
  }
}

# Intentionally override the child, not execute concurrent host/template work.
# These outputs prove metadata forwarding only, NOT bootstrap or EC2 readiness.
override_module {
  target = module.demo_host
  outputs = {
    instance_id          = "i-0123456789abcdef0"
    elastic_ip           = "192.0.2.10"
    app_secret_arn       = "arn:aws:secretsmanager:sa-east-1:896618135592:secret:medicia/dev/demo/app-SYNTH"
    duckdns_secret_arn   = "arn:aws:secretsmanager:sa-east-1:896618135592:secret:medicia/dev/demo/duckdns-SYNTH"
    releases_bucket_name = "medicia-dev-demo-releases-896618135592"
    release_key          = "releases/synthetic-1.tar.gz"
  }
}

run "disabled_by_default_preserves_existing_root" {
  command = plan
  assert {
    condition     = !var.demo.enabled && output.demo == null && length(module.demo_network) == 0 && length(module.demo_database) == 0 && length(module.demo_host) == 0
    error_message = "Sin configuración operacional no debe existir ninguna instancia de los módulos demo."
  }
  assert {
    condition     = length(var.models) == 1 && !var.models["echonext-mini"].enabled && length(output.enabled_endpoint_names) == 0
    error_message = "El catálogo existente conserva solamente EchoNext apagado."
  }
  assert {
    condition     = output.app_access_key_id == "synthetic-access-id" && output.app_secret_access_key == "synthetic-access-secret" && output.user_pool_client_secret == "synthetic-client-secret" && output.region == "sa-east-1" && output.user_pool_id == "sa-east-1_SYNTHETIC" && output.studies_bucket_name == "medicia-studies-dev-896618135592"
    error_message = "Los outputs locales previos no se sustituyen por credenciales demo."
  }
}

run "enabled_synthetic_metadata" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true }) }
  assert {
    condition     = length(module.demo_network) == 1 && length(module.demo_database) == 1 && length(module.demo_host) == 1 && output.demo.instance_id == "i-0123456789abcdef0" && output.demo.database_address == "medicia-dev-demo.synthetic.sa-east-1.rds.amazonaws.com" && output.demo.database_port == 5432 && output.demo.public_url == "https://synthetic-demo.duckdns.org" && output.demo.release_key == "releases/synthetic-1.tar.gz"
    error_message = "La composición habilitada reenvía metadata sintética de una instancia de cada módulo."
  }
  assert {
    condition     = !var.demo.accept_acme_terms && length(output.enabled_endpoint_names) == 0 && !contains(keys(output.demo), "master_secret_arn") && !contains(keys(output.demo), "DATABASE_URL") && !contains(keys(output.demo), "secret_string")
    error_message = "Habilitar infraestructura no acepta ACME, enciende modelos ni publica valores secretos/master."
  }
}

run "disabled_needs_no_operational_inputs" {
  command = plan
  variables { demo = {} }
  assert {
    condition     = output.demo == null && length(module.demo_host) == 0
    error_message = "Apagado admite entradas operacionales ausentes."
  }
}

run "enabled_requires_operational_inputs" {
  command = plan
  variables { demo = { enabled = true } }
  expect_failures = [var.demo]
}
run "only_dev" {
  command = plan
  variables { demo = { environment = "prod" } }
  expect_failures = [var.demo]
}
run "reject_unapproved_ami" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, ami_id = "latest" }) }
  expect_failures = [var.demo]
}
run "reject_missing_evidence" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, ami_evidence = "" }) }
  expect_failures = [var.demo]
}
run "reject_major_only" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, engine_version = "17" }) }
  expect_failures = [var.demo]
}
run "reject_final_snapshot" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, final_snapshot_identifier = "medicia-dev-demo--invalid" }) }
  expect_failures = [var.demo]
}
run "reject_hostname" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, public_hostname = "https://synthetic-demo.duckdns.org" }) }
  expect_failures = [var.demo]
}
run "reject_mutable_release" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, release_key = "releases/latest.tar.gz" }) }
  expect_failures = [var.demo]
}
run "reject_checksum" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, release_sha256 = "invalid" }) }
  expect_failures = [var.demo]
}
run "explicit_optin_with_synthetic_contact" {
  command = plan
  variables {
    demo                    = merge(var.demo, { enabled = true, accept_acme_terms = true })
    demo_acme_contact_email = "synthetic-operator@example.invalid"
  }
  assert {
    condition     = var.demo.accept_acme_terms && output.demo != null && length(output.enabled_endpoint_names) == 0
    error_message = "Aceptación explícita/contacto válido no habilitan inferencia ni prueban emisión ACME."
  }
}

run "reject_malformed_optin_contact" {
  command = plan
  variables {
    demo                    = merge(var.demo, { enabled = true, accept_acme_terms = true })
    demo_acme_contact_email = " synthetic-operator@example.invalid"
  }
  expect_failures = [var.demo_acme_contact_email]
}

run "optin_requires_contact" {
  command = plan
  variables { demo = merge(var.demo, { enabled = true, accept_acme_terms = true }) }
  expect_failures = [var.demo_acme_contact_email]
}
