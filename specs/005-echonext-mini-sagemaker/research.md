# Research: Modelo EchoNext-Mini en SageMaker

**Fecha**: 2026-11-10 | **Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

Lo que se verificó leyendo el código del repositorio original (`PierreElias/IntroECG`, carpeta `7-EchoNext Minimodel`, `master` en el commit `15233e9`, del 2026-04-20) está marcado como **verificado**. Lo que depende de documentación de AWS que no se pudo comprobar acá está marcado como **a confirmar al implementar**.

## R1. Imagen de inferencia: propia o contenedor de PyTorch de AWS

**Decisión:** imagen propia, `linux/amd64`, basada en Python 3.11 slim con PyTorch solo CPU y NumPy, y un servidor HTTP mínimo con `/ping` y `/invocations` en el puerto 8080. Se publica en un repositorio ECR propio y el catálogo la referencia por etiqueta de versión.

**Por qué:**
- El modelo es chico (4,27 MB de pesos, una ResNet 1D) y la inferencia solo necesita PyTorch y NumPy. Una imagen propia queda de unos cientos de MB y con dependencias exactas.
- Se puede probar igual en la máquina del responsable que en la nube (`docker run --network none` reproduce el aislamiento de red).
- Todo el código vive en la imagen, y el artefacto de S3 solo trae datos (pesos), lo que mantiene la separación pedida por la constitución.

**Alternativas descartadas:**
- Contenedor de PyTorch de SageMaker con un script propio: evita construir una imagen, pero pesa varios GB, arranca TorchServe, exige empaquetar el código dentro de `model.tar.gz` y esconde las versiones. Menos control para un modelo de 4 MB.
- Reutilizar la imagen del repositorio original: usa Python 3.8 (fuera de soporte), `poetry` y paquetes de AzureML y MLflow que no sirven sin internet.

**Versión de PyTorch:** el original fija 2.0.1. No hace falta repetirla: la arquitectura solo usa capas estándar (`Conv1d`, `BatchNorm1d`, `MaxPool1d`, `Linear`), así que se usa una versión actual de la rama 2.x posterior a 2.6, que además corrige el problema de seguridad de `torch.load` de las versiones anteriores. La versión exacta se fija al implementar y la paridad (R9) comprueba que el resultado no cambia. **A confirmar al implementar:** que existan ruedas CPU para esa versión y Python 3.11.

**Funcionamiento sin internet:** SageMaker descarga la imagen y el artefacto antes de arrancar (con aislamiento de red no lo hace el contenedor), así que la imagen no necesita salir a internet. La imagen no instala nada al arrancar.

## R2. Formato de la solicitud y de la respuesta

**Decisión:** JSON. La solicitud lleva `Content-Type: application/json` y la respuesta es JSON. Detalle completo en [contracts/inference-api.md](contracts/inference-api.md).

- Solicitud: `{"waveform": [[...]], "tabular": [...]}`, con la onda como lista de 2500 muestras de 12 valores (una lista por instante, igual que el eje de tiempo del arreglo `(1, 2500, 12)` sin la dimensión de canal) y 7 variables.
- Respuesta: `{"model": "echonext-mini", "model_version": "...", "probabilities": {...12 claves en orden fijo...}}`.

**Por qué:**
- La 006 es una aplicación TypeScript que lee el archivo cargado y llama al punto de inferencia. JSON se arma y se valida sin librerías de NumPy y se puede probar a mano.
- El tamaño es chico: 30 000 números son cerca de 0,6 MB, muy por debajo del límite de 25 MB de una solicitud de SageMaker.
- La respuesta por nombre (no por posición) evita cruzar hallazgos; el orden fijo se mantiene además por contrato.
- Mismos resultados que el flujo original: el original convierte float64 a float32 al cargar, y el servidor hace lo mismo con los números del JSON.

**Alternativas descartadas:** `.npz` binario (obliga a la 006 a escribir y leer `.npz` en TypeScript), `application/x-npy` (un arreglo por solicitud, no entran onda y variables juntas), CSV (ambiguo para una matriz).

**Validación (FR-003):** forma exacta de la onda, exactamente 7 variables, todos los valores finitos, sexo 0 o 1, tipos numéricos, y tope del tamaño del cuerpo. Los errores devuelven HTTP 400 con un mensaje claro. El servidor no escribe el contenido de las solicitudes en los registros.

## R3. Código del modelo: cómo se obtiene la arquitectura

**Verificado.** El módulo que importa el original para predecir (`cradlenet/models/resnet1d_tabular.py`) depende solo de `torch`; las dependencias pesadas (Lightning, MLflow, AzureML) están en el resto del paquete. La arquitectura:

- `ResNet1dWithTabular(len_tabular_feature_vector=7, filter_size=16, num_classes=12)`.
- Entrada: onda `(N, 1, 2500, 12)` y variables `(N, 7)`. Se trasponen las dos últimas dimensiones y se quita el canal: `(N, 12, 2500)`.
- Capas: `Conv1d` de 12 a 16 canales (núcleo 15, paso 2, relleno 7), `BatchNorm1d`, `ReLU`, `MaxPool1d` (3, 2, 1); cuatro etapas de bloques residuales `[3, 4, 6, 3]` con 16, 32, 64 y 128 canales, núcleo 7 y relleno 3; `AdaptiveAvgPool1d` y `AdaptiveMaxPool1d` concatenados (256), luego las 7 variables (263) y una capa lineal a 12 logits.
- Probabilidades: `sigmoid` sobre los logits (`--binary`). Sin umbrales.
- El punto de control es un diccionario con la clave `"model"` que contiene el `state_dict`. Se carga con `load_state_dict`.

**Decisión:** reescribir la arquitectura de forma independiente en `medicia-ml` (`echonext/model.py`) con los mismos nombres de módulos para que el `state_dict` coincida, y cargar con `strict=True`. No se copia el archivo del original.

**Por qué reescribir y no copiar:**
- El repositorio original no declara licencia (la API de GitHub informa `license: null`) y Columbia tiene una solicitud de patente. Copiar el código a otro repositorio sin permiso es un riesgo evitable. Una ResNet 1D con esas capas es una estructura estándar, y los pesos son los que se usan bajo los términos de PhysioNet.
- Si la reescritura difiere, `strict=True` falla de inmediato (nombres o formas distintas) y la paridad (R9) detecta cualquier diferencia numérica.

**Alternativas descartadas:** copiar el archivo (riesgo de licencia), instalar `cradlenet` completo en la imagen (arrastra Lightning, MLflow y AzureML, y Python 3.8).

**A confirmar al implementar:** que `torch.load(..., weights_only=True)` pueda leer el punto de control (si trae objetos que no son tensores, se evalúa convertirlo una vez a un `state_dict` solo con tensores, y se documenta). Es lo primero que probará el script de paridad.

**Modo de evaluación:** el modelo se usa con `model.eval()` y `torch.no_grad()`. Con eso la `Dropout` queda inactiva y la normalización por lotes usa estadísticas guardadas, lo que da el mismo resultado ante la misma entrada (FR-004). Es la causa más probable de una discrepancia si se olvida.

## R4. Transformador de variables y normalización de la onda

**Verificado.** En el flujo original (`preprocess.py`):

- **Onda:** por derivación, se recorta a un límite inferior y superior, se resta la media y se divide por el desvío (parámetros en `waveform_normalization_params.json`, 12 valores por parámetro, calculados sobre el conjunto de entrenamiento). Los límites están en las unidades de la señal cruda (por ejemplo, entre −140 y 287 en la primera derivación). Después se reordena a `(N, 1, 2500, 12)`.
- **Variables:** sexo se codifica 1 si es hombre y 0 si es mujer; atrial y PR faltantes se toman como 0; las seis variables numéricas pasan por un `StandardScaler` y luego una imputación por mediana (el transformador guardado en `tabular_transformer.joblib`, un `Pipeline` de scikit-learn 1.1.3). El sexo no se estandariza.
- **El modelo no aplica ninguna de las dos cosas:** el script de inferencia lee los arreglos ya procesados y llama al modelo. Los arreglos del conjunto de datos de PhysioNet ya están procesados (confirmado empíricamente).

**Decisión:** el punto de inferencia recibe datos ya normalizados y **no** aplica el transformador ni la normalización. El `model.tar.gz` incluye igualmente `tabular_transformer.joblib` y `waveform_normalization_params.json` (pesan 1,5 KB y 1,1 KB) porque la 006 los necesitará para convertir estudios propios. La inferencia solo lee `weights.pt`.

**Por qué no cargar el `.joblib` en la inferencia:** es un archivo `pickle` (cargar uno de origen desconocido ejecuta código), exige scikit-learn 1.1.3 (arrastra Python 3.8 o similar) y no hace falta para predecir. La 006 decidirá cómo reproducir la normalización (por ejemplo, con los números del `.json` y los valores de la media y el desvío del transformador exportados a un formato de datos).

## R5. ECR: Terraform o a mano

**Decisión:** Terraform, en un módulo nuevo `infra/modules/model-registry` (un repositorio por modelo, nombre `medicia-dev-echonext-mini`).

- Etiquetas **inmutables** (`image_tag_mutability = "IMMUTABLE"`): la etiqueta de versión siempre apunta a la misma imagen, que es la base de la trazabilidad (Principio IV).
- Escaneo de vulnerabilidades al subir (`scan_on_push`), cifrado por defecto (AES-256 gestionado por AWS, sin costo extra) y política de ciclo de vida que conserva las últimas 10 imágenes.
- Sin política de repositorio: el rol de ejecución accede por su propia política de identidad (misma cuenta).
- `force_delete = false`: no se puede destruir un repositorio con imágenes sin vaciarlo antes.

**Por qué:** sigue el principio del proyecto (todo como código y revisable). El costo de almacenamiento es de unos 0,10 USD por GB al mes, es decir menos de 0,10 USD por mes para una imagen de unos cientos de MB.

**Orden de despliegue (huevo y gallina):** el repositorio tiene que existir antes de subir la imagen, y la entrada del catálogo (que apunta a esa imagen) debe agregarse después. Pasos en [quickstart.md](quickstart.md).

**Alternativa descartada:** crearlo a mano en la consola: no queda revisado, ni con etiquetas inmutables garantizadas, ni versionado.

## R6. Permisos

### R6.1 Política administrada nueva para el operador

La política actual del operador (`medicia-dev-terraform-operator`) está cerca del tope de 6144 caracteres. **Decisión:** una segunda política, `medicia-dev-terraform-operator-ml`, que el administrador adjunta a `terraform-dev` durante la rotación de la 003. **A confirmar al implementar:** medir el tamaño con `terraform console` o el plan; si la política actual deja margen, se evalúa unir las dos.

Contenido, sin comodines de acciones ni servicios:

- **SageMaker, escrituras y lecturas sobre los recursos del entorno:** `CreateModel`, `DeleteModel`, `DescribeModel`, `CreateEndpointConfig`, `DeleteEndpointConfig`, `DescribeEndpointConfig`, `CreateEndpoint`, `UpdateEndpoint`, `DeleteEndpoint`, `DescribeEndpoint`, `AddTags`, `DeleteTags`, `ListTags`, sobre `model/medicia-dev-*`, `endpoint-config/medicia-dev-*` y `endpoint/medicia-dev-*`. También `InvokeEndpoint` sobre `endpoint/medicia-dev-*` para la verificación.
- **Listados (`ListModels`, `ListEndpoints`, `ListEndpointConfigs`):** SageMaker no admite limitarlos a un recurso, así que `Resource: "*"` en una sentencia aparte y solo de listado.
- **`iam:PassRole`:** solo sobre el rol de ejecución (`medicia-dev-sagemaker-execution`) y con la condición `iam:PassedToService = sagemaker.amazonaws.com`. Es la protección principal contra escalar privilegios.
- **ECR:** crear y gestionar el repositorio (`CreateRepository`, `DeleteRepository`, `DescribeRepositories`, `ListTagsForResource`, `TagResource`, `GetLifecyclePolicy`, `PutLifecyclePolicy`, `GetRepositoryPolicy`, `PutImageScanningConfiguration`) y subir imágenes (`BatchCheckLayerAvailability`, `InitiateLayerUpload`, `UploadLayerPart`, `CompleteLayerUpload`, `PutImage`, `DescribeImages`, `ListImages`, `BatchGetImage`, `GetDownloadUrlForLayer`) solo sobre `repository/medicia-dev-*`. `GetAuthorizationToken` exige `Resource: "*"` (AWS no admite otra cosa) en una sentencia aparte.
- **Sin borrado de imágenes** (`BatchDeleteImage`) para el operador: una imagen publicada es una versión trazable. El ciclo de vida del repositorio las vence.
- **Sentencias de protección:** un `Deny` sobre `CreatePolicy`, `CreatePolicyVersion`, `DeletePolicy`, `DeletePolicyVersion` y `SetDefaultPolicyVersion` de esta política (se agrega su ARN a `ProtegerLasPoliticasDeAcceso` de la política actual) y, si AWS lo admite, condiciones que exijan `sagemaker:NetworkIsolation = true` al crear un modelo.

**A confirmar al implementar con la referencia de autorización de AWS:** qué claves de condición admite cada acción de SageMaker (`sagemaker:NetworkIsolation` en `CreateModel` y las de tipo de instancia en `CreateEndpointConfig`). Donde existan se usan como defensa adicional; donde no, las protegen las validaciones de Terraform y la comprobación de CI de la 004. También qué otras lecturas pide el proveedor de Terraform al refrescar un modelo, una configuración o un punto de inferencia (se descubren con el plan).

### R6.2 Rol de ejecución: descarga de la imagen

Se agrega al rol y a su límite (`medicia-dev-sagemaker-boundary`) `ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer` y `ecr:BatchGetImage` solo sobre el repositorio `medicia-dev-echonext-mini`, y `ecr:GetAuthorizationToken` sobre `*` (única opción). El límite y el rol repiten la misma lista, como ya hace la 004 (R10).

### R6.3 Plan de CI y límite de la aplicación (FR-019)

El rol de plan gana lecturas enumeradas y sin escrituras: `sagemaker:DescribeModel`, `DescribeEndpointConfig`, `DescribeEndpoint`, `ListTags` sobre los recursos `medicia-dev-*`, y `ecr:DescribeRepositories`, `ListTagsForResource`, `GetLifecyclePolicy`, `GetRepositoryPolicy` sobre el repositorio. Como el rol de plan y el usuario de la aplicación comparten el límite `medicia-dev-boundary`, ese techo también sube. **Efecto:** la aplicación podría, en teoría, leer (no escribir) esos recursos, pero su política real no se los concede. Se documenta y se actualiza FR-008 de la 004 al implementar.

**Cuál es la ruta:** los cambios van por la rotación de administrador de la 003 (`terraform -chdir=infra/bootstrap plan/apply` con permisos de administrador y luego restituir al operador). Es un único paso para los tres cambios (política nueva, límite del rol de ejecución, rol de plan y su límite).

## R7. Registros de CloudWatch

**Decisión:** SageMaker crea el grupo `/aws/sagemaker/Endpoints/<nombre>` al encender el punto de inferencia, sin vencimiento. El servidor **no escribe datos de estudios** en la salida (solo tamaños de forma, estado y errores), así que los registros no contienen datos clínicos. Para esta entrega no se gestiona el grupo con Terraform (exigiría más permisos del operador); se documenta en la guía que, después de las pruebas, se puede fijar una retención desde la consola, y queda anotado como riesgo bajo.

## R8. Estructura de `medicia-ml`

**Decisión:** ver el árbol en [plan.md](plan.md). Puntos que importan:

- `.gitignore` bloquea `*.pt`, `*.pth`, `*.npy`, `*.npz`, `*.joblib`, `*.csv`, `*.tar.gz`, `.venv/`, `data/` y `samples/`. Los pesos y los datos nunca entran al repositorio.
- Dependencias con versiones exactas (`requirements.lock`) y la imagen se construye con esas versiones.
- Los scripts de verificación leen el conjunto de datos desde la ruta que indica el responsable (`--data-dir`), nunca desde el repositorio.
- El `README` de `medicia-ml` replica el aviso de licencia (FR-023) y no incluye datos de ningún estudio.

## R9. Verificación de paridad: cómo y cuánto cuesta

**Decisión:** tres pruebas escalonadas, de barata a cara, todas desde la máquina del responsable:

1. **Modelo en proceso contra el original:** `check_parity.py` carga el original desde un clon aparte de `IntroECG` fijado en el commit `15233e9` (fuera de ambos repositorios, por ejemplo `C:\datos\echonext\IntroECG`) importando solo `resnet1d_tabular.py` y sin Lightning. Compara las 12 probabilidades de 3 a 5 estudios de la partición de prueba. Costo: cero.
2. **Contenedor local:** `docker run --network none` con la imagen, y se envían los mismos estudios por HTTP. Prueba la validación, el contrato y el arranque sin internet. Costo: cero.
3. **Punto de inferencia real:** se enciende, `invoke_endpoint.py` envía los mismos estudios y se apaga. Costo de cómputo: `ml.t2.medium` a 0,089 USD por hora en `sa-east-1` (precios del 2026-11-09), así que una sesión de una hora cuesta menos de 0,10 USD, más unos 0,10 USD por mes de almacenamiento de la imagen. Duración estimada: 15 a 30 minutos, de los cuales 5 a 10 son el arranque.

**Tolerancia:** 0,001 por probabilidad (la del spec). Se espera que las diferencias reales sean del orden de 1e-6 (precisión de coma flotante y orden de operaciones); el valor es un tope y no una medición. Si la prueba 1 falla, no se sigue con las otras.

**Selección de estudios:** el script toma los primeros N índices de la partición de prueba (el orden de filas ya está confirmado contra los metadatos) y no imprime datos de estudios individuales: solo índices y diferencias máximas.

**Muestra de demostración para la 006:** `make_sample.py` genera un `.npz` con **solo** `waveform` y `tabular` (sin identificadores ni raza ni ubicación), para pruebas manuales. Queda fuera de ambos repositorios.

## R10. Origen de la imagen en el catálogo

**Decisión:** el módulo `model-endpoints` valida que `image_uri` pertenezca a un repositorio ECR de la cuenta y región del entorno y que la etiqueta no sea `latest`. Formato esperado: `896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-<nombre>:<versión>`. Complementa el límite de IAM: aunque otro principal pudiera apuntar a una imagen ajena, el rol de ejecución no tiene permiso para descargarla.

**Por qué:** cierra la pendiente de la 004 sobre restringir el origen de la imagen y hace que una entrada del catálogo no pueda apuntar a una imagen sin versión.

## R11. Licencia y uso

**Verificado:** el repositorio no declara licencia en GitHub; los datos están bajo la licencia de PhysioNet de datos de salud restringidos y su acuerdo de uso (los términos completos no se leyeron para este plan). Columbia tiene una solicitud de patente (#63/555,968). El uso actual es académico. **Antes de cualquier uso comercial** hay que revisar ambos. La guía lo advierte (FR-023).

## R12. Cuota y tipo de cómputo

**Verificado el 2026-11-10:** la cuota aplicada de `ml.t2.medium` para puntos de inferencia es 30. Tipo por defecto: `ml.t2.medium` (el más barato permitido por la 004). El modelo cabe de sobra (4 MB de pesos).

## Pendientes que se resuelven al implementar

- Versión exacta de PyTorch y de NumPy, y la imagen base.
- Si `weights_only=True` lee el punto de control sin cambios.
- Claves de condición de IAM disponibles para SageMaker.
- Tamaño final de las políticas de IAM.
- Lecturas adicionales que pida el proveedor de Terraform al refrescar los recursos nuevos.
- Plazo real de SC-004 (30 minutos), que se mide con la prueba 3.
