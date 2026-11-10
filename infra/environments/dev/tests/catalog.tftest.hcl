# Pruebas del catálogo de modelos en el entorno dev (specs/004-infra-sagemaker-modelos/contracts/model-catalog.md).
# Corren en modo plan con un proveedor simulado: no necesitan credenciales de AWS ni crean recursos.
# La entrada de ejemplo solo vive en esta prueba; el catálogo real del entorno está vacío.

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

run "catalogo_vacio_por_defecto" {
  command = plan

  assert {
    condition     = length(module.model_endpoints.model_names) == 0
    error_message = "El catálogo del entorno debe estar vacío: ningún modelo."
  }

  assert {
    condition     = length(module.model_endpoints.enabled_endpoint_names) == 0
    error_message = "El catálogo del entorno debe estar vacío: ningún punto de inferencia encendido."
  }
}

run "entrada_de_ejemplo_apagada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/ejemplo:1"
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
        image_uri      = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/ejemplo:1"
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
