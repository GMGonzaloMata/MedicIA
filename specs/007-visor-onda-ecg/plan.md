# Implementation Plan: Visor de la onda de un estudio de ECG

**Branch**: `007-visor-onda-ecg` | **Date**: 2026-11-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/007-visor-onda-ecg/spec.md`

## Summary

Una pantalla de solo lectura, `/studies/[studyId]`, que muestra las 12 derivaciones de un estudio guardado por la 006. Un caso de uso nuevo, `getStudyWaveform`, aplica las reglas de acceso de la 006, lee el objeto guardado (formato `ecg1`) por el puerto de almacenamiento, separa la onda en 12 derivaciones y devuelve solo eso y los datos visibles del estudio; nunca la clave del objeto ni las siete variables. El dibujo es SVG propio, sin librerías nuevas, con una vista de las 12 derivaciones apiladas y una vista ampliada de una con zoom y desplazamiento por teclado y por gestos. No hay migraciones ni cambios de infraestructura: el usuario de la aplicación ya tiene `s3:GetObject` sobre `studies/*`. Decisiones y alternativas en [research.md](research.md).

## Technical Context

**Language/Version**: TypeScript estricto sobre Node 24; Next.js 16.4.4 (App Router, `cacheComponents`), React 19.3.

**Primary Dependencies**: las existentes (`@aws-sdk/client-s3` ya instalado, `zod`). Ninguna dependencia nueva: el dibujo es SVG propio.

**Storage**: sin cambios. El objeto `ecg1` en S3 (o en memoria con `STUDY_STORAGE=fake`) y la tabla `studies` de la 006. El puerto `StudyFileStorage` suma `get`; el repositorio suma `findDetailById`.

**Testing**: Vitest (unidad e integración) y Playwright (pocas pruebas E2E con almacenamiento falso). Cobertura mínima del 80 % por archivo en `src/modules` y `src/infrastructure`.

**Target Platform**: navegador moderno en móvil, tablet y escritorio; servidor Next.js en Node.

**Project Type**: aplicación web (monolito modular hexagonal).

**Performance Goals**: abrir un estudio y ver la onda en menos de 3 s (SC-002); zoom y desplazamiento fluidos con 12 series de 2.500 puntos.

**Constraints**: la clave del objeto y las siete variables no llegan al navegador; el acceso se evalúa al abrir; sin desplazamiento horizontal de la página a 375, 768 y 1280 px; tokens de color existentes en modo claro y oscuro.

**Scale/Scope**: 1 pantalla, 1 caso de uso, 2 métodos de puertos, unos 8 componentes y 3 módulos de lógica pura. Cada estudio pesa 120.036 bytes.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Apoyo clínico, no diagnóstico**: pasa. El texto es de visualización, sin interpretar la señal (FR-015) y sin umbrales ni etiquetas.
- **II. Aislamiento multi-tenant**: pasa. La búsqueda del estudio lleva siempre `tenantId`; un estudio ajeno, de otra clínica o inexistente da el mismo resultado; el acceso del médico se evalúa con la asignación vigente en el momento (FR-009). Prueba de integración por combinación.
- **III. Arquitectura hexagonal**: pasa. El caso de uso vive en `application/use-cases`, depende de puertos (`StudyRepository`, `StudyFileStorage`, `PatientDirectory`) y la decodificación del formato es dominio. La pantalla solo llama a `getStudiesModule()`.
- **IV. Trazabilidad**: no aplica (no hay análisis todavía).
- **V. Extensibilidad**: pasa. El tipo de estudio sigue siendo ECG; el visor se asocia al tipo, así que otro tipo suma su propio visor sin tocar este.
- **VI. Datos clínicos**: pasa. Solo se envía la onda del estudio autorizado; no se registra su contenido en logs; las pruebas usan archivos sintéticos.
- **VII. Interfaz**: pasa. Tokens existentes, modo claro y oscuro por preferencia del sistema, 3 anchos, teclado, foco visible, estado no solo con color.
- **VIII. Código tipado**: pasa. Sin `any`; la entrada `studyId` se valida con `z.uuid()`; el objeto leído se valida al decodificar.
- **Restricciones técnicas**: stack sin cambios; guías de Next.js leídas antes de escribir la pantalla (tarea explícita).

Sin violaciones. La sección de complejidad queda vacía.

**Re-evaluación tras el diseño (Phase 1)**: sin cambios; el diseño no agrega dependencias, tablas ni permisos.

## Project Structure

### Documentation (this feature)

```text
specs/007-visor-onda-ecg/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── get-study-waveform.md
│   └── viewer-ui.md
├── checklists/requirements.md
└── tasks.md             # lo genera speckit-tasks
```

### Source Code (repository root)

```text
src/modules/studies/
├── domain/
│   ├── ecg-leads.ts                       # nombres de derivaciones, frecuencia, duración, separación de la onda
│   └── study.ts                           # + StudyDetail
├── application/
│   ├── ports/out/study-file-storage.ts    # + get(key)
│   ├── ports/out/study-repository.ts      # + findDetailById
│   └── use-cases/get-study-waveform.ts
├── infrastructure/
│   ├── adapters/{s3,in-memory}-study-file-storage.ts   # + get
│   └── repositories/prisma-study-repository.ts          # + findDetailById
└── composition.ts                         # + getStudyWaveform

src/app/(dashboard)/studies/[studyId]/
├── page.tsx
└── error.tsx

src/app/(dashboard)/_studies/_components/
├── studies-list.tsx                       # + vínculo «Ver onda» por estudio
└── viewer/
    ├── study-viewer.tsx                   # componente cliente: estado de vista, derivación y ventana
    ├── lead-strip.tsx                     # una derivación en SVG (cuadrícula, trazo, nombre)
    ├── time-axis.tsx
    ├── viewer-controls.tsx                # alternar vista, elegir derivación, zoom y desplazamiento
    ├── waveform-summary.tsx               # resumen textual accesible
    └── viewer-states.tsx                  # onda no disponible y sin acceso
src/app/(dashboard)/_studies/_lib/
├── viewport.ts                            # zoom, desplazamiento y límites (puro)
├── waveform-path.ts                       # puntos del trazo y escala por derivación (puro)
└── viewer-keys.ts                         # mapa de teclas a acciones (puro)

tests/
├── unit/modules/studies/application/get-study-waveform.test.ts
├── unit/modules/studies/domain/ecg-leads.test.ts
├── unit/modules/studies/infrastructure/{in-memory,s3}-study-file-storage.test.ts   # + casos de get
├── unit/app/studies/{viewport,waveform-path,viewer-keys,study-viewer,viewer-states}.test.ts
├── integration/study-storage/study-waveform-access.test.ts
└── e2e/study-viewer.spec.ts
```

**Structure Decision**: la lógica de zoom, trazo y teclas es pura y vive en `_lib/` para probarse sin DOM; los componentes solo dibujan y conectan eventos. Una sola ruta `/studies/[studyId]` sirve a paciente y a médico, porque el caso de uso resuelve el acceso desde el propio estudio; solo cambia el vínculo de regreso.

## Complexity Tracking

Sin violaciones de la constitución que justificar.
