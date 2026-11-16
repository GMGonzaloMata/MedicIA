output "demo" {
  description = "Metadata demo o null apagada. URL candidata: NO acredita DNS/TLS/host/modelos listos. Sin secretos ni ARN master RDS."
  value = var.demo.enabled ? {
    public_hostname      = var.demo.public_hostname
    public_url           = "https://${var.demo.public_hostname}"
    instance_id          = module.demo_host[0].instance_id
    elastic_ip           = module.demo_host[0].elastic_ip
    releases_bucket_name = module.demo_host[0].releases_bucket_name
    release_key          = module.demo_host[0].release_key
    app_secret_arn       = module.demo_host[0].app_secret_arn
    duckdns_secret_arn   = module.demo_host[0].duckdns_secret_arn
    database_address     = module.demo_database[0].database_address
    database_name        = module.demo_database[0].database_name
    database_port        = module.demo_database[0].database_port
    database_identifier  = module.demo_database[0].database_identifier
  } : null
}

# Datos de conexión de la aplicación. Los sensibles se consultan de a uno y de forma explícita:
#   terraform -chdir=infra/environments/dev output -raw user_pool_client_secret
# Correspondencia con las variables de la aplicación: specs/003-infra-base-cognito/contracts/identity-service.md.

output "app_access_key_id" {
  description = "Identificador de la clave de acceso del usuario de la aplicación (variable AWS_ACCESS_KEY_ID)."
  value       = module.identity.app_access_key_id
  sensitive   = true
}

output "app_secret_access_key" {
  description = "Secreto de la clave de acceso del usuario de la aplicación (variable AWS_SECRET_ACCESS_KEY)."
  value       = module.identity.app_secret_access_key
  sensitive   = true
}

output "enabled_endpoint_names" {
  description = "Puntos de inferencia de SageMaker encendidos. Cada uno cobra por hora; vacío significa que no hay costo de cómputo."
  value       = module.model_endpoints.enabled_endpoint_names
}

output "models_bucket_name" {
  description = "Nombre del bucket de artefactos de modelos, donde el responsable sube los artefactos."
  value       = module.model_artifacts.bucket_name
}

output "studies_bucket_name" {
  description = "Nombre del bucket de estudios de ECG (variable STUDIES_BUCKET de la aplicación)."
  value       = module.study_storage.bucket_name
}

output "region" {
  description = "Región de AWS del grupo de usuarios (variable COGNITO_REGION)."
  value       = module.identity.region
}

output "sagemaker_execution_role_arn" {
  description = "ARN del rol de ejecución de SageMaker, que se usará al crear modelos."
  value       = module.sagemaker_execution_role.role_arn
}

output "user_pool_arn" {
  description = "ARN del grupo de usuarios de Cognito."
  value       = module.identity.user_pool_arn
}

output "user_pool_client_id" {
  description = "Identificador del cliente de la aplicación (variable COGNITO_CLIENT_ID)."
  value       = module.identity.user_pool_client_id
}

output "user_pool_client_secret" {
  description = "Secreto del cliente de la aplicación (variable COGNITO_CLIENT_SECRET)."
  value       = module.identity.user_pool_client_secret
  sensitive   = true
}

output "user_pool_id" {
  description = "Identificador del grupo de usuarios de Cognito (variable COGNITO_USER_POOL_ID)."
  value       = module.identity.user_pool_id
}
