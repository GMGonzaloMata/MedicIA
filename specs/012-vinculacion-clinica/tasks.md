---

description: "Lista de tareas de la funcionalidad 012: vinculación de personal y pacientes a una clínica"
---

# Tasks: Vinculación de personal y pacientes a una clínica

**Input**: documentos de diseño en `specs/012-vinculacion-clinica/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: se incluyen. La constitución los exige: es una tarea compleja (autorización, persistencia, integración externa), con cobertura de líneas ≥ 80 % en el código nuevo y una prueba de integración de rechazo entre clínicas por cada operación. Toda prueba vive en `tests/`.

**Organization**: por historia de usuario, para implementar y probar cada una por separado.

## Formato: `[ID] [P?] [Story] Descripción con ruta`

- **[P]**: se puede hacer en paralelo (archivos distintos, sin depender de una tarea incompleta).
- **[US1]–[US4]**: la historia de [spec.md](spec.md) a la que pertenece.
- **[Responsable]**: la ejecuta solo el responsable del proyecto desde su terminal o su cuenta (`prisma migrate`, `git commit`, enmiendas, cuentas externas). El agente se detiene e indica el comando exacto.

## Convenciones del proyecto que aplican a todas las tareas

- Los módulos no se importan entre sí: `tenants` no importa `users` ni `studies`. Solo `app/` conoce las composiciones de los dos.
- Los casos de uso reciben el actor con la clínica del contexto, nunca un `tenantId` del cliente. Un identificador de otra clínica es `NOT_FOUND`.
- Los resultados esperados son uniones discriminadas; los errores inesperados se lanzan y la acción los traduce a «no disponible».
- Ningún registro (`console`) contiene correos, documentos, nombres, tokens ni códigos.
- Antes de escribir código de Next.js, leer la guía correspondiente en `node_modules/next/dist/docs/` (la versión instalada tiene cambios incompatibles).
- Textos de pantalla en español rioplatense, sin lenguaje técnico, con el siguiente paso posible.

---

## Phase 1: Setup

**Purpose**: autorizaciones previas y dependencias.

- [ ] T001 [Responsable] Aprobar y aplicar la enmienda de la constitución (MINOR, 1.6.1 → 1.7.0): sumar en `.specify/memory/constitution.md`, sección «Stack aprobado», «Correo transaccional: servidor SMTP configurable detrás de un puerto (Gmail en desarrollo y demo), sustituible por otro servicio sin tocar el negocio», actualizar la versión y la fecha de enmienda, y reflejarlo en `memory/architecture.md` (sección Componentes y tecnologías). **Bloquea T004 y T027**; el resto puede avanzar con el correo simulado.
- [ ] T002 [Responsable] Revocar la contraseña de aplicación de Gmail que quedó en el chat, generar una nueva y guardarla solo en `.env.local` (`SMTP_PASSWORD`). Agregar `APP_BASE_URL=http://localhost:3000` a `.env.local`. Las demás variables (`INVITATION_MAILER`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `INVITATION_FROM_ADDRESS`, `FAKE_MAIL_OUTBOX_FILE`) ya existen. No escribir ningún valor en el repositorio.
- [X] T003 Comprobar que `eslint.config.mjs` aplica las reglas de límites entre módulos a `src/modules/tenants/` (hoy vacío) y que `tenants` no puede importar `users`, `studies` ni `analyses`; si el patrón no la cubre, agregarla en `eslint.config.mjs`.
- [ ] T004 Instalar `nodemailer` y `@types/nodemailer` con versión exacta en `package.json` (como `next` y `zod`), tras T001. Sin `npm install` de otras dependencias.

---

## Phase 2: Foundational (bloquea todas las historias)

**Purpose**: esquema de datos, valores de dominio compartidos, puertos, actor y composición.

**⚠️ CRÍTICO**: ninguna historia empieza antes de terminar esta fase.

- [X] T005 Agregar a `prisma/schema.prisma` los enums `InvitationStatus` (`PENDING`, `ACCEPTED`, `REVOKED`) y `PatientCodeStatus` (`ACTIVE`, `USED`, `REPLACED`, `LOCKED`) y los modelos `StaffInvitation` (`staff_invitations`), `PatientLinkCode` (`patient_link_codes`) y `PatientLinkAttempt` (`patient_link_attempts`) con los campos, tipos y nulabilidad exactos de [data-model.md](data-model.md); `token_hash` único; clave foránea compuesta `(tenant_id, patient_id)` → `patients(tenant_id, id)`; `onDelete: Restrict` en todas las relaciones con `users`. Agregar a `StaffMembership` `deactivatedAt DateTime?` y `deactivatedByUserId String?` (relación a `User`). Agregar las relaciones inversas en `Tenant`, `User` y `Patient`.
- [ ] T006 [Responsable] Generar la migración sin aplicarla: `npx prisma migrate dev --name clinic_linking --create-only`. Editar a mano el SQL generado y agregar: `CHECK (is_clinic_admin OR is_doctor)` en `staff_invitations`; índice único parcial `(tenant_id, email) WHERE status = 'PENDING'`; `CHECK` de coherencia (`ACCEPTED` exige `accepted_at` y `accepted_by_user_id`; `REVOKED` exige `revoked_at`); índice único parcial `(patient_id) WHERE status = 'ACTIVE'` en `patient_link_codes`; `CHECK (failed_attempts BETWEEN 0 AND 5)`; índice `(code_hash)`; índice `(user_id, attempted_at)` en `patient_link_attempts`; `CHECK ((status = 'DEACTIVATED') = (deactivated_at IS NOT NULL))` en `staff_memberships`. Después aplicarla con `npx prisma migrate dev` y generar el cliente con `npx prisma generate`. Depende de T005. Las restricciones y los índices parciales viven en una segunda migración, `prisma/migrations/20261123140000_clinic_linking_constraints/migration.sql` (incluye el relleno de `deactivated_at` para membresías ya desactivadas y el `CHECK` de correo en minúsculas), porque la primera ya estaba aplicada sin ellos. Se aplica con `npx prisma migrate dev`.
- [X] T007 [P] Crear `src/modules/tenants/domain/normalized-values.ts`: `normalizeEmail` (minúsculas, sin espacios) y `normalizeDocument` (sin espacios, puntos ni guiones; mayúsculas); ambos devuelven un tipo marcado para que no se comparen valores sin normalizar. Prueba en `tests/unit/modules/tenants/domain/normalized-values.test.ts`.
- [X] T008 [P] Crear `src/modules/tenants/domain/staff-roles.ts` (`StaffRoles` con la regla «al menos uno verdadero» y su descripción: «médico», «administrador» o «médico y administrador») y `src/modules/tenants/domain/clinic-admin-actor.ts` (`ClinicAdminActor = { tenantId, userId, membershipId }`). Prueba en `tests/unit/modules/tenants/domain/staff-roles.test.ts`.
- [X] T009 [P] Crear el puerto `src/modules/tenants/application/ports/out/secret-generator.ts` (genera un token de 32 bytes en base64url y calcula el hash SHA-256; la generación del código de vinculación se suma en T038, junto con su alfabeto y formato) y su adaptador `src/modules/tenants/infrastructure/adapters/node-secret-generator.ts` con `node:crypto`. Prueba en `tests/unit/modules/tenants/infrastructure/node-secret-generator.test.ts` (longitud del token, hash estable) y una versión determinista para pruebas en `tests/support/in-memory/deterministic-secret-generator.ts`.
- [X] T010 [P] Crear el puerto `src/modules/tenants/application/ports/out/invitation-mailer.ts` y el adaptador simulado `src/modules/tenants/infrastructure/adapters/fake-invitation-mailer.ts` (agrega `{ to, subject, text, html }` como una línea JSON a `FAKE_MAIL_OUTBOX_FILE`; nunca sale a la red). Prueba en `tests/unit/modules/tenants/infrastructure/fake-invitation-mailer.test.ts`.
- [X] T011 Crear `src/modules/tenants/infrastructure/adapters/create-invitation-mailer.ts`: elige el adaptador según `INVITATION_MAILER` (`smtp` o `fake`), **sin valor por defecto** (lanza un error claro si falta o es inválido, como `MODEL_INFERENCE`). Mientras T027 no exista, `smtp` falla con un error explícito. Prueba en `tests/unit/modules/tenants/infrastructure/create-invitation-mailer.test.ts`.
- [X] T012 Crear `src/app/_lib/clinic-admin-actor.ts` que traduce el contexto de acceso al `ClinicAdminActor` **solo** si la relación es `STAFF` con `isClinicAdmin`; devuelve `null` para médicos sin ese rol, pacientes y contextos sin clínica. Prueba en `tests/unit/app/clinic-admin-actor.test.ts`.
- [X] T013 Crear `src/modules/tenants/composition.ts` con `getTenantsModule()` siguiendo el patrón de `src/modules/users/composition.ts` (módulo armado la primera vez que se usa, guardado en `globalThis`, sin evaluar variables de entorno al importar). Arranca vacío y cada historia le agrega sus casos de uso.
- [X] T014 [P] Actualizar `tests/support/database.ts` (`resetDatabase`) para que el `TRUNCATE` incluya `"staff_invitations"`, `"patient_link_codes"` y `"patient_link_attempts"`; revisar `tests/support/e2e-database.ts` por si limpia tablas por separado.
- [X] T015 [P] Crear `src/app/(dashboard)/clinic/_lib/clinic-messages.ts` con los textos de pantalla comunes (rechazo por permisos, no disponible, invitación no válida, vinculación fallida, demasiados intentos) en español rioplatense y sin lenguaje técnico.

**Checkpoint**: esquema migrado, valores de dominio, puertos base, actor y composición listos.

---

## Phase 3: User Story 1 — El administrador incorpora personal a su clínica (Priority: P1) 🎯 MVP

**Goal**: un administrador invita por correo; la persona acepta con su cuenta y queda como miembro activo con su rol.

**Independent Test**: con una clínica sembrada y un administrador, invitar a un correo nuevo como médico; la persona se registra, abre el enlace y llega a la clínica con el rol de médico, sin tocar la base ni el script de siembra ([quickstart.md](quickstart.md), recorridos 1 y 2).

### Tests de US1 (escribirlos antes y comprobar que fallan)

- [X] T016 [P] [US1] Prueba de dominio en `tests/unit/modules/tenants/domain/staff-invitation.test.ts`: estado derivado `pending | expired | accepted | revoked` con `now`, vencimiento a los 7 días, y la regla «un miembro con todos los roles de la invitación» frente a «roles nuevos».
- [X] T017 [P] [US1] Prueba del contenido del correo en `tests/unit/modules/tenants/domain/invitation-email.test.ts` según [contracts/invitation-email.md](contracts/invitation-email.md): asunto, rol en palabras, enlace `APP_BASE_URL/invitation/<token>`, aviso de 7 días y de un solo uso, nombre de la clínica escapado en el HTML, sin imágenes remotas.
- [X] T018 [P] [US1] Prueba de los casos de uso con repositorios en memoria en `tests/unit/modules/tenants/application/staff-invitations.test.ts`: `inviteStaff` (correo inválido, `ALREADY_MEMBER`, `MEMBER_DEACTIVATED`, `MAIL_UNAVAILABLE` conservando la invitación), `revokeInvitation`, `resendInvitation` (revoca y crea), `inviteStaff` con la clínica suspendida (`NOT_FOUND`) y `acceptStaffInvitation` (rol nuevo suma a la misma membresía, y `INVALID_INVITATION` único para inexistente, vencida, revocada, usada, correo distinto y miembro desactivado). Repositorios en `tests/support/in-memory/in-memory-staff-repository.ts` y `tests/support/in-memory/in-memory-invitation-repository.ts`.
- [X] T019 [P] [US1] Prueba de integración en `tests/integration/tenants/staff-invitations.test.ts` con la base real: índice único parcial (una pendiente por correo y clínica), aceptación transaccional, `token_hash` único, **rechazo desde otra clínica** de `list`, `revoke` y `resend` (devuelve `NOT_FOUND` sin revelar existencia), `inviteStaff` solo crea en la clínica del actor, `inviteStaff` con la clínica suspendida devuelve `NOT_FOUND`, y dos aceptaciones simultáneas de la misma persona dejan una sola membresía — requisito de la constitución.
- [ ] T020 [P] [US1] Prueba del adaptador SMTP en `tests/unit/modules/tenants/infrastructure/smtp-invitation-mailer.test.ts` con un transporte inyectado (sin red): arma el mensaje correcto, un error se traduce a `MAIL_UNAVAILABLE`, y no registra el cuerpo ni los datos de conexión.
- [X] T021 [P] [US1] Prueba de autorización de las acciones en `tests/unit/app/actions/clinic-staff-actions.test.ts`: un usuario que no es administrador (médico, paciente, sin sesión, sin clínica) es rechazado y **no se llama** al caso de uso; los identificadores mal formados devuelven `NOT_FOUND`, y cada mensaje de rechazo de `clinic-messages.ts` indica el siguiente paso posible (FR-015).

### Implementación de US1

- [X] T022 [P] [US1] Crear `src/modules/tenants/domain/staff-invitation.ts` (estado derivado, vencimiento a 7 días, reglas de roles) y `src/modules/tenants/domain/invitation-email.ts` (arma asunto, texto y HTML).
- [X] T023 [P] [US1] Crear los puertos `src/modules/tenants/application/ports/out/staff-repository.ts` y `src/modules/tenants/application/ports/out/invitation-repository.ts`. Toda lectura y escritura recibe `tenantId` del actor.
- [X] T024 [US1] Implementar `src/modules/tenants/infrastructure/repositories/prisma-staff-repository.ts` y `src/modules/tenants/infrastructure/repositories/prisma-invitation-repository.ts`: cada consulta restringida por `tenant_id` salvo la búsqueda por `token_hash` de la aceptación (la clínica sale de la invitación encontrada). Aceptar y revocar usan una transacción. Depende de T005, T006 y T023.
- [X] T025 [US1] Crear los casos de uso en `src/modules/tenants/application/use-cases/`: `invite-staff.ts`, `list-staff.ts`, `revoke-invitation.ts`, `resend-invitation.ts` y `accept-staff-invitation.ts`, con los resultados y códigos de [contracts/use-cases.md](contracts/use-cases.md). El correo se envía **después** de crear la invitación; si falla, la invitación queda y el resultado es `MAIL_UNAVAILABLE`. Registrar solo códigos de resultado.
- [X] T026 [US1] Conectar en `src/modules/tenants/composition.ts` los repositorios, el generador de secretos y el correo, y exponer los casos de uso de US1.
- [ ] T027 [US1] Implementar `src/modules/tenants/infrastructure/adapters/smtp-invitation-mailer.ts` con `nodemailer` y `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `INVITATION_FROM_ADDRESS`; conexión segura con verificación del certificado; un error se traduce a `MAIL_UNAVAILABLE` sin mostrar el mensaje del servidor. Depende de T001 y T004. Conectarlo en `create-invitation-mailer.ts`.
- [X] T028 [P] [US1] Crear las acciones `src/app/(dashboard)/clinic/_actions/invite-staff.ts`, `revoke-invitation.ts` y `resend-invitation.ts` (`"use server"`): llaman a `requireClinicContextForAction()`, construyen el actor con `clinic-admin-actor.ts`, validan con zod y delegan; sin lógica de negocio.
- [X] T029 [P] [US1] Crear la acción `src/app/(dashboard)/invitation/[token]/_actions/accept-invitation.ts`: usa `getAccessContext()` (acepta `ready` y `no-clinic`), delega en `acceptStaffInvitation` con el `id` y el `email` del contexto, deja activa la clínica nueva con `getUsersModule().selectActiveClinic` y redirige a `/`.
- [X] T030 [US1] Crear la pantalla `src/app/(dashboard)/clinic/staff/page.tsx` con sus componentes en `src/app/(dashboard)/clinic/_components/` (lista de miembros, formulario de invitación con correo y roles, lista de invitaciones pendientes con reenviar y revocar). Un no administrador ve la pantalla de «sin acceso» existente. Tokens semánticos, modo claro y oscuro, responsiva, teclado y foco visibles; reutilizar `src/components/form/*`.
- [X] T031 [US1] Crear la pantalla `src/app/(dashboard)/invitation/[token]/page.tsx`: muestra clínica y rol y el botón «Aceptar»; con `metadata.referrer = "no-referrer"`; un token no válido muestra el mensaje único. Sin sesión, el `proxy` ya redirige a `/sign-in?next=…`: no tocar el flujo de registro.
- [X] T032 [US1] Agregar «Personal» al encabezado en `src/app/(dashboard)/_components/clinic-header.tsx` (solo administradores) y los enlaces al panel «Perfil administrativo» de `src/app/(dashboard)/page.tsx`. Ajustar `tests/unit/app/clinic-header-navigation.test.tsx`.
- [X] T033 [US1] Prueba E2E en `tests/e2e/clinic-staff-invitation.spec.ts` (recorridos 1 y 2 del quickstart) con `INVITATION_MAILER=fake`: invitar, leer el enlace del archivo de salida con un ayudante nuevo `tests/support/e2e-mail.ts`, registrar la cuenta con ese correo, abrir el enlace y comprobar la clínica y el rol; reuso del enlace, correo distinto y un no administrador por POST directo. Depende de T030 y T031.

**Checkpoint**: una clínica puede incorporar personal sin tocar la base de datos. MVP.

---

## Phase 4: User Story 2 — El administrador da de alta pacientes y los asigna a un médico (Priority: P1)

**Goal**: el administrador registra pacientes, recibe el código de vinculación una sola vez y los asigna a un médico; el médico ve solo a los suyos y un administrador que no es médico no accede a los estudios.

**Independent Test**: registrar un paciente con su documento, asignarlo a un médico de la clínica y comprobar que ese médico lo ve y otro médico de la misma clínica no ([quickstart.md](quickstart.md), recorrido 3, pasos 1 a 3). No depende de US1 si el médico viene de la siembra.

### Tests de US2

- [X] T034 [P] [US2] Prueba de dominio en `tests/unit/modules/tenants/domain/patient-link-code.test.ts`: alfabeto de 31 símbolos sin ambiguos, 10 caracteres, formato de pantalla `XXXXX-XXXXX`, normalización (mayúsculas y sin guion), vencimiento a 7 días y estado derivado `active | expired | used | replaced | locked`.
- [X] T035 [P] [US2] Prueba de los casos de uso en `tests/unit/modules/tenants/application/patient-registry.test.ts` con repositorios en memoria (`tests/support/in-memory/in-memory-patient-registry-repository.ts` y `tests/support/in-memory/in-memory-assignment-repository.ts`): `registerPatient` (documento normalizado, `DUPLICATE_PATIENT`, devuelve el código una sola vez), `regeneratePatientLinkCode` (reemplaza al activo, `ALREADY_LINKED`), `assignPatient` (`NOT_A_DOCTOR`, `DOCTOR_DEACTIVATED`, `ALREADY_ASSIGNED`, médico y paciente de la misma clínica) y `listClinicPatients`.
- [X] T036 [P] [US2] Prueba de integración en `tests/integration/tenants/patient-registry.test.ts`: unicidad `(tenant_id, document_type, document_number)`, un solo código `ACTIVE` por paciente, asignación entre clínicas rechazada por la clave compuesta, el médico asignado lista al paciente con `listDoctorPatients` de `studies` y el que no lo está, no; y **rechazo desde otra clínica** de `register`, `regenerate`, `assign`, `list` — requisito de la constitución.
- [X] T037 [P] [US2] Prueba de las acciones en `tests/unit/app/actions/clinic-patients-actions.test.ts`: solo el administrador; el `linkCode` solo está en la respuesta y no se escribe en la URL ni en cookies.

### Implementación de US2

- [X] T038 [P] [US2] Crear `src/modules/tenants/domain/patient-link-code.ts` con el alfabeto, el formato, la normalización, el vencimiento y el estado derivado, y agregar `generateLinkCode` al puerto `secret-generator.ts` y a `node-secret-generator.ts` (y a la versión determinista de pruebas), usando ese alfabeto y formato.
- [X] T039 [P] [US2] Crear los puertos `src/modules/tenants/application/ports/out/patient-registry-repository.ts` y `src/modules/tenants/application/ports/out/assignment-repository.ts`.
- [X] T040 [US2] Implementar `src/modules/tenants/infrastructure/repositories/prisma-patient-registry-repository.ts` y `src/modules/tenants/infrastructure/repositories/prisma-assignment-repository.ts`: toda consulta por `tenant_id`; registrar paciente y su primer código en una transacción; reasignar es terminar la vigente y crear otra en una transacción. Depende de T006 y T039.
- [X] T041 [US2] Crear los casos de uso `register-patient.ts`, `list-clinic-patients.ts`, `regenerate-patient-link-code.ts`, `assign-patient.ts` en `src/modules/tenants/application/use-cases/`. `list-clinic-patients` devuelve documento, estado, médico asignado (y el nombre si ya vinculó su cuenta) con su estado, y **ningún dato clínico**. Conectarlos en `src/modules/tenants/composition.ts`.
- [X] T042 [P] [US2] Crear las acciones `register-patient.ts`, `regenerate-link-code.ts`, `assign-patient.ts` en `src/app/(dashboard)/clinic/_actions/`, con la misma disciplina de autorización que las de US1.
- [X] T043 [US2] Crear la pantalla `src/app/(dashboard)/clinic/patients/page.tsx` y sus componentes: alta de paciente, lista con estado y médico asignado, generar código nuevo, asignar. El código se muestra **una sola vez** con el aviso de que no se podrá ver de nuevo. Mismas reglas de interfaz que T030.
- [X] T044 [US2] Agregar «Pacientes de la clínica» al encabezado y al panel administrativo (`clinic-header.tsx`, `page.tsx`) y ajustar `tests/unit/app/clinic-header-navigation.test.tsx`.
- [X] T045 [US2] Prueba E2E en `tests/e2e/clinic-patients.spec.ts`: registrar, ver el código una vez, asignar, y comprobar que el médico asignado lo ve y otro médico no; un administrador que no es médico no abre estudios.

**Checkpoint**: la clínica puede cargar y asignar pacientes. US1 y US2 juntas dejan una clínica operable.

---

## Phase 5: User Story 3 — Una persona se vincula con su cuenta, en una o más clínicas (Priority: P2)

**Goal**: el paciente se vincula con documento y código; una misma cuenta pertenece a más de una clínica sin cruzar datos.

**Independent Test**: una cuenta sin clínica se vincula con documento y código válidos y ve sus datos; con datos incorrectos recibe siempre el mismo mensaje; con 5 fallos el código queda anulado ([quickstart.md](quickstart.md), recorrido 3 pasos 4 a 8).

### Tests de US3

- [ ] T046 [P] [US3] Prueba del caso de uso en `tests/unit/modules/tenants/application/link-patient-account.test.ts` con repositorios en memoria (`tests/support/in-memory/in-memory-link-attempt-repository.ts`): éxito, mismo `LINK_FAILED` para documento inexistente, código incorrecto, vencido, usado, reemplazado y bloqueado, el 5.º fallo bloquea el código, `TOO_MANY_ATTEMPTS` con 10 fallos en 15 minutos antes de evaluar el código, cuenta que ya es paciente de esa clínica.
- [ ] T047 [P] [US3] Prueba de integración en `tests/integration/tenants/patient-linking.test.ts`: la vinculación es una transacción (asocia `user_id`, pasa a `LINKED`, marca el código `USED`, borra los intentos), `failed_attempts` entre 0 y 5, dos clínicas con el mismo documento resuelven por el código, un registro ya vinculado no se vincula a otra cuenta, las filas de intentos de más de 24 horas se borran, y una cuenta en dos clínicas elige y **no ve datos de la otra** (rechazo entre clínicas).
- [ ] T048 [P] [US3] Prueba de la acción en `tests/unit/app/actions/link-patient-action.test.ts`: acepta contextos `ready` y `no-clinic`, rechaza anónimos, y devuelve el mismo mensaje para todo fallo.

### Implementación de US3

- [ ] T049 [P] [US3] Crear el puerto `src/modules/tenants/application/ports/out/link-attempt-repository.ts` e implementarlo en `src/modules/tenants/infrastructure/repositories/prisma-link-attempt-repository.ts` (solo intentos **fallidos**; al insertar, borra las filas de ese usuario de más de 24 horas; sin documentos, códigos ni clínica).
- [ ] T050 [US3] Crear `src/modules/tenants/application/use-cases/link-patient-account.ts`: busca los registros `PENDING` con ese documento normalizado y un código `ACTIVE` vigente, compara el hash del código, y en cada fallo suma a `failed_attempts` de esos códigos y registra el intento de la cuenta; al 5.º fallo pasa el código a `LOCKED`. Una sola respuesta de rechazo. Conectarlo en la composición.
- [ ] T051 [US3] Crear la acción `src/app/(dashboard)/link-patient/_actions/link-patient.ts` (valida con zod, delega, deja activa la clínica con `getUsersModule().selectActiveClinic` y redirige a `/`) y la pantalla `src/app/(dashboard)/link-patient/page.tsx` con el formulario (tipo y número de documento y código) y los mensajes únicos.
- [ ] T052 [US3] Actualizar `src/app/(dashboard)/no-access/page.tsx`: agregar el enlace a `/link-patient` y la aclaración de que, si recibió una invitación, abra el enlace del correo (y que, si todavía no tiene cuenta, se registre con ese mismo correo y vuelva a abrirlo).
- [ ] T053 [US3] Prueba E2E en `tests/e2e/clinic-patient-linking.spec.ts`: vinculación correcta, mismo mensaje con documento y con código incorrectos, bloqueo al 5.º fallo y regeneración del código, y una persona que pertenece a dos clínicas y las ve en la selección de clínica sin mezclar datos.

**Checkpoint**: el circuito completo funciona de punta a punta para personal y pacientes.

---

## Phase 6: User Story 4 — El administrador ve y desactiva miembros y asignaciones sin perder el historial (Priority: P2)

**Goal**: desactivar y reactivar miembros, terminar asignaciones y avisar al paciente, sin borrar nada y sin dejar la clínica sin administrador.

**Independent Test**: desactivar a un médico con la sesión abierta en otra ventana; pierde el acceso en su siguiente operación, su asignación sigue vigente pero inactiva y el paciente ve el aviso ([quickstart.md](quickstart.md), recorrido 4). Depende de las pantallas de US1 y US2.

### Tests de US4

- [ ] T054 [P] [US4] Prueba de los casos de uso en `tests/unit/modules/tenants/application/member-lifecycle.test.ts` con repositorios en memoria: `deactivateMember` (`LAST_ADMIN`, `ALREADY_DEACTIVATED`, no toca asignaciones), `reactivateMember` (`ALREADY_ACTIVE`, limpia `deactivated_*`), `endAssignment` (`ALREADY_ENDED`, guarda fecha y autor) y `getAttendingDoctorAvailability` (`NO_ASSIGNMENT`, `AVAILABLE` si hay al menos un médico activo, `UNAVAILABLE` solo si todos están desactivados, sin nombres).
- [ ] T055 [P] [US4] Prueba de integración en `tests/integration/tenants/member-lifecycle.test.ts`: dos administradores que se desactivan **a la vez** dejan siempre uno activo (bloqueo de la fila de la clínica), `CHECK` entre `status` y `deactivated_at`, las asignaciones pasadas se conservan con `ended_at` y `ended_by_user_id`, y el **rechazo desde otra clínica** de `deactivate`, `reactivate`, `endAssignment` y `getAttendingDoctorAvailability` (un paciente de otra clínica no cambia el resultado ni revela nada).
- [ ] T056 [P] [US4] Prueba de integración en `tests/integration/tenants/deactivation-access.test.ts`: con una **sesión ya abierta**, desactivar la membresía hace que `getAccessContext` deje de devolver la clínica en la siguiente llamada, y reactivarla la devuelve (FR-009, SC-005). Reutilizar `tests/support/database.ts`.

### Implementación de US4

- [ ] T057 [US4] Agregar a `src/modules/tenants/infrastructure/repositories/prisma-staff-repository.ts` la desactivación con bloqueo de la fila de la clínica (`SELECT … FOR UPDATE`), conteo de administradores activos y rechazo si es el último, y la reactivación; y a `prisma-assignment-repository.ts` terminar una asignación y la consulta de disponibilidad del médico.
- [ ] T058 [US4] Crear los casos de uso `deactivate-member.ts`, `reactivate-member.ts`, `end-assignment.ts` y `get-attending-doctor-availability.ts` en `src/modules/tenants/application/use-cases/` y conectarlos en la composición.
- [ ] T059 [P] [US4] Crear las acciones `deactivate-member.ts`, `reactivate-member.ts` y `end-assignment.ts` en `src/app/(dashboard)/clinic/_actions/`.
- [ ] T060 [US4] Agregar a `src/app/(dashboard)/clinic/staff/page.tsx` los controles de desactivar y reactivar (con el estado visible por texto y no solo por color), y a `src/app/(dashboard)/clinic/patients/page.tsx` la distinción entre asignaciones con médico activo y con médico desactivado, y terminar o reasignar.
- [ ] T061 [US4] Agregar a `src/app/(dashboard)/studies/page.tsx` el aviso «Tu médico ya no está disponible» cuando la disponibilidad es `UNAVAILABLE`, sin datos del médico. La consulta se hace con el `patientId` y el `tenantId` del contexto, no del cliente. Prueba en `tests/unit/app/studies/` junto a las existentes.
- [ ] T062 [US4] Prueba E2E en `tests/e2e/clinic-member-lifecycle.spec.ts`: desactivar a un médico con su sesión abierta y comprobar que pierde el acceso, el aviso al paciente, reasignar y conservar el historial, reactivar y recuperar a sus pacientes, y el rechazo del último administrador.

**Checkpoint**: las cuatro historias funcionan de forma independiente y juntas.

---

## Phase 7: Polish y verificación transversal

- [ ] T063 [P] Prueba de que ningún registro contiene datos personales en `tests/unit/modules/tenants/no-personal-data-in-logs.test.ts`: capturar `console` mientras se ejecutan los casos de uso, incluidos los de fallo, y comprobar que no aparecen correos, documentos, nombres, tokens ni códigos (SC-008).
- [ ] T064 [P] Actualizar `memory/architecture.md` (módulo `tenants`, variables `INVITATION_MAILER`, `SMTP_*`, `INVITATION_FROM_ADDRESS`, `FAKE_MAIL_OUTBOX_FILE`, `APP_BASE_URL`, las dos lecturas sin clínica previa) y `memory/project-structure.md` (carpetas y rutas nuevas).
- [ ] T065 Actualizar `scripts/seed-demo-clinic.ts` si hace falta para que la siembra deje al menos un administrador por clínica y no choque con los documentos normalizados; no cambiar su comportamiento actual.
- [ ] T066 Ejecutar `npm run check` y corregir lo que falle, comprobando en el informe de cobertura que el código nuevo de `src/modules/tenants/` llega al 80 % de líneas por archivo. En Windows, con Git Bash en el `PATH`.
- [ ] T067 Ejecutar `npm run test:e2e` completo y corregir regresiones en las pantallas existentes (encabezado, panel de inicio, `/no-access`, `/studies`).
- [ ] T068 Revisar los cambios con la skill `review-changes` (arquitectura, seguridad e interfaz). Es obligatoria: toca autorización, aislamiento entre clínicas y datos personales.
- [ ] T069 [Responsable] Recorrer a mano [quickstart.md](quickstart.md) con `INVITATION_MAILER=fake` y una vez con `smtp` hacia una dirección propia, y registrar el resultado, con los tiempos de invitar a un médico (SC-001, menos de 3 minutos) y de registrar y asignar un paciente (SC-002, menos de 2 minutos).
- [ ] T070 [Responsable] Antes de desplegar: aplicar la migración a la base de RDS con el procedimiento de siempre y agregar `INVITATION_MAILER`, `SMTP_*`, `INVITATION_FROM_ADDRESS` y `APP_BASE_URL` al secreto `medicia-dev-demo/app` por un canal privado.
- [ ] T071 [Responsable] Revisar el `diff` y hacer `git commit` en los puntos de cierre de cada fase.
- [ ] T072 [P] Prueba E2E de interfaz en `tests/e2e/clinic-responsive.spec.ts`, siguiendo `tests/e2e/studies-responsive.spec.ts`: `/clinic/staff`, `/clinic/patients`, `/invitation/[token]` y `/link-patient` sin desbordes en móvil, tablet y escritorio, en modo claro y oscuro, con navegación por teclado y foco visible, y con los estados (activo, desactivado, pendiente, vencido) comunicados también por texto (constitución VII).
- [ ] T073 [Responsable] Documentar en `infra/README.md` cómo se crea la primera clínica y su primer administrador en la base de la demo (con `scripts/seed-demo-clinic.ts` o con SQL a cargo del responsable), porque sin ese administrador no puede enviarse ninguna invitación (FR-017, supuesto de la spec). Hacerlo antes de T070.

---

## Dependencias y orden de ejecución

- **Setup (Fase 1)**: T001 y T002 son del responsable y pueden hacerse en cualquier momento antes de T027 (correo real). T003 y T004 no bloquean nada más que el adaptador SMTP.
- **Foundational (Fase 2)**: T005 → T006 (migración, del responsable) bloquea toda prueba de integración y todo repositorio de Prisma. T007–T010, T014 y T015 son paralelas. T011 depende de T010; T013 depende de T009 y T010.
- **US1** depende de la Fase 2. **US2** depende de la Fase 2 y **no** de US1 (los médicos vienen de la siembra). **US3** depende de US2 (necesita pacientes con código) y reutiliza la selección de clínica. **US4** depende de las pantallas de US1 y US2.
- Dentro de cada historia: pruebas (deben fallar) → dominio y puertos → repositorios → casos de uso → composición → acciones → pantallas → E2E.
- **Polish** depende de las historias que se entreguen.

### Oportunidades de paralelismo

- Fase 2: T007, T008, T009, T010, T014 y T015 a la vez.
- US1: T016–T021 (pruebas) a la vez; T022 y T023 a la vez; T028 y T029 a la vez.
- US2 puede empezar al terminar la Fase 2, en paralelo con US1, con otra persona o en otra sesión; ambas tocan el encabezado y el panel (T032 y T044), así que esas dos tareas se hacen en orden.
- US3: T046–T048 a la vez; T049 en paralelo con las pruebas.
- US4: T054–T056 a la vez; T059 en paralelo con T058.

## Estrategia de implementación

1. **MVP (US1)**: Fases 1 y 2, luego US1. Con el correo simulado ya se prueba de punta a punta; el adaptador SMTP (T027) se suma al aprobarse la enmienda (T001).
2. **Entrega incremental**: US2 deja una clínica operable (personal y pacientes asignados); US3 permite que los pacientes entren; US4 completa el ciclo de vida.
3. **Puntos de commit sugeridos (los hace el responsable)**: tras la Fase 2 (`feat(tenants): esquema y base de la vinculación de clínica`), tras US1, US2, US3 y US4, cada uno con su mensaje, y uno final de documentación.
4. Cada fase termina con `npm run check` verde antes de seguir.
