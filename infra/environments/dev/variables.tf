# Catálogo de modelos del entorno: vacío en esta entrega. Sumar un modelo es agregar una entrada acá,
# en un cambio que pasa por revisión (no se usan archivos .tfvars). Todo punto de inferencia nace apagado
# (enabled = false) y cobra por hora solo mientras está encendido. Ver specs/004-infra-sagemaker-modelos/contracts/model-catalog.md.
variable "models" {
  type = map(object({
    image_uri      = string
    model_data_key = string
    model_version  = string
    instance_type  = optional(string, "ml.t2.medium")
    enabled        = optional(bool, false)
  }))
  description = "Catálogo de modelos: nombre corto a entrada. Vacío por defecto."
  default     = {}
}
