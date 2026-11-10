output "role_arn" {
  description = "ARN del rol de ejecución de SageMaker. Se arma con el nombre conocido, no con atributos del recurso."
  value       = local.role_arn
}

output "role_name" {
  description = "Nombre del rol de ejecución de SageMaker."
  value       = local.role_name
}
