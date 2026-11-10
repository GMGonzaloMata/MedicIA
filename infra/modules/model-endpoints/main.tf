# Catálogo de modelos. Por cada entrada de var.models se crean un modelo y una configuración de punto de
# inferencia, que no cuestan nada. El punto de inferencia es lo único que cobra por hora: existe solo si la
# entrada tiene enabled = true. Encenderlo y apagarlo es cambiar ese campo. No se crea ningún otro recurso
# de SageMaker.

resource "aws_sagemaker_model" "this" {
  for_each = var.models

  # SageMaker no puede actualizar un modelo: cambiar la imagen, el artefacto o el rol lo reemplaza. La
  # configuración del punto de inferencia, que depende de él, se reemplaza antes de borrar (create_before_destroy),
  # y eso se propaga al modelo; con un nombre fijo, el modelo nuevo chocaría con el viejo. Por eso el nombre lleva
  # un resumen de lo que no se puede actualizar, y el reemplazo se encadena sin chocar (máximo 45 caracteres).
  name = "medicia-${var.environment}-${each.key}-${substr(sha256(jsonencode([each.value.image_uri, each.value.model_data_key, var.execution_role_arn])), 0, 8)}"

  execution_role_arn = var.execution_role_arn

  # El contenedor procesa estudios de pacientes: sin salida a internet no puede enviar nada afuera. Los pesos se siguen cargando desde S3 por SageMaker. Cambiar este
  # valor obliga a reemplazar el modelo, por eso se fija desde el principio. Si un contenedor necesita red,
  # se decide aparte y se documenta.
  enable_network_isolation = true

  primary_container {
    image          = each.value.image_uri
    model_data_url = "s3://${var.artifacts_bucket_name}/${each.value.model_data_key}"
  }

  # La versión exacta del modelo es la base de la trazabilidad de un análisis futuro.
  tags = {
    ModelVersion = each.value.model_version
  }
}

resource "aws_sagemaker_endpoint_configuration" "this" {
  for_each = var.models

  # name_prefix: SageMaker no permite editar una configuración, así que un cambio crea otra con nombre nuevo.
  name_prefix = "medicia-${var.environment}-${each.key}-"

  production_variants {
    variant_name           = "AllTraffic"
    model_name             = aws_sagemaker_model.this[each.key].name
    initial_instance_count = 1
    instance_type          = each.value.instance_type
  }

  tags = {
    ModelVersion = each.value.model_version
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_sagemaker_endpoint" "this" {
  for_each = { for nombre, modelo in var.models : nombre => modelo if modelo.enabled }

  name                 = "medicia-${var.environment}-${each.key}"
  endpoint_config_name = aws_sagemaker_endpoint_configuration.this[each.key].name

  tags = {
    ModelVersion = each.value.model_version
  }
}
