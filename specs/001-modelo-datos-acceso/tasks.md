---

description: "Lista de tareas del modelo de datos de acceso multi-clínica"
---

# Tasks: Modelo de datos de acceso multi-clínica

**Input**: Documentos de diseño en `/specs/001-modelo-datos-acceso/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md). No hay `contracts/`: esta funcionalidad no expone interfaces.

**Tests**: Incluidos. La spec los exige (FR-027, SC-006): cada regla del modelo se verifica intentando violarla.

**Organization**: Las tareas se agrupan por historia de usuario. El schema es un único archivo compartido por todas las historias, así que se escribe completo en la fase Foundational. Cada historia agrega las pruebas de integración que verifican sus reglas.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US5).
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal. El agente no corre `git commit`, `prisma migrate`, `prisma db` ni `prisma generate`: se detiene en esa tarea e indica el comando exacto.

## Path Conventions

- Proyecto único: `src/`, `tests/` y `prisma/` en la raíz del repositorio, según [plan.md](plan.md).
- El cliente generado de Prisma queda en `generated/prisma/`, fuera de `src/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, entorno local y configuración de Prisma.

- [ ] T001 [Responsable] Aprobar e instalar las dependencias fijando la versión estable de Prisma: `npm install prisma@7.10.1 @prisma/client@7.10.1 @prisma/adapter-pg@7.10.1 pg` y `npm install -D @types/pg`. Actualiza `package.json` y `package-lock.json`. No se usa Prisma 8 por estar en candidatas (R1).
- [ ] T002 [P] Crear `docker-compose.yml` en la raíz con un servicio de PostgreSQL y una única base, `medicia`, que se usa para probar la aplicación y para las pruebas de integración.
- [ ] T003 [P] Crear `.env.example` en la raíz documentando `DATABASE_URL` (conexión a la base de Docker local, con una línea que aclare que las pruebas vacían sus tablas y que producción la define el servidor).
- [ ] T004 [P] Agregar `generated/` a `.gitignore` y a la lista de archivos ignorados de `eslint.config.mjs`.
- [ ] T005 Confirmar contra la documentación oficial de Prisma `7.10.1` los puntos de configuración de R1: archivo `prisma.config.ts`, adaptador `@prisma/adapter-pg`, generador `prisma-client` y carpeta de salida `generated/prisma/`. Registrar cualquier diferencia en R1 de `specs/001-modelo-datos-acceso/research.md`. Depende de T001.
- [ ] T006 Crear `prisma.config.ts` en la raíz según lo confirmado en T005: schema en `prisma/schema.prisma`, migraciones en `prisma/migrations` y la URL tomada de `DATABASE_URL`. Depende de T005.
- [ ] T007 Actualizar `.github/workflows/ci.yml`: en el job `check`, agregar un servicio de PostgreSQL con la variable `DATABASE_URL` apuntando a él, y los pasos `npx prisma generate` y `npx prisma migrate deploy` antes de `npm run check`. El job `e2e` no cambia.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: schema completo, migración con las restricciones manuales, cliente de Prisma y base de las pruebas.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase.

- [ ] T008 Crear `prisma/schema.prisma` con el generador `prisma-client` (salida `../generated/prisma`), el datasource de PostgreSQL y las cuatro enumeraciones: `TenantStatus` (`ACTIVE`, `SUSPENDED`), `MembershipStatus` (`ACTIVE`, `DEACTIVATED`), `PatientStatus` (`PENDING`, `LINKED`, `REVOKED`) y `DocumentType` (`DNI`, `PASSPORT`, `OTHER`). Convenciones de `data-model.md`: campos en `camelCase` mapeados a `snake_case` con `@map` y `@@map`; identificadores UUID (`uuid(7)` si la versión lo admite, si no `uuid(4)`); fechas `timestamptz`; todas las claves foráneas con `onDelete: Restrict`, sin cascadas.
- [ ] T009 En `prisma/schema.prisma`, agregar los modelos `Tenant` (tabla `tenants`) y `User` (tabla `users`). `Tenant`: `id`, `name`, `status` (por defecto `ACTIVE`), `createdAt`, `updatedAt`. `User`: `id`, `cognitoSub` (único), `email` (único), `fullName`, `isPlatformAdmin` (por defecto `false`), `sessionsValidFrom` (por defecto la fecha de creación), `createdAt`, `updatedAt`. Sin contraseñas, tokens ni datos clínicos. Depende de T008.
- [ ] T010 En `prisma/schema.prisma`, agregar `StaffMembership` (tabla `staff_memberships`): `id`, `tenantId`, `userId`, `isClinicAdmin`, `isDoctor`, `specialty` (opcional), `licenseNumber` (opcional), `status` (por defecto `ACTIVE`), `createdAt`, `updatedAt`. Claves foráneas a `Tenant` y `User`. Unicidades `(tenantId, userId)`, `(tenantId, licenseNumber)` y `(tenantId, id)`; índice `(userId)`. Depende de T009.
- [ ] T011 En `prisma/schema.prisma`, agregar `Patient` (tabla `patients`): `id`, `tenantId`, `userId` (opcional), `documentType`, `documentNumber`, `fullName` (opcional), `status` (por defecto `PENDING`), `linkedAt` (opcional), `revokedAt` (opcional), `createdAt`, `updatedAt`. Unicidades `(tenantId, documentType, documentNumber)`, `(tenantId, userId)` y `(tenantId, id)`; índice `(userId)`. Sin fecha de nacimiento ni datos clínicos. Depende de T010.
- [ ] T012 En `prisma/schema.prisma`, agregar `DoctorPatientAssignment` (tabla `doctor_patient_assignments`): `id`, `tenantId`, `membershipId`, `patientId`, `createdByUserId`, `createdAt`, `endedAt` (opcional), `endedByUserId` (opcional). Relaciones compuestas: `(tenantId, membershipId)` hacia `StaffMembership(tenantId, id)` y `(tenantId, patientId)` hacia `Patient(tenantId, id)`; `createdByUserId` y `endedByUserId` hacia `User`. Índice `(tenantId, membershipId, patientId, createdAt)`. Sin `updatedAt`. Depende de T011.
- [ ] T013 [Responsable] Levantar PostgreSQL con `docker compose up -d` y generar la migración sin aplicarla: `npx prisma migrate dev --create-only --name access_model`. El agente se detiene aquí hasta que exista `prisma/migrations/<fecha>_access_model/migration.sql`. Depende de T012.
- [ ] T014 En `prisma/migrations/<fecha>_access_model/migration.sql`, agregar las restricciones `CHECK` de `tenants` y `users`: `name` no vacío ni solo espacios (`btrim(name) <> ''`); `full_name` no vacío ni solo espacios; `email = lower(email)`. Depende de T013.
- [ ] T015 En el mismo `migration.sql`, agregar los `CHECK` de `staff_memberships`: `is_clinic_admin OR is_doctor`; y `(is_doctor AND specialty IS NOT NULL AND btrim(specialty) <> '' AND license_number IS NOT NULL AND btrim(license_number) <> '') OR (NOT is_doctor AND specialty IS NULL AND license_number IS NULL)`. Depende de T014.
- [ ] T016 En el mismo `migration.sql`, agregar los `CHECK` de `patients` según el estado: `PENDING` con `user_id`, `full_name`, `linked_at` y `revoked_at` nulos; `LINKED` con `user_id`, `full_name` y `linked_at` presentes y `revoked_at` nulo; `REVOKED` con los cuatro presentes; y `btrim(document_number) <> ''`. Depende de T015.
- [ ] T017 En el mismo `migration.sql`, agregar las restricciones de `doctor_patient_assignments`: `CHECK ((ended_at IS NULL) = (ended_by_user_id IS NULL))`; `CHECK (ended_at IS NULL OR ended_at >= created_at)`; índice único parcial sobre `(membership_id, patient_id) WHERE ended_at IS NULL`; e índices parciales `(tenant_id, membership_id) WHERE ended_at IS NULL` y `(tenant_id, patient_id) WHERE ended_at IS NULL`. Depende de T016.
- [ ] T018 [Responsable] Aplicar y generar: `npx prisma migrate dev` (sobre la base de Docker) y `npx prisma generate`. Aplicar migraciones a producción queda fuera de esta funcionalidad. Depende de T017.
- [ ] T019 [Responsable] Comprobar el riesgo de R2: ejecutar `npx prisma migrate dev --create-only --name verify_manual_constraints` y revisar el SQL resultante. Si propone eliminar los índices parciales, descartar esa migración, aplicar la alternativa de la columna marcadora descrita en R2 (ajustar T012 y T017) y registrar el resultado en R2 de `research.md`. Si no propone nada, borrar la migración de verificación y registrar igualmente el resultado. Depende de T018.
- [ ] T020 Crear `src/infrastructure/database/prisma-client.ts`: `import 'server-only'`, cliente importado de `generated/prisma` con el adaptador `PrismaPg` y `DATABASE_URL`, una única instancia por proceso (reutilizada en desarrollo con `globalThis`). Depende de T018.
- [ ] T021 [P] Crear `tests/support/integration-setup.ts` (globalSetup): conectar a `DATABASE_URL`, negarse a continuar si el servidor no es local (`localhost` o `127.0.0.1`) para no vaciar producción por error, comprobar que las cinco tablas existan, y si no, fallar con un mensaje en español que indique al responsable correr `npx prisma migrate dev`. No ejecuta ningún comando de Prisma. Depende de T018.
- [ ] T022 [P] Crear `tests/support/database.ts`: cliente de pruebas sobre `DATABASE_URL`, `resetDatabase()` que vacía las cinco tablas respetando el orden de dependencias y que también se niega a ejecutarse si el servidor no es local, y fábricas `createTenant`, `createUser`, `createStaffMembership`, `createPatient` y `createAssignment` con valores válidos por defecto que cada prueba puede sobrescribir. Depende de T018.
- [ ] T023 En `vitest.config.mts`, registrar `tests/support/integration-setup.ts` como `globalSetup` del proyecto `integration` y desactivar el paralelismo entre archivos de ese proyecto (`fileParallelism: false`), porque comparten una base. Depende de T021 y T022.

**Checkpoint**: la base está migrada, el cliente generado y la infraestructura de pruebas lista. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Información separada por clínica (Priority: P1) 🎯 MVP

**Goal**: ninguna relación entre registros puede cruzar el límite entre clínicas, y todo registro clínico pertenece a una.

**Independent Test**: crear datos de dos clínicas e intentar relacionarlos entre sí; todos los intentos son rechazados por la base.

- [ ] T024 [P] [US1] Crear `tests/integration/access-model/tenant-isolation.test.ts` que verifique: (1) una asignación entre el médico de la clínica A y el paciente de la clínica B es rechazada por la clave foránea compuesta; (2) crear una membresía, un paciente y una asignación sin `tenantId` es rechazado; (3) una consulta filtrada solo por `tenantId` devuelve únicamente los registros de esa clínica. Ejecutar con `npx vitest run --project integration tests/integration/access-model/tenant-isolation.test.ts` y, si falla, corregir el schema o el SQL de la migración (con aviso al responsable para reaplicarla).

**Checkpoint**: la historia 1 se verifica por sí sola.

---

## Phase 4: User Story 2 - Una cuenta, varias clínicas (Priority: P1)

**Goal**: una cuenta única puede vincularse a varias clínicas, con un solo vínculo de un solo tipo por clínica.

**Independent Test**: vincular una cuenta como personal y como paciente en distintas clínicas, e intentar duplicar un vínculo dentro de una misma clínica.

- [ ] T025 [P] [US2] Crear `tests/integration/access-model/accounts-and-memberships.test.ts` que verifique: (1) una cuenta como paciente en dos clínicas genera dos registros independientes; (2) un segundo paciente de la misma cuenta en la misma clínica es rechazado; (3) una segunda membresía de la misma cuenta en la misma clínica es rechazada; (4) una membresía con `isClinicAdmin` e `isDoctor` verdaderos se acepta como una sola; (5) una membresía sin ningún rol es rechazada; (6) un correo con mayúsculas es rechazado por `email = lower(email)` y un correo repetido también; (7) un `cognitoSub` repetido es rechazado; (8) una cuenta sin ninguna clínica es válida y `isPlatformAdmin` es `false` por defecto; (9) una misma cuenta se vincula a 5 clínicas sin duplicar su correo ni su identidad (SC-003). Ejecutar con `npx vitest run --project integration tests/integration/access-model/accounts-and-memberships.test.ts`.

**Checkpoint**: las historias 1 y 2 se verifican de forma independiente.

---

## Phase 5: User Story 3 - Identificación de personas dentro de una clínica (Priority: P2)

**Goal**: documento y matrícula únicos dentro de una clínica, pero repetibles entre clínicas.

**Independent Test**: repetir documentos y matrículas dentro de una clínica (rechazo) y en clínicas distintas (aceptación).

- [ ] T026 [P] [US3] Crear `tests/integration/access-model/identification-uniqueness.test.ts` que verifique: (1) mismo tipo y número de documento en la misma clínica es rechazado; (2) el mismo documento en otra clínica se acepta; (3) el mismo número con distinto tipo (`DNI` y `PASSPORT`) en una clínica se acepta; (4) la misma matrícula en la misma clínica es rechazada y en otra clínica se acepta; (5) dos membresías de administrador sin matrícula en una clínica se aceptan; (6) una membresía con `isDoctor` verdadero sin especialidad, o sin matrícula, o con alguna vacía, es rechazada, y una de solo administrador con especialidad o matrícula también es rechazada. Ejecutar con `npx vitest run --project integration tests/integration/access-model/identification-uniqueness.test.ts`.

**Checkpoint**: la historia 3 se verifica por sí sola.

---

## Phase 6: User Story 4 - Asignaciones entre médicos y pacientes (Priority: P2)

**Goal**: asignaciones con historial por período, una sola activa por pareja.

**Independent Test**: crear, terminar y volver a crear asignaciones; intentar duplicar las activas.

- [ ] T027 [P] [US4] Crear `tests/integration/access-model/assignments.test.ts` que verifique: (1) una asignación nueva queda activa (`endedAt` nulo) con quién la creó y cuándo; (2) una segunda asignación activa de la misma pareja es rechazada por el índice único parcial; (3) tras terminar la primera, asignar de nuevo crea una fila nueva y la anterior se conserva; (4) la consulta de pacientes de un médico devuelve solo las activas; (5) la consulta del historial de una pareja devuelve todos los períodos con quién creó y quién terminó cada uno; (6) terminar con `endedAt` sin `endedByUserId` (o al revés) es rechazado; (7) un `endedAt` anterior a `createdAt` es rechazado; (8) un médico con muchos pacientes y un paciente con muchos médicos se aceptan. Ejecutar con `npx vitest run --project integration tests/integration/access-model/assignments.test.ts`.

**Checkpoint**: la historia 4 se verifica por sí sola.

---

## Phase 7: User Story 5 - Estados sin pérdida de información (Priority: P2)

**Goal**: los cambios de estado reemplazan al borrado, y nada con dependencias se puede eliminar.

**Independent Test**: aplicar cada cambio de estado y verificar que todo sigue disponible; intentar eliminar registros referenciados.

- [ ] T028 [P] [US5] Crear `tests/integration/access-model/states-and-integrity.test.ts` que verifique: (1) suspender una clínica (`status` `SUSPENDED`) conserva todos sus datos y vínculos, y se revierte a `ACTIVE`; (2) desactivar una membresía y revocar un paciente (con `revokedAt`) conserva sus registros, su documento y su historial de asignaciones; (3) eliminar una clínica, una cuenta, una membresía o un paciente que tienen registros dependientes es rechazado (`Restrict`); (4) un paciente `LINKED` sin cuenta, o sin nombre, o sin `linkedAt`, es rechazado; un `PENDING` con cuenta o nombre es rechazado; un `REVOKED` sin `revokedAt` es rechazado; (5) revincular un paciente `REVOKED` a `LINKED` limpiando `revokedAt` reutiliza su mismo registro; (6) `createdAt` se completa en todas las tablas y `updatedAt` cambia al modificar una fila donde existe (FR-026). Ejecutar con `npx vitest run --project integration tests/integration/access-model/states-and-integrity.test.ts`.

**Checkpoint**: las cinco historias se verifican de forma independiente.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: cobertura, rendimiento, trazabilidad y verificación final.

- [ ] T029 [P] Crear `tests/integration/access-model/prisma-client.test.ts` que verifique que dos importaciones de `src/infrastructure/database/prisma-client.ts` devuelven la misma instancia y que una consulta simple funciona, para alcanzar el 80 % de líneas por archivo que exige `vitest.config.mts`. Depende de T020.
- [ ] T030 [P] Crear `tests/integration/access-model/query-performance.test.ts` (SC-004): cargar 100 clínicas y 10.000 pacientes en la mayor, y comprobar que las consultas de clínicas de una persona, pacientes de un médico y médicos de un paciente responden cada una en menos de 1 segundo. Depende de T022.
- [ ] T031 Revisar la trazabilidad de SC-006: confirmar que cada requisito de `data-model.md` (sección "Trazabilidad de requisitos") y cada regla de `spec.md` tiene al menos una prueba en `tests/integration/access-model/`, y completar las que falten. Depende de T024 a T030.
- [ ] T032 [P] Actualizar `memory/project-structure.md` para incluir `generated/prisma/`, `prisma.config.ts` y `docker-compose.yml`, y mantenerlo coherente con `memory/architecture.md`.
- [ ] T033 Ejecutar `npm run check` (requiere el cliente generado y la base de Docker migrada) y reportar el resultado. Informar con claridad cualquier verificación que no se haya podido ejecutar, sin omitir las pruebas de integración. Depende de T031.
- [ ] T034 Recorrer los escenarios de `specs/001-modelo-datos-acceso/quickstart.md` contra los resultados de las pruebas y anotar cualquier diferencia. Depende de T033.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias. T001 es requisito de T005 y T006.
- **Foundational (Phase 2)**: depende de Setup. Bloquea todas las historias.
  - T008 a T012 y T014 a T017 editan un mismo archivo cada grupo, por eso son secuenciales.
  - T013, T018 y T019 son puntos de espera: el agente se detiene y el responsable ejecuta el comando.
- **User Stories (Phase 3 a 7)**: todas dependen de T023. Son independientes entre sí y cada una agrega su propio archivo de pruebas.
- **Polish (Phase 8)**: depende de las historias que se quieran cubrir.

### User Story Dependencies

- **US1 (P1)**: tras la fase Foundational; sin dependencias de otras historias.
- **US2 (P1)**: tras la fase Foundational; independiente.
- **US3, US4 y US5 (P2)**: tras la fase Foundational; independientes.

### Within Each User Story

- Cada historia es un único archivo de pruebas. Si una prueba falla, se corrige el schema (Phase 2) o el SQL de la migración, y el responsable reaplica la migración.

### Parallel Opportunities

- En Setup: T002, T003 y T004.
- En Foundational: T021 y T022.
- Tras T023: T024, T025, T026, T027 y T028 en paralelo (archivos distintos).
- En Polish: T029, T030 y T032.

---

## Parallel Example: Historias de usuario

```bash
# Con la fase Foundational terminada, las cinco historias pueden escribirse a la vez:
Task: "Pruebas de aislamiento en tests/integration/access-model/tenant-isolation.test.ts"
Task: "Pruebas de cuentas y membresías en tests/integration/access-model/accounts-and-memberships.test.ts"
Task: "Pruebas de identificación en tests/integration/access-model/identification-uniqueness.test.ts"
Task: "Pruebas de asignaciones en tests/integration/access-model/assignments.test.ts"
Task: "Pruebas de estados e integridad en tests/integration/access-model/states-and-integrity.test.ts"
```

---

## Implementation Strategy

### MVP First (US1 y US2)

1. Completar Setup y Foundational. El modelo completo se escribe en esa fase porque el schema es un único archivo.
2. Completar US1 y US2, las dos historias P1: aislamiento entre clínicas y una cuenta en varias clínicas.
3. **Parar y validar** que la base rechaza lo que debe rechazar.

### Incremental Delivery

1. Setup y Foundational: base migrada y pruebas listas.
2. US1 y US2: aislamiento y cuentas (MVP).
3. US3: identificación dentro de una clínica.
4. US4: asignaciones con historial.
5. US5: estados e integridad.
6. Polish: cobertura, rendimiento y verificación final.

### Puntos de espera del responsable

- **T001**: aprobar e instalar dependencias.
- **T013**: generar la migración sin aplicarla.
- **T018**: aplicar la migración a la base de Docker y generar el cliente.
- **T019**: comprobar el comportamiento de Prisma con los índices parciales.
- Cada vez que cambie el schema o el SQL de la migración, repetir el aplicado y la generación.

---

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- La etiqueta [Story] mapea cada tarea con su historia para trazabilidad.
- Las pruebas verifican el rechazo de las violaciones y la aceptación de los casos válidos (por ejemplo, el mismo documento en dos clínicas).
- Ninguna tarea ejecuta `git commit` ni comandos de Prisma por parte del agente.
- Las reglas de flujo (rol de médico en la asignación, paciente vinculado, último administrador, un solo tipo de vínculo por clínica) no se prueban acá: pertenecen a las funcionalidades que las implementan.
