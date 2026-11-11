# Implementation Plan: Análisis de un estudio de ECG con EchoNext-Mini

**Branch**: `008-analisis-estudio-ecg` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-analisis-estudio-ecg/spec.md`

## Summary

Un módulo nuevo, `analyses`, registra cada análisis de un estudio (tabla `analyses`, con estado explícito y un solo análisis en curso por estudio garantizado por un índice único parcial) y lo ejecuta contra el modelo EchoNext-Mini por un puerto `ModelInference` con dos adaptadores: SageMaker (`InvokeEndpoint`) y uno simulado, elegidos por `MODEL_INFERENCE`. El pedido crea el análisis y responde enseguida; la inferencia corre en segundo plano con `after()` de Next, y la pantalla del estudio, `/studies/[studyId]`, consulta cada pocos segundos mientras hay uno en curso. Los análisis vencidos se marcan como fallidos al abrir el estudio o al pedir otro, sin trabajador aparte. El módulo `studies` suma dos casos de uso con control de acceso (autorizar un estudio y leer su entrada al modelo) y reemplaza `canDeleteStudy` para impedir eliminar un estudio con un análisis en curso. En infraestructura, el único cambio es el permiso `sagemaker:InvokeEndpoint` acotado al punto de inferencia, en el módulo `identity` y en `medicia-dev-boundary`. Decisiones y alternativas en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript estricto sobre Node 24; Next.js 16.4.4 (App Router, `cacheComponents`, Server Actions, `after`), React 19.3.

**Primary Dependencies**: las existentes más una nueva, `@aws-sdk/client-sagemaker-runtime` fijada en la misma versión que `@aws-sdk/client-s3` (3.1164.0). `zod` ya instalado.

**Storage**: PostgreSQL con Prisma: tabla nueva `analyses`, enums `analysis_status` y `analysis_failure_code`, índice único parcial y `CHECK` escritos a mano en la migración. Los archivos de los estudios siguen en S3 (solo lectura).

**Testing**: Vitest (unidad e integración) y Playwright (pocas pruebas E2E con el modelo simulado). Pruebas de Terraform del módulo `identity` y de `bootstrap`. Cobertura mínima del 80 % por archivo en `src/modules` y `src/infrastructure`.

**Target Platform**: navegador moderno en móvil, tablet y escritorio; servidor Node (EC2 en producción, proceso local en desarrollo).

**Project Type**: aplicación web (monolito modular hexagonal).

**Performance Goals**: con el modelo simulado, el resultado se ve en menos de 5 s (SC-002); el pedido responde sin esperar al modelo.

**Constraints**: un análisis en curso por estudio; tiempo máximo del pedido al modelo de 30 s y de un análisis en curso de 2 minutos; las siete variables, la clave del archivo y las probabilidades fuera de los registros; el modelo nace apagado.

**Scale/Scope**: 1 módulo nuevo, 1 tabla, 1 puerto con 2 adaptadores, 5 casos de uso, 2 casos de uso nuevos en `studies`, 1 acción de servidor, 1 sección nueva en la pantalla del estudio y unos 8 componentes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Apoyo clínico, no diagnóstico**: pasa. Posibles hallazgos, sin umbrales ni etiquetas de sí o no, advertencia permanente (FR-006, FR-015, SC-007).
- **II. Aislamiento multi-tenant**: pasa. Toda consulta de `analyses` lleva `tenantId`; la clave foránea compuesta impide un análisis en otra clínica que su estudio; el acceso a un análisis pasa siempre por el acceso al estudio; un análisis o estudio ajeno, de otra clínica o inexistente da el mismo resultado. Prueba de integración de rechazo desde otra clínica.
- **III. Hexagonal pragmática**: pasa. Casos de uso en `application`, puertos de salida (`AnalysisRepository`, `ModelInference`, `StudySource`), adaptadores en `infrastructure`. La acción de servidor solo valida y delega. Los dos módulos solo se conectan en sus `composition.ts` mediante cierres perezosos, como exige la regla de límites entre módulos de `eslint.config.mjs` (R1).
- **IV. Trazabilidad**: pasa y es el centro de esta funcionalidad: estudio, resultado, nombre y versión del modelo tal como los informó el contenedor, momento y estado explícito (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`); un estudio puede tener muchos.
- **V. Extensibilidad**: pasa. El resultado se guarda como documento validado, así que otro modelo con otras salidas no exige cambiar el esquema; el puerto `ModelInference` oculta el proveedor.
- **VI. Datos clínicos**: pasa. Las siete variables y la onda salen solo del servidor al modelo; el navegador recibe probabilidades solo de un análisis autorizado; sin datos en los registros; pruebas con archivos sintéticos.
- **VII. Interfaz**: pasa. Tokens, claro y oscuro, tres anchos, teclado, foco visible, estados con texto además de color.
- **VIII. Código tipado**: pasa. Sin `any`; la respuesta del modelo y el documento guardado se validan con zod; `analysisId` y `studyId` se validan como UUID.
- **Restricciones técnicas**: el stack no cambia (SageMaker AI consumido mediante un adaptador, como exige la constitución). Guías de Next.js leídas antes de escribir código de Server Actions y de `after`.
- **Comandos reservados**: la migración de Prisma y el `apply` de Terraform los ejecuta el responsable; las tareas lo indican y se detienen.

Sin violaciones. La sección de complejidad queda vacía.

**Re-evaluación tras el diseño (Phase 1)**: sin cambios. Las dos composiciones se referencian entre sí de forma perezosa y se documenta en `memory/architecture.md`.

## Project Structure

### Documentation (this feature)

```text
specs/008-analisis-estudio-ecg/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── analysis-use-cases.md
│   ├── model-inference.md
│   ├── analysis-ui.md
│   └── permissions.md
├── checklists/requirements.md
└── tasks.md             # lo genera speckit-tasks
```

### Source Code (repository root)

```text
prisma/schema.prisma                         # + enums, model Analysis, relación en Study
prisma/migrations/<fecha>_add_analyses/      # SQL con el índice único parcial y los CHECK (a mano)

src/modules/analyses/
├── domain/
│   ├── findings.ts                          # las 12 claves en orden, tipo de probabilidades, validación
│   ├── analysis.ts                          # AnalysisRecord, estados, códigos de falla, constantes de tiempo
│   └── analysis-errors.ts                   # AnalysisNotFound, AnalysisInProgress, AnalysisUnavailable
├── application/
│   ├── ports/out/{analysis-repository,model-inference,study-source}.ts
│   └── use-cases/{request-analysis,list-analyses,get-analysis,has-analysis-in-progress}.ts
├── infrastructure/
│   ├── adapters/{sagemaker-model-inference,fake-model-inference,create-model-inference,study-source}.ts
│   └── repositories/prisma-analysis-repository.ts
└── composition.ts

src/modules/studies/
├── application/use-cases/{authorize-study,read-study-model-input}.ts   # nuevos, con control de acceso
└── composition.ts                           # + authorizeStudy, readStudyModelInput, canDeleteStudy inyectado

src/infrastructure/aws/sagemaker/{config,sagemaker-runtime-client}.ts

src/app/(dashboard)/studies/[studyId]/page.tsx          # + sección de análisis
src/app/(dashboard)/_studies/_actions/request-analysis.ts
src/app/(dashboard)/_studies/_components/analysis/
├── analysis-section.tsx                     # servidor: botón, resultado seleccionado e historial
├── request-analysis-button.tsx              # cliente: formulario de la acción
├── analysis-progress.tsx                    # cliente: consulta periódica mientras hay uno en curso
├── analysis-result.tsx                      # 12 filas, advertencia, modelo y fecha
├── analysis-history.tsx
└── analysis-disclaimer.tsx
src/app/(dashboard)/_studies/_lib/{analysis-messages,findings-labels}.ts

infra/modules/identity/{main,variables}.tf   # + política de invocación (variable opcional)
infra/bootstrap/permissions-boundary.tf      # + sentencia de invocación en el techo
infra/environments/dev/main.tf               # pasa el ARN del punto de inferencia

tests/
├── unit/modules/analyses/{domain,application,infrastructure}/…
├── unit/modules/studies/application/{authorize-study,read-study-model-input}.test.ts
├── unit/app/studies/{analysis-result,analysis-section,findings-labels}.test.tsx
├── integration/analyses/{analysis-repository,request-analysis-concurrency,analysis-access,delete-with-analysis}.test.ts
├── unit/modules/studies/repository-tenant-scope.test.ts   # + repositorio de análisis
└── e2e/study-analysis.spec.ts
```

**Structure Decision**: `analyses` es un módulo propio porque la constitución lo nombra como módulo de negocio aparte y porque el modelo de datos y los adaptadores crecerán con nuevos modelos sin tocar `studies`. Ningún módulo importa el dominio, la aplicación ni la infraestructura del otro: `analyses` define su propio actor y su puerto `StudySource`, `studies` devuelve resultados en lugar de errores propios, y todo se conecta en las dos composiciones con cierres perezosos (R1).

## Complexity Tracking

Sin violaciones de la constitución que justificar.
