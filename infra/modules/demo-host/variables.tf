variable "accept_acme_terms" {
  description = "Aceptación humana explícita de términos ACME; false no ejecuta Certbot ni crea estado CA."
  type        = bool
  default     = false
  nullable    = false
}

variable "acme_contact_email" {
  description = "Contacto operativo humano para ACME; obligatorio al aceptar términos. Nunca valor real en chat/fixtures."
  type        = string
  default     = ""
  sensitive   = true
  nullable    = false
  validation {
    condition = (!var.accept_acme_terms || (
      length(var.acme_contact_email) <= 254 &&
      var.acme_contact_email == trimspace(var.acme_contact_email) &&
    can(regex("^[A-Za-z0-9._%+-]+@[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?([.][A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$", var.acme_contact_email))))
    error_message = "Al aceptar términos se requiere contacto operativo ASCII válido, sin espacios ni controles."
  }
}

variable "account_id" {
  description = "Cuenta aprobada de la composición; no se descubre con AWS."
  type        = string
  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "account_id debe contener doce dígitos, sin comodines."
  }
}

variable "ami_id" {
  description = "AMI AL2023 Linux amd64 exacta comprobada por humano; sin latest ni default."
  type        = string
  validation {
    condition     = can(regex("^ami-([0-9a-f]{8}|[0-9a-f]{17})$", var.ami_id))
    error_message = "ami_id requiere identificador exacto aprobado AL2023 amd64; no se verifica disponibilidad AWS aquí."
  }
}

variable "ami_evidence" {
  description = "Evidencia humana no sensible de AMI oficial AWS AL2023 x86_64 y repos 2023.12.20261021; herramientas preparadas automáticamente en EC2, no AMI personalizada."
  type        = string
  validation {
    condition     = length(trimspace(var.ami_evidence)) >= 16
    error_message = "ami_evidence requiere referencia humana no sensible; no inventar evidencia de AMI."
  }
}

variable "app_security_group_id" {
  description = "Output app_security_group_id de demo-network: solo ingress 80/443, sin SSH/3000."
  type        = string
  validation {
    condition     = can(regex("^sg-([0-9a-f]{8}|[0-9a-f]{17})$", var.app_security_group_id))
    error_message = "app_security_group_id debe ser el SG app dedicado de demo-network."
  }
}

variable "database_address" {
  description = "Output database_address de demo-database; nunca URL ni secreto master."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+[.][a-z0-9]+[.]${var.region}[.]rds[.]amazonaws[.]com$", var.database_address))
    error_message = "database_address debe ser el hostname RDS de esta región, sin credenciales."
  }
}

variable "environment" {
  description = "Entorno dedicado; solo dev."
  type        = string
  default     = "dev"
  validation {
    condition     = var.environment == "dev"
    error_message = "El entorno debe ser dev; producción tiene otra cuenta/raíz."
  }
}

variable "permissions_boundary_arn" {
  description = "ARN medicia-dev-demo-boundary administrado por bootstrap, nunca límite compartido."
  type        = string
  validation {
    condition     = var.permissions_boundary_arn == "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-demo-boundary"
    error_message = "permissions_boundary_arn debe coincidir exactamente con el límite demo dedicado de bootstrap."
  }
}

variable "public_hostname" {
  description = "Hostname público DuckDNS de un solo label, registrado por humano; no es HOSTNAME de Node."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?[.]duckdns[.]org$", var.public_hostname))
    error_message = "public_hostname requiere un único label DNS minúsculo de 1–63 caracteres bajo duckdns.org, sin guiones extremos ni query."
  }
  nullable = false
}

variable "public_subnet_id" {
  description = "Output public_subnet_id de demo-network."
  type        = string
  validation {
    condition     = can(regex("^subnet-([0-9a-f]{8}|[0-9a-f]{17})$", var.public_subnet_id))
    error_message = "public_subnet_id debe ser la subnet app dedicada de demo-network."
  }
}

variable "region" {
  description = "Región de la composición existente."
  type        = string
  default     = "sa-east-1"
  validation {
    condition     = var.region == "sa-east-1"
    error_message = "region debe conservar sa-east-1 del entorno existente."
  }
}

variable "release_key" {
  description = "Objeto releases/<versión>.tar.gz inmutable por convención; no latest ni traversal."
  type        = string
  validation {
    condition = (can(regex("^releases/[A-Za-z0-9][A-Za-z0-9/_.-]+[.]tar[.]gz$", var.release_key)) &&
      !strcontains(var.release_key, "..") && !strcontains(var.release_key, "//") &&
    !can(regex("(?i)(^|[/_.-])latest([/_.-]|$)", var.release_key)))
    error_message = "release_key requiere objeto versionado releases/*.tar.gz, sin latest/traversal/comodines."
  }
}

variable "release_sha256" {
  description = "SHA-256 de 64 hex sobre paquete Linux amd64 Node24 preconstruido."
  type        = string
  validation {
    condition     = can(regex("^[0-9a-fA-F]{64}$", var.release_sha256))
    error_message = "release_sha256 debe contener exactamente 64 caracteres hexadecimales."
  }
}

variable "runtime_references" {
  description = "Referencias exactas no sensibles, aprobadas también en demo_runtime del bootstrap. No inventar FEVI."
  type = object({
    user_pool_arn            = string
    cognito_client_id        = string
    studies_bucket_name      = string
    echonext_endpoint_arn    = string
    additional_endpoint_arns = set(string)
  })
  validation {
    condition = (can(regex("^arn:aws:cognito-idp:${var.region}:${var.account_id}:userpool/${var.region}_[A-Za-z0-9]+$", var.runtime_references.user_pool_arn)) &&
      can(regex("^[a-z0-9]{1,128}$", var.runtime_references.cognito_client_id)) &&
      var.runtime_references.studies_bucket_name == "medicia-studies-${var.environment}-${var.account_id}" &&
      length(var.runtime_references.additional_endpoint_arns) <= 1 &&
      !contains(var.runtime_references.additional_endpoint_arns, var.runtime_references.echonext_endpoint_arn) &&
    alltrue([for a in setunion(toset([var.runtime_references.echonext_endpoint_arn]), var.runtime_references.additional_endpoint_arns) : can(regex("^arn:aws:sagemaker:${var.region}:${var.account_id}:endpoint/medicia-${var.environment}-[a-z0-9-]+$", a))]))
    error_message = "runtime_references requiere pool/client, bucket estudios del entorno y uno o dos endpoints exactos aprobados, sin comodines ni FEVI ficticio."
  }
}
