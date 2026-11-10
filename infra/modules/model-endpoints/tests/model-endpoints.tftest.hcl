# Pruebas del catálogo de modelos (specs/004-infra-sagemaker-modelos/contracts/model-catalog.md).
# Corren con el proveedor simulado: no tocan AWS ni piden credenciales. Las entradas de ejemplo solo viven acá.

mock_provider "aws" {}

variables {
  account_id            = "896618135592"
  environment           = "dev"
  artifacts_bucket_name = "medicia-models-dev-896618135592"
  execution_role_arn    = "arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"
}

run "catalogo_vacio_no_crea_nada" {
  command = plan

  variables {
    models = {}
  }

  assert {
    condition     = length(aws_sagemaker_model.this) == 0
    error_message = "Con el catálogo vacío no debe haber modelos."
  }

  assert {
    condition     = length(aws_sagemaker_endpoint_configuration.this) == 0
    error_message = "Con el catálogo vacío no debe haber configuraciones de punto de inferencia."
  }

  assert {
    condition     = length(aws_sagemaker_endpoint.this) == 0
    error_message = "Con el catálogo vacío no debe haber puntos de inferencia."
  }
}

run "entrada_apagada_por_defecto" {
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
    condition     = length(aws_sagemaker_model.this) == 1
    error_message = "Una entrada debe crear un modelo."
  }

  assert {
    condition     = length(aws_sagemaker_endpoint_configuration.this) == 1
    error_message = "Una entrada debe crear una configuración de punto de inferencia."
  }

  assert {
    condition     = length(aws_sagemaker_endpoint.this) == 0
    error_message = "Sin enabled, el punto de inferencia no debe existir (apagado por defecto)."
  }

  assert {
    condition     = can(regex("^medicia-dev-ecg-ejemplo-[0-9a-f]{8}$", aws_sagemaker_model.this["ecg-ejemplo"].name))
    error_message = "El modelo debe llamarse medicia-dev-<nombre>-<resumen de 8 caracteres>."
  }

  assert {
    condition     = aws_sagemaker_model.this["ecg-ejemplo"].enable_network_isolation == true
    error_message = "El contenedor del modelo debe correr sin salida a internet (aislamiento de red)."
  }

  assert {
    condition     = aws_sagemaker_model.this["ecg-ejemplo"].execution_role_arn == "arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution"
    error_message = "El modelo debe usar el rol de ejecución recibido."
  }

  assert {
    condition     = one(aws_sagemaker_model.this["ecg-ejemplo"].primary_container).model_data_url == "s3://medicia-models-dev-896618135592/ecg-ejemplo/1/model.tar.gz"
    error_message = "model_data_url debe armarse con el bucket y la clave."
  }

  assert {
    condition     = one(aws_sagemaker_model.this["ecg-ejemplo"].primary_container).image == "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
    error_message = "El contenedor debe usar la imagen indicada."
  }

  assert {
    condition     = one(aws_sagemaker_endpoint_configuration.this["ecg-ejemplo"].production_variants).instance_type == "ml.t2.medium"
    error_message = "El tipo de instancia por defecto debe ser ml.t2.medium."
  }

  assert {
    condition     = one(aws_sagemaker_endpoint_configuration.this["ecg-ejemplo"].production_variants).initial_instance_count == 1
    error_message = "Debe haber siempre una sola instancia."
  }
}

run "entrada_encendida_crea_un_punto_de_inferencia" {
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
    condition     = length(aws_sagemaker_endpoint.this) == 1
    error_message = "Con enabled = true debe haber exactamente un punto de inferencia."
  }

  assert {
    condition     = aws_sagemaker_endpoint.this["ecg-ejemplo"].name == "medicia-dev-ecg-ejemplo"
    error_message = "El punto de inferencia debe llamarse medicia-dev-<nombre>."
  }

  assert {
    condition     = length(aws_sagemaker_model.this) == 1 && length(aws_sagemaker_endpoint_configuration.this) == 1
    error_message = "Encender no debe cambiar el modelo ni la configuración."
  }
}

run "solo_la_encendida_tiene_punto_de_inferencia" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
        enabled        = true
      }
      rx-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-otro:2"
        model_data_key = "rx-ejemplo/2/model.tar.gz"
        model_version  = "2.1.0"
        enabled        = false
      }
    }
  }

  assert {
    condition     = length(aws_sagemaker_model.this) == 2 && length(aws_sagemaker_endpoint_configuration.this) == 2
    error_message = "Las dos entradas deben tener modelo y configuración."
  }

  assert {
    condition     = toset(keys(aws_sagemaker_endpoint.this)) == toset(["ecg-ejemplo"])
    error_message = "Solo la entrada encendida debe tener punto de inferencia."
  }
}

run "etiqueta_con_la_version_del_modelo" {
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
    condition     = aws_sagemaker_model.this["ecg-ejemplo"].tags["ModelVersion"] == "1.0.0"
    error_message = "El modelo debe llevar la etiqueta ModelVersion."
  }

  assert {
    condition     = aws_sagemaker_endpoint_configuration.this["ecg-ejemplo"].tags["ModelVersion"] == "1.0.0"
    error_message = "La configuración debe llevar la etiqueta ModelVersion."
  }

  assert {
    condition     = aws_sagemaker_endpoint.this["ecg-ejemplo"].tags["ModelVersion"] == "1.0.0"
    error_message = "El punto de inferencia debe llevar la etiqueta ModelVersion."
  }
}

# SageMaker no actualiza un modelo: si cambia el artefacto o la imagen, el nombre debe cambiar para que el
# reemplazo (crear antes de borrar) no choque con el modelo anterior. El punto de inferencia conserva su nombre.
run "el_nombre_del_modelo_cambia_con_su_artefacto_y_su_imagen" {
  command = plan

  variables {
    models = {
      uno = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
      otro-artefacto = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ejemplo/2/model.tar.gz"
        model_version  = "1.0.0"
      }
      otra-imagen = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:2"
        model_data_key = "ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  # Se compara solo el resumen final: cada nombre tiene un prefijo distinto, así que se aísla el sufijo.
  assert {
    condition = length(toset([
      substr(aws_sagemaker_model.this["uno"].name, length(aws_sagemaker_model.this["uno"].name) - 8, 8),
      substr(aws_sagemaker_model.this["otro-artefacto"].name, length(aws_sagemaker_model.this["otro-artefacto"].name) - 8, 8),
      substr(aws_sagemaker_model.this["otra-imagen"].name, length(aws_sagemaker_model.this["otra-imagen"].name) - 8, 8),
    ])) == 3
    error_message = "Cambiar model_data_key o image_uri debe cambiar el nombre del modelo."
  }
}

run "tipo_de_instancia_permitido" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
        instance_type  = "ml.m5.large"
      }
    }
  }

  assert {
    condition     = one(aws_sagemaker_endpoint_configuration.this["ecg-ejemplo"].production_variants).instance_type == "ml.m5.large"
    error_message = "Debe aceptar ml.m5.large."
  }
}

run "tipo_de_instancia_gpu_rechazado" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
        instance_type  = "ml.p3.2xlarge"
      }
    }
  }

  expect_failures = [var.models]
}

run "tipo_de_instancia_no_permitido_rechazado" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
        instance_type  = "ml.m5.xlarge"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_con_mayuscula_rechazada" {
  command = plan

  variables {
    models = {
      Ecg = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_que_empieza_con_numero_rechazada" {
  command = plan

  variables {
    models = {
      "1ecg" = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_de_un_caracter_rechazada" {
  command = plan

  variables {
    models = {
      a = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "a/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_de_25_caracteres_rechazada" {
  command = plan

  variables {
    models = {
      "abcdefghijklmnopqrstuvwxy" = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "x/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_de_24_caracteres_aceptada" {
  command = plan

  variables {
    models = {
      "abcdefghijklmnopqrstuvwx" = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "x/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  assert {
    condition     = length(aws_sagemaker_model.this) == 1
    error_message = "Una clave de 24 caracteres debe aceptarse."
  }
}

run "clave_del_artefacto_vacia_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = ""
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_del_artefacto_con_segmento_punto_punto_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg/../otro/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "clave_del_artefacto_con_barra_inicial_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "/x/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

# El origen de la imagen (005, R10): solo ECR del entorno, de esta cuenta y región, con una versión que no sea latest.
run "imagen_del_entorno_aceptada" {
  command = plan

  variables {
    models = {
      echonext-mini = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0"
        model_data_key = "echonext-mini/0.1.0/model.tar.gz"
        model_version  = "0.1.0"
      }
    }
  }

  assert {
    condition     = length(aws_sagemaker_model.this) == 1
    error_message = "Una imagen del repositorio del entorno debe aceptarse."
  }
}

run "imagen_de_otra_cuenta_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "123456789012.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_de_otra_region_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.us-east-1.amazonaws.com/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_de_otro_repositorio_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/otro-repositorio:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_de_un_registro_publico_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "public.ecr.aws/ejemplo/medicia-dev-ejemplo:1"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_sin_etiqueta_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_con_etiqueta_latest_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo:latest"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}

run "imagen_por_resumen_en_lugar_de_etiqueta_rechazada" {
  command = plan

  variables {
    models = {
      ecg-ejemplo = {
        image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-ejemplo@sha256:0123"
        model_data_key = "ecg-ejemplo/1/model.tar.gz"
        model_version  = "1.0.0"
      }
    }
  }

  expect_failures = [var.models]
}
