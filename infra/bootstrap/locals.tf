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

  # Rol de ejecución de SageMaker (lo crea infra/modules/sagemaker-execution-role).
  # El nombre debe coincidir con el del módulo.
  execution_role_arn = "arn:aws:iam::${var.account_id}:role/medicia-${var.environment}-sagemaker-execution"

  # Techo de permisos del rol de ejecución (ver sagemaker-boundary.tf).
  sagemaker_boundary_policy_arn = "arn:aws:iam::${var.account_id}:policy/medicia-${var.environment}-sagemaker-boundary"
}
