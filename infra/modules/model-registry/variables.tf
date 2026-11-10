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
  description = "ID de la cuenta de AWS (12 dígitos). Va en la URL del repositorio."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de cuenta debe tener 12 dígitos."
  }
}

variable "region" {
  type        = string
  description = "Región de AWS donde vive el repositorio."
  default     = "sa-east-1"
}

variable "name" {
  type        = string
  description = "Nombre corto del modelo (por ejemplo echonext-mini). El repositorio se llama medicia-<entorno>-<nombre>."

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{1,23}$", var.name))
    error_message = "El nombre debe empezar con una letra minúscula y tener solo minúsculas, números y guiones, de 2 a 24 caracteres."
  }
}

variable "keep_last_images" {
  type        = number
  description = "Cantidad de imágenes que se conservan. Las más viejas vencen."
  default     = 10

  validation {
    condition     = var.keep_last_images >= 1 && var.keep_last_images <= 100 && floor(var.keep_last_images) == var.keep_last_images
    error_message = "Debe ser un entero de 1 a 100."
  }
}
