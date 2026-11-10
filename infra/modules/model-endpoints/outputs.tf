output "enabled_endpoint_names" {
  description = "Nombres de los puntos de inferencia encendidos. Cada uno cobra por hora mientras exista."
  value       = [for punto in aws_sagemaker_endpoint.this : punto.name]
}

output "model_names" {
  description = "Nombres de los modelos del catálogo (cada uno lleva un resumen de su imagen, artefacto y rol)."
  value       = [for modelo in aws_sagemaker_model.this : modelo.name]
}
