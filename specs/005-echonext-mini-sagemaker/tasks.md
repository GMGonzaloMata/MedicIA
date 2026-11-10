---

description: "Lista de tareas del modelo EchoNext-Mini en SageMaker"
---

# Tasks: Modelo EchoNext-Mini en SageMaker

**Input**: Documentos de diseño en `/specs/005-echonext-mini-sagemaker/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos. La spec exige comprobaciones automáticas (SC-002, SC-003, SC-005) y una verificación de paridad (SC-001). En este repositorio son pruebas `terraform test` en modo `plan`, con proveedor simulado. En `medicia-ml` son pruebas `pytest`.

**Organization**: Las tareas se agrupan por historia de usuario. El orden es **Setup → Fundacional (permisos) → US1 → US2 → US3 → US4 → Pulido**. US1 y US2 son código y pruebas locales en `medicia-ml`, sin costo ni AWS. US3 es lo único que crea recursos y necesita los permisos de la fase fundacional, la imagen de US1 y el artefacto de US2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US4).
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal o en la consola de AWS. El agente no corre `git commit`, `terraform apply`, `terraform destroy`, `terraform import` ni `terraform state`: se detiene en esa tarea e indica el comando exacto. Sí puede correr `terraform init -backend=false`, `fmt`, `validate`, `test` y `providers lock`. `terraform plan`, los comandos de AWS y `docker push` los corre el responsable, porque necesitan credenciales.
- **[Administrador]**: lo hace el responsable con el perfil de administración (usuario raíz con MFA), por la vía "Cambiar los permisos del operador" de `infra/README.md`.
- **[ML]**: la tarea se hace en el repositorio `medicia-ml` (`C:\Users\gonza\OneDrive\Desktop\Facultad\MedicIA-ml`). El responsable hace el `git commit` en ese repositorio.

## Path Conventions

- Infraestructura: `infra/`, según [plan.md](plan.md). No se toca `src/` ni `tests/` de la aplicación.
- Código de ML: `medicia-ml`, con la estructura del plan. Ningún `.py` de modelo entra en este repositorio.
- Los comandos de Terraform se ejecutan desde la raíz de este repositorio con `-chdir=<carpeta>` y el perfil `medicia-dev` (`$env:AWS_PROFILE = "medicia-dev"` en PowerShell).
- Estilo de Terraform: guía de HashiCorp (`terraform-style-guide`). Archivos de bloqueo con `terraform providers lock -platform=linux_amd64 -platform=windows_amd64`.
- **Datos del dataset:** el agente nunca abre los archivos del dataset. Los scripts los corre el responsable en su máquina y solo se comparten salidas agregadas (índices y diferencias). Ningún dato de estudios entra a un repositorio ni al bucket.
- **Puntos de commit:** al cerrar cada fase el agente se detiene y avisa que es un buen momento para que el responsable haga `git commit`, indicando en qué repositorio. Solo da el mensaje, no el comando.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: leer las guías, dejar listo `medicia-ml` y comprobar el punto de partida.

- [X] T001 Leer, antes de escribir HCL: las skills `terraform-style-guide`, `terraform-skill` y `terraform-test`; `.agents/reviewers/infrastructure.md`; los archivos de la 004 que se extienden (`infra/bootstrap/{operator-policy,sagemaker-boundary,github-oidc,locals}.tf`, `infra/modules/{sagemaker-execution-role,model-endpoints}/`, `infra/environments/dev/`, `.github/workflows/infra.yml`); y [research.md](research.md) y los dos contratos de esta funcionalidad.
- [X] T002 [P] Comprobar que `terraform version` informa 1.15.x y que `terraform -chdir=infra/bootstrap test`, `terraform -chdir=infra/environments/dev test` y los de cada módulo pasan sin cambios (punto de partida limpio de la 004).
- [X] T003 [Responsable] Con el perfil `medicia-dev`, ejecutar `terraform -chdir=infra/bootstrap plan` y `terraform -chdir=infra/environments/dev plan`: ambos deben informar 0 cambios antes de empezar. Confirmar con `aws sagemaker list-endpoints --region sa-east-1` que no hay nada encendido.
- [X] T004 [ML] En `medicia-ml`, confirmar que el agente puede escribir en la carpeta y borrar el placeholder `txt.txt`. Crear `.gitignore` que bloquee `*.pt`, `*.pth`, `*.npy`, `*.npz`, `*.joblib`, `*.csv`, `*.tar.gz`, `.venv/`, `data/`, `samples/` y `__pycache__/`. Crear `README.md` con el propósito del repositorio, el aviso de licencia (FR-023), los límites del modelo (FR-024) y la regla de no versionar datos ni pesos.
- [X] T005 [ML] Crear `pyproject.toml` (Python 3.11) con `torch` (CPU) y `numpy` como dependencias de ejecución, `pytest` y `pytest-cov` como dependencias de desarrollo (umbral de cobertura del 80 % de líneas, como pide la constitución), y `requirements.lock` con versiones exactas. Elegir la versión de PyTorch de la rama 2.x posterior a 2.6 con ruedas CPU para Python 3.11 y registrar la elección en `README.md` (pendiente R1 de la investigación).
- [X] T006 [P] [ML] Crear el esqueleto `src/medicia_ml/echonext/__init__.py`, `src/medicia_ml/__init__.py` y las carpetas `tests/` y `scripts/`.

---

## Phase 2: Foundational (permisos por la vía de administración)

**Purpose**: dejar escritos y probados los permisos que necesitan el operador, el rol de ejecución y el plan de CI. Ningún recurso de SageMaker o ECR puede crearse hasta que un administrador los aplique. Esta fase cubre US4 (escenarios 1 a 3); los guardas de CI y la guía están en la fase 6.

**⚠️ CRITICAL**: US3 no puede empezar hasta cerrar esta fase.

### Tests (escribirlos primero y verificar que fallan)

- [X] T007 [P] [US4] En `infra/bootstrap/tests/operator-ml.tftest.hcl`, pruebas de la política nueva `medicia-dev-terraform-operator-ml`: sin `Action: "*"` ni comodines de servicio (`sagemaker:*`, `ecr:*`, `iam:*`); `iam:PassRole` solo sobre el rol de ejecución y con la condición `iam:PassedToService = sagemaker.amazonaws.com`; sin `ecr:BatchDeleteImage`; los recursos de SageMaker acotados a `medicia-dev-*`; el tamaño de la política menor a 6144 caracteres; el `Deny` `ProtegerLasPoliticasDeAcceso` de la política actual incluye el ARN de la política nueva.
- [X] T008 [P] [US4] En `infra/bootstrap/tests/sagemaker-boundary.tftest.hcl` (ya existe), agregar las pruebas del límite: el límite y el rol de ejecución comparten la misma lista con la descarga de ECR sobre el repositorio `medicia-dev-echonext-mini`, `ecr:GetAuthorizationToken` sobre `*` y ninguna acción de ECR de escritura.
- [X] T009 [P] [US4] En `infra/bootstrap/tests/access.tftest.hcl` (ya existe), agregar las pruebas del plan de CI: las lecturas de SageMaker y ECR están presentes, enumeradas, sin acciones de escritura, y el límite `medicia-dev-boundary` las contiene.
- [X] T010 [P] [US4] En `infra/modules/sagemaker-execution-role/tests/`, agregar la prueba de que el rol concede la descarga de la imagen solo del repositorio del modelo y de que su lista coincide con la del límite.

### Implementation

- [X] T011 [US4] Crear `infra/bootstrap/operator-policy-ml.tf` con la política `medicia-dev-terraform-operator-ml` según [contracts/permissions-and-artifacts.md](contracts/permissions-and-artifacts.md): SageMaker enumerado sobre `medicia-dev-*`, listados sobre `*`, `iam:PassRole` condicionado y ECR sobre `repository/medicia-dev-*`. Medir el tamaño de la política; si supera el tope, dividirla. Confirmar con la referencia de autorización de AWS las claves de condición (`sagemaker:NetworkIsolation`, tipos de instancia) y usarlas solo donde existan (pendiente R6.1). Agregar la descripción con el aviso "no cambiar: fuerza reemplazo".
- [X] T012 [US4] En `infra/bootstrap/operator-policy.tf`, agregar el ARN de la política nueva a la sentencia `ProtegerLasPoliticasDeAcceso` y verificar que el tamaño de la política actual sigue bajo el tope.
- [X] T013 [US4] En `infra/bootstrap/sagemaker-boundary.tf` y `infra/modules/sagemaker-execution-role/main.tf`, agregar la descarga de la imagen (`ecr:BatchCheckLayerAvailability`, `ecr:GetDownloadUrlForLayer`, `ecr:BatchGetImage` sobre el repositorio del modelo, y `ecr:GetAuthorizationToken` sobre `*`). La lista es idéntica en ambos. Agregar el ARN del repositorio a `infra/bootstrap/locals.tf`.
- [X] T014 [US4] En `infra/bootstrap/github-oidc.tf`, ampliar `plan_read_statements` con las lecturas de SageMaker y ECR del contrato, sin escrituras. Descubrir con el plan cualquier lectura adicional que pida el proveedor al refrescar los recursos nuevos.
- [X] T015 [US4] Ejecutar `terraform fmt -check -recursive infra/`, `terraform validate` y `terraform test` en `infra/bootstrap` y en el módulo del rol; todas las pruebas de T007 a T010 deben pasar. Si hay archivos de bloqueo nuevos, regenerarlos con `terraform providers lock`.
- [X] T016 [Responsable] Ejecutar `terraform -chdir=infra/bootstrap plan` y revisar el resultado con el agente: esperado, una política nueva, el límite y la política del rol de ejecución modificados, el rol de plan y la política límite modificados, y nada más.
- [X] T017 [Administrador] Aplicar por la vía de administración (usuario raíz con MFA): quitar la política del operador y adjuntar `AdministratorAccess`, `terraform -chdir=infra/bootstrap apply`, adjuntar `medicia-dev-terraform-operator` y la política nueva `medicia-dev-terraform-operator-ml` a `terraform-dev`, y quitar `AdministratorAccess`. Después, `terraform -chdir=infra/bootstrap plan` debe informar 0 cambios.

**Checkpoint**: los permisos están aplicados. El operador puede gestionar SageMaker y ECR del entorno y solo pasar el rol de ejecución; el plan de CI puede leerlos. Punto de commit sugerido (repositorio principal).

---

## Phase 3: User Story 1 - Pedir una predicción y recibir las 12 probabilidades (Priority: P1) 🎯 MVP

**Goal**: un servidor de inferencia en una imagen que carga `weights.pt`, valida la entrada y devuelve 12 probabilidades en orden fijo, probado en local sin internet.

**Independent Test**: con un modelo cargado, un estudio válido devuelve 12 probabilidades entre 0 y 1 en el orden documentado, el mismo estudio dos veces da la misma respuesta, y cada entrada inválida devuelve 400 sin probabilidades.

### Tests (escribirlos primero y verificar que fallan)

- [X] T018 [P] [US1] [ML] En `tests/test_contract.py`, pruebas del contrato: el orden de las 12 salidas, el orden de las 7 variables y los nombres coinciden exactamente con [contracts/inference-api.md](contracts/inference-api.md) y [data-model.md](data-model.md).
- [X] T019 [P] [US1] [ML] En `tests/test_validation.py`, pruebas de entradas inválidas (FR-003, SC-002): onda de otra forma o transpuesta, menos o más de 7 variables, NaN e infinitos en la onda y en las variables, sexo distinto de 0 y 1, tipos no numéricos, campos faltantes y cuerpo no JSON. Cada caso produce un mensaje claro que no repite valores del estudio.
- [X] T020 [P] [US1] [ML] En `tests/test_model.py`, pruebas de la arquitectura con pesos aleatorios: forma de salida `(N, 12)`, nombres y formas del `state_dict` según [research.md](research.md) R3, carga con `strict=True` y determinismo (misma entrada, misma salida) en modo `eval`.
- [X] T021 [P] [US1] [ML] En `tests/test_serve.py`, pruebas del servidor con un modelo de pesos aleatorios: `GET /ping`, `POST /invocations` válido, 400, 413 y 415, formato exacto de la respuesta y que los registros no contienen valores del estudio.

### Implementation

- [X] T022 [US1] [ML] Crear `src/medicia_ml/echonext/contract.py` con el orden de las 12 salidas, el orden de las 7 variables, la forma de la onda y las constantes del contrato. Es la única fuente de esos valores.
- [X] T023 [US1] [ML] Crear `src/medicia_ml/echonext/model.py` con la arquitectura `ResNet1dWithTabular` reescrita de forma independiente (R3), con los nombres de módulos que hacen coincidir el `state_dict` (`conv1`, `bn1`, `layer1` a `layer4`, `output`, y los bloques `conv1`, `bn1`, `conv2`, `bn2`, `downsample`). No se copia código del repositorio original.
- [X] T024 [US1] [ML] Crear `src/medicia_ml/echonext/predict.py`: carga de `weights.pt` con `weights_only=True`, clave `"model"`, `strict=True`, `model.eval()` y `torch.no_grad()`; conversión a `float32`; `sigmoid` sobre los logits. Si `weights_only=True` no puede leer el punto de control, documentar la conversión única a un `state_dict` solo con tensores (pendiente de R3).
- [X] T025 [US1] [ML] Crear `src/medicia_ml/serve.py`: servidor HTTP en el puerto 8080, con los pesos leídos de `/opt/ml/model/weights.pt` (la ruta donde SageMaker descomprime el artefacto) con `GET /ping` y `POST /invocations`, validación de entrada con los códigos y mensajes del contrato, tope de cuerpo de 2 MB, versión del modelo leída de una variable de entorno, y registros que no incluyen datos del estudio. El arranque falla de forma explícita si el modelo no carga.
- [X] T026 [US1] [ML] Crear el `Dockerfile` (Python 3.11 slim, `linux/amd64`, dependencias de `requirements.lock`, usuario sin privilegios, sin instalar nada al arrancar, `ENTRYPOINT` que ignora el argumento `serve` que pasa SageMaker) y `.dockerignore` que excluya pesos, datos y `tests/`.
- [X] T027 [US1] [ML] Ejecutar `pytest --cov=medicia_ml --cov-fail-under=80` hasta que T018 a T021 pasen con al menos 80 % de cobertura de líneas.

**Checkpoint**: el servidor responde y valida, con pesos aleatorios, en pruebas automáticas. Todavía no se sabe si reproduce al modelo real: eso es US2. Punto de commit sugerido (`medicia-ml`).

---

## Phase 4: User Story 2 - Comprobar que el modelo reproduce al original (Priority: P1)

**Goal**: el modelo reescrito, con los pesos reales, da las mismas 12 probabilidades que el código original sobre 3 a 5 estudios de prueba, y el artefacto queda empaquetado.

**Independent Test**: `check_parity.py` informa una diferencia máxima menor a 0,001 en las 12 salidas para todos los estudios elegidos, todos de la partición de prueba.

### Implementation

- [X] T028 [Responsable] Clonar `PierreElias/IntroECG` en el commit `15233e9392e9dc10c136a5624abf10199207bce9` en `C:\datos\echonext\IntroECG`. Los pesos (`weights.pt`), el transformador (`tabular_transformer.joblib`) y los parámetros (`waveform_normalization_params.json`) están en su carpeta `7-EchoNext Minimodel/models/echonext_multilabel_minimodel/`; copiarlos a `C:\datos\echonext\model\`, fuera de ambos repositorios. Nada de esto se versiona.
- [X] T029 [US2] [ML] Crear `scripts/check_parity.py`: carga el original importando solo `resnet1d_tabular.py` del clon (sin Lightning), carga el modelo reescrito, lee N estudios de la partición de prueba desde `--data-dir` (por defecto 5, índices explícitos opcionales) y compara las 12 probabilidades. Solo imprime índices y diferencias máximas, nunca datos de estudios. Guarda las 12 probabilidades de referencia del original de cada estudio en `--reference-out` (por defecto `C:\datos\echonext
eference.json`, fuera de ambos repositorios) para que T042 y T047 las lean sin volver a cargar el original; son salidas del modelo, no datos de los estudios. Falla si alguna diferencia supera 0,001. Verifica que los índices pertenezcan a la partición de prueba.
- [X] T030 [US2] [ML] Crear `scripts/package_artifacts.py`: arma `model.tar.gz` con `weights.pt`, `tabular_transformer.joblib`, `waveform_normalization_params.json` y `MANIFEST.json` (versión, SHA-256 de cada archivo, versión del código) en la raíz del archivo, y se niega a empaquetar si encuentra archivos que no sean esos cuatro. Pruebas en `tests/test_package.py` con archivos sintéticos.
- [X] T031 [US2] [ML] Crear `scripts/make_sample.py`: genera un `.npz` de demostración con solo `waveform` y `tabular` de un estudio de la partición de prueba, sin identificadores, raza ni ubicación, y un archivo aparte con las etiquetas reales para la comparación fuera de la interfaz. Los escribe fuera del repositorio.
- [X] T032 [Responsable] Ejecutar `scripts/check_parity.py` con 3 a 5 estudios de prueba desde la máquina del responsable y pegar al agente solo la salida (índices y diferencias). Esperado: diferencia máxima menor a 0,001 en el 100 % de los casos (SC-001). Si falla, se corrige T023 o T024 antes de seguir.
- [X] T033 [Responsable] Ejecutar `scripts/package_artifacts.py` para generar `model.tar.gz` de la versión `0.1.0` en una carpeta fuera de los repositorios y anotar la huella SHA-256.

**Checkpoint**: la reescritura reproduce al original y el artefacto está listo para subir. Punto de commit sugerido (`medicia-ml`).

---

## Phase 5: User Story 3 - Encender y apagar el modelo controlando el costo (Priority: P2)

**Goal**: el repositorio de imágenes, el artefacto y la entrada del catálogo existen; el modelo nace apagado, se enciende con un cambio revisable, responde igual que en local y se apaga.

**Independent Test**: con el modelo apagado el plan propone el modelo y su configuración pero ningún punto de inferencia; al encenderlo propone exactamente uno; al apagarlo quita solo ese.

### Tests (escribirlos primero y verificar que fallan)

- [X] T034 [P] [US3] En `infra/modules/model-registry/tests/registry.tftest.hcl`, pruebas del repositorio: etiquetas inmutables, escaneo al subir, cifrado, política de ciclo de vida de las últimas 10 imágenes, `force_delete = false`, nombre con prefijo `medicia-dev-` (las etiquetas obligatorias del proyecto vienen de `default_tags` y las cubre la guarda de etiquetas de CI).
- [X] T035 [P] [US3] En `infra/modules/model-endpoints/tests/`, pruebas del origen de la imagen (R10): se rechaza `image_uri` de otra cuenta, otra región, otro repositorio, sin etiqueta o con `latest`; se acepta el formato del contrato.
- [X] T036 [P] [US3] En `infra/environments/dev/tests/catalog.tftest.hcl` (ya existe), agregar (se ejecutan en T044, cuando existe la entrada): con la entrada `echonext-mini` por defecto el plan propone 1 modelo, 1 configuración y 0 puntos de inferencia; con `enabled = true` exactamente 1; el modelo, la configuración y el punto de inferencia llevan la etiqueta `ModelVersion`; el aislamiento de red está activo; el tipo de cómputo por defecto es `ml.t2.medium`.

### Implementation

- [X] T037 [US3] Crear el módulo `infra/modules/model-registry/` (`main.tf`, `variables.tf`, `outputs.tf`, `terraform.tf`) con el repositorio ECR del contrato, y conectarlo en `infra/environments/dev/main.tf`. Salidas: URL del repositorio y su ARN.
- [X] T038 [US3] En `infra/modules/model-endpoints/variables.tf`, agregar la validación del origen de la imagen (R10) con la cuenta y la región del entorno.
- [X] T039 [US3] Ejecutar `terraform fmt`, `validate` y `test` en los módulos y en `infra/environments/dev`; T034, T035 y la parte de T036 que no depende de la entrada `echonext-mini` deben pasar. El resto de T036 se ejecuta en T044.
- [X] T040 [Responsable] Con el perfil `medicia-dev`, ejecutar `terraform -chdir=infra/environments/dev plan`: esperado, el repositorio ECR nuevo y la modificación de la política en línea del rol de ejecución (T013), y nada más. Revisar con el agente y aplicar: `terraform -chdir=infra/environments/dev apply`.
- [X] T041 [Responsable] Subir el artefacto con el perfil del operador: `aws s3 cp <ruta>/model.tar.gz s3://medicia-models-dev-896618135592/echonext-mini/0.1.0/model.tar.gz --region sa-east-1`. Confirmar la huella con la del manifiesto.
- [X] T042 [US3] [Responsable] Construir y probar la imagen: `docker build --platform linux/amd64`, y con `docker run --network none` montando los pesos de solo lectura, probar `/ping`, un estudio válido (comparado con `reference.json` de T029, tolerancia 0,001) y las entradas inválidas (SC-002). Pegar al agente solo la salida agregada.
- [X] T043 [Responsable] Subir la imagen: autenticarse en ECR con el perfil del operador, etiquetar con `0.1.0` y `docker push`. Confirmar que el escaneo al subir no informa vulnerabilidades críticas; si las hay, decidirlo con el agente antes de seguir.
- [X] T044 [US3] Agregar la entrada `echonext-mini` al catálogo en `infra/environments/dev/` (`image_uri`, `model_data_key`, `model_version = "0.1.0"`, `instance_type = "ml.t2.medium"`, `enabled = false`) y ejecutar `terraform test`.
- [X] T045 [Responsable] Ejecutar `terraform plan` (esperado: 1 modelo y 1 configuración nuevos, 0 puntos de inferencia, nada más) y aplicar. Confirmar con `aws sagemaker list-endpoints --region sa-east-1` que no hay nada encendido.
- [X] T046 [Responsable] Encender: cambiar `enabled = true` en el catálogo, `terraform plan` (esperado: exactamente 1 punto de inferencia) y aplicar. Esperar entre 5 y 10 minutos hasta que el estado sea `InService`. Anotar la hora de inicio.
- [X] T047 [US3] [ML] Crear `scripts/invoke_endpoint.py`: envía N estudios al punto de inferencia con `InvokeEndpoint`, compara con `reference.json` (T029) con la tolerancia de 0,001, y prueba una entrada inválida. Solo imprime índices, diferencias y el estado de la entrada inválida.
- [X] T048 [Responsable] Ejecutar `scripts/invoke_endpoint.py` con los mismos estudios que T032 (SC-001 sobre el punto de inferencia real). Anotar la hora de fin. SC-004 se mide desde el inicio de T041 (subir el artefacto) hasta el fin de T049 (apagado), con la imagen ya subida; el tiempo de construir y subir la imagen se registra aparte.
- [X] T049 [Responsable] Apagar: `enabled = false`, `terraform plan` (esperado: se quita solo el punto de inferencia, sin tocar el bucket, el rol, el modelo ni el repositorio) y aplicar. Confirmar con `aws sagemaker list-endpoints --region sa-east-1` que no queda nada encendido.

**Checkpoint**: el modelo vive en SageMaker, se probó de punta a punta y volvió a quedar apagado. Punto de commit sugerido (repositorio principal y `medicia-ml`).

---

## Phase 6: User Story 4 - Revisar cada cambio y documentar (Priority: P2)

**Goal**: las comprobaciones de CI, la guía y el registro de resultados están en su lugar, y los cambios pasaron por revisión.

**Independent Test**: una propuesta que incumple una regla (comodín, punto de inferencia encendido sin pedirlo, GPU, imagen ajena, artefacto versionado) falla las comprobaciones, y la guía permite repetir todo sin pasos no documentados.

- [X] T050 [P] [US4] En `.github/workflows/infra.yml`, extender las guardas de la 004: falla si una entrada del catálogo tiene `image_uri` fuera del repositorio del entorno o con `latest`, si el plan crea más de un punto de inferencia por modelo, y si aparecen permisos de SageMaker o ECR con comodín. Confirmar que siguen vigentes la guarda de costo, la de `prevent_destroy` y la de extensiones de pesos (FR-020).
- [X] T051 [P] [US4] En `.github/workflows/ci.yml` y `.gitignore` de este repositorio, confirmar que bloquean `*.pt`, `*.npy`, `*.npz`, `*.joblib` y `*.tar.gz` y que ningún archivo del dataset puede versionarse (SC-005).
- [X] T052 [US4] Documentar en `infra/README.md` una sección "Modelo EchoNext-Mini": orden de los pasos (FR-021), cómo armar y subir el artefacto y la imagen, cómo encender y apagar, cómo ver qué hay encendido y el apagado de emergencia, el costo por hora, día y mes de `ml.t2.medium` (0,089 USD por hora, 2,14 por día, 64,97 por mes, precios del 2026-11-09), el formato de entrada y el orden de las 12 salidas (enlazando a [contracts/inference-api.md](contracts/inference-api.md)), los límites del modelo (FR-024), la advertencia de que las probabilidades pueden no estar calibradas y el aviso de licencia (FR-023). Incluir una lista previa al encendido: artefacto presente en el bucket, imagen presente en el repositorio con la etiqueta del catálogo, cuota de `ml.t2.medium` disponible (repetirla si se cambia de tipo) y nada más encendido.
- [X] T053 [US4] Actualizar `specs/004-infra-sagemaker-modelos/spec.md` (FR-008) y `research.md` (R10) para reflejar la ampliación de lecturas del plan y del límite de la aplicación (FR-019), y `memory/architecture.md` y `memory/project-structure.md` para reflejar el repositorio `medicia-ml`, el repositorio ECR y el nuevo módulo.
- [X] T054 [US4] Registrar los resultados de la verificación, con fecha, en `specs/005-echonext-mini-sagemaker/quickstart.md` (sección "Resultados"): índices de estudios, diferencia máxima, tiempo de SC-004 y costo real. Sin datos de estudios individuales (FR-022).
- [X] T055 [US4] Ejecutar la skill `review-changes` sobre `infra/` y `.github/` con los revisores de infraestructura y seguridad, corregir los hallazgos bloqueantes y repetir una vez el revisor afectado. Ejecutar `npm run check` antes de dar el cambio por terminado.

**Checkpoint**: comprobaciones, guía y revisión en su lugar. Punto de commit sugerido.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [X] T056 [P] [ML] Revisión final de `medicia-ml`: `README.md` completo, `pytest` en verde, `.gitignore` verificado con `git status` y una búsqueda de extensiones prohibidas en el historial.
- [X] T057 [P] Búsqueda automática de datos del dataset en ambos repositorios y en el bucket (`aws s3 ls --recursive` del bucket de modelos: solo debe haber `echonext-mini/0.1.0/model.tar.gz`) (SC-005).
- [ ] T058 Ejecutar el recorrido completo de [quickstart.md](quickstart.md) de punta a punta con otra persona o con una lectura en frío, y corregir cualquier paso no documentado (SC-004, SC-006).
- [ ] T059 [Responsable] Una semana después de apagar el modelo, revisar la facturación de AWS: sin cargos de cómputo de SageMaker. Anotar el resultado en la guía.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de Setup. Bloquea US3. No bloquea US1 ni US2, que son locales.
- **US1 (Phase 3)**: depende de T004 a T006. Puede avanzar en paralelo con la Fase 2 (el código de ML y la administración de permisos no comparten archivos).
- **US2 (Phase 4)**: depende de US1 (necesita el modelo reescrito) y de T028 (pesos y clon del original).
- **US3 (Phase 5)**: depende de la Fase 2 aplicada (T017), de la imagen de US1 (T026) y del artefacto de US2 (T033).
- **US4 (Phase 6)**: las guardas y la guía pueden empezar cuando existe el módulo (T037); los resultados (T054) dependen de US3.
- **Pulido (Phase 7)**: depende de todo lo anterior; T059 espera una semana.

### Dentro de cada historia

- Las pruebas se escriben primero y deben fallar.
- Contrato y arquitectura antes que servidor; módulos de Terraform antes que la entrada del catálogo.
- Lo que cuesta dinero (T046 a T049) va al final y se apaga de inmediato.

### Parallel Opportunities

- T002, T006 en Setup.
- T007 a T010 (pruebas de permisos) entre sí.
- T018 a T021 (pruebas de ML) entre sí.
- Fase 2 y Fase 3 pueden avanzar a la par.
- T034 a T036 entre sí; T050 y T051 entre sí.

---

## Parallel Example: Foundational

```text
Task: "Pruebas de la política nueva del operador en infra/bootstrap/tests/operator-ml.tftest.hcl"
Task: "Pruebas del límite del rol de ejecución en infra/bootstrap/tests/sagemaker-boundary.tftest.hcl"
Task: "Pruebas del plan de CI en infra/bootstrap/tests/access.tftest.hcl"
Task: "Pruebas del rol de ejecución en infra/modules/sagemaker-execution-role/tests/"
```

---

## Implementation Strategy

### MVP primero (US1 + US2)

1. Setup, luego US1 (servidor probado) y US2 (paridad contra el original, 3 a 5 estudios), todo local y sin costo.
2. **Detenerse y validar:** si la paridad falla, se corrige acá, antes de gastar en AWS.
3. En paralelo, la Fase 2 (permisos) para que la nube esté lista.

### Entrega incremental

1. US3 despliega el modelo apagado, lo enciende para probar y lo apaga.
2. US4 deja las guardas, la guía y la revisión.
3. Pulido y la revisión de facturación a la semana.

### Orden de commits

- Repositorio principal: después de la Fase 2, después de la Fase 5 y después de la Fase 6.
- `medicia-ml`: después de la Fase 3 y de la Fase 4 (y los cambios de T047 al cerrar la Fase 5).

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] relaciona la tarea con la historia de la spec para la trazabilidad.
- Ningún comando de la lista reservada (`git commit`, `terraform apply`, `destroy`, `import`, `state`, Prisma) lo ejecuta el agente.
- El agente nunca abre los archivos del dataset. Los scripts de verificación los corre el responsable y solo se comparten índices y diferencias.
- Si T032 falla, no se avanza a US3: un modelo mal reproducido no se despliega.
- Evaluar los 5.442 estudios de prueba queda fuera de esta lista, a cargo del responsable más adelante (FR-015).
