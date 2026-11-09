---

description: "Lista de tareas de ingreso y sesión"
---

# Tasks: Ingreso y sesión

**Input**: Documentos de diseño en `/specs/002-ingreso-sesion/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos. La constitución exige pruebas proporcionales al riesgo (autorización, persistencia e integraciones) y la spec pide una prueba por regla (SC-008).

**Organization**: Las tareas se agrupan por historia de usuario. Las fases siguen el orden de dependencia técnica, no el de la spec: **US1 → US3 → US2 → US4**. La razón es que las pantallas de elegir clínica (US2) son protegidas y necesitan el contexto de acceso (US3). Por eso los recorridos de punta a punta (E2E) se escriben al cerrar US2 y US4, cuando el flujo ya es completo; US1 y US3 se verifican con pruebas unitarias y de integración.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US4).
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal. El agente no corre `git commit`, `prisma migrate`, `prisma db` ni `prisma generate`, ni escribe `.env*`: se detiene en esa tarea e indica el comando o el cambio exacto.

## Path Conventions

- Proyecto único: `src/`, `tests/` y `prisma/` en la raíz, según [plan.md](plan.md).
- Las pruebas unitarias replican la estructura de `src/` dentro de `tests/unit/`.
- El código de Next (cookies, redirecciones, Server Actions) vive en `src/app/`. El módulo `src/modules/users/` no importa Next, Prisma ni el SDK de AWS en `domain/` ni en `application/`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: dependencias, variables de entorno y lectura de las guías de Next.

- [ ] T001 [Responsable] Instalar las dependencias aprobadas con versión exacta: `npm install --save-exact @aws-sdk/client-cognito-identity-provider@3.1164.0 aws-jwt-verify@5.2.1 zod@4.6.7`. Actualiza `package.json` y `package-lock.json`. Revisar si hay una versión más reciente del SDK de AWS antes de fijarla (R15).
- [ ] T002 [Responsable] Actualizar las variables de entorno, que los agentes no pueden escribir. En `.env.example`, documentar `IDENTITY_PROVIDER` (`cognito` o `fake`, obligatoria, sin valor por defecto) y `COGNITO_REGION`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID` y `COGNITO_CLIENT_SECRET` (solo con `cognito`; con `fake` deben estar ausentes). En `.env.local`, agregar `IDENTITY_PROVIDER=fake` y ninguna variable `COGNITO_*`.
- [ ] T003 Leer en `node_modules/next/dist/docs/` las guías de las APIs que se usan antes de escribir código de Next: `cookies`, `redirect` (y `unstable_rethrow` si aplica), Server Actions y formularios con `useActionState`, `Suspense` y streaming con `cacheComponents`, y `proxy`. Registrar en R10 de `specs/002-ingreso-sesion/research.md` cualquier diferencia con lo supuesto en el plan, en especial si `cookies().set` y `delete` se permiten en Server Actions en esta versión.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: tabla de sesiones, migración con las restricciones manuales, tipos del dominio, puertos, repositorios y dobles de prueba.

**⚠️ CRÍTICO**: ninguna historia puede empezar hasta terminar esta fase.

- [ ] T004 En `prisma/schema.prisma`: (a) agregar `@@unique([userId, id])` a `StaffMembership` y a `Patient`; (b) agregar el modelo `Session` (tabla `sessions`) con `id` (`uuid(7)`), `userId`, `tokenHash` (único), `createdAt`, `lastActivityAt`, `expiresAt`, `revokedAt` (opcional), `activeStaffMembershipId` (opcional) y `activePatientId` (opcional), fechas `Timestamptz(3)`; (c) relaciones: `userId` hacia `User`; compuesta opcional `(userId, activeStaffMembershipId)` hacia `StaffMembership(userId, id)`; compuesta opcional `(userId, activePatientId)` hacia `Patient(userId, id)`; todas con `onDelete: Restrict` y `onUpdate: Restrict`; (d) índice `(userId)`; (e) relaciones inversas en `User`, `StaffMembership` y `Patient`. Sin contraseña, tokens de Cognito, valor de la cookie ni datos clínicos. Ejecutar `npx prisma validate` (no está reservado). Si Prisma rechaza la relación compuesta opcional que comparte `userId` (R5), usar la alternativa: claves foráneas simples por vínculo y la comprobación de pertenencia en las consultas, y registrarlo en R5. Depende de T001.
- [ ] T005 [Responsable] Generar la migración sin aplicarla: `npx prisma migrate dev --create-only --name session_table` (con la base de Docker levantada). El agente se detiene aquí hasta que exista `prisma/migrations/<fecha>_session_table/migration.sql`. Depende de T004.
- [ ] T006 En `prisma/migrations/<fecha>_session_table/migration.sql`, agregar los `CHECK` de `sessions`: `char_length(token_hash) = 64`; `expires_at > created_at`; `last_activity_at >= created_at`; `revoked_at IS NULL OR revoked_at >= created_at`; `num_nonnulls(active_staff_membership_id, active_patient_id) <= 1`. Nombrarlos `sessions_token_hash_length`, `sessions_expires_after_created`, `sessions_activity_after_created`, `sessions_revoked_after_created` y `sessions_single_active_context`, igual que en la migración de 001. Depende de T005.
- [ ] T007 [Responsable] Aplicar y generar: `npx prisma migrate dev` y `npx prisma generate`. Después ejecutar `npm run typecheck`. Depende de T006.
- [ ] T008 [Responsable] Comprobar que Prisma no elimina los `CHECK` manuales: `npx prisma migrate dev --create-only --name verify_session_constraints`, revisar que el SQL generado quede vacío y borrar esa migración. Registrar el resultado en R2 de `specs/001-modelo-datos-acceso/research.md`. Depende de T007.
- [ ] T009 Actualizar `tests/support/integration-setup.ts` para exigir también la tabla `sessions` (con el mismo mensaje en español si falta), y `tests/support/database.ts`: agregar `"sessions"` al principio del `TRUNCATE` de `resetDatabase()` y una fábrica `createSession` con valores válidos por defecto (hash de 64 caracteres único por llamada, `createdAt`, `lastActivityAt` y `expiresAt` con el reloj de la aplicación y 12 horas de vigencia, sin vínculo activo). Depende de T007.
- [ ] T010 [P] Crear `src/modules/users/domain/session-policy.ts`: constantes con nombre `SESSION_IDLE_TIMEOUT_MS` (30 minutos), `SESSION_ABSOLUTE_TIMEOUT_MS` (12 horas) y `ACTIVITY_WRITE_INTERVAL_MS` (1 minuto); `isSessionCurrent({ session, user, now })` pura, que devuelve un motivo cerrado (`REVOKED`, `EXPIRED`, `IDLE`, `INVALIDATED_BY_PASSWORD_CHANGE`) o `CURRENT`; y `shouldRecordActivity({ lastActivityAt, now })`. Sin dependencias de Next, Prisma ni AWS. Depende de T007.
- [ ] T011 [P] Crear `src/modules/users/domain/session-token.ts`: `generateSessionToken()` (32 bytes aleatorios en base64url) y `hashSessionToken(token)` (SHA-256 en hexadecimal, 64 caracteres), con `node:crypto`. Depende de T007.
- [ ] T012 [P] Crear `src/modules/users/domain/access-context.ts` con los tipos de [contracts/access-context.md](contracts/access-context.md): `AccessUser`, `ActiveClinic`, `ClinicRelationship` (unión `STAFF` / `PATIENT`) y `AccessContext` (unión `anonymous` / `no-clinic` / `ready`); y `src/modules/users/domain/available-clinic.ts` con `AvailableClinic` (identificador del vínculo, tipo, nombre de la clínica y roles). Depende de T007.
- [ ] T013 [P] Crear `src/modules/users/domain/identity-errors.ts`: clase `IdentityError` con el código cerrado `INVALID_CREDENTIALS`, `INVALID_CODE`, `INVALID_PASSWORD` o `UNAVAILABLE`, sin guardar el mensaje original del proveedor (R12). Depende de T007.
- [ ] T014 [P] Crear el puerto `src/modules/users/application/ports/out/identity-provider.ts` con las operaciones de [contracts/identity-provider.md](contracts/identity-provider.md): `signUp`, `confirmSignUp`, `resendConfirmationCode`, `signIn` (devuelve `{ subject, email, fullName }`), `requestPasswordReset` y `confirmPasswordReset`. Depende de T013.
- [ ] T015 [P] Crear el puerto `src/modules/users/application/ports/out/session-repository.ts`: `create`, `findByTokenHash` (devuelve la sesión con la cuenta y el vínculo activo con su clínica, en una sola consulta), `recordActivity`, `setActiveContext`, `revoke`. Depende de T012.
- [ ] T016 [P] Crear el puerto `src/modules/users/application/ports/out/user-repository.ts`: `upsertFromIdentity({ subject, email, fullName })` (devuelve `AccessUser`; falla con un error propio si el correo ya pertenece a otro `subject`) e `invalidateSessionsByEmail({ email, now })`. Depende de T012.
- [ ] T017 [P] Crear el puerto `src/modules/users/application/ports/out/clinic-access-repository.ts`: `listAvailableClinics(userId)` y `findAvailableClinic({ userId, kind, relationshipId })`, ambos solo con vínculos vigentes en clínicas activas. Depende de T012.
- [ ] T018 [P] Escribir primero `tests/unit/shared/utils/safe-redirect.test.ts`: acepta `/`, `/select-clinic` y rutas con consulta; reemplaza por `/` las que no empiezan con `/`, las que empiezan con `//` o `/\`, las que traen esquema o host (`https://...`, `javascript:...`), las codificadas (`/%2F...`, `%5C`) y las que tienen caracteres de control o saltos de línea; devuelve `/` si el valor es nulo o vacío (R9). Debe fallar antes de T019.
- [ ] T019 Crear `src/shared/utils/safe-redirect.ts` con `getSafeRedirectPath(value: unknown): string`, cumpliendo T018. Depende de T018.
- [ ] T020 Crear `src/modules/users/infrastructure/repositories/prisma-user-repository.ts`: implementa `UserRepository` con el cliente compartido. `upsertFromIdentity` busca por `cognitoSub`, crea con el correo en minúsculas si no existe, y no pisa el nombre de una cuenta existente; un choque de correo con otro `subject` se convierte en un error propio sin exponer el de Prisma. `invalidateSessionsByEmail` pone `sessionsValidFrom = now` donde el correo coincide, o no hace nada si no existe. `import 'server-only'`; los tipos de Prisma no salen del archivo. Depende de T016 y T007.
- [ ] T021 Crear `src/modules/users/infrastructure/repositories/prisma-session-repository.ts`: implementa `SessionRepository`. `findByTokenHash` resuelve en una sola consulta la sesión, la cuenta, la membresía activa o el paciente activo, y la clínica de ese vínculo, y la convierte a tipos del dominio. Todas las escrituras usan el reloj recibido, no `CURRENT_TIMESTAMP`. `setActiveContext` limpia un vínculo y completa el otro en una sola actualización. Depende de T015 y T007.
- [ ] T022 Crear `src/modules/users/infrastructure/repositories/prisma-clinic-access-repository.ts`: implementa `ClinicAccessRepository` con dos consultas por `userId` (membresías `ACTIVE` y pacientes `LINKED`, ambos en clínicas `ACTIVE`) que usan los índices `(userId)` existentes. Depende de T017 y T007.
- [ ] T023 [P] Crear dobles en memoria en `tests/support/in-memory/`: `in-memory-user-repository.ts`, `in-memory-session-repository.ts` e `in-memory-clinic-access-repository.ts`, que cumplen los puertos y permiten inspeccionar su estado, para las pruebas unitarias de los casos de uso. Depende de T015, T016 y T017.

**Checkpoint**: la tabla existe, los tipos, los puertos y los repositorios están listos. Las historias pueden empezar.

---

## Phase 3: User Story 1 - Crear una cuenta e ingresar (Priority: P1) 🎯 MVP

**Goal**: una persona crea su cuenta con correo verificado, ingresa con correo y contraseña y obtiene una sesión, con mensajes que no revelan si un correo tiene cuenta.

**Independent Test**: con el proveedor simulado, registrar una cuenta, verificarla con el código y ingresar; probar también el ingreso sin verificar, con credenciales incorrectas y con un correo ya registrado. Se comprueba con pruebas unitarias y de integración; el recorrido E2E se cierra en Phase 5.

### Tests for User Story 1 ⚠️

> Escribir primero y comprobar que fallan antes de implementar.

- [ ] T024 [P] [US1] `tests/unit/modules/users/infrastructure/in-memory-identity-provider.test.ts`: el flujo de registro y verificación con el código `000000`; contraseñas fuera de 12 a 128 caracteres devuelven `INVALID_PASSWORD`; registrar un correo ya existente devuelve el mismo resultado; el ingreso de una cuenta sin verificar y el de una contraseña incorrecta devuelven `INVALID_CREDENTIALS`; el `subject` es el mismo para el mismo correo; la fábrica se niega a iniciar si está definida alguna variable `COGNITO_*` (R11).
- [ ] T025 [P] [US1] `tests/unit/modules/users/infrastructure/identity-provider-from-env.test.ts`: sin `IDENTITY_PROVIDER` lanza un error; con un valor desconocido lanza un error; `fake` devuelve el simulado; `cognito` con variables completas devuelve el de Cognito y con alguna faltante lanza un error que no incluye el secreto (R11, R13).
- [ ] T026 [P] [US1] `tests/unit/infrastructure/aws/cognito/config-and-secret-hash.test.ts`: `loadCognitoConfig` valida las cuatro variables con `zod`; `computeSecretHash` coincide con un valor conocido de HMAC-SHA256 en base 64 del correo más el ID de cliente.
- [ ] T027 [P] [US1] `tests/unit/infrastructure/aws/cognito/cognito-identity-provider.test.ts`, con el cliente del SDK y el verificador de JWT simulados: cada operación envía `SECRET_HASH`; `UsernameExistsException` en el registro se absorbe; `UserNotFoundException`, `NotAuthorizedException`, `UserNotConfirmedException` y los desafíos devuelven `INVALID_CREDENTIALS`; `CodeMismatchException` y `ExpiredCodeException` devuelven `INVALID_CODE`; `InvalidPasswordException` devuelve `INVALID_PASSWORD`; cualquier otro error devuelve `UNAVAILABLE`; un ID token que no valida (firma, emisor, cliente, `token_use` o `email_verified` falso) devuelve `INVALID_CREDENTIALS`; los tokens, la contraseña y el código nunca aparecen en lo que se registra (FR-028).
- [ ] T028 [P] [US1] `tests/unit/modules/users/application/account-registration.test.ts`, con dobles: `register-account`, `confirm-account` y `resend-confirmation-code` devuelven siempre el resultado uniforme salvo errores de forma o `UNAVAILABLE`; normalizan el correo a minúsculas; no registran contraseña, código ni correo.
- [ ] T029 [P] [US1] `tests/unit/modules/users/application/sign-in.test.ts`: ingreso correcto crea la cuenta propia en el primer ingreso y la reutiliza después (FR-007); crea la sesión con `expiresAt` = inicio + 12 horas, `lastActivityAt` = inicio, sin vínculo activo, y guarda el hash y no el identificador; devuelve el identificador solo una vez; cada falla del proveedor se propaga como `IdentityError` sin detalles; un choque de correo con otro `subject` falla sin crear sesión.
- [ ] T030 [P] [US1] `tests/integration/session-access/session-storage.test.ts`: crear una sesión con `tokenHash` repetido es rechazado por su unicidad; un `tokenHash` de largo distinto de 64 por `sessions_token_hash_length`; `expiresAt` no posterior a `createdAt` por `sessions_expires_after_created`; `lastActivityAt` anterior por `sessions_activity_after_created`; `revokedAt` anterior por `sessions_revoked_after_created`; `upsertFromIdentity` crea una vez, reutiliza por `cognitoSub`, guarda el correo en minúsculas, y rechaza sin crear nada un correo que ya tiene otro `subject`. Usa `expectRejectedBy` con el nombre de la restricción, como en 001.

### Implementation for User Story 1

- [ ] T031 [P] [US1] Crear `src/modules/users/infrastructure/adapters/in-memory-identity-provider.ts`: implementa el puerto en memoria, con el código fijo `000000`, la política de 12 a 128 caracteres, un `subject` estable derivado del correo (UUID determinista, exportado como `fakeSubjectForEmail`) y la fábrica que se niega a iniciar si hay variables `COGNITO_*` definidas. Cumple T024. Depende de T014.
- [ ] T032 [P] [US1] Crear `src/infrastructure/aws/cognito/config.ts` (`loadCognitoConfig` con `zod`, sin incluir el secreto en los errores) y `src/infrastructure/aws/cognito/secret-hash.ts` (`computeSecretHash`). Cumple T026. Depende de T001.
- [ ] T033 [US1] Crear `src/infrastructure/aws/cognito/cognito-identity-provider.ts`: implementa el puerto con `SignUp`, `ConfirmSignUp`, `ResendConfirmationCode`, `InitiateAuth` (`USER_PASSWORD_AUTH`), `ForgotPassword` y `ConfirmForgotPassword`; valida el ID token con `aws-jwt-verify` (`tokenUse: "id"`, ID de cliente, `email_verified`) y lo descarta; mapea los errores según R4 y [contracts/identity-provider.md](contracts/identity-provider.md); registra solo códigos internos (R12). Recibe el cliente del SDK y el verificador por parámetro para poder probarlo. Antes de dar la tarea por cerrada, confirmar que el SDK funciona sin credenciales de AWS (R3); si no, pasar una configuración anónima explícita y registrarlo. Cumple T027. Depende de T032 y T014.
- [ ] T034 [US1] Crear `src/modules/users/infrastructure/adapters/identity-provider-from-env.ts`: `createIdentityProvider(env)` según `IDENTITY_PROVIDER`, sin valor por defecto (R11). Cumple T025. Depende de T031 y T033.
- [ ] T035 [P] [US1] Crear los casos de uso `src/modules/users/application/use-cases/register-account.ts`, `confirm-account.ts` y `resend-confirmation-code.ts`: normalizan el correo, llaman al puerto y devuelven resultados cerrados; sin Next ni Prisma. Cumple T028. Depende de T014.
- [ ] T036 [US1] Crear `src/modules/users/application/use-cases/sign-in.ts`: llama a `identity.signIn`, hace `upsertFromIdentity`, genera el identificador con `generateSessionToken`, guarda `hashSessionToken(token)` con `expiresAt` y `lastActivityAt` del reloj inyectado, y devuelve `{ token, expiresAt }` sin vínculo activo. Cumple T029. Depende de T011, T015, T016, T014 y T010.
- [ ] T037 [US1] Crear `src/modules/users/composition.ts`: conecta los casos de uso con `createIdentityProvider(process.env)`, los repositorios de Prisma y `() => new Date()`. Se amplía en las historias siguientes. Depende de T034, T035, T036, T020 y T021.
- [ ] T038 [P] [US1] Crear `src/app/_lib/session-cookie.ts` (`import 'server-only'`): `setSessionCookie`, `readSessionToken` y `clearSessionCookie` con `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`, `Secure` en producción, `Max-Age` igual al tiempo restante de la sesión y nombre `medicia-session` (R10). Depende de T003.
- [ ] T039 [P] [US1] Crear los componentes de formulario reutilizables en `src/components/form/` (campo con etiqueta y error en texto, resumen de error del formulario, botón de envío con estado de carga), con los tokens semánticos de `memory/design.md`, foco visible y errores comunicados con texto además de color (constitución VII). Depende de T003.
- [ ] T040 [US1] Crear las acciones `src/app/(auth)/_actions/sign-up.ts`, `confirm-account.ts` y `resend-confirmation-code.ts` con los esquemas `zod` de R13 (correo recortado y en minúsculas, nombre de 2 a 120 caracteres, contraseña de 12 a 128, código de 6 dígitos) y los mensajes cerrados de [contracts/screens-and-actions.md](contracts/screens-and-actions.md). Depende de T037 y T039.
- [ ] T041 [US1] Crear la acción `src/app/(auth)/_actions/sign-in.ts`: valida la forma, llama al caso de uso, escribe la cookie y redirige a `getSafeRedirectPath(next)`; ante cualquier falla muestra el único mensaje de credenciales. Depende de T037, T038, T019 y T039.
- [ ] T042 [US1] Crear las pantallas `src/app/(auth)/sign-in/page.tsx`, `sign-up/page.tsx` (con el paso del código en la misma pantalla y el correo solo en el estado del formulario), `verify-email/page.tsx` y `src/app/(auth)/layout.tsx`. La pantalla de ingreso muestra siempre los enlaces a `/forgot-password`, `/sign-up` y "¿No verificaste tu correo?" (R4). Textos en español con mayúscula inicial solo en la primera palabra, atributos `autocomplete` correctos, y funcionales en móvil, tablet y escritorio, en claro y oscuro. Depende de T040 y T041.

**Checkpoint**: se puede registrar una cuenta, verificarla e iniciar sesión con el proveedor simulado; las pruebas de US1 pasan.

---

## Phase 4: User Story 3 - La plataforma sabe quién es y dónde trabaja (Priority: P1)

**Goal**: en cada solicitud se resuelve la persona y su clínica activa, revalidando que la sesión y el vínculo sigan vigentes; un cambio de estado corta el acceso en la solicitud siguiente.

**Independent Test**: con una sesión abierta, suspender la clínica, desactivar la membresía o revocar al paciente, y comprobar que la solicitud siguiente deja de tener contexto; vencer, revocar o invalidar la sesión y comprobar que se resuelve como anónima.

### Tests for User Story 3 ⚠️

- [ ] T043 [P] [US3] `tests/unit/modules/users/domain/session-policy.test.ts`: `isSessionCurrent` en los límites exactos (29:59 y 30:00 de inactividad; 11:59:59 y 12:00:00 de antigüedad), revocada, e invalidada por `sessionsValidFrom` posterior; `shouldRecordActivity` en 59 y 60 segundos.
- [ ] T044 [P] [US3] `tests/unit/modules/users/application/get-access-context.test.ts`, con dobles: sin token, token desconocido o sesión no vigente devuelven `anonymous`; sesión vigente sin vínculo activo o con vínculo no vigente devuelve `no-clinic`; sesión con vínculo vigente devuelve `ready` con el `tenantId` de la clínica del vínculo y los roles; registra la actividad solo si pasó más de un minuto; el resultado no incluye `tokenHash` ni campos de la cuenta fuera de `AccessUser`.
- [ ] T045 [P] [US3] `tests/integration/session-access/context-resolution.test.ts`, contra PostgreSQL real: (a) con una sesión abierta, suspender la clínica, desactivar la membresía o revocar al paciente hace que el contexto pase a `no-clinic` en la lectura siguiente (SC-002); (b) una sesión vencida por inactividad o por tiempo absoluto, una revocada y una anterior a `sessionsValidFrom` se resuelven como `anonymous`, y una creada después sigue vigente (SC-005); (c) crear una sesión de la cuenta A con la membresía o el paciente de la cuenta B es rechazado por la clave foránea compuesta, y con ambos vínculos a la vez por `sessions_single_active_context` (SC-003); (d) una sesión con el vínculo de la clínica A nunca devuelve datos de la clínica B, aunque la persona también pertenezca a B (constitución II); (e) dos sesiones de la misma cuenta tienen clínicas activas independientes (FR-021). Usa `expectRejectedBy` con el nombre de la restricción.

### Implementation for User Story 3

- [ ] T046 [US3] Crear `src/modules/users/application/use-cases/get-access-context.ts`: calcula el hash del token, busca la sesión, aplica `isSessionCurrent`, verifica que el vínculo activo siga vigente (membresía `ACTIVE`, paciente `LINKED`, clínica `ACTIVE`), registra la actividad solo si `shouldRecordActivity`, y devuelve `AccessContext`. Cumple T044. Depende de T010, T011, T012 y T015.
- [ ] T047 [US3] Ampliar `src/modules/users/composition.ts` con `getAccessContext`. Depende de T046 y T037.
- [ ] T048 [US3] Crear `src/app/_lib/access.ts` (`import 'server-only'`): `getAccessContext` (lee la cookie, llama al caso de uso, memoizada con `cache` de React solo dentro de un render, sin `use cache`), `requireClinicContext()` (redirige a `/sign-in` si es anónimo y a `/select-clinic` si no hay clínica activa) y `requireClinicContextForAction()` (devuelve un error de autorización en vez de redirigir), según [contracts/access-context.md](contracts/access-context.md). Depende de T047 y T038.
- [ ] T049 [US3] Crear `src/proxy.ts`: comprobación optimista (R6). Si la ruta es protegida y no hay cookie de sesión, redirige a `/sign-in?next=<ruta>`; no consulta la base. Las rutas públicas son las de `(auth)`; el `matcher` negativo excluye los recursos estáticos. Un comentario aclara que la validación real está en `getAccessContext`. Depende de T003.
- [ ] T050 [US3] Crear el inicio provisional: reemplazar la página de plantilla `src/app/page.tsx` por una pantalla protegida (grupo `(dashboard)` con `layout.tsx`) que, dentro de `<Suspense>`, muestra el nombre de la clínica activa y el tipo de vínculo; sin leer la sesión en el nivel superior del layout. Actualizar `tests/unit/app/page.test.tsx` y `tests/e2e/home.spec.ts`, que apuntan a la plantilla anterior. Depende de T048 y T049.
- [ ] T051 [US3] Preparar las pruebas E2E con base de datos: crear `tests/support/e2e-database.ts` (cliente de Prisma propio, sin `server-only`, que Playwright puede cargar; se niega a correr si la base no es local; incluye los datos de prueba de clínicas, vínculos y la acción de suspender una clínica), y en `playwright.config.ts` cargar `.env.local` y pasar `DATABASE_URL` e `IDENTITY_PROVIDER=fake` al servidor de pruebas. Depende de T009.

**Checkpoint**: cada solicitud resuelve su contexto y lo revalida; las pruebas de US3 pasan.

---

## Phase 5: User Story 2 - Elegir la clínica activa (Priority: P1)

**Goal**: la persona ve sus clínicas vigentes, elige una (o entra directo si tiene una sola), puede cambiar sin cerrar sesión, y ve un estado vacío si no tiene ninguna.

**Independent Test**: con cuentas que tengan cero, una y varias clínicas, en distintas combinaciones de vínculo y estado, comprobar qué se ofrece, que elegir una clínica ajena se rechaza y que el cambio de clínica no deja nada de la anterior.

### Tests for User Story 2 ⚠️

- [ ] T052 [P] [US2] `tests/unit/modules/users/application/clinic-selection.test.ts`, con dobles: `list-available-clinics` devuelve los vínculos con nombre y tipo; `select-active-clinic` activa un vínculo disponible, rechaza uno ajeno, inexistente o no vigente con el mismo error, y recibe un identificador de vínculo, nunca un `tenantId`; `sign-in` activa sola la única clínica disponible y devuelve el siguiente paso (`HOME`, `SELECT_CLINIC` o `NO_ACCESS`).
- [ ] T053 [P] [US2] `tests/integration/session-access/clinic-selection.test.ts`: la lista incluye solo membresías `ACTIVE` y pacientes `LINKED` en clínicas `ACTIVE`, y excluye desactivadas, pendientes, revocadas y suspendidas (FR-017, SC-006); una persona personal en una clínica y paciente en otra ve ambas con su tipo; elegir un vínculo de otra cuenta, de una clínica suspendida o inexistente es rechazado con el mismo error y la sesión no cambia (FR-022, SC-003); activar un vínculo limpia el otro; cambiar de la clínica A a la B deja la sesión solo con B.

### Implementation for User Story 2

- [ ] T054 [P] [US2] Crear `src/modules/users/application/use-cases/list-available-clinics.ts`. Depende de T017.
- [ ] T055 [P] [US2] Crear `src/modules/users/application/use-cases/select-active-clinic.ts`: recibe `{ userId, sessionId, kind, relationshipId }`, comprueba con `findAvailableClinic` que el vínculo sea de esa persona y esté vigente, y llama a `setActiveContext`. Cumple T052. Depende de T015 y T017.
- [ ] T056 [US2] Ampliar `src/modules/users/application/use-cases/sign-in.ts`: después de crear la sesión, consultar las clínicas disponibles; si hay exactamente una, activarla en el mismo paso; devolver el siguiente paso `HOME`, `SELECT_CLINIC` o `NO_ACCESS` (FR-019). Ajustar `src/app/(auth)/_actions/sign-in.ts` para redirigir según ese paso y a `next` solo si el paso es `HOME`. Depende de T054, T036 y T041.
- [ ] T057 [US2] Ampliar `src/modules/users/composition.ts` con `listAvailableClinics` y `selectActiveClinic`. Depende de T054, T055 y T047.
- [ ] T058 [US2] Crear la acción `src/app/(dashboard)/_actions/select-clinic.ts`: valida con `zod` el valor `STAFF:<uuid>` o `PATIENT:<uuid>`, llama a `requireClinicContextForAction` o a la comprobación de sesión, ejecuta el caso de uso y redirige a `/`; ante cualquier rechazo muestra el mensaje de clínica no disponible. Depende de T057 y T048.
- [ ] T059 [US2] Crear las pantallas `src/app/(dashboard)/select-clinic/page.tsx` y `no-access/page.tsx`, y el encabezado `src/app/(dashboard)/_components/clinic-header.tsx` con el nombre de la clínica activa siempre visible y el selector para cambiar, dentro de `<Suspense>`. `no-access` explica que necesita una invitación y que un acceso anterior puede haber dejado de estar vigente, con el botón de cierre de sesión pendiente de US4; sin clínicas, `select-clinic` redirige a `no-access`. Depende de T058 y T050.
- [ ] T060 [US2] Escribir `tests/e2e/clinic-selection.spec.ts`, usando `tests/support/e2e-database.ts` y el proveedor simulado: (a) registro, verificación con `000000` e ingreso de una cuenta sin clínicas llevan a `/no-access` (US1 y US2); (b) con un vínculo creado en la base, entra directo a `/` mostrando la clínica; (c) con varios, muestra `/select-clinic`, elige una y cambia a otra desde el encabezado; (d) abrir `/` sin sesión redirige a `/sign-in?next=/` y tras ingresar vuelve a `/`; un `next` externo (`https://...` o `//host`) se ignora; (e) con la sesión abierta, suspender la clínica en la base y recargar lleva a `/no-access` o a la selección; (f) el mismo mensaje de credenciales para un correo inexistente y una contraseña incorrecta (SC-004). Se ejecuta en escritorio, tablet y móvil. Depende de T059 y T051.

**Checkpoint**: el flujo de entrada a una clínica está completo; las pruebas de US1, US2 y US3 pasan, incluida la E2E.

---

## Phase 6: User Story 4 - Cerrar sesión y recuperar la contraseña (Priority: P2)

**Goal**: cerrar sesión la invalida de inmediato; recuperar la contraseña con un código invalida todas las sesiones anteriores.

**Independent Test**: cerrar sesión y comprobar que la cookie ya no sirve; con otra sesión abierta, recuperar la contraseña y comprobar que esa sesión deja de valer.

### Tests for User Story 4 ⚠️

- [ ] T061 [P] [US4] `tests/unit/modules/users/application/session-and-password.test.ts`, con dobles: `sign-out` revoca la sesión y no falla si ya no es vigente o no existe; `request-password-reset` devuelve siempre el mismo resultado; `reset-password` llama a `invalidateSessionsByEmail` solo después de que el proveedor confirmó el cambio y nunca si el proveedor falló (R8); un fallo de la base después del cambio se registra sin datos personales y se informa.
- [ ] T062 [P] [US4] `tests/integration/session-access/sign-out-and-reset.test.ts`: cerrar una sesión completa `revokedAt`, conserva la fila y deja vigente otra sesión de la misma cuenta (FR-011, FR-021); `invalidateSessionsByEmail` invalida todas las sesiones anteriores a `now` y no las creadas después, y no hace nada si el correo no tiene cuenta propia (FR-016, SC-005).

### Implementation for User Story 4

- [ ] T063 [P] [US4] Crear los casos de uso `src/modules/users/application/use-cases/sign-out.ts`, `request-password-reset.ts` y `reset-password.ts`. Cumplen T061. Depende de T015, T016 y T014.
- [ ] T064 [US4] Ampliar `src/modules/users/composition.ts` con `signOut`, `requestPasswordReset` y `resetPassword`. Depende de T063 y T057.
- [ ] T065 [US4] Crear las acciones `src/app/(dashboard)/_actions/sign-out.ts` (revoca, borra la cookie y redirige a `/sign-in`; funciona aunque la sesión ya no sea vigente) y `src/app/(auth)/_actions/request-password-reset.ts` y `reset-password.ts` con los esquemas `zod` y los mensajes cerrados. Depende de T064 y T038.
- [ ] T066 [US4] Crear las pantallas `src/app/(auth)/forgot-password/page.tsx` y `reset-password/page.tsx`, y agregar el botón "Cerrar sesión" al encabezado `clinic-header.tsx` y a la pantalla `no-access`. Depende de T065 y T059.
- [ ] T067 [US4] Escribir `tests/e2e/session-and-recovery.spec.ts`: (a) cerrar sesión lleva a `/sign-in` y `/` deja de abrirse; (b) recuperar la contraseña con el código `000000` y definir una nueva; una sesión abierta en otro contexto del navegador deja de valer y la contraseña anterior no sirve; (c) un código incorrecto no cambia nada; (d) el mensaje de recuperación es el mismo exista o no el correo; (e) vencer la inactividad en la base (retrasando `lastActivityAt`) lleva a `/sign-in`. En escritorio, tablet y móvil. Depende de T066 y T051.

**Checkpoint**: las cuatro historias funcionan y se pueden probar por separado.

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T068 Actualizar `.github/workflows/ci.yml`: el job `e2e` necesita el servicio de PostgreSQL, `DATABASE_URL`, `npx prisma generate`, `npx prisma migrate deploy` e `IDENTITY_PROVIDER=fake`, igual que el job `check`. El job `check` también define `IDENTITY_PROVIDER=fake`. Sin comprobar en local: solo corre en GitHub (informarlo). Depende de T067.
- [ ] T069 [P] Actualizar `memory/project-structure.md`: `proxy.ts` y `src/app/_lib/` en la estructura general, y la regla de que las cookies y las redirecciones viven en `src/app/`.
- [ ] T070 Ejecutar `npm run check` y corregir lo que falle. Confirmar la cobertura de al menos 80 % de líneas por archivo en `src/modules/users`, `src/infrastructure/aws/cognito` y `src/shared/utils`. Ejecutar `npm run test:e2e` y comprobar que pasa en los tres proyectos.
- [ ] T071 Revisar la interfaz en las seis combinaciones (escritorio, tablet y móvil, claro y oscuro): tokens semánticos sin colores fijos, foco visible, recorrido completo con teclado, errores con texto además de color, sin desbordes (constitución VII, FR-030). Corregir lo que falle.
- [ ] T072 [Responsable] Verificar con un grupo de usuarios de Cognito de desarrollo, cuando exista (pasos de [quickstart.md](quickstart.md)). Registrar en `research.md` el resultado de los puntos marcados **a verificar**: SDK sin credenciales de AWS (R3), respuesta ante una cuenta sin verificar (R4) y cookie `Secure` en `http://localhost` (R10). Si algún resultado contradice el plan, volver a `speckit-plan`.
- [ ] T073 Ejecutar la guía de [quickstart.md](quickstart.md) y marcar cada recorrido. Informar lo que no se haya podido verificar (CI en GitHub y Cognito real).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: sin dependencias.
- **Foundational (Phase 2)**: depende de T001 (T004 en adelante). Bloquea todas las historias. Los pasos de Prisma son del responsable (T005, T007, T008).
- **US1 (Phase 3)**: depende de Foundational.
- **US3 (Phase 4)**: depende de Foundational y de US1 (la cookie y la sesión creada al ingresar).
- **US2 (Phase 5)**: depende de US1 y US3.
- **US4 (Phase 6)**: depende de US1 y de US3 (acceso al encabezado de US2 para el botón).
- **Polish (Phase 7)**: depende de todas.

### Within Each User Story

- Las pruebas se escriben primero y deben fallar antes de implementar.
- Dominio y puertos antes que casos de uso; casos de uso antes que `composition.ts`; `composition.ts` antes que acciones; acciones antes que pantallas.
- Las tareas que modifican `composition.ts` o `sign-in.ts` van en orden (T037, T047, T057, T064; T036, T056).

### Parallel Opportunities

- En Foundational: T010 a T017 y T023 son independientes entre sí una vez aplicada la migración (T007).
- En cada historia, las tareas de pruebas marcadas [P] se pueden escribir juntas.
- En US1: T031, T032, T035, T038 y T039 son independientes.

## Parallel Example: Foundational

```text
# Después de T007, en paralelo:
Task: "T010 session-policy.ts"        Task: "T011 session-token.ts"
Task: "T012 access-context.ts"        Task: "T013 identity-errors.ts"
Task: "T014 puerto identity-provider" Task: "T015 puerto session-repository"
```

## Implementation Strategy

### MVP primero (US1 + US3 + US2)

1. Setup y Foundational (con los pasos del responsable en la migración).
2. US1: cuenta e ingreso.
3. US3: el contexto verificado en cada solicitud.
4. US2: elegir y cambiar de clínica; aquí se cierra el primer recorrido E2E.
5. **Detenerse y validar** antes de seguir.

### Entrega incremental

1. Cada fase termina en un checkpoint; si se corta ahí, lo hecho funciona y está probado.
2. US4 (cierre de sesión y recuperación) se agrega sin cambiar lo anterior.
3. La verificación con Cognito real (T072) no bloquea el resto.

### Puntos de commit sugeridos

- Al terminar la migración (T008).
- Al terminar cada fase, y dentro de US1 y US3 después de las pruebas y después de la implementación.
- Con las correcciones de `review-changes`, al final.

## Notes

- [P] = archivos distintos, sin dependencias pendientes.
- [Story] relaciona cada tarea con la historia de la spec.
- Cada Server Action y Route Handler autentica y autoriza por su cuenta; el `proxy` no es la defensa.
- No registrar contraseñas, códigos, tokens, valores de cookie ni correos (FR-028).
- Evitar tareas vagas, conflictos en un mismo archivo y dependencias entre historias que rompan su independencia.
