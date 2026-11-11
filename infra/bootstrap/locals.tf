locals {
  # El sufijo con el ID de la cuenta evita choques: los nombres de bucket son globales en AWS.
  state_bucket_name = "medicia-tfstate-${var.environment}-${var.account_id}"

  # Se arma con el nombre, que se conoce al planificar, y no con un atributo del bucket.
  # Así la política se puede decodificar en las pruebas.
  state_bucket_arn = "arn:aws:s3:::${local.state_bucket_name}"

  # Bucket de artefactos de modelos (lo crea infra/modules/model-artifacts desde infra/environments/dev).
  # Se arma con el nombre, como el del estado, para poder decodificar las políticas en las pruebas.
  # El nombre debe coincidir con el del módulo model-artifacts.
  models_bucket_name = "medicia-models-${var.environment}-${var.account_id}"
  models_bucket_arn  = "arn:aws:s3:::${local.models_bucket_name}"

  # Bucket de estudios de ECG (lo crea infra/modules/study-storage desde infra/environments/dev). Se arma con el
  # nombre, como los demás, para poder decodificar las políticas en las pruebas. Debe coincidir con el del módulo.
  studies_bucket_name = "medicia-studies-${var.environment}-${var.account_id}"
  studies_bucket_arn  = "arn:aws:s3:::${local.studies_bucket_name}"

  # Rol de ejecución de SageMaker (lo crea infra/modules/sagemaker-execution-role).
  # El nombre debe coincidir con el del módulo.
  execution_role_arn = "arn:aws:iam::${var.account_id}:role/medicia-${var.environment}-sagemaker-execution"

  # Techo de permisos del rol de ejecución (ver sagemaker-boundary.tf).
  sagemaker_boundary_policy_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-sagemaker-boundary"

  # Repositorio de imágenes de EchoNext-Mini (lo crea infra/modules/model-registry). El nombre debe coincidir con el
  # del módulo. El patrón cubre los repositorios de los modelos futuros del entorno.
  ecr_repository_arn         = "arn:aws:ecr:${var.region}:${var.account_id}:repository/medicia-${var.environment}-echonext-mini"
  ecr_repository_arn_pattern = "arn:aws:ecr:${var.region}:${var.account_id}:repository/medicia-${var.environment}-*"

  # Recursos de SageMaker del entorno (modelos, configuraciones y puntos de inferencia).
  sagemaker_arn_prefix = "arn:aws:sagemaker:${var.region}:${var.account_id}"

  # Punto de inferencia de EchoNext-Mini (lo crea infra/modules/model-endpoints cuando se enciende). El ARN se arma por
  # nombre, así que existe aunque el punto esté apagado. Debe coincidir con el que pasa infra/environments/dev al
  # módulo identity.
  model_endpoint_arn = "${local.sagemaker_arn_prefix}:endpoint/medicia-${var.environment}-echonext-mini"

  # Segunda política del operador (SageMaker, PassRole y ECR); ver operator-policy-ml.tf.
  operator_ml_policy_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-terraform-operator-ml"
}
