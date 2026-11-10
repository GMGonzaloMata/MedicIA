output "repository_arn" {
  description = "ARN del repositorio. Se arma con el nombre conocido, igual que en infra/bootstrap."
  value       = local.repository_arn
}

output "repository_name" {
  description = "Nombre del repositorio (medicia-<entorno>-<nombre>)."
  value       = local.repository_name
}

output "repository_url" {
  description = "URL del repositorio, sin etiqueta. La imagen del catálogo es esta URL más :<versión>."
  value       = local.repository_url
}
