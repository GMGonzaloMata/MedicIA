# Catálogo de modelos del entorno. Sumar un modelo es agregar una entrada acá,
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
  description = "Catálogo de modelos: nombre corto a entrada."

  default = {
    # EchoNext-Mini (005): 12 probabilidades de posibles hallazgos de cardiopatía estructural a partir de un ECG de
    # 12 derivaciones. Modelo de investigación: apoyo clínico, nunca diagnóstico. Nace apagado: enabled = true crea
    # el punto de inferencia, que cobra por hora (ml.t2.medium: 0,089 USD por hora en sa-east-1). Apagarlo es volver
    # a false. La imagen sale de medicia-ml y el artefacto del bucket de modelos, ambos con la versión 0.1.0.
    # Guía: infra/README.md, sección "Modelo EchoNext-Mini".
    echonext-mini = {
      image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0"
      model_data_key = "echonext-mini/0.1.0/model.tar.gz"
      model_version  = "0.1.0"
      instance_type  = "ml.t2.medium"
      enabled        = false
    }
  }
}
