# Modelo de datos: Modelo EchoNext-Mini en SageMaker

No hay base de datos: esta entrega no toca Prisma. Describe las entidades del spec con sus campos, reglas y relaciones.

## Estudio de entrada (solicitud)

- **waveform**: lista de 2500 elementos, cada uno una lista de 12 números (derivaciones). Equivale al arreglo `(1, 2500, 12)` sin la dimensión de canal. 250 Hz, 10 segundos, ya filtrada y normalizada (sin unidades de milivolts).
- **tabular**: lista de 7 números en este orden fijo:
  1. `sex`: 0 mujer, 1 hombre (sin estandarizar)
  2. `age`
  3. `ventricular_rate`
  4. `atrial_rate`
  5. `pr_interval`
  6. `qrs_duration`
  7. `qt_corrected`

  De la posición 2 a la 7, valores estandarizados.
- **Reglas:** los 30 000 números de la onda y los 7 valores son finitos; `sex` es 0 o 1; la forma es exacta. Ver [contracts/inference-api.md](contracts/inference-api.md).
- **Orden de las 12 derivaciones:** el del conjunto de datos. No se puede validar de forma automática; se documenta.

## Resultado (respuesta)

- **model**: `echonext-mini`.
- **model_version**: la versión exacta del modelo (la misma etiqueta del artefacto y de la imagen).
- **probabilities**: objeto con 12 claves en este orden fijo, cada valor entre 0 y 1:
  `lvef_lte_45`, `lvwt_gte_13`, `aortic_stenosis`, `aortic_regurgitation`, `mitral_regurgitation`, `tricuspid_regurgitation`, `pulmonary_regurgitation`, `rv_systolic_dysfunction`, `pericardial_effusion`, `pasp_gte_45`, `tr_max_gte_32`, `shd`.
- **Relación:** el valor `shd` es el compuesto (al menos uno de los otros once). No es una suma ni un máximo de las otras salidas: es una salida propia del modelo.

## Artefactos del modelo (`model.tar.gz`)

Ubicación en el bucket de la 004: `echonext-mini/<versión>/model.tar.gz`. Contenido:

- `weights.pt`: pesos (4,27 MB). **Lo único que lee la inferencia.**
- `tabular_transformer.joblib`: transformador de variables (1,5 KB). No se carga en la inferencia; lo usaría una funcionalidad futura que acepte estudios sin preprocesar.
- `waveform_normalization_params.json`: límites, media y desvío por derivación (1,1 KB). No se aplica en la inferencia; lo usaría esa misma funcionalidad futura.
- `MANIFEST.json`: versión del modelo, huella SHA-256 de cada archivo y versión del código que lo empaquetó.

Regla: sin datos de estudios, nunca. La clave del artefacto lleva la versión; subir una versión nueva no pisa la anterior.

## Imagen de inferencia

- **Repositorio:** `medicia-dev-echonext-mini` (ECR, `sa-east-1`).
- **Etiqueta:** la versión del modelo y de la imagen, por ejemplo `0.1.0`. Inmutable. Nunca `latest`.
- **Contenido:** Python, PyTorch (CPU), NumPy, el código de `medicia-ml`. No incluye pesos (salen del artefacto) ni datos.

## Entrada del catálogo (`infra/environments/dev`)

Campos de la 004 (ver [../004-infra-sagemaker-modelos/contracts/model-catalog.md](../004-infra-sagemaker-modelos/contracts/model-catalog.md)):

- **Clave:** `echonext-mini`.
- **image_uri:** `896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:<versión>`.
- **model_data_key:** `echonext-mini/<versión>/model.tar.gz`.
- **model_version:** `<versión>`.
- **instance_type:** `ml.t2.medium` (por defecto).
- **enabled:** `false` (por defecto).

## Referencia de verificación

- Las 12 probabilidades que calcula el código original para 3 a 5 estudios de la partición de prueba, junto con las del modelo desplegado y la diferencia máxima.
- Se registran solo índices de estudio y diferencias, nunca los datos de los estudios (FR-022).

## Estados de un punto de inferencia (resumen)

- **Apagado** (`enabled = false`): existen el modelo y la configuración (sin costo); no existe el punto de inferencia.
- **Creando:** SageMaker descarga la imagen y el artefacto y arranca el contenedor (5 a 10 minutos).
- **En servicio:** responde `/ping` y `/invocations`. Cobra por hora.
- **Apagado de nuevo:** `enabled = false` y el plan quita solo el punto de inferencia.
