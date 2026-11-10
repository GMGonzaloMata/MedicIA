variable "environment" {
  type        = string
  description = "Entorno de despliegue. Por ahora solo existe dev."

  validation {
    condition     = var.environment == "dev"
    error_message = "El entorno debe ser dev."
  }
}

variable "artifacts_bucket_name" {
  type        = string
  description = "Nombre del bucket de artefactos de modelos, de donde cada modelo lee su artefacto."
}

variable "execution_role_arn" {
  type        = string
  description = "ARN del rol de ejecución de SageMaker que usan todos los modelos."

  validation {
    condition     = can(regex("^arn:aws:iam::[0-9]{12}:role/.+$", var.execution_role_arn))
    error_message = "El rol de ejecución debe ser el ARN de un rol de IAM."
  }
}

variable "models" {
  type = map(object({
    image_uri      = string
    model_data_key = string
    model_version  = string
    instance_type  = optional(string, "ml.t2.medium")
    enabled        = optional(bool, false)
  }))
  description = <<-EOT
    Catálogo de modelos: nombre corto a entrada. Cada entrada crea un modelo y una configuración de punto de
    inferencia (sin costo); el punto de inferencia, que cobra por hora, solo existe si enabled es true.
    La cantidad de instancias no es configurable: vale 1.
  EOT
  default     = {}

  validation {
    condition     = alltrue([for nombre in keys(var.models) : can(regex("^[a-z][a-z0-9-]{1,23}$", nombre))])
    error_message = "Cada nombre de modelo debe empezar con una letra minúscula y tener solo minúsculas, números y guiones, de 2 a 24 caracteres. El tope de 24 existe porque la configuración del punto de inferencia agrega un sufijo único de 26 caracteres al nombre, y SageMaker admite hasta 63."
  }

  validation {
    condition     = alltrue([for modelo in values(var.models) : contains(["ml.t2.medium", "ml.c5.large", "ml.m5.large"], modelo.instance_type)])
    error_message = "El tipo de instancia debe ser uno de ml.t2.medium, ml.c5.large o ml.m5.large (solo CPU)."
  }

  validation {
    condition = alltrue([
      for modelo in values(var.models) :
      length(modelo.model_data_key) > 0 &&
      !startswith(modelo.model_data_key, "/") &&
      !contains(split("/", modelo.model_data_key), "..")
    ])
    error_message = "model_data_key es la clave dentro del bucket: no puede estar vacía, empezar con / ni contener segmentos .. ."
  }
}
