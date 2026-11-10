variable "environment" {
  type        = string
  description = "Entorno de despliegue. Por ahora solo existe dev."

  validation {
    condition     = var.environment == "dev"
    error_message = "El entorno debe ser dev."
  }
}

variable "account_id" {
  type        = string
  description = "ID de la cuenta de AWS (12 dígitos). Va en el nombre del bucket porque los nombres de bucket son globales."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de cuenta debe tener 12 dígitos."
  }
}
