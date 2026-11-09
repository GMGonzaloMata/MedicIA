output "region" {
  description = "Región de AWS del entorno."
  value       = var.region
}

output "state_bucket_arn" {
  description = "ARN del bucket que guarda el estado remoto."
  value       = aws_s3_bucket.state.arn
}

output "state_bucket_name" {
  description = "Nombre del bucket que guarda el estado remoto. Es el valor del backend de las demás raíces."
  value       = aws_s3_bucket.state.bucket
}
