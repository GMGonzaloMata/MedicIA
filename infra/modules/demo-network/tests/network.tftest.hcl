# Plan-only: sin credenciales, backend ni consultas AWS.
test {
  parallel = true
}

mock_provider "aws" {}

# IDs sintéticos conocidos en plan; ninguna lectura ni creación real.
override_resource {
  override_during = plan
  target          = aws_vpc.demo
  values          = { id = "vpc-demo" }
}
override_resource {
  override_during = plan
  target          = aws_internet_gateway.demo
  values          = { id = "igw-demo" }
}
override_resource {
  override_during = plan
  target          = aws_subnet.app
  values          = { id = "subnet-app" }
}
override_resource {
  override_during = plan
  target          = aws_subnet.database["first"]
  values          = { id = "subnet-db-first" }
}
override_resource {
  override_during = plan
  target          = aws_subnet.database["second"]
  values          = { id = "subnet-db-second" }
}
override_resource {
  override_during = plan
  target          = aws_route_table.public
  values          = { id = "rtb-public" }
}
override_resource {
  override_during = plan
  target          = aws_route_table.database["first"]
  values          = { id = "rtb-db-first" }
}
override_resource {
  override_during = plan
  target          = aws_route_table.database["second"]
  values          = { id = "rtb-db-second" }
}
override_resource {
  override_during = plan
  target          = aws_security_group.app
  values          = { id = "sg-app" }
}
override_resource {
  override_during = plan
  target          = aws_security_group.database
  values          = { id = "sg-db" }
}

run "reject_vpc_malformed" {
  state_key = "vpc_malformed"
  command   = plan
  variables { vpc_cidr = "not-a-cidr" }
  expect_failures = [var.vpc_cidr]
}
run "reject_vpc_ipv6" {
  state_key = "vpc_ipv6"
  command   = plan
  variables { vpc_cidr = "fd00::/16" }
  expect_failures = [var.vpc_cidr]
}
run "reject_vpc_public" {
  state_key = "vpc_public"
  command   = plan
  variables { vpc_cidr = "8.8.0.0/16" }
  expect_failures = [var.vpc_cidr]
}
run "reject_vpc_too_large" {
  state_key = "vpc_too_large"
  command   = plan
  variables { vpc_cidr = "10.0.0.0/15" }
  expect_failures = [var.vpc_cidr]
}
run "reject_vpc_too_small" {
  state_key = "vpc_too_small"
  command   = plan
  variables { vpc_cidr = "10.42.0.0/29" }
  expect_failures = [var.vpc_cidr]
}
run "reject_vpc_host_bits" {
  state_key = "vpc_host_bits"
  command   = plan
  variables { vpc_cidr = "10.42.0.1/16" }
  expect_failures = [var.vpc_cidr]
}
run "reject_duplicate_az" {
  state_key = "duplicate_az"
  command   = plan
  variables { availability_zones = ["sa-east-1a", "sa-east-1a"] }
  expect_failures = [var.availability_zones]
}
run "reject_missing_az" {
  state_key = "missing_az"
  command   = plan
  variables { availability_zones = ["sa-east-1a"] }
  expect_failures = [var.availability_zones]
}
run "reject_malformed_az" {
  state_key = "malformed_az"
  command   = plan
  variables { availability_zones = ["", "sa-east-1c"] }
  expect_failures = [var.availability_zones]
}
run "reject_cross_region_az" {
  state_key = "cross_region_az"
  command   = plan
  variables { availability_zones = ["sa-east-1a", "us-east-1a"] }
  expect_failures = [var.availability_zones]
}
run "reject_missing_db_subnet" {
  state_key = "missing_db_subnet"
  command   = plan
  variables { database_subnet_cidrs = ["10.42.10.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_outside_vpc" {
  state_key = "db_outside_vpc"
  command   = plan
  variables { database_subnet_cidrs = ["10.43.10.0/24", "10.42.11.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_overlap" {
  state_key = "db_overlap"
  command   = plan
  variables { database_subnet_cidrs = ["10.42.10.0/24", "10.42.10.128/25"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_app_overlap" {
  state_key = "db_app_overlap"
  command   = plan
  variables { database_subnet_cidrs = ["10.42.1.0/25", "10.42.11.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_ipv6" {
  state_key = "db_ipv6"
  command   = plan
  variables { database_subnet_cidrs = ["fd00::/24", "10.42.11.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_host_bits" {
  state_key = "db_host_bits"
  command   = plan
  variables { database_subnet_cidrs = ["10.42.10.1/24", "10.42.11.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_db_too_small" {
  state_key = "db_too_small"
  command   = plan
  variables { database_subnet_cidrs = ["10.42.10.0/29", "10.42.11.0/24"] }
  expect_failures = [var.database_subnet_cidrs]
}
run "reject_public_outside_vpc" {
  state_key = "public_outside_vpc"
  command   = plan
  variables { public_subnet_cidr = "10.43.1.0/24" }
  expect_failures = [var.public_subnet_cidr]
}
run "reject_public_malformed" {
  state_key = "public_malformed"
  command   = plan
  variables { public_subnet_cidr = "invalid" }
  expect_failures = [var.public_subnet_cidr]
}
run "reject_public_host_bits" {
  state_key = "public_host_bits"
  command   = plan
  variables { public_subnet_cidr = "10.42.1.1/24" }
  expect_failures = [var.public_subnet_cidr]
}
run "reject_public_too_small" {
  state_key = "public_too_small"
  command   = plan
  variables { public_subnet_cidr = "10.42.1.0/29" }
  expect_failures = [var.public_subnet_cidr]
}
run "reject_non_demo_environment" {
  state_key = "non_demo_environment"
  command   = plan
  variables { environment = "prod" }
  expect_failures = [var.environment]
}

run "dedicated_network_and_private_routes" {
  state_key = "topology"
  command   = plan

  assert {
    condition = (aws_vpc.demo.cidr_block == "10.42.0.0/16" && aws_vpc.demo.enable_dns_support && aws_vpc.demo.enable_dns_hostnames &&
      aws_subnet.app.vpc_id == "vpc-demo" && aws_subnet.app.cidr_block == "10.42.1.0/24" && aws_subnet.app.availability_zone == "sa-east-1a" &&
      aws_subnet.app.map_public_ip_on_launch && length(aws_subnet.database) == 2 &&
      toset([for s in aws_subnet.database : s.availability_zone]) == toset(["sa-east-1a", "sa-east-1c"]) &&
      toset([for s in aws_subnet.database : s.cidr_block]) == toset(["10.42.10.0/24", "10.42.11.0/24"]) &&
    alltrue([for s in aws_subnet.database : s.vpc_id == "vpc-demo" && !s.map_public_ip_on_launch]))
    error_message = "VPC dedicada con DNS, una subnet app pública y exactamente dos DB privadas en AZ distintas."
  }
  assert {
    condition = (aws_internet_gateway.demo.vpc_id == "vpc-demo" && aws_route.internet.route_table_id == "rtb-public" &&
      aws_route.internet.gateway_id == "igw-demo" && aws_route.internet.destination_cidr_block == "0.0.0.0/0" &&
      aws_route_table.public.vpc_id == "vpc-demo" && aws_route_table_association.app.subnet_id == "subnet-app" &&
      aws_route_table_association.app.route_table_id == "rtb-public" && length(aws_route_table.database) == 2 &&
      alltrue([for k, rt in aws_route_table.database : rt.vpc_id == "vpc-demo" && length(rt.route) == 0 &&
        aws_route_table_association.database[k].route_table_id == "rtb-db-${k}" &&
    aws_route_table_association.database[k].subnet_id == "subnet-db-${k}"]))
    error_message = "Solo app tiene ruta default IGW; cada DB tiene tabla propia sin rutas externas ni NAT."
  }
  assert {
    condition = (output.vpc_id == "vpc-demo" && output.public_subnet_id == "subnet-app" &&
      output.database_subnet_ids == ["subnet-db-first", "subnet-db-second"] &&
    output.app_security_group_id == "sg-app" && output.database_security_group_id == "sg-db")
    error_message = "Contrato de IDs explícitos para composición futura host y DB, sin secretos."
  }
}

run "least_privilege_security_groups" {
  state_key = "security"
  command   = plan

  assert {
    condition = (aws_security_group.app.vpc_id == "vpc-demo" && aws_security_group.database.vpc_id == "vpc-demo" &&
      toset(keys(aws_vpc_security_group_ingress_rule.web)) == toset(["80", "443"]) &&
      alltrue([for port, r in aws_vpc_security_group_ingress_rule.web : r.security_group_id == "sg-app" &&
      r.ip_protocol == "tcp" && r.from_port == tonumber(port) && r.to_port == tonumber(port) && r.cidr_ipv4 == "0.0.0.0/0"]) &&
      aws_vpc_security_group_ingress_rule.database.security_group_id == "sg-db" &&
      aws_vpc_security_group_ingress_rule.database.referenced_security_group_id == "sg-app" &&
      aws_vpc_security_group_ingress_rule.database.cidr_ipv4 == null &&
      aws_vpc_security_group_ingress_rule.database.ip_protocol == "tcp" &&
    aws_vpc_security_group_ingress_rule.database.from_port == 5432 && aws_vpc_security_group_ingress_rule.database.to_port == 5432)
    error_message = "Solo 80/443 públicos y DB TCP5432 desde SG app; ningún SSH/3000 ni CIDR público DB."
  }
  assert {
    condition = (aws_vpc_security_group_egress_rule.https.security_group_id == "sg-app" &&
      aws_vpc_security_group_egress_rule.https.ip_protocol == "tcp" && aws_vpc_security_group_egress_rule.https.from_port == 443 &&
      aws_vpc_security_group_egress_rule.https.to_port == 443 && aws_vpc_security_group_egress_rule.https.cidr_ipv4 == "0.0.0.0/0" &&
      aws_vpc_security_group_egress_rule.database.security_group_id == "sg-app" &&
      aws_vpc_security_group_egress_rule.database.referenced_security_group_id == "sg-db" &&
      aws_vpc_security_group_egress_rule.database.ip_protocol == "tcp" &&
      aws_vpc_security_group_egress_rule.database.from_port == 5432 && aws_vpc_security_group_egress_rule.database.to_port == 5432 &&
      toset(keys(aws_vpc_security_group_egress_rule.dns)) == toset(["tcp", "udp"]) &&
      alltrue([for protocol, r in aws_vpc_security_group_egress_rule.dns : r.security_group_id == "sg-app" &&
    r.ip_protocol == protocol && r.from_port == 53 && r.to_port == 53 && r.cidr_ipv4 == "10.42.0.2/32"]))
    error_message = "Egress app solo HTTPS, PostgreSQL al SG DB y DNS TCP/UDP al resolver VPC; sin all-protocol Internet."
  }
  assert {
    condition = alltrue([for tags in concat(
      [aws_vpc.demo.tags, aws_internet_gateway.demo.tags, aws_subnet.app.tags, aws_route_table.public.tags, aws_security_group.app.tags, aws_security_group.database.tags],
      [for r in aws_subnet.database : r.tags], [for r in aws_route_table.database : r.tags],
      [for r in aws_vpc_security_group_ingress_rule.web : r.tags], [aws_vpc_security_group_ingress_rule.database.tags],
      [aws_vpc_security_group_egress_rule.https.tags, aws_vpc_security_group_egress_rule.database.tags],
      [for r in aws_vpc_security_group_egress_rule.dns : r.tags]
    ) : tags.Project == "medicia" && tags.Environment == "dev" && tags.ManagedBy == "terraform" && tags.Deployment == "ec2-rds-demo"])
    error_message = "Todos los recursos etiquetables preservan tags base y Deployment para condiciones IAM."
  }
}

run "valid_custom_network_with_minimum_subnets" {
  state_key = "custom"
  command   = plan
  variables {
    vpc_cidr              = "172.16.0.0/26"
    public_subnet_cidr    = "172.16.0.0/28"
    database_subnet_cidrs = ["172.16.0.16/28", "172.16.0.32/28"]
    availability_zones    = ["sa-east-1b", "sa-east-1c"]
  }
  assert {
    condition = (aws_vpc.demo.cidr_block == "172.16.0.0/26" && aws_subnet.app.cidr_block == "172.16.0.0/28" &&
      aws_subnet.app.availability_zone == "sa-east-1b" && aws_subnet.database["second"].availability_zone == "sa-east-1c" &&
      toset([for s in aws_subnet.database : s.cidr_block]) == toset(["172.16.0.16/28", "172.16.0.32/28"]) &&
    alltrue([for r in aws_vpc_security_group_egress_rule.dns : r.cidr_ipv4 == "172.16.0.2/32"]))
    error_message = "Inputs configurables admiten subredes adyacentes /28 sin solapamiento y recalculan resolver."
  }
}

