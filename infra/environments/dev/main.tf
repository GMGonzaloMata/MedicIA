# Recursos aditivos; deshabilitados por defecto. No usar el toggle para cerrar una DB
# existente: las protecciones del módulo requieren una decisión humana específica.
module "demo_network" {
  count  = var.demo.enabled ? 1 : 0
  source = "../../modules/demo-network"

  environment = var.demo.environment
}

module "demo_database" {
  count  = var.demo.enabled ? 1 : 0
  source = "../../modules/demo-database"

  environment                = var.demo.environment
  database_security_group_id = module.demo_network[0].database_security_group_id
  database_subnet_ids        = module.demo_network[0].database_subnet_ids
  engine_version             = var.demo.engine_version
  final_snapshot_identifier  = var.demo.final_snapshot_identifier
}

module "demo_host" {
  count  = var.demo.enabled ? 1 : 0
  source = "../../modules/demo-host"

  environment              = var.demo.environment
  account_id               = "896618135592"
  region                   = "sa-east-1"
  ami_id                   = var.demo.ami_id
  ami_evidence             = var.demo.ami_evidence
  public_subnet_id         = module.demo_network[0].public_subnet_id
  app_security_group_id    = module.demo_network[0].app_security_group_id
  database_address         = module.demo_database[0].database_address
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-demo-boundary"
  public_hostname          = var.demo.public_hostname
  release_key              = var.demo.release_key
  release_sha256           = var.demo.release_sha256
  accept_acme_terms        = var.demo.accept_acme_terms
  acme_contact_email       = var.demo_acme_contact_email

  # Referencias de los servicios existentes, no valores secretos ni permisos nuevos.
  # No depende de enabled_endpoint_names: conservar modelo apagado no invalida su ARN.
  runtime_references = {
    user_pool_arn            = module.identity.user_pool_arn
    cognito_client_id        = module.identity.user_pool_client_id
    studies_bucket_name      = module.study_storage.bucket_name
    echonext_endpoint_arn    = "arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"
    additional_endpoint_arns = []
  }
}

module "identity" {
  source = "../../modules/identity"

  environment = "dev"

  # Acceso de la aplicación al bucket de estudios. Se pasa el ARN, no una dependencia entre módulos.
  studies_bucket_arn = module.study_storage.bucket_arn

  # Permiso de la aplicación para invocar el punto de inferencia de EchoNext-Mini (008). Se arma por nombre, igual que
  # el nombre que le pone infra/modules/model-endpoints, así que existe aunque el punto esté apagado.
  model_endpoint_arn = "arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini"

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-boundary"
}

# Bucket privado de los estudios de ECG de las clínicas (006). Sin versionado: eliminar un estudio lo borra de verdad.
# Los estudios se leen y escriben desde la aplicación; el operador de Terraform no puede leerlos.
module "study_storage" {
  source = "../../modules/study-storage"

  environment = "dev"
  account_id  = "896618135592"
}

# Bucket privado para los artefactos de los modelos. No guarda datos de pacientes.
module "model_artifacts" {
  source = "../../modules/model-artifacts"

  environment = "dev"
  account_id  = "896618135592"
}

# Repositorio privado con la imagen de inferencia de EchoNext-Mini (005). La imagen la construye y sube el responsable
# desde el repositorio medicia-ml. Etiquetas inmutables, escaneo al subir y solo las últimas 10 imágenes.
module "model_registry" {
  source = "../../modules/model-registry"

  environment = "dev"
  account_id  = "896618135592"
  name        = "echonext-mini"
}

# Rol que SageMaker asume para leer los artefactos del bucket, descargar la imagen y escribir registros.
module "sagemaker_execution_role" {
  source = "../../modules/sagemaker-execution-role"

  environment          = "dev"
  account_id           = "896618135592"
  artifacts_bucket_arn = module.model_artifacts.bucket_arn
  ecr_repository_arn   = module.model_registry.repository_arn

  # La crea infra/bootstrap. Se escribe el ARN porque cada raíz tiene su propio estado.
  permissions_boundary_arn = "arn:aws:iam::896618135592:policy/medicia-dev-sagemaker-boundary"
}

# Catálogo de modelos, apagado por defecto. Con var.models vacío no crea ningún recurso.
module "model_endpoints" {
  source = "../../modules/model-endpoints"

  environment           = "dev"
  account_id            = "896618135592"
  artifacts_bucket_name = module.model_artifacts.bucket_name
  execution_role_arn    = module.sagemaker_execution_role.role_arn
  models                = var.models

  # La salida role_arn se arma con una cadena conocida, no con un atributo del recurso, así que Terraform no ve solo
  # que el modelo depende del rol y de su política. Sin esto, en una cuenta limpia intentaría crear el modelo a la vez
  # que el rol. Se depende solo del rol: la configuración del punto de inferencia usa create_before_destroy y Terraform
  # lo extiende a todo lo que está detrás de una dependencia, así que depender del bucket o del repositorio lo
  # propagaría a sus subrecursos (versionado, bloqueo de acceso público, política de TLS). El artefacto y la imagen
  # se suben a mano antes del apply que crea el modelo (ver infra/README.md, "Modelo EchoNext-Mini").
  depends_on = [module.sagemaker_execution_role]
}
