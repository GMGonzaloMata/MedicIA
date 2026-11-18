run "infrastructure_only_bootstrap" {
  command   = plan
  state_key = "infrastructure_only"
  variables {
    app_enabled     = false
    public_hostname = ""
    release_key     = ""
    release_sha256  = ""
  }
  assert {
    condition = (strcontains(local.user_data, "if [[ 'false' == false ]]; then\n  systemctl enable amazon-ssm-agent.service\n  systemctl start amazon-ssm-agent.service\n  exit 0\nfi") &&
      strcontains(local.user_data, file("${path.module}/templates/prerequisites.sh")) &&
      aws_instance.web.user_data_replace_on_change && aws_instance.web.metadata_options[0].http_tokens == "required" &&
      aws_instance.web.root_block_device[0].encrypted && aws_instance.web.instance_type == "t3.small" &&
      aws_instance.web.associate_public_ip_address == false && aws_instance.web.iam_instance_profile == aws_iam_instance_profile.web.name &&
    length(base64gzip(local.user_data)) < 21844)
    error_message = "Infraestructura sola conserva prerrequisitos/SSM/seguridad/reemplazo/capacidad sin insumos app ficticios."
  }
}
run "explicit_active_keeps_bootstrap" {
  command   = plan
  state_key = "explicit_active"
  variables { app_enabled = true }
  assert {
    condition     = strcontains(local.user_data, "if [[ 'true' == false ]]; then") && strcontains(local.user_data, "systemctl start amazon-ssm-agent.service medicia.service")
    error_message = "True conserva arranque previo y no toma salida temprana."
  }
}
run "infrastructure_acme_rejected" {
  command   = plan
  state_key = "infrastructure_acme"
  variables {
    app_enabled        = false
    accept_acme_terms  = true
    acme_contact_email = "ops@example.invalid"
  }
  expect_failures = [var.accept_acme_terms]
}
run "infrastructure_bad_hostname" {
  command   = plan
  state_key = "infrastructure_bad_hostname"
  variables {
    app_enabled     = false
    public_hostname = "bad.example.org"
  }
  expect_failures = [var.public_hostname]
}
run "infrastructure_bad_release" {
  command   = plan
  state_key = "infrastructure_bad_release"
  variables {
    app_enabled = false
    release_key = "releases/latest.tar.gz"
  }
  expect_failures = [var.release_key]
}
run "infrastructure_bad_checksum" {
  command   = plan
  state_key = "infrastructure_bad_checksum"
  variables {
    app_enabled    = false
    release_sha256 = "invalid"
  }
  expect_failures = [var.release_sha256]
}
run "active_empty_release" {
  command   = plan
  state_key = "active_empty_release"
  variables { release_key = "" }
  expect_failures = [var.release_key]
}
run "active_empty_checksum" {
  command   = plan
  state_key = "active_empty_checksum"
  variables { release_sha256 = "" }
  expect_failures = [var.release_sha256]
}

run "standard_image_preparation_and_transport" {
  command   = plan
  state_key = "standard_image"
  assert {
    condition = (strcontains(local.user_data, file("${path.module}/templates/prerequisites.sh")) &&
      strcontains(local.user_data, "--exclude=certbot --setopt=gpgcheck=1") &&
    length(regexall("(?m)^const files = .+;$", local.user_data)) == 1)
    error_message = "Preparación estándar antes de servicios y transporte JSON en una sola declaración, sin payload ejecutable."
  }
  assert {
    condition = try(jsondecode(regex("(?m)^const files = (.+);$", local.user_data)[0]) == {
      "/usr/local/libexec/medicia-runtime"          = { mode = 448, content = local.runtime_script }
      "/etc/systemd/system/medicia.service"         = { mode = 420, content = file("${path.module}/templates/medicia.service.tftpl") }
      "/etc/systemd/system/medicia-runtime.service" = { mode = 420, content = file("${path.module}/templates/medicia-runtime.service.tftpl") }
      "/usr/local/libexec/medicia-dns"              = { mode = 448, content = local.dns_script }
      "/etc/systemd/system/medicia-dns.service"     = { mode = 420, content = file("${path.module}/templates/medicia-dns.service.tftpl") }
      "/etc/systemd/system/medicia-dns.timer"       = { mode = 420, content = file("${path.module}/templates/medicia-dns.timer.tftpl") }
      "/usr/local/libexec/medicia-proxy"            = { mode = 448, content = local.proxy_script }
      "/etc/medicia/nginx/challenge.conf"           = { mode = 384, content = local.challenge_config }
      "/etc/medicia/nginx/tls.conf"                 = { mode = 384, content = local.tls_config }
      "/etc/systemd/system/medicia-nginx.service"   = { mode = 420, content = file("${path.module}/templates/medicia-nginx.service.tftpl") }
    }, false)
    error_message = "Cada ruta instalada debe transportar exactamente los bytes/newlines y modos originales, no solo contener un fragmento."
  }
}

run "acme_initial_opt_in_and_owned_namespace" {
  command   = plan
  state_key = "acme_default"
  assert {
    condition = (var.accept_acme_terms == false &&
      local.proxy_paths.certificate_root == "/etc/medicia/letsencrypt/live/${var.public_hostname}" &&
      strcontains(local.user_data, "/usr/local/libexec/medicia-acme") &&
    strcontains(local.user_data, "if [[ 'false' == true ]]"))
    error_message = "ACME debe instalar interfaz propia, namespace privado y no habilitar ejecución sin opt-in."
  }
  assert {
    condition     = length(aws_instance.web.user_data_base64) < 21844
    error_message = "ACME excede capacidad del bootstrap: base64 chars=${nonsensitive(length(aws_instance.web.user_data_base64))}; conservar límite previo 21844, no aumentarlo."
  }
}
run "acme_explicit_contact_accepted" {
  command   = plan
  state_key = "acme_contact_accepted"
  variables {
    accept_acme_terms  = true
    acme_contact_email = "ops@example.invalid"
  }
  assert {
    condition = (var.accept_acme_terms && strcontains(local.user_data, "if [[ 'true' == true ]]") &&
    length(aws_instance.web.user_data_base64) < 21844)
    error_message = "Contacto sintético válido debe permitir opt-in explícito sin exceder bootstrap; no implica aceptación real ni solicitud ACME."
  }
}
run "acme_contact_required_when_opted_in" {
  command   = plan
  state_key = "acme_no_contact"
  variables { accept_acme_terms = true }
  expect_failures = [var.acme_contact_email]
}

# Todos los identificadores son sintéticos. Nunca provider real ni apply.
test {
  parallel = true
}
mock_provider "aws" {}

variables {
  account_id               = "123456789012"
  ami_id                   = "ami-0123456789abcdef0"
  ami_evidence             = "fixture: aprobación humana AL2023 amd64 con Node24/SSM/CLI/CA; no evidencia AWS"
  app_security_group_id    = "sg-0123456789abcdef0"
  database_address         = "demo.abcdefghijkl.sa-east-1.rds.amazonaws.com"
  permissions_boundary_arn = "arn:aws:iam::123456789012:policy/medicia-dev-demo-boundary"
  public_hostname          = "synthetic-demo.duckdns.org"
  public_subnet_id         = "subnet-0123456789abcdef0"
  release_key              = "releases/1.2.3/web-linux-amd64.tar.gz"
  release_sha256           = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  runtime_references = {
    user_pool_arn            = "arn:aws:cognito-idp:sa-east-1:123456789012:userpool/sa-east-1_fixture"
    cognito_client_id        = "fixture123"
    studies_bucket_name      = "medicia-studies-dev-123456789012"
    echonext_endpoint_arn    = "arn:aws:sagemaker:sa-east-1:123456789012:endpoint/medicia-dev-echonext-mini"
    additional_endpoint_arns = []
  }
}

override_resource {
  target          = aws_secretsmanager_secret.runtime["app"]
  override_during = plan
  values          = { arn = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/app-Ab1234" }
}
override_resource {
  target          = aws_secretsmanager_secret.runtime["duckdns"]
  override_during = plan
  values          = { arn = "arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/duckdns-Cd5678" }
}

run "dns_hostname_rejected" {
  command   = plan
  state_key = "dns_bad_host"
  variables { public_hostname = "a.b.duckdns.org" }
  expect_failures = [var.public_hostname]
}
run "dns_query_rejected" {
  command   = plan
  state_key = "dns_bad_query"
  variables { public_hostname = "a&token=bad.duckdns.org" }
  expect_failures = [var.public_hostname]
}

run "dns_no_transient_ipv4" {
  command   = plan
  state_key = "dns_no_transient_ipv4"
  assert {
    condition     = aws_instance.web.associate_public_ip_address == false
    error_message = "DNS no debe publicar IPv4 efímera: deshabilitar IP pública automática y esperar asociación EIP."
  }
}

run "dns_wiring" {
  command   = plan
  state_key = "dns_wiring"
  assert {
    condition = (local.dns_config.public_hostname == var.public_hostname && local.dns_config.token_path == "/run/medicia/current/duckdns" &&
      local.runtime_config.environment.HOSTNAME == "127.0.0.1" && length(keys(local.dns_config)) == 2 &&
      try(jsondecode(regex("(?m)^const files = (.+);$", local.user_data)[0])["/usr/local/libexec/medicia-dns"].content == local.dns_script, false) && strcontains(local.user_data, "systemctl enable --now medicia-dns.timer") &&
    !strcontains(local.dns_script, "get-secret-value") && !strcontains(local.dns_script, "runtime_config"))
    error_message = "DNS metadata separado, token publicado, timer propio y Node loopback; sin fetch ni dependencia inversa EIP."
  }
}
run "dns_empty_rejected" {
  command   = plan
  state_key = "dns_empty"
  variables { public_hostname = "" }
  expect_failures = [var.public_hostname]
}
run "dns_long_rejected" {
  command   = plan
  state_key = "dns_long"
  variables { public_hostname = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.duckdns.org" }
  expect_failures = [var.public_hostname]
}
run "dns_boundary_accepted" {
  command   = plan
  state_key = "dns_boundary"
  variables { public_hostname = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.duckdns.org" }
  assert {
    condition     = local.dns_config.public_hostname == var.public_hostname
    error_message = "El label de 63 caracteres debe conservarse."
  }
}

run "imds_v2" {
  command   = plan
  state_key = "imds"
  assert {
    condition     = aws_instance.web.metadata_options[0].http_tokens == "required" && aws_instance.web.metadata_options[0].http_put_response_hop_limit == 1
    error_message = "IMDSv2 obligatorio con un salto."
  }
}
run "encrypted_capacity" {
  command   = plan
  state_key = "ebs"
  assert {
    condition     = aws_instance.web.instance_type == "t3.small" && aws_instance.web.root_block_device[0].encrypted && aws_instance.web.root_block_device[0].volume_size == 20 && aws_instance.web.root_block_device[0].volume_type == "gp3"
    error_message = "D3 requiere t3.small y EBS cifrado 20 GiB gp3."
  }
}
run "no_ssh" {
  command   = plan
  state_key = "ssh"
  assert {
    condition     = !can(regex("(?m)^\\s*key_name\\s*=", file("${path.module}/main.tf"))) && aws_instance.web.subnet_id == var.public_subnet_id && aws_instance.web.vpc_security_group_ids == toset([var.app_security_group_id])
    error_message = "Sin key_pair; consumir exclusivamente subnet pública y SG app de demo-network."
  }
}
run "ec2_trust_boundary" {
  command   = plan
  state_key = "trust"
  assert {
    condition     = aws_iam_role.web.permissions_boundary == var.permissions_boundary_arn && jsondecode(aws_iam_role.web.assume_role_policy).Statement == [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }] && aws_iam_instance_profile.web.role == aws_iam_role.web.name && aws_instance.web.iam_instance_profile == aws_iam_instance_profile.web.name
    error_message = "Rol/perfil propios con trust EC2 y límite dedicado exacto, no usuario local."
  }
}
run "exact_runtime_permissions" {
  command   = plan
  state_key = "permissions"
  assert {
    condition = (length(jsondecode(aws_iam_role_policy.runtime.policy).Statement) == 9 &&
      length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "SecretosRuntimeExactos" && s.Resource == ["arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/app-Ab1234", "arn:aws:secretsmanager:sa-east-1:123456789012:secret:medicia-dev-demo/duckdns-Cd5678"]]) == 1 &&
      length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "ReleaseExacto" && s.Resource == ["arn:aws:s3:::medicia-releases-dev-123456789012/releases/1.2.3/web-linux-amd64.tar.gz"]]) == 1 &&
    length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "InferenciaExacta" && s.Resource == [var.runtime_references.echonext_endpoint_arn]]) == 1)
    error_message = "Valores de secretos y release exactos; nunca RDS master, backend ni FEVI inventado."
  }
}
run "ssm_agent_only" {
  command   = plan
  state_key = "ssm"
  assert {
    condition = (length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "EstadoDelAgente" && s.Action == ["ssm:UpdateInstanceInformation"] && s.Resource == ["arn:aws:ec2:sa-east-1:123456789012:instance/*"] && s.Condition.StringEquals["aws:ResourceTag/Deployment"] == "ec2-rds-demo"]) == 1 &&
      length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "CanalesDelAgente" && s.Resource == ["*"] && toset(s.Action) == toset(["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel"])]) == 1 &&
    length([for s in jsondecode(aws_iam_role_policy.runtime.policy).Statement : s if try(s.Sid, "") == "AbrirCanalDeSesion" && s.Action == ["ssmmessages:OpenDataChannel"] && s.Resource == ["arn:aws:ssm:sa-east-1:123456789012:session/*"]]) == 1)
    error_message = "SSM solo agente y canales, excepciones de scope iguales al límite aprobado."
  }
}
run "private_bucket" {
  command   = plan
  state_key = "private"
  assert {
    condition     = aws_s3_bucket.releases.bucket == "medicia-releases-dev-123456789012" && !aws_s3_bucket.releases.force_destroy && aws_s3_bucket_public_access_block.releases.block_public_acls && aws_s3_bucket_public_access_block.releases.block_public_policy && aws_s3_bucket_public_access_block.releases.ignore_public_acls && aws_s3_bucket_public_access_block.releases.restrict_public_buckets && one(aws_s3_bucket_ownership_controls.releases.rule).object_ownership == "BucketOwnerEnforced"
    error_message = "Releases privados sin limpieza automática, ACLs desactivadas."
  }
}
run "bucket_encryption_tls" {
  command   = plan
  state_key = "tls"
  assert {
    condition = (alltrue([for r in aws_s3_bucket_server_side_encryption_configuration.releases.rule : alltrue([for e in r.apply_server_side_encryption_by_default : e.sse_algorithm == "AES256"])]) &&
      jsondecode(aws_s3_bucket_policy.releases.policy).Statement[0].Action == ["s3:*"] &&
      jsondecode(aws_s3_bucket_policy.releases.policy).Statement[0].Resource == ["arn:aws:s3:::medicia-releases-dev-123456789012", "arn:aws:s3:::medicia-releases-dev-123456789012/*"] &&
    jsondecode(aws_s3_bucket_policy.releases.policy).Statement[0].Condition.Bool["aws:SecureTransport"] == "false")
    error_message = "SSE-S3 y Deny de cualquier operación sin TLS, bucket y objetos."
  }
}
run "tag_and_name_contract" {
  command   = plan
  state_key = "tags"
  assert {
    condition = (aws_iam_role.web.name == "medicia-dev-demo-web" && aws_iam_instance_profile.web.name == "medicia-dev-demo-web" &&
    alltrue([for t in [aws_instance.web.tags, aws_instance.web.root_block_device[0].tags, aws_eip.web.tags, aws_iam_role.web.tags, aws_iam_instance_profile.web.tags, aws_s3_bucket.releases.tags, aws_secretsmanager_secret.runtime["app"].tags, aws_secretsmanager_secret.runtime["duckdns"].tags] : t == tomap({ Project = "medicia", Environment = "dev", ManagedBy = "terraform", Deployment = "ec2-rds-demo" })]))
    error_message = "Tags/nombres deben satisfacer las condiciones existentes del operador/límite."
  }
}
run "bootstrap_runtime" {
  command   = plan
  state_key = "bootstrap"
  assert {
    condition     = aws_instance.web.user_data_base64 == base64gzip(local.user_data) && length(aws_instance.web.user_data_base64) < 21844 && strcontains(local.user_data, "medicia-runtime") && strcontains(local.user_data, "useradd") && aws_instance.web.user_data_replace_on_change
    error_message = "Bootstrap instala servicios/cuenta propios, no solo una instancia vacía."
  }
}
run "invalid_checksum" {
  command   = plan
  state_key = "bad_sha"
  variables { release_sha256 = "not-64-hex" }
  expect_failures = [var.release_sha256]
}
run "invalid_release" {
  command   = plan
  state_key = "bad_release"
  variables { release_key = "releases/../latest.tar.gz" }
  expect_failures = [var.release_key]
}
run "invalid_ami" {
  command   = plan
  state_key = "bad_ami"
  variables { ami_id = "" }
  expect_failures = [var.ami_id]
}
run "missing_ami_evidence" {
  command   = plan
  state_key = "bad_evidence"
  variables { ami_evidence = "" }
  expect_failures = [var.ami_evidence]
}
run "shared_boundary_rejected" {
  command   = plan
  state_key = "bad_boundary"
  variables { permissions_boundary_arn = "arn:aws:iam::123456789012:policy/medicia-dev-boundary" }
  expect_failures = [var.permissions_boundary_arn]
}
run "other_environment" {
  command   = plan
  state_key = "bad_env"
  variables { environment = "prod" }
  expect_failures = [var.environment]
}
run "bad_subnet" {
  command   = plan
  state_key = "bad_subnet"
  variables { public_subnet_id = "default" }
  expect_failures = [var.public_subnet_id]
}
run "bad_security_group" {
  command   = plan
  state_key = "bad_sg"
  variables { app_security_group_id = "default" }
  expect_failures = [var.app_security_group_id]
}
run "bad_account" {
  command   = plan
  state_key = "bad_account"
  variables { account_id = "*" }
  expect_failures = [var.account_id]
}
run "bad_region" {
  command   = plan
  state_key = "bad_region"
  variables { region = "*" }
  expect_failures = [var.region]
}
run "bad_database_address" {
  command   = plan
  state_key = "bad_db"
  variables { database_address = "postgres://secret@db" }
  expect_failures = [var.database_address]
}
run "bad_runtime_references" {
  command   = plan
  state_key = "bad_refs"
  variables {
    runtime_references = {
      user_pool_arn            = "arn:aws:cognito-idp:sa-east-1:999999999999:userpool/sa-east-1_foreign"
      cognito_client_id        = "fixture123"
      studies_bucket_name      = "foreign-studies"
      echonext_endpoint_arn    = "arn:aws:sagemaker:sa-east-1:123456789012:endpoint/*"
      additional_endpoint_arns = []
    }
  }
  expect_failures = [var.runtime_references]
}

run "proxy_wiring" {
  command   = plan
  state_key = "proxy_wiring"
  assert {
    condition = (strcontains(local.user_data, "/usr/local/libexec/medicia-proxy") &&
      strcontains(local.user_data, "/etc/medicia/nginx/challenge.conf") &&
      strcontains(local.user_data, "systemctl enable --now medicia-nginx.service") &&
      local.runtime_config.environment.HOSTNAME == "127.0.0.1" &&
      !strcontains(local.user_data, "systemctl disable nginx") &&
    !strcontains(local.user_data, "certbot certonly"))
    error_message = "Proxy must install owned configuration and service without changing runtime, AMI Nginx or issuing certificates."
  }
}

run "acme_renewal_timer_wiring" {
  command   = plan
  state_key = "acme_renewal_default"
  assert {
    condition = (var.accept_acme_terms == false &&
      strcontains(local.user_data, chomp(file("${path.module}/templates/medicia-acme.timer.tftpl"))) &&
      strcontains(local.user_data, "/etc/systemd/system/medicia-acme.timer") &&
      strcontains(local.user_data, "if [[ 'false' == true ]]; then\n  systemctl start medicia-acme.service\n  systemctl enable --now medicia-acme.timer\nfi") &&
    length(aws_instance.web.user_data_base64) < 21844)
    error_message = "Renovación instala timer inerte con gate explícito; preservar capacidad 21844 sin ejecutar emisión por defecto."
  }
}

run "acme_renewal_timer_opted_in" {
  command   = plan
  state_key = "acme_renewal_opted_in"
  variables {
    accept_acme_terms  = true
    acme_contact_email = "ops@example.invalid"
  }
  assert {
    condition = (strcontains(local.user_data, "if [[ 'true' == true ]]; then\n  systemctl start medicia-acme.service\n  systemctl enable --now medicia-acme.timer\nfi") &&
      aws_instance.web.user_data_base64 == base64gzip(local.user_data) &&
    length(aws_instance.web.user_data_base64) < 21844)
    error_message = "Timer solo tras start exitoso optado; conservar compresión y límite también con contacto sintético."
  }
}
