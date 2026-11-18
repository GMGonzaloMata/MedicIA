# D4: solo datos sintéticos. La raíz dev futura conserva su backend remoto existente.
locals {
  name = "medicia-${var.environment}-demo"
  tags = {
    Project     = "medicia"
    Environment = var.environment
    ManagedBy   = "terraform"
    Deployment  = "ec2-rds-demo"
  }
}

resource "aws_db_subnet_group" "demo" {
  name        = local.name
  description = "Dos subredes privadas dedicadas a la demo MedicIA"
  subnet_ids  = var.database_subnet_ids
  tags        = local.tags
}

resource "aws_db_parameter_group" "demo" {
  name        = local.name
  description = "PostgreSQL 17 demo con TLS obligatorio"
  family      = "postgres17"

  parameter {
    name         = "rds.force_ssl"
    value        = "1"
    apply_method = "pending-reboot"
  }

  tags = local.tags
}

resource "aws_db_instance" "demo" {
  identifier                  = local.name
  engine                      = "postgres"
  engine_version              = var.engine_version
  instance_class              = "db.t4g.micro"
  allocated_storage           = 20
  storage_type                = "gp3"
  storage_encrypted           = true
  multi_az                    = false
  publicly_accessible         = false
  backup_retention_period     = 7
  manage_master_user_password = true
  # Identidad administrativa, no credencial de la app: RDS genera/rota su secreto.
  username                    = "medicia_admin"
  db_name                     = "medicia"
  port                        = 5432
  db_subnet_group_name        = aws_db_subnet_group.demo.name
  parameter_group_name        = aws_db_parameter_group.demo.name
  vpc_security_group_ids      = [var.database_security_group_id]
  auto_minor_version_upgrade  = false
  allow_major_version_upgrade = false
  apply_immediately           = false
  deletion_protection         = true
  skip_final_snapshot         = false
  final_snapshot_identifier   = var.final_snapshot_identifier
  delete_automated_backups    = false
  copy_tags_to_snapshot       = true
  tags                        = local.tags

  # Quitar esta guarda y deletion_protection requiere decisión humana específica.
  # Retirar TODO el recurso del código también retira lifecycle: revisar el plan completo.
  lifecycle {
    prevent_destroy = true
  }
}
