---

description: "Lista de tareas del visor de la onda de un estudio de ECG"
---

# Tasks: Visor de la onda de un estudio de ECG

**Input**: Documentos de diseño en `/specs/007-visor-onda-ecg/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos, con ritmo rápido: pocas pruebas, puestas donde está el riesgo (acceso, límites del zoom, privacidad de la respuesta). Unitarias en `tests/unit/` (replicando `src/`), de integración en `tests/integration/study-storage/` contra el PostgreSQL local de Docker y E2E en `tests/e2e/`. Cobertura mínima del 80 % de líneas por archivo en lo nuevo de `src/modules` y `src/infrastructure`.

**Organization**: Tres fases grandes, cada una cerrada con un punto de commit: (1) base de puertos y caso de uso, (2) pantalla y visor, (3) E2E y cierre. No hay fase de infraestructura: no hay migraciones, Terraform ni variables de entorno nuevas (el usuario de la aplicación ya tiene `s3:GetObject` sobre `studies/*`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec (US1 a US4). La fase base no lleva etiqueta porque sirve a todas.
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto. El agente no corre `git commit`, `prisma migrate`, `prisma db`, `prisma generate` ni comandos de Terraform que modifiquen infraestructura; se detiene e indica el comando o el mensaje.

## Path Conventions

- Aplicación: `src/modules/studies/` y `src/app/(dashboard)/`, según [plan.md](plan.md).
- Pruebas: todas en `tests/`, replicando `src/`. Archivos sintéticos con `tests/support/npz-builder.ts`; ningún archivo ni prueba abre datos de EchoNext.
- Textos de la interfaz y documentos en español rioplatense (vos), con títulos en sentence-case y sin tablas en los documentos. Identificadores en inglés.
- **Puntos de commit:** al cerrar cada fase el agente se detiene y avisa que es un buen momento para que el responsable haga `git commit`, con un mensaje de una línea `tipo(ámbito): descripción en español`, sin cuerpo ni trailer.
- **Antes de cerrar cualquier fase:** `npm run check` sin errores. Nota: `npm run check` trunca la base local; el responsable vuelve a correr `npm run seed:demo`.
- **Leer antes de escribir código de Next.js:** las guías en `node_modules/next/dist/docs` (ver T014).

---

## Phase 1: Base (puertos y caso de uso)

**Purpose**: todo lo que el visor necesita del servidor, con sus pruebas. Al terminar, `getStudiesModule().getStudyWaveform` existe, está probado con la matriz de acceso y no hay pantalla todavía.

**Independent test**: con un estudio sintético guardado, el caso de uso devuelve las 12 derivaciones al paciente dueño y al médico con asignación vigente, y rechaza a todos los demás sin leer el almacenamiento.

- [X] T001 [P] Crear `src/modules/studies/domain/ecg-leads.ts`: `ECG_LEAD_NAMES` (`I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6`, en el orden de las columnas del formato guardado), `ECG_SAMPLING_HZ = 250`, `ECG_DURATION_SECONDS = 10` y `splitLeads(waveform: Float32Array): Float32Array[]`, que separa el arreglo fila por fila (muestra `i`, derivación `j` en `i * 12 + j`) en 12 arreglos de `WAVEFORM_SAMPLES` valores y lanza `RangeError` si el largo no es 30.000. Reutilizar `WAVEFORM_SAMPLES` y `WAVEFORM_LEADS` de `domain/ecg-study.ts`.
- [X] T002 [P] Agregar `StudyDetail` a `src/modules/studies/domain/study.ts` con los campos de [data-model.md](data-model.md): `id`, `tenantId`, `patientId`, `number`, `type`, `status`, `uploadedAt`, `storageKey`, `uploadedByUserId`, `uploadedByPatient` y `uploaderName` (vacío si lo cargó el paciente).
- [X] T003 [P] Agregar `get(key: string): Promise<Uint8Array | null>` al puerto `StudyFileStorage` en `src/modules/studies/application/ports/out/study-file-storage.ts` (devuelve `null` si el objeto no existe; los demás errores se propagan) e implementarlo en `src/modules/studies/infrastructure/adapters/in-memory-study-file-storage.ts` (copia de los bytes, o `null`) y en `src/modules/studies/infrastructure/adapters/s3-study-file-storage.ts` con `GetObjectCommand` y `Body.transformToByteArray()`; el error `NoSuchKey` devuelve `null`, cualquier otro error se propaga sin modificar.
- [X] T004 Agregar `findDetailById({ tenantId, studyId }): Promise<StudyDetail | null>` al puerto `StudyRepository` en `src/modules/studies/application/ports/out/study-repository.ts` y a `src/modules/studies/infrastructure/repositories/prisma-study-repository.ts`: una sola consulta que filtra siempre por `tenantId` y `id` e incluye al usuario que cargó el estudio (nombre completo del médico, o la marca de paciente si `uploadedByUserId` es el usuario del propio paciente), con el mismo criterio que usa `listByPatient` para `uploaderName` y `uploadedByPatient`. Depende de T002.
- [X] T005 Crear `src/modules/studies/application/use-cases/get-study-waveform.ts` con `createGetStudyWaveform({ studies, storage, directory })` según [contracts/get-study-waveform.md](contracts/get-study-waveform.md): (1) `findDetailById` con el `tenantId` del actor, `StudyNotFoundError` si no existe; (2) acceso antes de leer el almacenamiento: paciente solo si `study.patientId === actor.patientId`, médico solo si `directory.findAssignedPatient` devuelve el paciente (usa su `fullName`), si no `StudyForbiddenError`; (3) `storage.get(storageKey)`: si es `null` o `decodeStoredStudy` lanza `StoredStudyCorruptError` devuelve `{ status: "UNAVAILABLE", study }`; cualquier otro error se registra con `console.error` (solo el nombre del error y la clave opaca) y se lanza `StudyUnavailableError`; (4) `{ status: "READY", study, leads: splitLeads(waveform) }`. El `study` devuelto lleva solo `id`, `number`, `uploadedAt`, `uploadedBy`, `patientId` y `patientName` (`null` si el actor es paciente); nunca `storageKey`, `tenantId`, `uploadedByUserId` ni las siete variables. Depende de T001, T003 y T004.
- [X] T006 Registrar `getStudyWaveform` en `src/modules/studies/composition.ts` con el repositorio, el almacenamiento y el directorio de pacientes ya creados. Depende de T005.
- [X] T007 [P] Prueba de unidad en `tests/unit/modules/studies/domain/ecg-leads.test.ts`: `splitLeads` separa 12 derivaciones de 2.500 valores en el orden correcto (con una onda donde el valor de cada celda codifica su muestra y derivación), conserva los valores y lanza `RangeError` con un largo distinto de 30.000.
- [X] T008 [P] Pruebas de unidad de `get` en `tests/unit/modules/studies/infrastructure/in-memory-study-file-storage.test.ts` (objeto existente devuelve una copia; ausente devuelve `null`) y `tests/unit/modules/studies/infrastructure/s3-study-file-storage.test.ts` (cliente simulado: devuelve los bytes, `NoSuchKey` devuelve `null`, otro error se propaga).
- [X] T009 Prueba de unidad en `tests/unit/modules/studies/application/get-study-waveform.test.ts` con repositorio, directorio y almacenamiento en memoria: paciente dueño obtiene `READY` con 12 derivaciones; paciente ajeno y médico sin asignación vigente y con asignación terminada reciben `StudyForbiddenError` y **el almacenamiento no se lee**; estudio inexistente y estudio de otra clínica reciben `StudyNotFoundError`; objeto ausente y objeto de formato inválido dan `UNAVAILABLE`; una falla del almacenamiento lanza `StudyUnavailableError` y el mensaje registrado no contiene datos del estudio; el resultado no contiene `storageKey`, `tenantId` ni las siete variables (recorrer el objeto con `JSON.stringify` y comprobar la ausencia). Depende de T005.
- [X] T010 Prueba de integración en `tests/integration/study-storage/study-waveform-access.test.ts` (patrón de `access-matrix.test.ts`: `resetDatabase`, `createTenant`, usuarios, `createAssignment`, `createLinkedPatient`, almacenamiento en memoria): `findDetailById` con el `tenantId` correcto devuelve el detalle y con el de otra clínica devuelve `null`; el caso de uso con el repositorio y el directorio reales cubre paciente dueño, paciente ajeno, médico con asignación, sin asignación, asignación terminada y reiniciada, otra clínica y estudio inexistente. Depende de T006.
- [X] T011 Cerrar la fase: ejecutar `npm run check`; cobertura de línea de al menos 80 % en los archivos nuevos o modificados de `src/modules/studies`. **[Responsable]** Punto de commit sugerido: `feat(studies): lectura de la onda de un estudio con control de acceso`. Después, volver a correr `npm run seed:demo`.

**Checkpoint**: el caso de uso está probado de punta a punta con la base real; falta la pantalla.

---

## Phase 2: Pantalla y visor (US1, US2, US3, US4)

**Purpose**: la ruta `/studies/[studyId]`, el visor con sus dos vistas, el zoom, los estados y el vínculo desde las listas. US1 (ver las 12 derivaciones) y US3 (acceso y estados) son P1; US2 (ampliar y desplazar) y US4 (accesibilidad y responsivo) son P2, pero comparten los mismos componentes y se construyen juntos.

**Independent test**: con un paciente que subió un estudio sintético, «Ver onda» abre las 12 derivaciones; con un médico asignado, ve la misma onda y el nombre del paciente; un identificador ajeno o inventado muestra el mismo «Sin acceso».

- [ ] T012 [P] [US1] Lógica pura de trazo en `src/app/(dashboard)/_studies/_lib/waveform-path.ts`: `computeLeadScale(samples)` (mínimo y máximo de la derivación completa más un margen del 10 %, con rango fijo de ±1 si la derivación es constante), `buildPolylinePoints(samples, { start, span, width, height, scale })` que devuelve la cadena `points` de un `<polyline>` solo con las muestras de la ventana, y `gridLines({ start, span })` con las posiciones de las líneas finas cada 0,2 s y marcadas cada 1 s (en segundos, con `ECG_SAMPLING_HZ`).
- [ ] T013 [P] [US2] Lógica pura de ventana en `src/app/(dashboard)/_studies/_lib/viewport.ts` según R4 de [research.md](research.md): tipo `ViewWindow { start, span }` en muestras con las invariantes `250 ≤ span ≤ 2500`, `0 ≤ start` y `start + span ≤ 2500`; `fullWindow()`, `zoomIn(window)` y `zoomOut(window)` (factor 2 alrededor del centro), `zoomBy(window, factor, anchorFraction)` para el pellizco, `panBy(window, deltaSamples)`, `panStep(window, direction)` (la quinta parte del `span`), `toStart` y `toEnd`; todas devuelven siempre una ventana válida. Incluye `formatRange(window)` con el texto «Mostrando de 2,0 a 4,0 s» (coma decimal).
- [ ] T014 [P] [US2] **Antes de escribir los componentes y la página**: leer en `node_modules/next/dist/docs` las guías de `cacheComponents` y de `Suspense` con datos dinámicos, de rutas dinámicas y `PageProps`, de `error.tsx` y de componentes cliente con propiedades serializables; respetar sus avisos de deprecación. Ejecutar `npx next typegen` si hace falta para el tipo `PageProps<"/studies/[studyId]">`. Anotar en una línea cualquier diferencia relevante en [research.md](research.md), al final de R2.
- [ ] T015 [P] [US2] Mapa de teclas puro en `src/app/(dashboard)/_studies/_lib/viewer-keys.ts`: `actionForKey(event: { key: string }, view: "ALL" | "SINGLE")` devuelve la acción (`PAN_LEFT`, `PAN_RIGHT`, `GO_START`, `GO_END`, `ZOOM_IN`, `ZOOM_OUT`, `ZOOM_RESET`, `PREVIOUS_LEAD`, `NEXT_LEAD`, `BACK_TO_ALL`) o `null`, según [contracts/viewer-ui.md](contracts/viewer-ui.md): flechas izquierda y derecha, Inicio, Fin, `+` y `-`, `0`, flechas arriba y abajo y `Escape`; en la vista `ALL` solo `Escape` no hace nada y las acciones de zoom y desplazamiento devuelven `null`.
- [ ] T016 [US2] Pruebas de unidad de la lógica pura: `tests/unit/app/studies/viewport.test.ts` (límites: no pasa de 2.500 ni baja de 250 muestras, el desplazamiento se detiene en los extremos, `zoomBy` mantiene el punto ancla, ventana siempre válida con valores extremos o `NaN`, `formatRange`), `tests/unit/app/studies/waveform-path.test.ts` (escala con derivación constante, margen del 10 %, cantidad de puntos igual a la ventana, líneas de cuadrícula en 0,2 s y 1 s) y `tests/unit/app/studies/viewer-keys.test.ts` (cada tecla en cada vista). Depende de T012, T013 y T015.
- [ ] T017 [P] [US1] Componente `src/app/(dashboard)/_studies/_components/viewer/lead-strip.tsx`: un `<svg role="img" aria-label="Derivación II, …">` por derivación con la cuadrícula (líneas finas y marcadas con `--border` y más opacidad cada segundo), el `<polyline>` en `--foreground` con `vector-effect: non-scaling-stroke`, el nombre de la derivación escrito dentro de la tira y una escala vertical propia fija. Solo colores por tokens. Componente puro (sin estado): recibe `samples`, `leadName`, `window` y `height`.
- [ ] T018 [P] [US1] Componente `src/app/(dashboard)/_studies/_components/viewer/time-axis.tsx`: eje de tiempo en segundos al pie, con las marcas cada 1 s rotuladas según la ventana visible, `font-label` y cifras tabulares.
- [ ] T019 [P] [US4] Componente `src/app/(dashboard)/_studies/_components/viewer/waveform-summary.tsx`: lista de definiciones visible con las derivaciones (los 12 nombres), la duración (10 segundos) y la frecuencia de muestreo (250 Hz), más la aclaración «Señal normalizada, sin unidades de milivolts. Cada derivación tiene su propia escala. Es una visualización de la señal, no una interpretación.» Nada de lenguaje de diagnóstico.
- [ ] T020 [P] [US3] Componente `src/app/(dashboard)/_studies/_components/viewer/viewer-states.tsx`: vistas «Sin acceso» («No tenés acceso a este estudio.») y «Onda no disponible» («La onda de este estudio no está disponible. Probá de nuevo más tarde o cargalo otra vez.»), cada una con el vínculo de regreso recibido por propiedad. Los textos van en `src/app/(dashboard)/_studies/_lib/study-messages.ts` junto a los existentes.
- [ ] T021 [US2] Componente `src/app/(dashboard)/_studies/_components/viewer/viewer-controls.tsx`: botones con texto visible y foco visible para alternar la vista («Ver las 12 derivaciones» / «Ampliar derivación»), el selector de derivación con los 12 nombres, «Acercar», «Alejar», «Ver completo», «Anterior» y «Siguiente», y la línea de ayuda con las teclas. Los botones de zoom y desplazamiento se deshabilitan (con `disabled`) en la vista `ALL` o en el límite. Depende de T013.
- [ ] T022 [US2] Componente cliente `src/app/(dashboard)/_studies/_components/viewer/study-viewer.tsx` (`"use client"`): estado `{ view, lead, window }` con las invariantes de [data-model.md](data-model.md); la gráfica es un único elemento con `role="group"`, `aria-label` («Gráfica de la onda»), `tabIndex={0}`, `aria-keyshortcuts` y `onKeyDown` que usa `actionForKey` y las funciones de `viewport.ts`; en la vista `SINGLE`, eventos de puntero (un dedo arrastra y desplaza, dos dedos hacen pellizco con `zoomBy`) y `touch-action: pan-y`; `aria-live="polite"` con `formatRange`; elegir una tira (clic o Enter) abre la vista ampliada. Compone `lead-strip`, `time-axis`, `viewer-controls` y `waveform-summary`. Sin desplazamiento horizontal de la página: contenedor `max-w-full`, SVG al `100%` del ancho. Depende de T012 a T021.
- [ ] T023 [US1] Página `src/app/(dashboard)/studies/[studyId]/page.tsx` según [contracts/viewer-ui.md](contracts/viewer-ui.md) y R2: cascarón con el título y `<Suspense fallback={<p className="text-muted">Cargando estudio…</p>}>`; adentro, un componente asíncrono que usa `requireClinicContext`, `toStudyActor` (si es `null`, el mensaje de administrador sin estudios de la 006), valida `studyId` con `z.uuid()` (si falla, «Sin acceso»), llama a `getStudiesModule().getStudyWaveform` y atrapa `StudyForbiddenError` y `StudyNotFoundError` mostrando **la misma** vista «Sin acceso». Renderiza el encabezado (título «Estudio {número}», fecha y hora con `formatUploadedAt`, quién lo cargó y, solo para el médico, el nombre del paciente o `STUDY_MESSAGES.patientWithoutName`), `StudyViewer` con las 12 derivaciones en `READY` o la vista «Onda no disponible» en `UNAVAILABLE`. Vínculo de regreso: `/studies` («Volver a mis estudios») para el paciente y `/patients/{patientId}` («Volver a los estudios del paciente») para el médico. Metadata `title: "Estudio de ECG"`. Depende de T006, T020 y T022.
- [ ] T024 [US3] Límite de error `src/app/(dashboard)/studies/[studyId]/error.tsx` (componente cliente): «No pudimos mostrar el estudio.», botón «Reintentar» que llama a `reset()` y vínculo a `/studies`. Sin mostrar el mensaje técnico del error.
- [ ] T025 [US1] Vínculo «Ver onda» en `src/app/(dashboard)/_studies/_components/studies-list.tsx`, en la columna de acciones de la tabla y en cada tarjeta, hacia `/studies/{study.id}` con nombre accesible «Ver onda del estudio {número}», junto al botón de eliminar y con el estilo `linkClassName` de `@/components/form/button-styles`. Actualizar `tests/unit/app/studies/studies-list.test.tsx` para comprobar el vínculo en la tabla y en las tarjetas.
- [ ] T026 [US2] Prueba de componente en `tests/unit/app/studies/study-viewer.test.tsx` (jsdom, sin jest-dom) con una onda sintética: se ven 12 tiras con su nombre; elegir una derivación pasa a la vista ampliada; las teclas `+`, `-`, flechas y `0` cambian el rango anunciado; `Escape` vuelve a las 12; el aviso de «sin unidades de milivolts» está presente. No probar gestos táctiles (la lógica del pellizco ya está cubierta en T016). Depende de T022.
- [ ] T027 [P] [US3] Prueba de unidad en `tests/unit/app/studies/viewer-states.test.tsx`: el mensaje de «Sin acceso» es idéntico para los casos de estudio ajeno e inexistente, y «Onda no disponible» no incluye detalles internos y trae el vínculo de regreso.
- [ ] T028 [US3] Verificar que la respuesta de la página no incluye la clave del objeto ni las siete variables y confirmar la serialización de `Float32Array`: con `npm run dev` (almacenamiento falso) abrir un estudio de prueba, comprobar que las 12 derivaciones se dibujan y revisar el HTML y los datos de streaming de la página buscando `studies/` y `MEDECG01`. Si los arreglos tipados no llegan íntegros al cliente, aplicar el respaldo de R2: enviar los bytes en base64 y decodificarlos en `study-viewer.tsx`, con una prueba de unidad de la decodificación. Anotar el resultado en [research.md](research.md), al final de R2.
- [ ] T029 Cerrar la fase: ejecutar `npm run check` (lint, tipos, cobertura y compilación); revisar que no queden textos de diagnóstico ni colores fijos fuera de los tokens. **[Responsable]** Punto de commit sugerido: `feat(studies): visor de la onda de un estudio de ECG`. Después, volver a correr `npm run seed:demo`.

**Checkpoint**: la pantalla funciona a mano con el almacenamiento falso; faltan las pruebas E2E y el cierre.

---

## Phase 3: E2E y cierre

**Purpose**: comprobar los recorridos reales en el navegador, completar la guía de verificación, actualizar la documentación del proyecto y hacer una sola revisión.

- [ ] T030 [US1] Prueba E2E `tests/e2e/study-viewer.spec.ts` (patrón de `studies-patient.spec.ts`: `createE2eDatabase`, `enterClinicAs`, `buildNpz`): el paciente sube un estudio, toca «Ver onda del estudio 1», ve las 12 derivaciones por su nombre, el encabezado («El propio paciente») y la aclaración de señal normalizada; recorrido de teclado: enfocar la gráfica, elegir una derivación, acercar, desplazar con las flechas, comprobar que cambia el rango anunciado y volver con `Escape`; con `Tab` el foco sale de la gráfica al siguiente control (no queda atrapado); «Volver a mis estudios» regresa a la lista. Además, comprobar que el contenido de la página no contiene `studies/` ni `MEDECG01` (la clave del objeto y la firma del formato guardado no llegan al navegador).
- [ ] T031 [US1] En el mismo archivo: un médico con un paciente asignado que tiene un estudio abre «Ver onda» desde «Mis pacientes», ve la onda y el nombre del paciente, y «Volver a los estudios del paciente» regresa a la lista del paciente.
- [ ] T032 [US3] En el mismo archivo: acceso rechazado. Otro paciente de la misma clínica abre la dirección de un estudio ajeno y un identificador inventado: ambos muestran exactamente el mismo texto «No tenés acceso a este estudio.» y ninguno muestra la onda ni el número del estudio.
- [ ] T033 [US4] En el mismo archivo: los tres anchos (375, 768 y 1280 px) y el modo oscuro (`page.emulateMedia({ colorScheme: "dark" })`): la página no tiene desplazamiento horizontal (`document.documentElement.scrollWidth <= clientWidth`) y las 12 derivaciones son visibles. Seguir el patrón de `studies-responsive.spec.ts` y esperar al contenido dinámico antes de medir (el contenido llega después del cascarón).
- [ ] T034 Ejecutar `npm run test:e2e` completo y confirmar que no se rompió ninguna prueba E2E de la 006 (el nuevo vínculo comparte la columna de acciones con el botón de eliminar).
- [ ] T035 [P] Completar la sección «Resultados» de [quickstart.md](quickstart.md) con lo ejecutado (automático y a mano) y el estado de cada punto. **[Responsable]** El punto 6 (estado «onda no disponible» con S3 real, borrando el objeto con una credencial de administración) y la verificación visual de la forma de los latidos (SC-001) las hace el responsable.
- [ ] T036 [P] Actualizar `memory/architecture.md` (el caso de uso de lectura de la onda y el nuevo método del puerto de almacenamiento) y `memory/project-structure.md` (la ruta `studies/[studyId]`, `_components/viewer/` y los archivos de `_lib/`), sin tablas.
- [ ] T037 Ejecutar `npm run check` y, con los resultados, la revisión final con la skill `review-changes` (una sola vez, al terminar). Corregir solo los hallazgos bloqueantes dentro del alcance, repetir `npm run check` y registrar lo pendiente en una sección «Resultados de la implementación» al final de [research.md](research.md). **[Responsable]** Punto de commit sugerido: `docs(studies): cierre del visor de la onda y pruebas de extremo a extremo`. Después, volver a correr `npm run seed:demo`.

---

## Dependencies & Execution Order

- **Fase 1 → Fase 2 → Fase 3**, en ese orden. La fase 2 necesita `getStudyWaveform` (T006); la fase 3 necesita la pantalla (T023).
- Dentro de la fase 1: T001, T002 y T003 en paralelo; T004 después de T002; T005 después de T001, T003 y T004; T006 después de T005; T007 y T008 en paralelo con lo anterior; T009 después de T005; T010 después de T005; T011 al final.
- Dentro de la fase 2: T012 a T015 en paralelo; **T014 (leer las guías de Next.js) va antes de T017 a T024**; T016 después de T012, T013 y T015; T017 a T020 en paralelo; T021 después de T013; T022 después de T012 a T021; T023 después de T006, T020 y T022; T024 en paralelo con T023; T025 en paralelo con T022; T026 después de T022; T027 en paralelo; T028 después de T023; T029 al final.
- Dentro de la fase 3: T030 a T033 comparten un archivo, así que van en orden; T034 después de ellos; T035 y T036 en paralelo; T037 al final.

### Parallel example (fase 1)

```text
T001 ecg-leads.ts        T002 StudyDetail        T003 puerto get + adaptadores
T007 ecg-leads.test.ts   T008 pruebas de get
```

### Parallel example (fase 2)

```text
T012 waveform-path.ts    T013 viewport.ts    T014 guías de Next.js    T015 viewer-keys.ts
T017 lead-strip.tsx      T018 time-axis.tsx  T019 waveform-summary    T020 viewer-states
```

## Implementation Strategy

- **MVP**: la fase 1 más T012, T017, T018, T019, T020, T022 (solo la vista de las 12 derivaciones), T023 y T025 ya cubren US1 y US3. El zoom (US2) y los gestos pueden quedar para el final de la fase 2 sin bloquear lo demás.
- **Orden recomendado**: cerrar la fase 1 con su commit, hacer la fase 2 completa (el riesgo está en T028, la serialización de `Float32Array`: hacerlo apenas la página renderice, antes de pulir) y terminar con la fase 3.
- **Ritmo rápido**: solo se corrigen los hallazgos bloqueantes de la revisión; lo demás se registra como pendiente.

## Notes

- Todas las tareas de pruebas usan archivos sintéticos armados con `tests/support/npz-builder.ts`. Ninguna abre ni usa datos de EchoNext.
- El estado «onda no disponible» no tiene prueba E2E (el almacenamiento falso no permite borrar el objeto sin borrar la fila); lo cubren T009, T027 y la verificación manual de T035.
- Si una tarea resulta ser más chica de lo previsto, se puede fusionar con la siguiente del mismo archivo sin cambiar el orden de fases.
