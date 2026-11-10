module "identity" {
  source = "../../modules/identity"

  environment = "dev"

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
}

# Bucket privado para los artefactos de los modelos. No guarda datos de pacientes.
module "model_artifacts" {
  source = "../../modules/model-artifacts"

  environment = "dev"
  account_id  = "896618135592"
}

# Rol que SageMaker asume para leer los artefactos del bucket y escribir registros. Todavía no hay modelos.
module "sagemaker_execution_role" {
  source = "../../modules/sagemaker-execution-role"

  environment          = "dev"
  account_id           = "896618135592"
  artifacts_bucket_arn = module.model_artifacts.bucket_arn

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
}

# Catálogo de modelos, apagado por defecto. Con var.models vacío no crea ningún recurso.
module "model_endpoints" {
  source = "../../modules/model-endpoints"

  environment           = "dev"
  artifacts_bucket_name = module.model_artifacts.bucket_name
  execution_role_arn    = module.sagemaker_execution_role.role_arn
  models                = var.models
}
