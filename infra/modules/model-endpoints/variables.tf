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
  description = "ID de la cuenta de AWS (12 dígitos). Las imágenes solo pueden venir de ECR de esta cuenta."

  validation {
    condition     = can(regex("^[0-9]{12}$", var.account_id))
    error_message = "El ID de cuenta debe tener 12 dígitos."
  }
}

variable "region" {
  type        = string
  description = "Región de AWS. Las imágenes solo pueden venir de ECR de esta región."
  default     = "sa-east-1"
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

  # La imagen solo puede venir de un repositorio ECR del entorno (medicia-dev-<nombre>) de esta cuenta y región, con una
  # etiqueta de versión que no sea latest (las etiquetas del repositorio son inmutables, así que la versión no cambia).
  validation {
    condition = alltrue([
      for modelo in values(var.models) :
      can(regex("^${var.account_id}\\.dkr\\.ecr\\.${var.region}\\.amazonaws\\.com/medicia-${var.environment}-[a-z0-9][a-z0-9-]*:[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$", modelo.image_uri))
      && !endswith(modelo.image_uri, ":latest")
    ])
    error_message = "image_uri debe ser un repositorio ECR del entorno en esta cuenta y región, con la forma <cuenta>.dkr.ecr.<región>.amazonaws.com/medicia-dev-<nombre>:<versión>, y la etiqueta no puede ser latest."
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
