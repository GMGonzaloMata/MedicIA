# Implementation Plan: Modelo EchoNext-Mini en SageMaker

**Branch**: `feat/echonext-mini` (especificación en `specs/005-echonext-mini-sagemaker`) | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/005-echonext-mini-sagemaker/spec.md`

## Summary

Dejar EchoNext-Mini disponible como primer modelo real del catálogo de la 004. El trabajo se reparte en dos repositorios, como exige la constitución (el código Python/PyTorch vive fuera de este):

- **Este repositorio (`infra/`, Terraform):** un repositorio de imágenes en ECR (módulo nuevo `model-registry`), la entrada `echonext-mini` del catálogo (apagada), el permiso del rol de ejecución para descargar la imagen, los permisos nuevos del operador (SageMaker, `iam:PassRole`, ECR) y las lecturas de SageMaker y ECR para el plan de CI. Los permisos se aplican por la vía de administración de la 003.
- **`medicia-ml` (repositorio separado):** la arquitectura del modelo reescrita (solo PyTorch y NumPy), el servidor de inferencia, el `Dockerfile` de la imagen, el armado del paquete de artefactos y los scripts de verificación.

Decisiones centrales (detalle en [research.md](research.md)): imagen propia pequeña en lugar del contenedor de PyTorch de SageMaker; solicitud y respuesta en JSON; el punto de inferencia **no** aplica normalización (el conjunto de datos ya viene normalizado) y solo carga `weights.pt`; arquitectura reescrita de forma independiente (el código original no declara licencia) y comparada contra el original, sin copiarlo, con 3 a 5 estudios de prueba.

## Technical Context

**Language/Version**: Terraform 1.15.x con `hashicorp/aws ~> 6.72` (igual que la 004). En `medicia-ml`: Python 3.11, PyTorch (solo CPU) y NumPy con versiones exactas fijadas al implementar.

**Primary Dependencies**: infraestructura, módulos de la 004 (`model-artifacts`, `sagemaker-execution-role`, `model-endpoints`) más un módulo nuevo `model-registry`. Inferencia: `torch` (CPU) y `numpy`; sin Lightning, scikit-learn, MLflow ni AzureML.

**Storage**: bucket de artefactos de la 004 (`medicia-models-dev-896618135592`) para `model.tar.gz`; repositorio ECR `medicia-dev-echonext-mini` para la imagen. Ningún dato de estudios en ninguno de los dos.

**Testing**: `terraform test` (modo plan, proveedor simulado) para el módulo nuevo, el catálogo y las políticas; `terraform validate` y `fmt`. En `medicia-ml`: `pytest` (arquitectura, validación de entrada, determinismo, contrato) y el procedimiento de verificación de paridad con 3 a 5 estudios.

**Target Platform**: SageMaker en `sa-east-1`, punto de inferencia en tiempo real, una instancia `ml.t2.medium` (CPU) con aislamiento de red. Imagen `linux/amd64`.

**Project Type**: infraestructura como código + paquete de inferencia en un repositorio aparte.

**Performance Goals**: una solicitud por estudio; latencia de segundos en CPU es aceptable (el modelo pesa 4,27 MB). Encender el punto de inferencia tarda entre 5 y 10 minutos.

**Constraints**: sin acceso a internet dentro del contenedor; tipos de cómputo solo CPU de la 004; sin comodines en IAM; tope de 6144 caracteres por política administrada; los comandos reservados (`terraform apply`, `git commit`, etc.) los ejecuta el responsable.

**Scale/Scope**: un modelo, una instancia, un operador. 12 salidas. Sin tráfico de usuarios hasta la 006.

## Constitution Check

*GATE: pasa antes de la investigación; se vuelve a evaluar después del diseño.*

- **I. Apoyo clínico, no diagnóstico:** PASA. La respuesta son probabilidades de posible hallazgo, sin etiquetas ni umbrales; la guía advierte que pueden no estar calibradas (FR-005).
- **II. Aislamiento multi-tenant:** PASA, no aplica todavía. No hay datos de clínicas en esta entrega. El bucket de estudios (por clínica) llega con la 006.
- **III. Arquitectura hexagonal:** PASA, sin cambios en `src/`. El contrato de la respuesta ([contracts/inference-api.md](contracts/inference-api.md)) es lo que consumirá un adaptador de la 006.
- **IV. Trazabilidad:** PASA. La respuesta incluye `model_version` y los recursos llevan la versión como etiqueta (FR-012); la 006 la guardará en cada análisis.
- **V. Extensibilidad por modelo:** PASA. Es una entrada más del catálogo; sumar un modelo no cambia el flujo general.
- **VI. Datos clínicos:** PASA. Los datos del conjunto nunca van a los repositorios ni al bucket (FR-022); la verificación corre en la máquina del responsable.
- **VII. Interfaz:** no aplica.
- **VIII. Código limpio, tipado:** el código de la aplicación no cambia. El código Python tiene sus propias pruebas en `medicia-ml`; los datos externos (el cuerpo de la solicitud) se validan al entrar (FR-003).
- **Restricciones técnicas, "Límites de responsabilidad":** PASA. El código Python/PyTorch vive en `medicia-ml`, no en este repositorio.
- **Flujo de desarrollo:** PASA. Las pruebas de Terraform van en `tests/` de cada módulo o raíz, como permite la constitución.

Re-evaluación posterior al diseño: sin violaciones. La única decisión que merece justificación es crear un segundo repositorio, que la propia constitución obliga.

## Project Structure

### Documentation (this feature)

```text
specs/005-echonext-mini-sagemaker/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── inference-api.md
│   └── permissions-and-artifacts.md
└── tasks.md              # lo genera speckit-tasks
```

### Source Code (este repositorio)

```text
infra/
├── bootstrap/
│   ├── operator-policy.tf        # protege con Deny la política nueva del operador
│   ├── operator-policy-ml.tf     # NUEVO: segunda política administrada (SageMaker, PassRole, ECR)
│   ├── sagemaker-boundary.tf     # + descarga de la imagen desde ECR
│   ├── github-oidc.tf            # + lecturas de SageMaker y ECR para el plan (y su límite)
│   └── tests/                    # pruebas de las políticas
├── modules/
│   ├── model-registry/           # NUEVO: repositorio ECR (etiquetas inmutables, escaneo, ciclo de vida)
│   ├── sagemaker-execution-role/ # + permiso de descarga de la imagen
│   └── model-endpoints/          # + validación del origen de la imagen
└── environments/dev/
    ├── main.tf                   # + módulo model_registry y entrada echonext-mini
    └── tests/catalog.tftest.hcl
```

### Source Code (repositorio `medicia-ml`, fuera de este)

```text
MedicIA-ml/
├── README.md
├── .gitignore                    # *.pt, *.npy, *.npz, *.joblib, *.csv, entornos virtuales
├── pyproject.toml / requirements.lock   # versiones exactas
├── Dockerfile
├── src/medicia_ml/
│   ├── echonext/model.py         # arquitectura reescrita
│   ├── echonext/contract.py      # orden de entradas y de las 12 salidas
│   ├── echonext/predict.py       # carga de weights.pt y predicción
│   └── serve.py                  # /ping y /invocations
├── scripts/
│   ├── package_artifacts.py      # arma model.tar.gz
│   ├── make_sample.py            # arma el .npz de demostración (solo onda y 7 variables)
│   ├── check_parity.py           # compara con el código original (clon aparte, fijado por commit)
│   └── invoke_endpoint.py        # envía un estudio al punto de inferencia
└── tests/
```

**Structure Decision**: la infraestructura sigue la estructura de la 003 y la 004 (módulos chicos y una raíz por entorno). Todo el código de ML va a `medicia-ml`. La carpeta local de ese repositorio (`C:\Users\gonza\OneDrive\Desktop\Facultad\MedicIA-ml`) se agregó como directorio de trabajo de la sesión.

## Complexity Tracking

Sin violaciones de la constitución que justificar. Dos decisiones que agregan piezas, con su motivo:

- **Segunda política administrada para el operador.** Hace falta porque la política actual está cerca del tope de 6144 caracteres y SageMaker, `PassRole` y ECR no entran. Se descartó ampliar la política única porque se pasaría del tope.
- **Imagen propia y repositorio ECR.** Da control total de las dependencias, arranque sin internet y una prueba local idéntica a la nube. Se descartó el contenedor de PyTorch de AWS: imagen de varios GB, TorchServe y el código empaquetado dentro del artefacto.
