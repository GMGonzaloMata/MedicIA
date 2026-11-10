# Contrato: permisos, artefactos e imagen

Complementa [../../004-infra-sagemaker-modelos/contracts/access-and-permissions.md](../../004-infra-sagemaker-modelos/contracts/access-and-permissions.md). Los permisos se otorgan por la vía de administración de la 003. Cada lista es enumerada, sin comodines de acciones. Las claves de condición marcadas con (*) se confirman al implementar con la referencia de autorización de AWS.

## Operador (`terraform-dev`): política nueva `medicia-dev-terraform-operator-ml`

- **Gestionar SageMaker del entorno:** `sagemaker:CreateModel`, `DeleteModel`, `DescribeModel`, `CreateEndpointConfig`, `DeleteEndpointConfig`, `DescribeEndpointConfig`, `CreateEndpoint`, `UpdateEndpoint`, `DeleteEndpoint`, `DescribeEndpoint`, `AddTags`, `DeleteTags`, `ListTags`. Recursos: `model/medicia-dev-*`, `endpoint-config/medicia-dev-*`, `endpoint/medicia-dev-*` en `sa-east-1` y la cuenta del entorno.
- **Invocar:** `sagemaker:InvokeEndpoint` sobre `endpoint/medicia-dev-*`.
- **Listar:** `sagemaker:ListModels`, `ListEndpoints`, `ListEndpointConfigs` sobre `*` (AWS no permite limitarlos).
- **Entregar el rol:** `iam:PassRole` solo sobre `arn:aws:iam::896618135592:role/medicia-dev-sagemaker-execution`, con `iam:PassedToService = sagemaker.amazonaws.com`.
- **Crear modelos aislados:** `sagemaker:CreateModel` con la condición `sagemaker:NetworkIsolation = true` (*).
- **ECR:** repositorio (`ecr:CreateRepository`, `DeleteRepository`, `DescribeRepositories`, `ListTagsForResource`, `TagResource`, `GetLifecyclePolicy`, `PutLifecyclePolicy`, `GetRepositoryPolicy`, `PutImageScanningConfiguration`) e imágenes (`BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `PutImage`, `DescribeImages`, `ListImages`, `BatchGetImage`, `GetDownloadUrlForLayer`) sobre `repository/medicia-dev-*`. `ecr:GetAuthorizationToken` sobre `*`.
- **No incluye:** `ecr:BatchDeleteImage`, `sagemaker:*`, `iam:PassRole` sobre otros roles, ni permisos de entrenamiento, notebooks o trabajos de procesamiento.
- **Protección:** se agrega el ARN de esta política al `Deny` `ProtegerLasPoliticasDeAcceso` de la política actual del operador.

## Rol de ejecución (`medicia-dev-sagemaker-execution`) y su límite

Se suma a lo de la 004 (leer artefactos y escribir registros):

- `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage` sobre `repository/medicia-dev-echonext-mini`.
- `ecr:GetAuthorizationToken` sobre `*`.

La lista idéntica va en el rol (`modules/sagemaker-execution-role`) y en su límite (`bootstrap/sagemaker-boundary.tf`).

## Plan de CI (`medicia-dev-plan`) y límite de la aplicación

Se suman al rol de plan y a `medicia-dev-boundary` solo lecturas:

- `sagemaker:DescribeModel`, `DescribeEndpointConfig`, `DescribeEndpoint`, `ListTags` sobre `model/`, `endpoint-config/` y `endpoint/` con prefijo `medicia-dev-`.
- `ecr:DescribeRepositories`, `ListTagsForResource`, `GetLifecyclePolicy`, `GetRepositoryPolicy` sobre `repository/medicia-dev-*`.
- Sin escrituras. Se documenta que el techo del usuario de la aplicación sube con el límite compartido y se actualiza FR-008 de la 004.

## Artefacto en el bucket de la 004

- **Clave:** `echonext-mini/<versión>/model.tar.gz`. Una versión por carpeta.
- **Contenido:** `weights.pt`, `tabular_transformer.joblib`, `waveform_normalization_params.json` y `MANIFEST.json`, en la raíz del archivo (SageMaker lo descomprime en `/opt/ml/model`).
- **Cómo se sube:** a mano, con las credenciales del operador (`s3:PutObject`, sin borrado). Lo arma `medicia-ml/scripts/package_artifacts.py`.
- **Prohibido:** datos de estudios, en cualquier forma, en el bucket.

## Imagen

- **Repositorio:** `medicia-dev-echonext-mini`, etiquetas inmutables, escaneo al subir, cifrado por defecto, últimas 10 imágenes.
- **Etiqueta:** la versión del modelo (por ejemplo `0.1.0`), nunca `latest`.
- **Descarga:** la hace SageMaker con el rol de ejecución; dentro del contenedor no hay acceso a internet.
- **Origen aceptado por el catálogo:** `896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-<nombre>:<versión>`.

## Comprobaciones que fallan (FR-020)

- Un permiso comodín, un punto de inferencia encendido sin pedirlo o un cómputo con GPU (las de la 004, siguen vigentes).
- Una entrada del catálogo con `image_uri` de otra cuenta, otra región, otro repositorio o con etiqueta `latest`.
- Un artefacto de modelo (`.pt`, `.joblib`, `.npy`, `.npz`, `.tar.gz`) versionado en cualquiera de los dos repositorios.
