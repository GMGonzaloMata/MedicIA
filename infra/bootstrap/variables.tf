variable "account_id" {
  description = "ID de la cuenta de AWS del entorno. El proveedor rechaza cualquier otra cuenta."
  type        = string
  default     = "896618135592"

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de la cuenta debe tener 12 dígitos."
  }
}

variable "environment" {
  description = "Nombre del entorno. Por ahora solo existe dev; producción se crea con su propia cuenta y su propio arranque."
  type        = string
  default     = "dev"

  validation {
    condition     = contains(["dev"], var.environment)
    error_message = "El entorno debe ser dev. Producción se crea en otra cuenta y con otro arranque."
  }
}

variable "region" {
  description = "Región de AWS donde viven todos los recursos. Sao Paulo mantiene los datos dentro de Sudamérica."
  type        = string
  default     = "sa-east-1"
}
