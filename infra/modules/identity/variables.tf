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

variable "studies_bucket_arn" {
  description = "ARN del bucket de estudios (infra/modules/study-storage). Vacío por defecto: sin él, el usuario de la aplicación no recibe ningún permiso de S3. Con valor, puede guardar, leer y borrar objetos del prefijo studies/ y listarlo (specs/006-carga-estudios-ecg)."
  type        = string
  default     = ""

  validation {
    condition     = var.studies_bucket_arn == "" || can(regex("^arn:aws:s3:::[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.studies_bucket_arn))
    error_message = "El bucket de estudios debe ser el ARN de un bucket de S3 (arn:aws:s3:::nombre), sin ruta."
  }
}

variable "model_endpoint_arn" {
  description = "ARN del punto de inferencia de EchoNext-Mini (infra/modules/model-endpoints). Vacío por defecto: sin él, el usuario de la aplicación no puede invocar ningún modelo. Con valor, puede invocar solo ese punto (specs/008-analisis-estudio-ecg). El ARN se arma por nombre, así que existe aunque el punto esté apagado."
  type        = string
  default     = ""

  validation {
    condition     = var.model_endpoint_arn == "" || can(regex("^arn:aws:sagemaker:[a-z0-9-]+:[0-9]{12}:endpoint/[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$", var.model_endpoint_arn))
    error_message = "El punto de inferencia debe ser el ARN de un endpoint de SageMaker (arn:aws:sagemaker:región:cuenta:endpoint/nombre), sin comodines."
  }
}
