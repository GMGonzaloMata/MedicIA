variable "availability_zones" {
  description = "Dos AZ estándar de la misma región: app y primera DB en la primera, segunda DB en la otra. Verificar disponibilidad humana."
  type        = list(string)
  default     = ["sa-east-1a", "sa-east-1c"]

  validation {
    condition = try(
      length(var.availability_zones) == 2 && length(distinct(var.availability_zones)) == 2 &&
      alltrue([for az in var.availability_zones : can(regex("^[a-z]{2}(-[a-z]+)+-[0-9][a-z]$", az))]) &&
      regex("^(.+-[0-9])[a-z]$", var.availability_zones[0])[0] == regex("^(.+-[0-9])[a-z]$", var.availability_zones[1])[0],
      false
    )
    error_message = "Indicar exactamente dos AZ estándar distintas de la misma región."
  }
  nullable = false
}

variable "database_subnet_cidrs" {
  description = "Dos CIDR IPv4 privados canónicos /16 a /28, contenidos en la VPC y sin solaparse entre sí ni con app."
  type        = list(string)
  default     = ["10.42.10.0/24", "10.42.11.0/24"]

  validation {
    condition = try(length(var.database_subnet_cidrs) == 2 && alltrue([
      for cidr in var.database_subnet_cidrs :
      can(cidrnetmask(cidr)) && split("/", cidr)[0] == cidrhost(cidr, 0) &&
      tonumber(split("/", cidr)[1]) >= 16 && tonumber(split("/", cidr)[1]) <= 28 &&
      cidrhost("${cidrhost(cidr, 0)}/${split("/", var.vpc_cidr)[1]}", 0) == cidrhost(var.vpc_cidr, 0) &&
      tonumber(split("/", cidr)[1]) >= tonumber(split("/", var.vpc_cidr)[1])
      ]) && alltrue([
      for pair in [[var.database_subnet_cidrs[0], var.database_subnet_cidrs[1]], [var.database_subnet_cidrs[0], var.public_subnet_cidr], [var.database_subnet_cidrs[1], var.public_subnet_cidr]] :
      cidrhost("${cidrhost(pair[0], 0)}/${min(tonumber(split("/", pair[0])[1]), tonumber(split("/", pair[1])[1]))}", 0) !=
      cidrhost("${cidrhost(pair[1], 0)}/${min(tonumber(split("/", pair[0])[1]), tonumber(split("/", pair[1])[1]))}", 0)
    ]), false)
    error_message = "Indicar dos CIDR IPv4 canónicos /16 a /28 contenidos en la VPC, sin solapamiento entre DB y app."
  }
  nullable = false
}

variable "environment" {
  description = "Entorno de la demo; únicamente dev."
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "La demo ec2-rds-demo solo admite environment dev."
  }
  nullable = false
}

variable "public_subnet_cidr" {
  description = "CIDR IPv4 privado canónico /16 a /28 de la subnet app pública, contenido en la VPC."
  type        = string
  default     = "10.42.1.0/24"

  validation {
    condition = try(
      can(cidrnetmask(var.public_subnet_cidr)) && split("/", var.public_subnet_cidr)[0] == cidrhost(var.public_subnet_cidr, 0) &&
      tonumber(split("/", var.public_subnet_cidr)[1]) >= 16 && tonumber(split("/", var.public_subnet_cidr)[1]) <= 28 &&
      tonumber(split("/", var.public_subnet_cidr)[1]) >= tonumber(split("/", var.vpc_cidr)[1]) &&
      cidrhost("${cidrhost(var.public_subnet_cidr, 0)}/${split("/", var.vpc_cidr)[1]}", 0) == cidrhost(var.vpc_cidr, 0),
      false
    )
    error_message = "Indicar un CIDR IPv4 canónico /16 a /28 para app contenido en la VPC."
  }
  nullable = false
}

variable "vpc_cidr" {
  description = "CIDR RFC1918 canónico /16 a /28. El responsable comprueba no solapamiento con redes existentes antes de ejecutar."
  type        = string
  default     = "10.42.0.0/16"

  validation {
    condition = try(
      can(cidrnetmask(var.vpc_cidr)) && split("/", var.vpc_cidr)[0] == cidrhost(var.vpc_cidr, 0) &&
      tonumber(split("/", var.vpc_cidr)[1]) >= 16 && tonumber(split("/", var.vpc_cidr)[1]) <= 28 &&
      (split(".", cidrhost(var.vpc_cidr, 0))[0] == "10" ||
        (split(".", cidrhost(var.vpc_cidr, 0))[0] == "172" && tonumber(split(".", cidrhost(var.vpc_cidr, 0))[1]) >= 16 && tonumber(split(".", cidrhost(var.vpc_cidr, 0))[1]) <= 31) ||
      startswith(cidrhost(var.vpc_cidr, 0), "192.168.")),
      false
    )
    error_message = "Indicar un CIDR IPv4 RFC1918 canónico con prefijo /16 a /28."
  }
  nullable = false
}
