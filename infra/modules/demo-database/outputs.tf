output "database_address" {
  description = "Hostname RDS sin credenciales para futura composición."
  value       = aws_db_instance.demo.address
}

output "database_identifier" {
  description = "Identificador de la instancia dedicada."
  value       = aws_db_instance.demo.identifier
}

output "database_name" {
  description = "Nombre de la base; no es una URL de conexión."
  value       = aws_db_instance.demo.db_name
}

output "database_port" {
  description = "Puerto PostgreSQL privado."
  value       = aws_db_instance.demo.port
}

output "master_secret_arn" {
  description = "Solo ARN del master administrado por RDS; no autoriza lectura al rol web."
  value       = one(aws_db_instance.demo.master_user_secret[*].secret_arn)
}
