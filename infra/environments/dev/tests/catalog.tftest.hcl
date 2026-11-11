# Pruebas del catálogo de modelos en el entorno dev (specs/004-infra-sagemaker-modelos/contracts/model-catalog.md).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.
# El catálogo real tiene una sola entrada, echonext-mini, apagada. Las entradas de ejemplo solo viven en estas pruebas.

mock_provider "aws" {}

# Valores que el módulo identity necesita para planificar (mismos que en modules/identity/tests/identity.tftest.hcl).
override_resource {
  target          = module.identity.aws_cognito_user_pool.this
  override_during = plan
  values = {
    arn = "arn:aws:cognito-idp:sa-east-1:896618135592:userpool/sa-east-1_PRUEBA0001"
  }
}

override_data {
  target = module.identity.data.aws_region.current
  values = {
    region = "sa-east-1"
  }
}

# EchoNext-Mini (005, SC-003): con el valor por defecto hay un modelo y ningún punto de inferencia, es decir, costo de cómputo 0.
run "echonext_mini_apagado_por_defecto" {
  command = plan

  assert {
    condition     = length(module.model_endpoints.model_names) == 1 && startswith(module.model_endpoints.model_names[0], "medicia-dev-echonext-mini-")
    error_message = "El catálogo del entorno debe tener exactamente un modelo: echonext-mini."
  }

  assert {
    condition     = length(module.model_endpoints.enabled_endpoint_names) == 0
    error_message = "EchoNext-Mini debe nacer apagado: ningún punto de inferencia."
  }

  assert {
    condition     = output.enabled_endpoint_names == []
    error_message = "La salida enabled_endpoint_names debe estar vacía con el modelo apagado."
  }
}

# Encender es cambiar un solo valor: el plan propone exactamente un punto de inferencia y el mismo modelo.
run "echonext_mini_encendido_crea_un_punto_de_inferencia" {
  command = plan

  variables {
    models = {
      echonext-mini = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0"
        model_data_key = "echonext-mini/0.1.0/model.tar.gz"
        model_version  = "0.1.0"
        instance_type  = "ml.t2.medium"
        enabled        = true
      }
    }
  }

  assert {
    condition     = module.model_endpoints.enabled_endpoint_names == ["medicia-dev-echonext-mini"]
    error_message = "Encendido, EchoNext-Mini debe tener exactamente un punto de inferencia."
  }

  assert {
    condition     = length(module.model_endpoints.model_names) == 1
    error_message = "Encenderlo no debe cambiar la cantidad de modelos."
  }
}

# El repositorio de imágenes y el rol de ejecución se conectan con los mismos nombres que esperan las políticas de infra/bootstrap.
run "repositorio_de_imagenes_conectado" {
  command = plan

  assert {
    condition     = module.model_registry.repository_arn == "arn:aws:ecr:sa-east-1:896618135592:repository/medicia-dev-echonext-mini"
    error_message = "El repositorio debe llamarse medicia-dev-echonext-mini."
  }

  assert {
    condition     = startswith(var.models["echonext-mini"].image_uri, "${module.model_registry.repository_url}:")
    error_message = "La imagen del catálogo debe salir del repositorio que crea el módulo model-registry."
  }

  assert {
    condition     = var.models["echonext-mini"].model_data_key == "echonext-mini/${var.models["echonext-mini"].model_version}/model.tar.gz"
    error_message = "La clave del artefacto debe llevar la versión del modelo."
  }
}

run "entrada_de_ejemplo_apagada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  assert {
    condition     = length(module.model_endpoints.model_names) == 1 && startswith(module.model_endpoints.model_names[0], "medicia-dev-ecg-ejemplo-")
    error_message = "Una entrada apagada debe crear su modelo."
  }

  assert {
    condition     = length(module.model_endpoints.enabled_endpoint_names) == 0
    error_message = "Una entrada apagada no debe tener punto de inferencia encendido."
  }
}

run "entrada_de_ejemplo_encendida" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
        enabled        = true
      }
    }
  }

  assert {
    condition     = module.model_endpoints.enabled_endpoint_names == ["medicia-dev-ecg-ejemplo"]
    error_message = "Una entrada encendida debe tener exactamente un punto de inferencia."
  }
}

# Bucket de estudios (006): existe, el usuario de la aplicación recibe su acceso y ninguna entrada del catálogo de
# modelos lo referencia (los estudios nunca viajan a SageMaker desde la infraestructura).
run "bucket_de_estudios_y_acceso_de_la_aplicacion" {
  command = plan

  assert {
    condition     = output.studies_bucket_name == "medicia-studies-dev-896618135592"
    error_message = "El entorno debe exponer el bucket de estudios medicia-studies-dev-896618135592."
  }

  assert {
    condition     = module.identity.studies_access_granted
    error_message = "El usuario de la aplicación debe recibir la política del bucket de estudios."
  }

  assert {
    condition     = module.study_storage.bucket_name != module.model_artifacts.bucket_name
    error_message = "Los estudios y los artefactos de modelos deben ir en buckets distintos."
  }
}
