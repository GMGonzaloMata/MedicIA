output "app_security_group_id" {
  description = "SG exclusivo del futuro host EC2, sin SSH ni puerto Node público."
  value       = aws_security_group.app.id
}

output "database_security_group_id" {
  description = "SG para RDS, PostgreSQL permitido únicamente desde SG app."
  value       = aws_security_group.database.id
}

output "database_subnet_ids" {
  description = "Dos IDs privados en orden first/second para el futuro DB subnet group. No implica RDS Multi-AZ."
  value       = [aws_subnet.database["first"].id, aws_subnet.database["second"].id]
}

output "public_subnet_id" {
  description = "Subnet pública del futuro host EC2 con ruta IGW."
  value       = aws_subnet.app.id
}

output "vpc_id" {
  description = "VPC dedicada de la demo, nunca la VPC default."
  value       = aws_vpc.demo.id
}
