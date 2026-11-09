variable "environment" {
  description = "Nombre del entorno. Se usa en los nombres de los recursos. Por ahora solo existe dev."
  type        = string

  validation {
    condition     = contains(["dev"], var.environment)
    error_message = "El entorno debe ser dev. Producción se crea en otra cuenta y con otra raíz."
  }
}

variable "protect_user_pool" {
  description = "Si es true, el grupo de usuarios tiene la protección contra borrado activa. Ponerlo en false solo hace falta para liberar los recursos a propósito; además hay que quitar prevent_destroy del código."
  type        = bool
  default     = true
}

variable "permissions_boundary_arn" {
  description = "ARN de la política límite que fija el techo de permisos del usuario de la aplicación. La crea infra/bootstrap (medicia-dev-boundary)."
  type        = string

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:policy/.+$", var.permissions_boundary_arn))
    error_message = "El límite de permisos debe ser el ARN de una política de IAM."
  }
}
