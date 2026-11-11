# Implementation Plan: Carga y almacenamiento de estudios de ECG

**Branch**: `006-carga-estudios-ecg` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/006-carga-estudios-ecg/spec.md`

## Summary

Un paciente sube un `.npz` de ECG a su nombre, o un médico lo sube a nombre de un paciente que tiene asignado. La aplicación lo valida con un lector propio y acotado, guarda un archivo canónico de 120.036 bytes en un bucket privado de S3 y registra el estudio en PostgreSQL con un número correlativo por paciente. El paciente ve sus estudios y el médico ve a sus pacientes asignados y los estudios de cada uno, en listas paginadas; solo quien cargó un estudio puede eliminarlo (registro y archivo, de forma definitiva). Un administrador que no es médico no ve estudios. El acceso lo imponen los casos de uso y los repositorios con el `tenantId`, el vínculo y las asignaciones vigentes del contexto autenticado; el prefijo de S3 no es la barrera. Terraform suma el bucket de estudios, con permisos mínimos para la aplicación y sin que el operador pueda leer los estudios. Las decisiones están en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript en modo `strict` sobre Node.js 24, Next.js 16.4.4 (App Router, `cacheComponents`), React 19.3. Terraform 1.15 con el proveedor `hashicorp/aws ~> 6.72`.

**Primary Dependencies**: Prisma 7.10 con PostgreSQL (`@prisma/adapter-pg`), `zod` 4.6.7, `@aws-sdk/client-s3` 3.1164.0 (nueva, misma versión que el cliente de Cognito). Sin librería de ZIP ni de `.npy`: lector propio con `node:zlib` (R2).

**Storage**: PostgreSQL (`studies`, `study_counters`) y Amazon S3 (bucket `medicia-studies-dev-<cuenta>`, objetos `studies/<tenantId>/<studyId>.ecg1`).

**Testing**: Vitest (unidad en `tests/unit/`, integración en `tests/integration/` contra el PostgreSQL local), Playwright (`tests/e2e/`), `terraform test` en el módulo nuevo y en `infra/bootstrap`. Cobertura de líneas de al menos 80 % en lo nuevo, por archivo y sobre `src/modules`, `src/infrastructure` y `src/shared` (`src/app` no se mide).

**Target Platform**: Servidor Node.js (hoy local, en producción EC2) y AWS `sa-east-1`.

**Project Type**: Aplicación web full-stack, monolito modular (módulo `src/modules/studies`).

**Performance Goals**: subir y ver un estudio en menos de 10 segundos (SC-001); listas usables con 500 elementos (SC-007), con paginación de 20 y los índices de `(tenant_id, patient_id, number)` y de las asignaciones de la 001.

**Constraints**: archivo subido de hasta 2 MB (20 MB descomprimido); cuerpo de Server Actions elevado a 3 MB; sin datos del estudio en registros; sin deserialización de objetos; eliminación definitiva (sin versionado en S3); migraciones, `terraform apply` y commits los ejecuta el responsable.

**Scale/Scope**: una clínica de desarrollo y unas decenas de estudios sintéticos; hasta cientos por paciente y por médico. Tres pantallas (`/studies`, `/patients`, `/patients/[patientId]`), dos Server Actions, un script de conciliación y un script de datos de prueba.

## Constitution Check

*GATE: debe pasar antes de la investigación y se vuelve a evaluar tras el diseño.*

- **I. Apoyo clínico, no diagnóstico:** cumple. Esta funcionalidad no muestra ni guarda resultados. La interfaz no usa lenguaje de diagnóstico ni anticipa hallazgos.
- **II. Aislamiento multi-tenant:** cumple. `tenantId`, actor y vínculo solo del contexto autenticado; todas las consultas por clínica y por la relación del actor con el paciente (propio o asignación vigente); claves de S3 armadas en el servidor y el prefijo por clínica no es la barrera; pruebas de integración de rechazo entre clínicas, pacientes y roles incluidas (R7, R10). El operador de Terraform no puede leer estudios (R8).
- **III. Arquitectura hexagonal pragmática:** cumple. Dominio sin Next.js, Prisma ni SDK de AWS; puertos para el repositorio, el almacenamiento y el lector de archivos; `app/` solo delega en casos de uso; `composition.ts` conecta (patrón del módulo `users`). No se agregan fábricas ni capas sin uso: el único punto de extensión (no eliminar con análisis en curso) es un `if` en el caso de uso, reemplazado por la 008 (R6).
- **IV. Trazabilidad de los análisis:** cumple. El estudio no se asocia a una predicción, tiene clave compuesta lista para la clave foránea de los análisis y no guarda estado de análisis (R1).
- **V. Extensibilidad por estudio y modelo:** cumple. El usuario elige el tipo de estudio (hoy `ECG`), el enum admite otras modalidades y la validación depende del tipo. El archivo se valida contra los requisitos del análisis previsto (contrato de entrada de la 005) antes de guardarse.
- **VI. Tratamiento responsable de datos clínicos:** cumple para esta etapa. Acceso restringido al paciente dueño y a sus médicos con asignación vigente (finalidad: atención del paciente); el archivo guardado no contiene datos personales; solo datos de prueba. Los plazos de conservación, el registro de accesos y la auditoría de consultas quedan anotados para antes de usar datos reales (R8, R14).
- **VII. Interfaz consistente, responsiva y accesible:** cumple por diseño (R9): tokens semánticos, claro y oscuro, móvil, tablet y escritorio, teclado, foco visible, estados con texto y diálogo accesible. Lo comprueban el revisor de interfaz y la prueba E2E `tests/e2e/studies-responsive.spec.ts` (temas, anchos y teclado).
- **VIII. Código limpio, tipado y verificable:** cumple. `strict`, sin `any`, datos externos (el archivo y el formulario) validados al entrar con `zod` y con el lector, mensajes sin valores del estudio. `npm run check` antes de cerrar.
- **Restricciones técnicas:** stack aprobado (Next.js, Prisma/PostgreSQL, S3 privado, Terraform en `infra/`). No hay código Python en este repositorio: el generador de archivos sintéticos va en `medicia-ml`. Next.js: se leen las guías de `node_modules/next/dist/docs/` antes de escribir código de Next (R9).
- **Flujo y calidad:** especificación, aclaración y plan hechos; pruebas proporcionales al riesgo (reglas de negocio, autorización, persistencia e integración externa son tareas complejas: 80 % de cobertura); todas las pruebas en `tests/`, las de Terraform en el módulo.

**Resultado:** sin violaciones. No hay entradas en Complexity Tracking. Tras el diseño (Fase 1) se vuelve a evaluar y el resultado no cambia.

## Project Structure

### Documentation (this feature)

```text
specs/006-carga-estudios-ecg/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── upload-npz.md
│   ├── stored-study-format.md
│   ├── studies-actions.md
│   └── storage-and-permissions.md
├── checklists/requirements.md
└── tasks.md              # lo genera speckit-tasks
```

### Source Code (repository root)

```text
prisma/
└── schema.prisma                         # + StudyType, StudyStatus, Study, StudyCounter (migración la crea el responsable)

src/
├── modules/studies/
│   ├── domain/
│   │   ├── ecg-study.ts                  # reglas de contenido: sexo, rangos, finitud; tipos de la onda y las variables
│   │   ├── study-access.ts               # actor (paciente o médico) y reglas de acceso, carga y eliminación
│   │   ├── stored-study-format.ts        # codificación y lectura del formato canónico ecg1
│   │   ├── study.ts                      # Study, StudySummary, StudyPage, StudyType, StudyStatus
│   │   └── study-errors.ts               # códigos de rechazo y mensajes sin valores
│   ├── application/
│   │   ├── ports/out/
│   │   │   ├── study-repository.ts       # insertar con número, buscar por (tenant, id), listar por paciente, borrar
│   │   │   ├── patient-directory.ts      # pacientes del médico (asignaciones vigentes) y comprobación de acceso, solo lectura
│   │   │   ├── study-file-storage.ts     # guardar, borrar y listar objetos
│   │   │   └── study-file-reader.ts      # bytes de un .npz -> onda y variables
│   │   └── use-cases/
│   │       ├── upload-study.ts
│   │       ├── delete-study.ts
│   │       ├── list-studies.ts
│   │       ├── list-doctor-patients.ts
│   │       └── reconcile-study-files.ts
│   ├── infrastructure/
│   │   ├── adapters/
│   │   │   ├── npz-reader.ts             # lector propio de .npz/.npy (R2)
│   │   │   ├── s3-study-file-storage.ts  # usa @/infrastructure/aws/s3
│   │   │   ├── in-memory-study-file-storage.ts
│   │   │   └── create-study-file-storage.ts   # elige s3 o fake según STUDY_STORAGE
│   │   └── repositories/
│   │       ├── prisma-study-repository.ts
│   │       └── prisma-patient-directory.ts
│   └── composition.ts
├── infrastructure/aws/s3/
│   ├── config.ts                         # valida STUDIES_BUCKET y AWS_REGION con zod
│   └── s3-client.ts                      # cliente de S3
└── app/(dashboard)/
    ├── studies/page.tsx                  # paciente: «Mis estudios» (carga + lista), dentro de <Suspense>
    ├── patients/page.tsx                 # médico: «Mis pacientes» (lista paginada)
    ├── patients/[patientId]/page.tsx     # médico: estudios del paciente + carga a su nombre
    └── _studies/                         # compartido por las tres pantallas
        ├── _actions/{upload-study.ts,delete-study.ts}
        ├── _components/{upload-form.tsx,studies-list.tsx,delete-study-dialog.tsx,pagination.tsx,patients-list.tsx}
        └── _lib/study-messages.ts        # textos en español por código

scripts/
├── reconcile-study-files.ts              # npm run studies:reconcile (informa; --apply borra)
└── seed-demo-clinic.ts                   # npm run seed:demo: clínicas, médicos, pacientes y asignaciones de prueba

next.config.ts                            # + experimental.serverActions.bodySizeLimit: "3mb"

infra/
├── modules/study-storage/{main,variables,outputs,terraform}.tf, tests/study-storage.tftest.hcl, .terraform.lock.hcl
├── modules/identity/                     # + variable opcional studies_bucket_arn y su statement
├── environments/dev/main.tf              # + module "study_storage"; pasa el ARN a identity
├── bootstrap/                            # + límite, operador (Deny de lectura), rol de plan, tests
└── README.md                             # + sección "Bucket de estudios"

tests/
├── unit/modules/studies/…                # lector, dominio, formato, casos de uso
├── unit/infrastructure/aws/s3/…          # adaptador de S3 con cliente simulado
├── unit/app/studies/…                    # acciones y componentes
├── integration/study-storage/…           # acceso por rol, aislamiento, numeración concurrente por paciente, paginación
├── e2e/studies.spec.ts
└── support/{npz-builder.ts,in-memory/in-memory-study-repository.ts}

memory/                                   # architecture.md y project-structure.md: bucket de estudios y módulo
```

Fuera de este repositorio, en `medicia-ml`: `scripts/make_synthetic.py` (archivos sintéticos válidos y defectuosos) y `scripts/report_ranges.py` (rangos agregados del conjunto, sin datos de pacientes).

**Structure Decision:** monolito modular, siguiendo la estructura hexagonal de `memory/project-structure.md` y el patrón del módulo `users` (puertos de salida, casos de uso con dependencias inyectadas, `composition.ts` perezoso guardado en `globalThis`, selección de adaptador por variable de entorno sin valor por defecto). El adaptador de S3 reutilizable vive en `src/infrastructure/aws/s3/` (cliente y configuración), y el adaptador específico de estudios dentro del módulo, como pide la regla de organización. El mapeo del contexto de acceso al actor (paciente o médico) vive en `src/app/_lib/study-actor.ts`, en la capa `app/`, para que el módulo `studies` no dependa de `users`.

## Orden de trabajo sugerido

1. **Infraestructura de permisos y bucket** (en `tasks.md` va después de la base común —esquema, dominio y lector— y avanza en paralelo con el código; el responsable tiene que aplicarla antes de probar contra S3): módulo `study-storage`, cambios de `bootstrap`, pruebas de Terraform, guía. La rotación de administración y el `apply` los hace el responsable.
2. **Esquema y migración:** el esquema de Prisma y la nota para que el responsable genere y aplique la migración. El script de datos de prueba (pacientes y asignaciones) se escribe acá para poder probar el resto.
3. **Dominio y lector:** formato canónico, reglas de contenido, reglas de acceso del actor y lector de `.npz`, con sus pruebas (sin AWS ni base).
4. **Casos de uso y repositorios:** carga, lista de estudios, lista de pacientes del médico, eliminación y conciliación, con repositorio y almacenamiento en memoria; luego Prisma y S3.
5. **Interfaz y acciones:** las tres pantallas, formulario, listas, confirmación de eliminación, `next.config.ts`.
6. **Pruebas de integración y E2E, scripts de `medicia-ml`, guía y verificación.**

## Pendientes que fija este plan

- **Rangos finales** de la onda y de las variables: cerrados en ±25 con `report_ranges.py` sobre la partición de prueba (R4).
- **Rotación de administración** para el límite de la aplicación y la política del operador: se agrupa con la lista de pendientes de la 005 si todavía no se hizo (`ecr:DescribeImageScanFindings`, etc.).
- **Datos reales:** antes de cargar cualquier estudio de pacientes, definir conservación, registro de accesos de S3 y limitación de frecuencia (R14).
