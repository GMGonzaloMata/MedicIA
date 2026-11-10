output "app_access_key_id" {
  description = "Identificador de la clave de acceso del usuario de la aplicación. Solo se consulta de forma explícita."
  value       = aws_iam_access_key.app.id
  sensitive   = true
}

output "app_secret_access_key" {
  description = "Secreto de la clave de acceso del usuario de la aplicación. Solo se consulta de forma explícita."
  value       = aws_iam_access_key.app.secret
  sensitive   = true
}

output "region" {
  description = "Región de AWS del grupo de usuarios."
  value       = data.aws_region.current.region
}

output "user_pool_arn" {
  description = "ARN del grupo de usuarios de Cognito."
  value       = aws_cognito_user_pool.this.arn
}

output "user_pool_client_id" {
  description = "Identificador del cliente de la aplicación."
  value       = aws_cognito_user_pool_client.app.id
}

output "user_pool_client_secret" {
  description = "Secreto del cliente de la aplicación. Solo se consulta de forma explícita."
  value       = aws_cognito_user_pool_client.app.client_secret
  sensitive   = true
}

output "user_pool_id" {
  description = "Identificador del grupo de usuarios de Cognito."
  value       = aws_cognito_user_pool.this.id
}

output "studies_access_granted" {
  description = "Si el usuario de la aplicación recibió acceso al bucket de estudios (depende de studies_bucket_arn)."
  value       = length(aws_iam_user_policy.studies) == 1
}
