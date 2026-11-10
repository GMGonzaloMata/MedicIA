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
