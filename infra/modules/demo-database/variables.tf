variable "database_security_group_id" {
  description = "Output database_security_group_id de demo-network; SG dedicado que admite solo app:5432."
  type        = string

  validation {
    condition     = can(regex("^sg-([0-9a-f]{8}|[0-9a-f]{17})$", var.database_security_group_id))
    error_message = "Indicar el ID SG DB dedicado de demo-network (sg- y 8 o 17 hex minúsculas)."
  }
  nullable = false
}

variable "database_subnet_ids" {
  description = "Output database_subnet_ids de demo-network: dos subredes privadas distintas en AZ diferentes. El humano verifica pertenencia y rutas."
  type        = list(string)

  validation {
    condition = (length(var.database_subnet_ids) == 2 && length(distinct(var.database_subnet_ids)) == 2 &&
    alltrue([for id in var.database_subnet_ids : can(regex("^subnet-([0-9a-f]{8}|[0-9a-f]{17})$", id))]))
    error_message = "Indicar exactamente dos IDs subnet privados distintos (subnet- y 8 o 17 hex minúsculas)."
  }
  nullable = false
}

variable "engine_version" {
  description = "Versión menor exacta PostgreSQL 17.x verificada por el responsable para región y db.t4g.micro antes del plan. Sin default ni consulta AWS."
  type        = string

  validation {
    condition     = can(regex("^17\\.(0|[1-9][0-9]*)$", var.engine_version))
    error_message = "Indicar una versión menor exacta PostgreSQL 17.x, verificada como soportada en la región; no major solo ni latest."
  }
  nullable = false
}

variable "environment" {
  description = "Entorno de prueba; únicamente dev."
  type        = string
  default     = "dev"

  validation {
    condition     = var.environment == "dev"
    error_message = "La demo ec2-rds-demo solo admite environment dev."
  }
  nullable = false
}

variable "final_snapshot_identifier" {
  description = "Nombre único medicia-dev-demo* del snapshot final para cierre humano autorizado; hasta 255 caracteres AWS válidos. No reutilizar snapshot existente ni inferir conservación clínica."
  type        = string

  validation {
    condition = (length(var.final_snapshot_identifier) <= 255 &&
      startswith(var.final_snapshot_identifier, "medicia-${var.environment}-demo") &&
      can(regex("^[A-Za-z][A-Za-z0-9-]*$", var.final_snapshot_identifier)) &&
    !strcontains(var.final_snapshot_identifier, "--") && !endswith(var.final_snapshot_identifier, "-"))
    error_message = "Snapshot final obligatorio: prefijo medicia-dev-demo, máximo 255 caracteres alfanuméricos/guion, sin -- ni guion final; usar nombre único."
  }
  nullable = false
}
