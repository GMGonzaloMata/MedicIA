output "bucket_arn" {
  description = "ARN del bucket de estudios. Se arma con el nombre conocido, igual que en infra/bootstrap."
  value       = local.bucket_arn
}

output "bucket_name" {
  description = "Nombre del bucket de estudios."
  value       = local.bucket_name
}
