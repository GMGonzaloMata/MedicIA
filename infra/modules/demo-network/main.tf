locals {
  name = "medicia-${var.environment}-demo"
  tags = {
    Project     = "medicia"
    Environment = var.environment
    ManagedBy   = "terraform"
    Deployment  = "ec2-rds-demo"
  }
  database_subnets = {
    first  = { cidr = var.database_subnet_cidrs[0], az = var.availability_zones[0] }
    second = { cidr = var.database_subnet_cidrs[1], az = var.availability_zones[1] }
  }
}

resource "aws_vpc" "demo" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = merge(local.tags, { Name = "${local.name}-vpc" })
}

resource "aws_internet_gateway" "demo" {
  vpc_id = aws_vpc.demo.id
  tags   = merge(local.tags, { Name = "${local.name}-igw" })
}

# map_public_ip_on_launch = false: la única IP pública de la EC2 es su EIP. Con true, AWS asigna una IP efímera
# al lanzar aunque aws_instance pida associate_public_ip_address = false (el proveedor lo trata como "según la subred").
resource "aws_subnet" "app" {
  vpc_id                  = aws_vpc.demo.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = var.availability_zones[0]
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${local.name}-app" })
}

resource "aws_subnet" "database" {
  for_each = local.database_subnets

  vpc_id                  = aws_vpc.demo.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${local.name}-db-${each.key}" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.demo.id
  tags   = merge(local.tags, { Name = "${local.name}-public" })
}

resource "aws_route" "internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.demo.id
}

resource "aws_route_table_association" "app" {
  subnet_id      = aws_subnet.app.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "database" {
  for_each = local.database_subnets

  vpc_id = aws_vpc.demo.id
  # Lista autoritativa vacía: AWS conserva la ruta local implícita, nunca una default/NAT.
  route = []
  tags  = merge(local.tags, { Name = "${local.name}-db-${each.key}" })
}

resource "aws_route_table_association" "database" {
  for_each = local.database_subnets

  subnet_id      = aws_subnet.database[each.key].id
  route_table_id = aws_route_table.database[each.key].id
}

# Sin reglas inline. AWS provider elimina el egress allow-all al crear cada SG.
# Respuestas stateful no requieren egress DB; nunca adjuntar el SG default al host/DB.
resource "aws_security_group" "app" {
  name        = "${local.name}-app"
  description = "Demo web: HTTP ACME/redirect, HTTPS y egreso acotado."
  vpc_id      = aws_vpc.demo.id
  tags        = merge(local.tags, { Name = "${local.name}-app" })
}

resource "aws_security_group" "database" {
  name        = "${local.name}-db"
  description = "PostgreSQL privado solo desde SG app; sin egreso iniciado."
  vpc_id      = aws_vpc.demo.id
  tags        = merge(local.tags, { Name = "${local.name}-db" })
}

resource "aws_vpc_security_group_ingress_rule" "web" {
  for_each = toset(["80", "443"])

  security_group_id = aws_security_group.app.id
  description       = each.key == "80" ? "ACME HTTP-01 y redirect HTTPS" : "HTTPS publico"
  ip_protocol       = "tcp"
  from_port         = tonumber(each.key)
  to_port           = tonumber(each.key)
  cidr_ipv4         = "0.0.0.0/0"
  tags              = local.tags
}

resource "aws_vpc_security_group_ingress_rule" "database" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL solo desde app"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.app.id
  tags                         = local.tags
}

resource "aws_vpc_security_group_egress_rule" "https" {
  security_group_id = aws_security_group.app.id
  description       = "APIs AWS, repositorios y ACME por HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
  tags              = local.tags
}

resource "aws_vpc_security_group_egress_rule" "database" {
  security_group_id            = aws_security_group.app.id
  description                  = "PostgreSQL al SG DB"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
  tags                         = local.tags
}

resource "aws_vpc_security_group_egress_rule" "dns" {
  for_each = toset(["tcp", "udp"])

  security_group_id = aws_security_group.app.id
  description       = "DNS al resolver VPC; SG no filtra AmazonProvidedDNS"
  ip_protocol       = each.key
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = "${cidrhost(var.vpc_cidr, 2)}/32"
  tags              = local.tags
}
