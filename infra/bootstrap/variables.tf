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

variable "github_oidc_subject" {
  description = <<-EOT
    Sujeto (sub) del token de GitHub Actions que puede asumir el rol de plan. Se escribe exacto, sin comodines.
    Formato inmutable: repo:<dueño>@<id del dueño>/<repositorio>@<id del repositorio>:pull_request.
    Se confirma con la primera ejecución del flujo de CI, que imprime el sub real (R10).
  EOT
  type        = string
  default     = "repo:GMGonzaloMata@138719807/MedicIA@1443385030:pull_request"

  validation {
    condition     = !strcontains(var.github_oidc_subject, "*")
    error_message = "El sujeto de GitHub no admite comodines."
  }
}

variable "region" {
  description = "Región de AWS donde viven todos los recursos. Sao Paulo mantiene los datos dentro de Sudamérica."
  type        = string
  default     = "sa-east-1"
}
