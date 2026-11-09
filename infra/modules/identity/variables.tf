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
