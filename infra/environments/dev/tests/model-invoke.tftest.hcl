# Permiso de la aplicación para invocar el punto de inferencia (specs/008-analisis-estudio-ecg/contracts/permissions.md).
# Corre en modo plan con un proveedor simulado: no necesita credenciales de AWS ni crea recursos.

mock_provider "aws" {}

# Valores que el módulo identity necesita para planificar (mismos que en catalog.tftest.hcl).
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

# El ARN se arma por nombre: con el modelo apagado (valor por defecto) el permiso existe igual.
run "la_aplicacion_puede_invocar_el_punto_aunque_este_apagado" {
  command = plan

  assert {
    condition     = length(module.model_endpoints.enabled_endpoint_names) == 0
    error_message = "EchoNext-Mini debe seguir apagado."
  }

  assert {
    condition     = module.identity.model_access_granted == true
    error_message = "El plan debe agregar la política de invocación aunque el punto de inferencia esté apagado."
  }
}

run "el_arn_coincide_con_el_nombre_del_punto_de_inferencia_encendido" {
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
    error_message = "El punto de inferencia encendido debe llamarse medicia-dev-echonext-mini, como el ARN del permiso."
  }
}
