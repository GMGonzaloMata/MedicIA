output "app_secret_arn" {
  description = "ARN app separado del master RDS; humano carga JSON DATABASE_URL/COGNITO_CLIENT_SECRET."
  value       = aws_secretsmanager_secret.runtime["app"].arn
}

output "duckdns_secret_arn" {
  description = "ARN DuckDNS separado; humano carga JSON token."
  value       = aws_secretsmanager_secret.runtime["duckdns"].arn
}

output "elastic_ip" {
  description = "EIP para futura configuración DNS; no implica HTTPS ni demo lista."
  value       = aws_eip.web.public_ip
}

output "instance_id" {
  description = "Instancia dedicada, administrada por SSM sin key_pair."
  value       = aws_instance.web.id
}

output "release_key" {
  description = "Objeto exacto autorizado también en límite dedicado del bootstrap."
  value       = var.release_key
}

output "releases_bucket_name" {
  description = "Bucket privado separado de estudios/modelos/estado."
  value       = local.bucket_name
}
