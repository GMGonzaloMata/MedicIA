# Implementation Plan: Infraestructura base de SageMaker

**Branch**: `004-infra-sagemaker-modelos` | **Date**: 2026-11-09 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/004-infra-sagemaker-modelos/spec.md`

## Summary

Se agrega a `infra/` la base sobre la que más adelante se desplegarán los modelos de ECG, sin desplegar ninguno: un bucket privado y cifrado para los artefactos, el rol de ejecución de SageMaker con su propio límite de permisos y una estructura de catálogo de modelos cuyos puntos de inferencia nacen apagados. La aplicación no cambia y esta entrega no crea cómputo: el costo esperado es de centavos de almacenamiento.

El enfoque técnico, resuelto en [research.md](research.md):

- **Tres módulos nuevos, cada uno con una sola responsabilidad:** `model-artifacts` (bucket), `sagemaker-execution-role` (rol) y `model-endpoints` (catálogo y puntos de inferencia). La raíz `environments/dev` los llama; el catálogo es la variable `models`, vacía por defecto.
- **Interruptor por entrada:** el modelo y su configuración se crean con la entrada, pero el punto de inferencia (lo único que cobra) existe solo con `enabled = true`. Apagar es cambiar un valor y borra solo el punto de inferencia.
- **Solo CPU, tres tipos permitidos:** `ml.t2.medium`, `ml.c5.large` y `ml.m5.large`, validados en el módulo. Los costos por hora, por día y por mes salen de la lista de precios oficial de AWS para `sa-east-1` del 2026-11-09 (R7).
- **Permisos por la vía de administración de la 003:** `infra/bootstrap` suma la política límite `medicia-dev-sagemaker-boundary`, acota la política del operador (puede crear solo el rol de ejecución con ese límite, y subir y leer artefactos sin borrarlos) y amplía la lectura del plan de CI. Lo aplica un administrador, no el operador.
- **Todo verificado sin crear recursos:** `terraform test` en modo `plan` con proveedor simulado, en cada módulo, en la raíz del entorno y en `bootstrap`. El flujo de CI existente suma los directorios nuevos y una guarda de costo.
- **Aplicar sigue siendo del responsable:** ninguna automatización ejecuta `apply`, `destroy`, `import` ni `state`.

## Technical Context

**Language/Version**: Terraform 1.15.x (`required_version = "~> 1.15"`; instalado: 1.15.1). HCL. Flujo de GitHub Actions en YAML.

**Primary Dependencies**: proveedor `hashicorp/aws` `~> 6.72`, el mismo de la 003. Sin proveedores nuevos. En CI, las mismas acciones fijadas por versión exacta.

**Storage**: bucket de S3 `medicia-models-dev-896618135592` (SSE-S3, versiones, TLS obligatorio, sin acceso público). El estado sigue en el bucket de la 003, bajo la clave del entorno `dev`. La base de datos de la aplicación no cambia.

**Testing**: `terraform test` en modo `plan` con `mock_provider "aws"` en `modules/model-artifacts`, `modules/sagemaker-execution-role`, `modules/model-endpoints`, `environments/dev` y `bootstrap`. `terraform fmt`, `validate`, `tflint`, `trivy config` y `trivy fs --scanners secret` sobre `infra/`. La subida real de un artefacto y la lectura con el rol se prueban a mano (escenarios de la guía).

**Target Platform**: AWS, cuenta de desarrollo `896618135592`, región `sa-east-1`. El operador usa Windows con PowerShell y el perfil `medicia-dev` de la CLI.

**Project Type**: infraestructura como código dentro de un monolito Next.js. No agrega código de aplicación.

**Performance Goals**: crear la base en menos de 20 minutos siguiendo la guía (SC-001); una segunda ejecución propone 0 cambios (SC-002).

**Constraints**: ningún secreto, estado, plan guardado ni artefacto en git; solo el responsable aplica; costo adicional menor a 1 USD al mes con todo apagado (SC-003); sin cómputo en esta entrega; sin permisos de SageMaker para el operador hasta el primer modelo (R5).

**Scale/Scope**: un entorno, un operador, un bucket, un rol y un catálogo vacío. Desplegar modelos, S3 de estudios, RDS, EC2, producción, SES y dominio quedan fuera.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Constitución v1.6.1.

- **I. Apoyo clínico, no diagnóstico:** no se genera ni presenta ningún resultado clínico. La guía repite que todo resultado de un modelo es un posible hallazgo (FR-022). **Pasa.**
- **II. Aislamiento multi-tenant:** no hay datos de clínicas. El bucket queda reservado a artefactos de modelos y es privado, y el rol de ejecución no puede leer ningún otro bucket, para no exponer los estudios que vendrán. El acceso a datos de pacientes por clínica es de otra funcionalidad. **Pasa.**
- **III. Arquitectura hexagonal pragmática:** no se toca `src/`. Cada módulo de Terraform responde a una necesidad concreta: `model-endpoints` existe porque agregar un modelo debe ser una entrada y no código nuevo (FR-010); no se agregan capas más. **Pasa.**
- **IV. Trazabilidad de los análisis:** cada entrada del catálogo exige `model_version`, que se etiqueta en el modelo y el punto de inferencia para que un análisis futuro pueda registrar la versión exacta usada. **Pasa.**
- **V. Extensibilidad por estudio y modelo:** sumar un modelo es sumar una entrada al catálogo, sin tocar el bucket, el rol ni el flujo general (FR-010). **Pasa.**
- **VI. Tratamiento responsable de datos clínicos:** no se aprovisiona ningún dato clínico. La guía exige revisar la licencia de modelos restringidos antes de subirlos (FR-022). **Pasa.**
- **VII y VIII (interfaz, código de aplicación):** no aplican. El HCL se verifica con formato, validación, `tflint`, `trivy` y pruebas. **Pasa.**
- **Stack aprobado:** Terraform en `infra/`, estado remoto cifrado y con bloqueo, nunca en git, y `apply`, `destroy`, `import` y `state` solo del responsable. SageMaker AI es la inferencia aprobada. **Pasa.**
- **Flujo de calidad:** sigue Spec Kit. Las pruebas de Terraform viven en la carpeta `tests/` de su módulo o raíz, según la excepción de la v1.6.1. `npm run check` no cambia porque no se toca código de la aplicación. **Pasa.**
- **Comandos reservados:** el plan no usa `git commit`, Prisma ni `terraform apply`. Los pasos que modifican AWS quedan escritos como comandos para el responsable. **Pasa.**

**Resultado:** sin violaciones. No hace falta la sección de complejidad.

**Ampliación del límite del rol de plan (decidida por el responsable el 2026-11-09):** el plan de CI necesita leer el bucket y el rol nuevos, y el límite es el techo de ese rol. Se amplía el techo solo con lecturas enumeradas de esos dos recursos, sin escrituras ni comodines, y los permisos efectivos de la aplicación no cambian (R4). FR-008 y FR-019 de la especificación se ajustaron para reflejarlo.

**Re-evaluación posterior al diseño:** sin cambios. El diseño agrega una política límite y acota la política del operador con condiciones más estrictas que las existentes; no introduce ninguna violación.

## Project Structure

### Documentation (this feature)

```text
specs/004-infra-sagemaker-modelos/
├── plan.md              # Este archivo
├── research.md          # Fase 0: decisiones, costos y pendientes de verificar
├── data-model.md        # Fase 1: recursos, atributos y relaciones
├── quickstart.md        # Fase 1: recorrido de validación
├── contracts/
│   ├── model-catalog.md          # Contrato del catálogo y del interruptor
│   └── access-and-permissions.md # Permisos de cada identidad y orden de los pasos
├── checklists/
│   └── requirements.md
└── tasks.md             # Fase 2: lo genera speckit-tasks
```

### Source Code (repository root)

```text
infra/
├── README.md                          # MODIFICADO: base de SageMaker, costos, permisos y orden (FR-021)
├── bootstrap/                         # MODIFICADO: lo aplica un administrador
│   ├── sagemaker-boundary.tf          # NUEVO: política límite medicia-dev-sagemaker-boundary
│   ├── operator-policy.tf             # MODIFICADO: rol de ejecución con su límite, bucket de modelos, Deny del límite nuevo
│   ├── github-oidc.tf                 # MODIFICADO: lectura del plan sobre el bucket y el rol nuevos
│   ├── locals.tf                      # MODIFICADO: nombre y ARN del bucket de modelos
│   └── tests/
│       ├── access.tftest.hcl          # MODIFICADO: operador y rol de plan
│       └── sagemaker-boundary.tftest.hcl  # NUEVO: techo del rol de ejecución
├── modules/
│   ├── identity/                      # SIN CAMBIOS
│   ├── model-artifacts/               # NUEVO: bucket privado de artefactos
│   │   ├── terraform.tf
│   │   ├── variables.tf
│   │   ├── main.tf
│   │   ├── outputs.tf
│   │   └── tests/model-artifacts.tftest.hcl
│   ├── sagemaker-execution-role/      # NUEVO: rol de ejecución con permiso mínimo
│   │   ├── terraform.tf
│   │   ├── variables.tf
│   │   ├── main.tf
│   │   ├── outputs.tf
│   │   └── tests/execution-role.tftest.hcl
│   └── model-endpoints/               # NUEVO: catálogo, modelos y puntos de inferencia
│       ├── terraform.tf
│       ├── variables.tf
│       ├── main.tf
│       ├── outputs.tf
│       └── tests/model-endpoints.tftest.hcl
└── environments/
    └── dev/
        ├── main.tf                    # MODIFICADO: llama a los tres módulos nuevos
        ├── variables.tf               # NUEVO: variable models (catálogo, vacío)
        ├── outputs.tf                 # MODIFICADO: bucket, rol y puntos de inferencia encendidos
        └── tests/catalog.tftest.hcl   # NUEVO: catálogo vacío propone 0 modelos y 0 puntos

.github/workflows/
└── infra.yml                          # MODIFICADO: directorios nuevos y guarda de costo
```

También se modifican archivos existentes:

- `memory/project-structure.md` y `memory/architecture.md`: reflejan los módulos nuevos y el flujo de permisos.
- `infra/.trivyignore`: sin cambios previstos; las excepciones AWS-0132 y AWS-0089 ya aplican al bucket nuevo con el mismo motivo.

**Structure Decision**: un módulo por responsabilidad, en lugar de uno solo de SageMaker, porque el bucket y el rol cambian por motivos distintos que el catálogo y porque sumar un modelo solo debe tocar `model-endpoints` (FR-010). Los permisos de IAM viven en `bootstrap`, que ya agrupa lo que el operador no puede editar. El catálogo se escribe en la raíz del entorno, no en el módulo, para que producción tenga su propio catálogo.

## Complexity Tracking

Sin violaciones de la constitución. No se completa.
