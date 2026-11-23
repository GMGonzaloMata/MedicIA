locals {
  name        = "medicia-${var.environment}-demo-web"
  bucket_name = "medicia-releases-${var.environment}-${var.account_id}"
  bucket_arn  = "arn:aws:s3:::${local.bucket_name}"
  tags = {
    Project     = "medicia"
    Environment = var.environment
    ManagedBy   = "terraform"
    Deployment  = "ec2-rds-demo"
  }
  # Solo referencias públicas; jamás valores ni lectura del secreto master.
  runtime_config = {
    region             = var.region
    app_secret_arn     = aws_secretsmanager_secret.runtime["app"].arn
    duckdns_secret_arn = aws_secretsmanager_secret.runtime["duckdns"].arn
    release_bucket     = local.bucket_name
    release_key        = var.release_key
    release_sha256     = lower(var.release_sha256)
    database_address   = var.database_address
    environment = {
      NODE_ENV                = "production"
      HOSTNAME                = "127.0.0.1"
      PORT                    = "3000"
      IDENTITY_PROVIDER       = "cognito"
      STUDY_STORAGE           = "s3"
      MODEL_INFERENCE         = "sagemaker"
      AWS_REGION              = var.region
      COGNITO_REGION          = var.region
      COGNITO_USER_POOL_ID    = split("/", var.runtime_references.user_pool_arn)[1]
      COGNITO_CLIENT_ID       = var.runtime_references.cognito_client_id
      STUDIES_BUCKET          = var.runtime_references.studies_bucket_name
      SAGEMAKER_ENDPOINT_NAME = split("/", var.runtime_references.echonext_endpoint_arn)[1]
    }
  }
  runtime_script = templatefile("${path.module}/templates/runtime.sh.tftpl", {
    runtime_root          = "/run/medicia"
    release_root          = "/opt/medicia/releases"
    runtime_config_base64 = base64encode(jsonencode(local.runtime_config))
  })
  # Metadatos DNS separados: no cambiar runtime_config ni introducir tokens en Terraform.
  dns_config = {
    public_hostname = var.public_hostname
    token_path      = "/run/medicia/current/duckdns"
  }
  dns_script = templatefile("${path.module}/templates/dns.sh.tftpl", {
    dns_config_base64 = base64encode(jsonencode(local.dns_config))
  })
  proxy_paths = {
    proxy_root       = "/etc/medicia/nginx"
    certificate_root = "/etc/medicia/letsencrypt/live/${var.public_hostname}"
    state_root       = "/var/lib/medicia/nginx"
    public_hostname  = var.public_hostname
    hostname_pattern = replace(var.public_hostname, ".", "[.]")
  }
  proxy_script     = templatefile("${path.module}/templates/proxy.sh.tftpl", local.proxy_paths)
  challenge_config = templatefile("${path.module}/templates/nginx-challenge.conf.tftpl", local.proxy_paths)
  tls_config       = templatefile("${path.module}/templates/nginx.conf.tftpl", local.proxy_paths)
  acme_config = {
    acceptTerms = var.accept_acme_terms
    email       = var.acme_contact_email
    hostname    = var.public_hostname
    configRoot  = "/etc/medicia/letsencrypt"
    workRoot    = "/var/lib/medicia/certbot"
    logsRoot    = "/var/log/medicia/certbot"
    homeRoot    = "/var/lib/medicia/certbot-home"
    cliConfig   = "/etc/medicia/acme/cli.ini"
    binary      = "/opt/certbot/bin/certbot"
    proxyHelper = "/usr/local/libexec/medicia-proxy"
    webroot     = "/var/lib/medicia/acme"
  }
  acme_script = templatefile("${path.module}/templates/acme.sh.tftpl", {
    acme_config_json = jsonencode(local.acme_config)
  })
  # JSON como datos: conserva bytes y modos sin el overhead del base64 interno.
  # Modos decimales: 448=0700, 420=0644, 384=0600.
  bootstrap_files = {
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
  }
  user_data = templatefile("${path.module}/templates/user-data.sh.tftpl", {
    app_enabled             = var.app_enabled
    accept_acme_terms       = var.accept_acme_terms
    acme_script             = chomp(local.acme_script)
    acme_service            = chomp(file("${path.module}/templates/medicia-acme.service.tftpl"))
    acme_timer              = chomp(file("${path.module}/templates/medicia-acme.timer.tftpl"))
    bootstrap_files_json    = jsonencode(local.bootstrap_files)
    prerequisite_script_raw = file("${path.module}/templates/prerequisites.sh")
  })
}

resource "aws_secretsmanager_secret" "runtime" {
  for_each                = toset(["app", "duckdns"])
  name                    = "medicia-${var.environment}-demo/${each.key}"
  description             = "Solo metadatos; valor cargado fuera de Terraform por responsable."
  recovery_window_in_days = 30
  tags                    = local.tags
}

resource "aws_iam_role" "web" {
  name                 = local.name
  permissions_boundary = var.permissions_boundary_arn
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ec2.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = local.tags
}

resource "aws_iam_role_policy" "runtime" {
  name = "medicia-${var.environment}-demo-runtime"
  role = aws_iam_role.web.name
  policy = jsonencode({
    Version = "2012-10-17"
    # Misma intersección que demo-boundary; el límite NO concede permisos por sí solo.
    Statement = [
      {
        Sid       = "EstadoDelAgente"
        Effect    = "Allow"
        Action    = ["ssm:UpdateInstanceInformation"]
        Resource  = ["arn:aws:ec2:${var.region}:${var.account_id}:instance/*"]
        Condition = { StringEquals = { "aws:ResourceTag/Deployment" = "ec2-rds-demo" } }
      },
      {
        # Únicas tres acciones sin resource scope admitido; nunca StartSession.
        Sid      = "CanalesDelAgente"
        Effect   = "Allow"
        Action   = ["ssmmessages:CreateControlChannel", "ssmmessages:CreateDataChannel", "ssmmessages:OpenControlChannel"]
        Resource = ["*"]
      },
      {
        Sid      = "AbrirCanalDeSesion"
        Effect   = "Allow"
        Action   = ["ssmmessages:OpenDataChannel"]
        Resource = ["arn:aws:ssm:${var.region}:${var.account_id}:session/*"]
      },
      {
        Sid      = "PoolExacto"
        Effect   = "Allow"
        Action   = ["cognito-idp:AdminSetUserPassword"]
        Resource = [var.runtime_references.user_pool_arn]
      },
      {
        Sid      = "Estudios"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = ["arn:aws:s3:::${var.runtime_references.studies_bucket_name}/studies/*"]
      },
      {
        Sid       = "ConciliarEstudios"
        Effect    = "Allow"
        Action    = ["s3:ListBucket"]
        Resource  = ["arn:aws:s3:::${var.runtime_references.studies_bucket_name}"]
        Condition = { StringLike = { "s3:prefix" = ["studies/*"] } }
      },
      {
        Sid      = "SecretosRuntimeExactos"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = sort([for s in aws_secretsmanager_secret.runtime : s.arn])
      },
      {
        Sid      = "ReleaseExacto"
        Effect   = "Allow"
        Action   = ["s3:GetObject"]
        Resource = ["${local.bucket_arn}/${var.release_key}"]
      },
      {
        Sid      = "InferenciaExacta"
        Effect   = "Allow"
        Action   = ["sagemaker:InvokeEndpoint"]
        Resource = sort(tolist(setunion(toset([var.runtime_references.echonext_endpoint_arn]), var.runtime_references.additional_endpoint_arns)))
      },
    ]
  })
}

resource "aws_iam_instance_profile" "web" {
  name = local.name
  role = aws_iam_role.web.name
  tags = local.tags
}

resource "aws_s3_bucket" "releases" {
  bucket        = local.bucket_name
  force_destroy = false
  tags          = local.tags
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "releases" {
  bucket                  = aws_s3_bucket.releases.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "releases" {
  bucket = aws_s3_bucket.releases.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "releases" {
  bucket = aws_s3_bucket.releases.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Deny", Principal = "*", Action = ["s3:*"], Resource = [local.bucket_arn, "${local.bucket_arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }]
  })
  depends_on = [aws_s3_bucket_public_access_block.releases]
}

resource "aws_instance" "web" {
  ami                         = var.ami_id
  instance_type               = "t3.small"
  subnet_id                   = var.public_subnet_id
  vpc_security_group_ids      = [var.app_security_group_id]
  iam_instance_profile        = aws_iam_instance_profile.web.name
  associate_public_ip_address = false
  # Sin key_name ni SG/reglas nuevos: red dedicada es dueña del contrato 80/443.
  # Cloud-init reconoce gzip; comprimir evita exceder los 16 KiB de EC2 sin minificar fuentes.
  user_data_base64            = base64gzip(local.user_data)
  user_data_replace_on_change = true
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 1
  }
  root_block_device {
    volume_size = 20
    volume_type = "gp3"
    encrypted   = true
  }
  tags = local.tags
  # Se aplica al crear (TagSpecifications de RunInstances). root_block_device.tags se escribe después con un
  # CreateTags aparte, y el operador solo puede crear el disco si el pedido ya lleva la etiqueta Deployment.
  volume_tags = local.tags
  depends_on  = [aws_iam_role_policy.runtime]

  lifecycle {
    # Con la EIP asociada el proveedor lee associate_public_ip_address como true aunque la instancia nació sin IP
    # efímera (la subred ya no la asigna). Sin esto cada plan reemplazaría la EC2 por un falso cambio de IP.
    ignore_changes = [associate_public_ip_address]
  }
}

resource "aws_eip" "web" {
  domain   = "vpc"
  instance = aws_instance.web.id
  tags     = local.tags
}
