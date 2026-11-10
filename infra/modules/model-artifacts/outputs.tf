output "bucket_name" {
  description = "Nombre del bucket de artefactos de modelos."
  value       = local.bucket_name
}

output "bucket_arn" {
  description = "ARN del bucket de artefactos de modelos. Se arma con el nombre conocido, igual que en infra/bootstrap."
  value       = local.bucket_arn
}
