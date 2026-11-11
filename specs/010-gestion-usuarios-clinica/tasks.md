---

description: "Lista de tareas de la gestión de usuarios de una clínica"
---

# Tasks: Gestión de usuarios de una clínica

**Input**: Documentos de diseño en `/specs/010-gestion-usuarios-clinica/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos, con ritmo rápido: pocas pruebas, puestas donde está el riesgo (aislamiento entre clínicas, alta simultánea, último administrador en paralelo, baja con sesión abierta, respuesta uniforme del alta, privacidad en los registros). Unitarias en `tests/unit/` (replicando `src/`), de integración en `tests/integration/clinic-users/` contra el PostgreSQL local de Docker y E2E en `tests/e2e/`. Cobertura mínima del 80 % de líneas por archivo en lo nuevo de `src/modules` y `src/infrastructure`.

**Organization**: Seis fases, cada una cerrada con un punto de commit: (1) fundamentos, datos, infraestructura y puertos; (2) US1, las listas; (3) US2, el alta directa; (4) US3, las asignaciones; (5) US4, las bajas y reactivaciones; (6) E2E y cierre. Hasta el final todo se prueba con el correo y el servicio de identidad simulados (`INVITATION_MAILER=fake`, `IDENTITY_PROVIDER=fake`).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec (US1 a US4). Las tareas que sirven a todas las historias no llevan etiqueta.
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal. El agente no corre `git commit`, `prisma migrate`, `prisma db`, `prisma generate` ni `terraform apply`: se detiene en esa tarea e indica el comando exacto o el mensaje. Sí puede correr `terraform fmt` y `terraform validate` (con `terraform init -backend=false`).
- **Archivos `.env`**: el agente no lee ni edita `.env.local` ni `.env.example`. Esta funcionalidad no agrega variables; si hiciera falta una, avisa y el responsable la agrega.

## Path Conventions

- Aplicación: `src/modules/users/` (dominio, casos de uso, puertos, adaptadores y repositorios), `src/infrastructure/aws/cognito/` y `src/app/(dashboard)/` (pantallas `users`, componentes y acciones en `_users`), según [plan.md](plan.md).
- Infraestructura: `infra/modules/identity/` e `infra/bootstrap/`.
- Pruebas: todas en `tests/`, replicando `src/`. Datos de prueba con `tests/support/`.
- Textos de la interfaz y documentos en español rioplatense (vos), con títulos en sentence-case y sin tablas en los documentos. Identificadores en inglés.
- **Puntos de commit:** al cerrar cada fase el agente se detiene y avisa que es un buen momento para que el responsable haga `git commit`, con un mensaje de una línea `tipo(ámbito): descripción en español`, sin cuerpo ni trailer.
- **Antes de cerrar cualquier fase:** `npm run check` sin errores. `npm run check` trunca la base local: el responsable vuelve a correr `npm run seed:demo`.
- **Constantes:** `CLINIC_USERS_PAGE_SIZE = 25`.

---

## Phase 1: Fundamentos, datos, infraestructura y puertos

**Purpose**: la tabla del registro de gestión, el permiso de Terraform, las reglas puras, la lógica de vínculo compartida con la 009, los puertos y sus adaptadores (identidad, correo, repositorio). Al terminar, todo lo que las historias necesitan existe y está probado, sin pantallas ni casos de uso nuevos.

**Independent test**: con la tabla creada, el repositorio inserta un evento coherente y rechaza uno que viole los `CHECK`; `provisionAccount` devuelve el `subject` en el adaptador simulado y, con el SDK simulado, en el de Cognito (incluido el caso de una cuenta ya existente); el correo simulado deja una línea `access-notice`; y aceptar un link de la 009 se comporta igual que antes de la extracción.

### Preparación

- [X] T001 [P] **Antes de escribir pantallas y acciones**: leer en `node_modules/next/dist/docs` las guías de Server Functions (`mutating-data`), de `revalidatePath` y de `searchParams` en páginas con datos dinámicos (`<Suspense>` donde corresponda); respetar sus avisos de deprecación. Anotar en una línea cualquier diferencia relevante al final de R10 en [research.md](research.md).

### Datos (compuerta de Prisma)

- [X] T002 Editar `prisma/schema.prisma` según [data-model.md](data-model.md): `enum ClinicUserAction` con `@@map("clinic_user_action")` y los valores `STAFF_ENROLLED`, `PATIENT_ENROLLED`, `STAFF_DEACTIVATED`, `STAFF_REACTIVATED`, `PATIENT_REVOKED`, `PATIENT_REACTIVATED`, `ASSIGNMENT_CREATED`, `ASSIGNMENT_ENDED`, `ACCESS_RESENT`; `model ClinicUserEvent` con `@@map("clinic_user_events")` y los campos `id` (UUID v7), `tenantId`, `action`, `actorUserId`, `actorMembershipId`, `targetMembershipId` (`String?`), `targetPatientId` (`String?`) y `createdAt` (`DateTime @db.Timestamptz(3)`, lo pone la aplicación), columnas en `snake_case` con `@map`. Relaciones: `tenant` hacia `Tenant` con `Restrict`; `actor` hacia `User` por `actorUserId` con `Restrict`; `actorMembership` hacia `StaffMembership` por `(tenantId, actorMembershipId)` → `(tenantId, id)` con `Restrict`; `targetMembership` hacia `StaffMembership` por `(tenantId, targetMembershipId)` → `(tenantId, id)` con `Restrict`; `targetPatient` hacia `Patient` por `(tenantId, targetPatientId)` → `(tenantId, id)` con `Restrict`. Agregar los campos inversos en `Tenant`, `User`, `StaffMembership` (como actor y como destino) y `Patient`. Índices: `@@index([tenantId, createdAt(sort: Desc)])`, `@@index([tenantId, targetMembershipId, createdAt(sort: Desc)])` y `@@index([tenantId, targetPatientId, createdAt(sort: Desc)])`. Comentar que los `CHECK` se agregan a mano. No ejecutar comandos de Prisma.
- [X] T003 Agregar a [data-model.md](data-model.md) una sección «SQL a mano en la migración» con el SQL exacto listo para pegar: `ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_has_target" CHECK (num_nonnulls("target_membership_id", "target_patient_id") >= 1);` y `clinic_user_events_action_targets`: las acciones `STAFF_ENROLLED`, `STAFF_DEACTIVATED` y `STAFF_REACTIVATED` exigen `target_membership_id` presente y `target_patient_id` nulo; `PATIENT_ENROLLED`, `PATIENT_REVOKED` y `PATIENT_REACTIVATED` exigen `target_patient_id` presente y `target_membership_id` nulo; `ASSIGNMENT_CREATED` y `ASSIGNMENT_ENDED` exigen los dos presentes; `ACCESS_RESENT` exige exactamente uno de los dos. Depende de T002.
- [X] T004 **[Responsable]** Detenerse e indicar al responsable los comandos exactos, en este orden: `npx prisma migrate dev --create-only --name add_clinic_user_events`; pegar al final del `migration.sql` generado el SQL de la sección «SQL a mano en la migración» de [data-model.md](data-model.md); `npx prisma migrate dev` y `npx prisma generate`. **Ninguna tarea que use la tabla corre hasta que el responsable confirme.** Depende de T003.

### Infraestructura (sin `apply`)

- [X] T005 [P] En `infra/modules/identity/main.tf`, cambiar la política `aws_iam_user_policy.app` para que permita `cognito-idp:AdminSetUserPassword` y `cognito-idp:AdminGetUser` sobre el ARN del grupo de usuarios (una lista de acciones, mismo recurso). Actualizar el comentario del recurso: ahora también lee un usuario para obtener su `sub` en el alta directa (010, R1).
- [X] T006 [P] En `infra/bootstrap/permissions-boundary.tf`, sumar `cognito-idp:AdminGetUser` a la sentencia `FijarContrasenaEnElGrupo` (misma lista de acciones y mismo recurso) y ajustar su comentario. Sin ella el límite recorta la política de T005.
- [X] T007 Ajustar las pruebas `.tftest.hcl` de `infra/` que enumeran las acciones de esa política o del límite, y la sección correspondiente de `infra/README.md` (por qué existe `AdminGetUser`, que es de lectura de un solo usuario y que no permite crear, borrar ni cambiar cuentas). Ejecutar `terraform fmt -recursive`, `terraform init -backend=false` y `terraform validate` en `infra/bootstrap` y `infra/modules/identity`, y `terraform test` si el módulo lo permite sin credenciales. No ejecutar `apply`. Depende de T005 y T006.
- [ ] T008 **[Responsable]** Aplicar el cambio de Terraform, en este orden: `terraform apply` en `infra/bootstrap` (límite) y luego en `infra/environments/dev` (política). Solo hace falta para probar contra Cognito real; las pruebas automáticas y el desarrollo con `IDENTITY_PROVIDER=fake` no lo necesitan. Hasta entonces, el alta que reutiliza una cuenta de Cognito sin fila propia falla con un error genérico. Depende de T007.

### Dominio

- [X] T009 [P] Crear `src/modules/users/domain/clinic-user-rules.ts` según [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): `CLINIC_USERS_PAGE_SIZE` (25), `canManageClinicUsers(actor)` (solo `isClinicAdmin`), `checkStaffDeactivation({ actorMembershipId, targetMembershipId, targetIsClinicAdmin, otherActiveAdmins })` que devuelve `OK`, `CANNOT_DEACTIVATE_SELF` o `LAST_ADMIN` (la auto-baja se evalúa primero), y `canAssignTo({ patientStatus, membershipStatus, isDoctor })`, verdadero solo con paciente `LINKED` y médico activo. Sin importar Next.js ni Prisma.
- [X] T010 [P] Crear `src/modules/users/domain/clinic-user-events.ts`: el tipo `ClinicUserAction` (los nueve valores de T002) y `NewClinicUserEvent` (`tenantId`, `action`, `actorUserId`, `actorMembershipId`, `targetMembershipId?`, `targetPatientId?`, `now`).
- [X] T011 [P] Prueba unitaria `tests/unit/modules/users/domain/clinic-user-rules.test.ts`: `canManageClinicUsers` para administrador, médico y ambos roles; `checkStaffDeactivation` con auto-baja, último administrador, administrador con otro activo y médico que no es administrador; `canAssignTo` con paciente `PENDING`, `REVOKED`, médico desactivado y personal sin rol de médico.

### Lógica de vínculo compartida con la 009 (R2)

- [X] T012 Extraer la transacción de Prisma a `src/modules/users/infrastructure/repositories/relationship-transaction.ts`: mover desde `prisma-invitation-repository.ts` la función que arma el objeto `AcceptanceTransaction` a partir de un cliente de transacción (`findRelationshipFacts`, `createDoctorMembership`, `linkPatient`, `assignDoctorIfAbsent`, `isMembershipActiveDoctor`, `claim`) y exportarla; `prisma-invitation-repository.ts` pasa a importarla. Sin cambios de comportamiento: las pruebas de integración de `tests/integration/invitations/` deben seguir pasando sin tocarlas. Depende de T004 solo para correr esas pruebas.
- [X] T013 Extraer `applyDoctor` y `applyPatient` de `src/modules/users/application/use-cases/accept-invitation.ts` a `src/modules/users/application/use-cases/apply-relationship.ts`, con la transacción mínima `RelationshipTransaction = Pick<AcceptanceTransaction, "findRelationshipFacts" | "createDoctorMembership" | "linkPatient" | "assignDoctorIfAbsent">` (definida en el puerto) y el mismo resultado (`ACCEPTED` con `relationshipKind`, `relationshipId` y `assignedToDoctor`, o `ALREADY_MEMBER`; los conflictos siguen lanzando `InvitationConflictError`). `accept-invitation.ts` los importa y conserva su flujo (verificación, intentos, `claim`). Las pruebas de `tests/unit/modules/users/application/accept-invitation.test.ts` y `patient-invitation.test.ts` pasan sin cambios.
- [X] T014 [P] Prueba unitaria `tests/unit/modules/users/application/apply-relationship.test.ts` con el repositorio en memoria: médico nuevo; administrador sin rol de médico (`ROLE_CHANGE_NOT_SUPPORTED`); membresía desactivada (`MEMBERSHIP_DEACTIVATED`); matrícula en uso; paciente nuevo; paciente revocado que reutiliza su registro; documento en uso por otra cuenta; paciente ya vinculado que solo gana la asignación cuando `assignToCreator` es verdadero. Depende de T013.

### Puertos y adaptadores

- [X] T015 Ampliar el puerto `src/modules/users/application/ports/out/identity-provider.ts` con `provisionAccount(input: { email: string; fullName: string }): Promise<{ subject: string; fullName: string }>` y su comentario (según [contracts/identity-and-mail.md](contracts/identity-and-mail.md)): no recibe contraseña, responde igual exista o no la cuenta, falla con `IdentityError("UNAVAILABLE")`.
- [X] T016 [P] Implementar `provisionAccount` en `src/modules/users/infrastructure/adapters/in-memory-identity-provider.ts`: crea la cuenta como `signUp` si no existe (contraseña aleatoria, sin verificar) y devuelve `{ subject: fakeSubjectForEmail(email), fullName }` con el nombre de la cuenta existente si la había. Depende de T015.
- [X] T017 [P] Implementar `provisionAccount` en `src/infrastructure/aws/cognito/cognito-identity-provider.ts`: `SignUp` con la contraseña provisional de `temporaryPassword()` y `UserAttributes` de correo y nombre, tomando `UserSub` de la respuesta (validar con `zod` que exista); ante `UsernameExistsException`, reenviar el código con los mismos errores absorbidos que `signUp` y leer el `sub` y el atributo `name` con `AdminGetUserCommand` (validar con `zod`; si falta el nombre, usar el recibido); cualquier otro error se traduce con `unavailable("provisionAccount", error)`, sin registrar el correo, el código ni la contraseña. Depende de T015.
- [X] T018 [P] Pruebas unitarias en `tests/unit/infrastructure/aws/cognito/` (junto a las del proveedor existente): `provisionAccount` con cuenta nueva (devuelve el `UserSub`), con `UsernameExistsException` (llama a `AdminGetUser` y reenvía el código), con `AdminGetUser` sin permiso (`UNAVAILABLE`) y con una respuesta sin `UserSub`. Y en `tests/unit/modules/users/infrastructure/` la del adaptador simulado: cuenta nueva, cuenta existente conserva el nombre, mismo `subject` en dos llamadas. Depende de T016 y T017.
- [X] T019 Ampliar `src/modules/users/application/ports/out/invitation-mailer.ts` con `sendAccessNotice(input: { to: string; clinicName: string; kind: "DOCTOR" | "PATIENT"; setPasswordUrl: string | null }): Promise<void>` (lanza `MailDeliveryError` con un código genérico). Crear `src/modules/users/application/use-cases/render-access-notice.ts`: arma asunto y texto en español, sin documento, matrícula, datos clínicos ni el nombre de quien dio de alta; con `setPasswordUrl` explica que el servicio de identidad le envió un código y que debe ingresarlo ahí con su correo para elegir su contraseña; sin él, que ya puede elegir esa clínica al ingresar.
- [X] T020 [P] Implementar `sendAccessNotice` en `src/modules/users/infrastructure/adapters/fake-invitation-mailer.ts` (agrega una línea JSON `{ "type": "access-notice", to, clinicName, kind, setPasswordUrl }` al archivo de `FAKE_MAIL_OUTBOX_FILE`; `fail@invitations.test` siempre falla) y en `smtp-invitation-mailer.ts` (mismo transporte cifrado, mismos códigos de error genéricos). Depende de T019.
- [X] T021 [P] Pruebas unitarias de `render-access-notice.ts` y de los dos adaptadores en `tests/unit/modules/users/`: el texto con y sin `setPasswordUrl`; que no contiene documento ni matrícula; el simulado escribe la línea esperada y falla con `fail@invitations.test`; el SMTP traduce los errores (reutilizar el transporte simulado de las pruebas de la 009). Depende de T020.
- [X] T022 Ampliar `src/modules/users/application/ports/out/user-repository.ts` con `findByEmail(email: string): Promise<AccessUser | null>` e implementarlo en `prisma-user-repository.ts` (correo en minúsculas, mismos campos que `ACCESS_USER_SELECT`). Prueba en `tests/integration/access-model/` o junto a las del repositorio. Depende de T004.
- [X] T023 Crear el puerto `src/modules/users/application/ports/out/clinic-member-repository.ts` con los tipos de la sección «Puertos» de [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): `listStaff`, `listPatients`, `findResendTarget`, `runEnrollment`, `changeStaffStatus`, `changePatientStatus`, `assignDoctor`, `endAssignment` y `recordEvent`. Toda operación recibe `tenantId`. `runEnrollment(userId, work)` entrega una `RelationshipTransaction` más `recordEvent`, con la fila de la cuenta bloqueada. `changeStaffStatus` y `changePatientStatus` devuelven un resultado cerrado (`CHANGED`, `ALREADY_IN_STATE`, `NOT_FOUND` y, para la baja de personal, `LAST_ADMIN`). Sin importar Prisma.
- [X] T024 Implementar `src/modules/users/infrastructure/repositories/prisma-clinic-member-repository.ts` con el puerto de T023 (importa `relationship-transaction.ts` de T012):
  - `runEnrollment`: abre una transacción, bloquea la fila de `users` (`SELECT ... FOR UPDATE`), verifica que la clínica siga activa y entrega la transacción de vínculo con `recordEvent`.
  - `changeStaffStatus` (desactivar): transacción que bloquea la fila de la clínica (`SELECT id FROM tenants WHERE id = $1 FOR UPDATE`), lee al objetivo con `tenant_id`, cuenta los otros administradores activos, evalúa `checkStaffDeactivation` en el caso de uso (el repositorio devuelve el conteo) y aplica el cambio condicional (`WHERE status = 'ACTIVE'`); reactivar es condicional (`WHERE status = 'DEACTIVATED'`).
  - `changePatientStatus`: `LINKED → REVOKED` (`revoked_at = ahora`) y `REVOKED → LINKED` (`revoked_at = NULL`, `linked_at` se conserva), siempre con `tenant_id` y estado de origen en el `WHERE`.
  - `assignDoctor`: comprueba con `tenant_id` que el paciente esté `LINKED` y la membresía sea un médico activo, e inserta la asignación; la violación del índice `doctor_patient_assignments_one_active_per_pair` se traduce en `ALREADY_ASSIGNED`.
  - `endAssignment`: `UPDATE ... SET ended_at, ended_by_user_id WHERE id AND tenant_id AND ended_at IS NULL`.
  - `findResendTarget`: busca por `tenant_id` y devuelve el correo, el nombre y si la cuenta tiene alguna sesión (consulta de existencia sobre `sessions`).
  - `listStaff` y `listPatients`: `skip`/`take` de 25 más `count`, orden por nombre y luego `id`; pacientes sin nombre al final; las asignaciones vigentes de la página en una sola consulta (`endedAt: null`).
  - `recordEvent`: inserta con la hora de la aplicación.
  Ninguna consulta omite `tenant_id`. Depende de T004, T010, T012 y T023.
- [X] T025 Crear el repositorio en memoria `tests/support/in-memory/in-memory-clinic-member-repository.ts` que cumple el puerto de T023 (con las mismas reglas de estado y de unicidad), y ampliar `in-memory-invitation-repository.ts` si la extracción de T013 lo requiere. Depende de T023.
- [X] T026 Prueba de integración del repositorio en `tests/integration/clinic-users/clinic-member-repository.test.ts` (base local): `recordEvent` inserta un evento por cada acción con sus destinos; un evento sin destino o con destinos incoherentes con la acción viola los `CHECK`; la clave foránea compuesta rechaza un `actorMembershipId` de otra clínica; las transiciones condicionales no cambian filas en un estado distinto del de origen; `endAssignment` no toca una asignación ya terminada ni una de otra clínica. Depende de T004 y T024.
- [X] T027 **Cierre de la fase 1**: `npm run check`. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): registro de gestión, permiso de identidad y vínculo compartido` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`.

**Checkpoint**: la infraestructura, los puertos y la lógica de vínculo compartida están listos; la 009 se comporta igual.

---

## Phase 2: User Story 1 - Ver a las personas de la clínica (Priority: P1)

**Goal**: el administrador abre `/users` y ve, en dos pestañas paginadas, al personal y a los pacientes de su clínica, con su estado. El médico sigue viendo solo a sus pacientes asignados.

**Independent Test**: con una clínica con personal y pacientes en distintos estados, y otra con sus propios datos, el administrador de cada una ve exactamente a los suyos; un médico no abre `/users` y en `/patients` ve solo a los asignados.

### Tests for User Story 1

- [ ] T028 [P] [US1] Pruebas unitarias en `tests/unit/modules/users/application/list-clinic-staff.test.ts` y `list-clinic-patients.test.ts` (repositorio en memoria): el administrador recibe la página; un médico, un paciente y personal sin roles reciben `FORBIDDEN` sin consultar el repositorio; el número de página inválido vuelve a la 1; el orden es por nombre.
- [ ] T029 [P] [US1] Prueba de integración `tests/integration/clinic-users/list-access.test.ts` (base local): el administrador de la clínica A no ve nunca personas de la B, aunque la misma cuenta pertenezca a ambas; los estados vinculado, revocado y pendiente se listan; las asignaciones vigentes de cada paciente aparecen y las terminadas no; con 500 personas la primera página responde en menos de 2 s (SC-007).
- [ ] T030 [P] [US1] Verificación de la lista del médico de la 006 en `tests/integration/clinic-users/doctor-patient-list.test.ts`: `/patients` (el directorio de `src/modules/studies/infrastructure/repositories/prisma-patient-directory.ts`) devuelve solo pacientes `LINKED` con una asignación vigente a ese médico, no devuelve a los de otro médico ni a los de otra clínica, y no devuelve un paciente revocado ni uno cuya asignación terminó (FR-004). Si algún caso falla, corregir el directorio y anotarlo en [research.md](research.md), R6.

### Implementation for User Story 1

- [ ] T031 [P] [US1] Crear `src/modules/users/application/use-cases/list-clinic-staff.ts` y `list-clinic-patients.ts` según [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): comprueban `canManageClinicUsers(actor)` antes de consultar, normalizan la página (entero positivo, si no la 1) y devuelven `{ status: "OK", items, total, page, pageSize }` o `{ status: "FORBIDDEN" }`. Cada ítem incluye `canResendAccess` (cuenta sin ninguna sesión). Depende de T023.
- [ ] T032 [US1] Registrar `listClinicStaff` y `listClinicPatients` en `src/modules/users/composition.ts`, con el repositorio de Prisma y `now`. Depende de T024 y T031.
- [ ] T033 [P] [US1] Crear el actor de la gestión en `src/app/_lib/clinic-user-actor.ts` (reutiliza `resolveInvitationActor` de la 009 y el contexto de acceso; devuelve `null` si no hay actor) con su prueba unitaria en `tests/unit/app/users/clinic-user-actor.test.ts`.
- [ ] T034 [P] [US1] Crear `src/app/(dashboard)/_users/_lib/user-messages.ts` con los textos de estados y de resultados de esta funcionalidad (estados Activo, Desactivado, Vinculado, Revocado, Pendiente; mensajes de cada resultado cerrado de los casos de uso), en español rioplatense, sin datos internos. Se amplía en las fases siguientes.
- [ ] T035 [US1] Crear la pantalla `src/app/(dashboard)/users/page.tsx` y los componentes `src/app/(dashboard)/_users/_components/staff-table.tsx`, `patients-table.tsx`, `users-tabs.tsx` y `pagination.tsx` según [contracts/clinic-user-ui.md](contracts/clinic-user-ui.md): dos pestañas, `?tab=` y `?page=` en la dirección, estados con texto además de color, tablas que no se desbordan en móvil (tarjetas apiladas), vacío con enlace al alta, tokens semánticos, modo claro y oscuro. Sin actor, redirige al ingreso o muestra la pantalla de acceso denegado de siempre. Las acciones por fila se agregan en las fases siguientes. Depende de T032 a T034.
- [ ] T036 [US1] Agregar el enlace «Usuarios» (`/users`) al inicio del administrador en `src/app/(dashboard)/page.tsx`, sin mostrarlo a médicos ni pacientes. Prueba en `tests/unit/app/users/users-page.test.tsx`: el administrador ve las listas, el médico y el paciente no. Depende de T035.
- [ ] T037 **Cierre de la fase 2**: `npm run check`. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): listas de personal y pacientes de la clínica` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`.

**Checkpoint**: US1 funciona sola; el administrador ve a las personas de su clínica.

---

## Phase 3: User Story 2 - Dar de alta a una persona sin link (Priority: P1)

**Goal**: el administrador da de alta médicos y pacientes, y el médico da de alta pacientes (que quedan asignados a él), sin link. La persona recibe un correo y define su contraseña; con una cuenta existente se la vincula sin cambiarla.

**Independent Test**: dar de alta a una persona con correo nuevo y a otra cuyo correo ya tiene cuenta; ambas quedan vinculadas, la primera recibe el aviso con el camino para definir su contraseña, la segunda conserva su cuenta y su contraseña; la respuesta es idéntica en los dos casos.

### Tests for User Story 2

- [ ] T038 [P] [US2] Pruebas unitarias `tests/unit/modules/users/application/enroll-member.test.ts` (repositorio, identidad y correo en memoria): administrador da de alta médico y paciente; médico da de alta paciente y queda asignado; médico no puede dar de alta un médico (`FORBIDDEN`); cuenta nueva llama a `provisionAccount` y envía el aviso con `setPasswordUrl`; cuenta existente no llama a la identidad, conserva el nombre y envía el aviso sin `setPasswordUrl`; la respuesta es igual en ambos casos (SC-003); conflictos `ALREADY_STAFF`, `ALREADY_PATIENT`, `MEMBERSHIP_DEACTIVATED`, `ROLE_CHANGE_NOT_SUPPORTED`, `DOCUMENT_IN_USE`, `LICENSE_IN_USE` calculados solo con datos de la clínica del actor; `ALREADY_MEMBER` agrega la asignación que faltaba cuando lo hace un médico; falla de la identidad no escribe nada (`UNAVAILABLE`); falla del correo devuelve `ENROLLED` con `mail: "FAILED"` sin duplicar; validación de entrada.
- [ ] T039 [P] [US2] Pruebas unitarias `tests/unit/modules/users/application/resend-access.test.ts`: reenvía el código y el aviso mientras la cuenta no tiene sesiones; `NOT_ELIGIBLE` si ya ingresó; `NOT_FOUND` para un objetivo de otra clínica; permisos (administrador, o médico con una asignación vigente al paciente; el resto, incluido un médico sin asignación, `FORBIDDEN`); `MAIL_FAILED`.
- [ ] T040 [P] [US2] Prueba unitaria `tests/unit/modules/users/application/no-clinic-user-data-in-logs.test.ts` (como la de la 009): ningún caso de uso ni adaptador nuevo escribe contraseñas, códigos, documentos ni matrículas en la consola, ni en éxito ni en error.
- [ ] T041 [P] [US2] Prueba de integración `tests/integration/clinic-users/enroll-access.test.ts` (base local): dar de alta desde otra clínica, con un médico que no tiene asignado al paciente o con un rol sin permiso no crea nada; el médico solo da de alta pacientes; una cuenta con vínculos en la clínica B no cambia nada allí al darla de alta en la A (SC-008); una persona con otro correo no obtiene ningún vínculo (escenario 10 de la spec); con la clínica suspendida (también si se suspende justo antes de la transacción) no se crea nada (FR-028); un administrador de plataforma que no pertenece a la clínica no tiene actor y no puede dar de alta ni reenviar (FR-027); y `resendAccess` desde otra clínica o con un identificador de la B da `NOT_FOUND` sin enviar nada.
- [ ] T042 [P] [US2] Prueba de integración `tests/integration/clinic-users/enroll-concurrency.test.ts` (base local): dos altas simultáneas del mismo correo (con `Promise.all`) dejan exactamente una cuenta y un vínculo, y la otra informa que ya pertenece (SC-005); dos altas simultáneas del mismo documento con correos distintos dejan un solo registro y un `DOCUMENT_IN_USE`.
- [ ] T043 [P] [US2] Prueba de integración `tests/integration/clinic-users/enroll-relationships.test.ts` (base local): el alta reutiliza el registro de un paciente revocado y conserva su historial; un paciente pendiente con ese documento se vincula; un administrador sin rol de médico no recibe el rol; no se duplica un vínculo ni una asignación vigente; el evento `STAFF_ENROLLED` o `PATIENT_ENROLLED` queda escrito con quién lo hizo y sobre quién, en la misma transacción; el alta de un paciente por un médico escribe además `ASSIGNMENT_CREATED`; un alta sin cambios (`ALREADY_MEMBER` sin asignación nueva) no escribe ningún evento.

### Implementation for User Story 2

- [ ] T044 [P] [US2] Crear `src/modules/users/application/validation/clinic-user-form-schemas.ts` con los esquemas de `zod` del alta (correo normalizado, nombre no vacío con el mismo máximo del registro de cuenta, tipo y número de documento para paciente, matrícula y especialidad para médico), de las acciones por identificador (UUID) y de la página.
- [ ] T045 [US2] Crear `src/modules/users/application/use-cases/enroll-member.ts` según [research.md](research.md) R1 a R3 y [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): comprueba `canInvite(actor, kind)`, valida, normaliza, calcula los conflictos solo con datos de la clínica del actor (matrícula, documento, vínculo existente), busca la cuenta con `findByEmail`, llama a `provisionAccount` solo si no existe, crea la cuenta propia con `upsertFromIdentity` y aplica `applyRelationship` dentro de `runEnrollment` (con `assignToCreator = assignsCreator(actor, kind)` y el evento correspondiente), escribe los eventos del contrato («Registro de gestión»: solo si algo cambió, y `ASSIGNMENT_CREATED` cuando crea una asignación) y envía el aviso fuera de la transacción. Devuelve el resultado cerrado del contrato, idéntico exista o no la cuenta. No registra datos sensibles. Depende de T013, T015, T019, T022, T023 y T044.
- [ ] T046 [US2] Crear `src/modules/users/application/use-cases/resend-access.ts`: comprueba el permiso (administrador, o médico con asignación vigente al paciente), busca el objetivo con `findResendTarget` por `tenantId` del actor, exige que la cuenta no tenga sesiones, llama a `resendConfirmationCode`, envía el aviso con `setPasswordUrl` y escribe el evento `ACCESS_RESENT`. Depende de T023 y T045.
- [ ] T047 [US2] Registrar `enrollMember` y `resendAccess` en `src/modules/users/composition.ts`: el mismo `identity`, el mismo correo y la misma `appBaseUrl` perezosos de la 009 (si faltan variables, solo falla el alta, no el ingreso). Depende de T045 y T046.
- [ ] T048 [P] [US2] Crear las acciones `src/app/(dashboard)/_users/_actions/enroll-member.ts` y `resend-access.ts`: arman el actor desde el contexto de acceso, validan con `zod`, delegan y devuelven un estado serializable con los mensajes de `user-messages.ts`; ninguna recibe la clínica del formulario. Ampliar `user-messages.ts` con los resultados del alta y del reenvío. Depende de T033, T034 y T047.
- [ ] T049 [P] [US2] Pruebas unitarias de las acciones en `tests/unit/app/users/` (`enroll-member-action.test.ts`, `resend-access-action.test.ts`): sin actor se rechaza; un médico no puede dar de alta un médico; el estado devuelto es el mismo con y sin cuenta existente; no se registra ningún dato sensible. Depende de T048.
- [ ] T050 [US2] Crear la pantalla `src/app/(dashboard)/users/new/page.tsx` y `src/app/(dashboard)/_users/_components/enroll-form.tsx` según [contracts/clinic-user-ui.md](contracts/clinic-user-ui.md): el administrador elige Médico o Paciente (con `src/components/form/select-field.tsx`), el médico solo ve Paciente; campos según el tipo; confirma con el mismo mensaje exista o no la cuenta; si el aviso no pudo enviarse muestra el aviso y el botón Reintentar; nunca pide ni muestra una contraseña; errores en una región `aria-live`. Depende de T048.
- [ ] T051 [US2] Agregar la acción «Reenviar acceso» a las filas de `staff-table.tsx` y `patients-table.tsx` (solo si `canResendAccess`) con su estado y mensaje accesibles, y el enlace «Dar de alta» a `/users`. Agregar al inicio del médico el enlace «Dar de alta a un paciente» (`/users/new`) en `src/app/(dashboard)/page.tsx`. Agregar además el botón «Reenviar acceso» en `src/app/(dashboard)/patients/[patientId]/page.tsx` (006), visible solo si el médico tiene asignado al paciente y este todavía no ingresó, usando la acción `resendAccess` (sin otros cambios en esa pantalla), con prueba en `tests/unit/app/users/patient-resend-access.test.tsx`. Prueba en `tests/unit/app/users/users-page.test.tsx` ampliada. Depende de T035, T048 y T050.
- [ ] T052 **Cierre de la fase 3**: `npm run check`. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): alta directa de médicos y pacientes sin link` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`.

**Checkpoint**: US1 y US2 funcionan; la clínica puede sumar y ver gente sin link.

---

## Phase 4: User Story 3 - Asignar y quitar médicos a pacientes existentes (Priority: P2)

**Goal**: el administrador asigna uno o más médicos a un paciente vinculado y le quita alguno; el médico asignado lo ve, y al quitarlo deja de verlo. Quitar conserva el historial.

**Independent Test**: con un paciente sin médico, el administrador le asigna uno y el médico lo ve; se lo quita y el médico deja de verlo; reasignar crea una fila nueva.

### Tests for User Story 3

- [ ] T053 [P] [US3] Pruebas unitarias `tests/unit/modules/users/application/assign-doctor.test.ts`, `unassign-doctor.test.ts` y `list-active-doctors.test.ts` (solo administrador; solo médicos activos de su clínica; sin paginar): asigna a un médico activo y a un paciente vinculado; un segundo médico no cambia el primero; `ALREADY_ASSIGNED`; `PATIENT_NOT_LINKED` (pendiente y revocado); `NOT_AN_ACTIVE_DOCTOR` (sin rol de médico o desactivado); `NOT_FOUND` para ajenos; un médico, un paciente y personal sin rol reciben `FORBIDDEN`; quitar termina la asignación con quién y cuándo; quitar una ya terminada o ajena es `NOT_FOUND`; reasignar crea una nueva y deja la anterior como historial.
- [ ] T054 [P] [US3] Prueba de integración `tests/integration/clinic-users/assignments.test.ts` (base local): asignar y quitar desde otra clínica se rechaza con `NOT_FOUND` y no cambia nada; un `membershipId` o `patientId` de la clínica B no se puede mezclar con el de la A; dos asignaciones simultáneas de la misma pareja dejan una sola vigente; quitar y volver a asignar deja dos filas (una terminada con `ended_by_user_id`); los eventos `ASSIGNMENT_CREATED` y `ASSIGNMENT_ENDED` quedan con ambos destinos; el médico asignado ve al paciente en el directorio de la 006 y deja de verlo al quitarlo.

### Implementation for User Story 3

- [ ] T055 [US3] Crear `src/modules/users/application/use-cases/list-active-doctors.ts` (solo administrador; devuelve `{ membershipId, fullName, specialty }` de los médicos activos de la clínica del actor, sin paginar; agregar `listActiveDoctors` al puerto de T023 y al repositorio de T024 y al repositorio en memoria de T025), `assign-doctor.ts` y `unassign-doctor.ts` según [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): comprueban `canManageClinicUsers`, validan los identificadores con `zod`, usan `canAssignTo` y el repositorio (siempre con el `tenantId` del actor) y escriben el evento correspondiente en la misma transacción. Depende de T009, T023 y T044.
- [ ] T056 [US3] Registrar `listActiveDoctors`, `assignDoctor` y `unassignDoctor` en `src/modules/users/composition.ts`. Depende de T055.
- [ ] T057 [P] [US3] Crear las acciones `src/app/(dashboard)/_users/_actions/assign-doctor.ts` y `unassign-doctor.ts` y ampliar `user-messages.ts`, con la misma forma que las de la fase 3 y revalidando `/users`. Prueba en `tests/unit/app/users/assignment-actions.test.ts`. Depende de T033, T034 y T056.
- [ ] T058 [US3] Agregar a `patients-table.tsx` el selector «Asignar médico» (solo médicos activos de la clínica, obtenidos con el actor, nunca por un identificador de clínica del cliente) y el botón «Quitar» de cada médico asignado, con el diálogo de confirmación accesible `src/app/(dashboard)/_users/_components/confirm-dialog.tsx` (foco al abrir y al cerrar, `Escape` cancela, estado comunicado con texto). Los médicos activos salen del caso de uso `listActiveDoctors` (T055). Depende de T031, T035 y T057.
- [ ] T059 **Cierre de la fase 4**: `npm run check`. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): asignación de médicos a pacientes existentes` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`.

**Checkpoint**: US1 a US3 funcionan; los pacientes sin médico se pueden atender.

---

## Phase 5: User Story 4 - Dar de baja y reactivar vínculos (Priority: P2)

**Goal**: el administrador desactiva y reactiva personal, y revoca y reactiva pacientes; la persona pierde el acceso a esa clínica en su siguiente acción, y conserva su cuenta, sus otras clínicas y los datos.

**Independent Test**: desactivar a un médico con sesión abierta y comprobar que pierde el acceso a esa clínica en su siguiente acción, que conserva el de otra clínica y que al reactivarlo lo recupera con sus asignaciones.

### Tests for User Story 4

- [ ] T060 [P] [US4] Pruebas unitarias `tests/unit/modules/users/application/change-member-status.test.ts`: las cuatro transiciones (`CHANGED`); `ALREADY_IN_STATE`; `NOT_FOUND` para ajenos; `FORBIDDEN` para médico, paciente y personal sin rol; `CANNOT_DEACTIVATE_SELF`, incluso con ambos roles; `LAST_ADMIN`; un administrador puede desactivar a otro si queda uno activo; ninguna transición toca las asignaciones (FR-023, FR-024).
- [ ] T061 [P] [US4] Prueba de integración `tests/integration/clinic-users/status-isolation.test.ts` (base local): desactivar, reactivar, revocar y reactivar desde otra clínica se rechaza con `NOT_FOUND` y no cambia nada; dar de baja a una persona en la A no cambia su vínculo en la B (SC-008); los roles, la matrícula, el documento y los estudios no cambian; los eventos `STAFF_DEACTIVATED`, `STAFF_REACTIVATED`, `PATIENT_REVOKED` y `PATIENT_REACTIVATED` quedan registrados con quién lo hizo.
- [ ] T062 [P] [US4] Prueba de integración `tests/integration/clinic-users/last-admin-concurrency.test.ts` (base local): dos administradores se desactivan entre sí a la vez (`Promise.all`) y queda exactamente uno activo (SC-006); el único administrador no puede desactivarse; un administrador-médico no puede desactivarse a sí mismo.
- [ ] T063 [P] [US4] Prueba de integración `tests/integration/clinic-users/revocation-with-session.test.ts` (base local, con los casos de uso reales de sesión): una persona con sesión abierta en la clínica A y acceso a la B; al desactivarla (o revocar al paciente) en la A, la siguiente resolución de contexto deja de ser `ready` en la A y puede elegir la B; al reactivarla recupera la A con sus roles y asignaciones (SC-004); un médico desactivado deja de ver a sus pacientes en el directorio de la 006 y los recupera al reactivarse; las invitaciones pendientes del emisor desactivado dejan de servir (009).

### Implementation for User Story 4

- [ ] T064 [US4] Crear `src/modules/users/application/use-cases/change-member-status.ts` según [contracts/clinic-user-use-cases.md](contracts/clinic-user-use-cases.md): comprueba `canManageClinicUsers`, valida el identificador, y para `DEACTIVATE_STAFF` ejecuta la transacción con el bloqueo de la clínica y `checkStaffDeactivation` (R5), escribiendo el evento en la misma transacción. Las otras tres transiciones son condicionales y no tocan las asignaciones. Depende de T009, T023, T024 y T044.
- [ ] T065 [US4] Registrar `changeMemberStatus` en `src/modules/users/composition.ts`. Depende de T064.
- [ ] T066 [P] [US4] Crear la acción `src/app/(dashboard)/_users/_actions/change-member-status.ts` y ampliar `user-messages.ts` (incluidos «No se puede desactivar al único administrador de la clínica» y «No podés desactivarte a vos mismo»), revalidando `/users`. Prueba en `tests/unit/app/users/change-status-action.test.ts`. Depende de T033, T034 y T065.
- [ ] T067 [US4] Agregar a `staff-table.tsx` y `patients-table.tsx` las acciones Desactivar o Reactivar y Revocar o Reactivar, con el diálogo de confirmación de T058 para toda baja; sin acciones sobre la propia fila del administrador; el estado se comunica con texto y la fila refleja el nuevo estado tras la acción. Prueba en `tests/unit/app/users/staff-table.test.tsx` y `patients-table.test.tsx`. Depende de T035, T058 y T066.
- [ ] T068 **Cierre de la fase 5**: `npm run check`. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): baja y reactivación de vínculos con control del último administrador` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`.

**Checkpoint**: las cuatro historias funcionan.

---

## Phase 6: Pruebas de extremo a extremo y cierre

**Purpose**: recorrer lo implementado en el navegador, actualizar la documentación y cerrar la funcionalidad.

- [ ] T069 [P] Ampliar `tests/support/e2e-accounts.ts` y `tests/support/e2e-mail.ts` si hace falta (leer el aviso `access-notice` del archivo del correo simulado) y crear `tests/support/clinic-users-scenario.ts` con una clínica con administrador, dos médicos y pacientes en distintos estados, más una segunda clínica.
- [ ] T070 Crear `tests/e2e/clinic-users.spec.ts` (Playwright, producción local; mantener libre el puerto 3000): (1) el administrador ve las dos listas, pagina y no ve a la otra clínica; (2) da de alta a un paciente con un correo nuevo, la persona usa el código `000000` en `/verify-email`, elige su contraseña e ingresa; (3) da de alta a una persona con cuenta existente y el mensaje es idéntico; (4) un médico da de alta a un paciente y lo ve en `/patients`; (5) el administrador asigna y quita un médico con confirmación; (6) desactiva a un médico con sesión abierta y este pierde el acceso en su siguiente acción, y al reactivarlo lo recupera; (7) no puede desactivarse a sí mismo ni al único administrador. Incluir un recorrido en móvil y otro en modo oscuro, con navegación por teclado en los diálogos.
- [ ] T071 [P] Actualizar `memory/architecture.md` (sección «Gestión de usuarios de una clínica»: alta directa con `provisionAccount`, vínculo compartido con la 009, último administrador con bloqueo de la clínica, registro de gestión y permiso `AdminGetUser`, y la brecha de los administradores) y `memory/project-structure.md` (lo nuevo en `users`, `_users` y `infra/`). Sin tablas. Verificar que no contradicen la constitución.
- [ ] T072 [P] Ejecutar la skill `review-changes` sobre toda la funcionalidad (seguridad, arquitectura, interfaz e infraestructura), con foco en: aislamiento entre clínicas, respuesta uniforme del alta, concurrencia del alta y de la baja del último administrador, registros sin datos sensibles, accesibilidad de `/users` y `/users/new`, y el cambio de IAM. Corregir los hallazgos bloqueantes dentro del alcance y anotar los pendientes al final de [research.md](research.md).
- [ ] T073 Recorrer [quickstart.md](quickstart.md) a mano con el servicio de identidad y el correo simulados; anotar al final de [quickstart.md](quickstart.md) qué se verificó y qué no (por ejemplo, el alta con una cuenta ya existente en Cognito real depende de T008).
- [ ] T074 **Cierre final**: `npm run check` y `npm run test:e2e` sin errores. **Punto de commit:** avisar al responsable que es un buen momento para `git commit`, con un mensaje como `feat(users): cierre de la gestión de usuarios y pruebas de extremo a extremo` (una línea, sin cuerpo ni trailer). Recordarle `npm run seed:demo`, la aplicación de Terraform (T008) si va a usar Cognito real, y volver a decidir el camino definitivo para crear administradores (R7).

---

## Dependencies & Execution Order

- **Fase 1** bloquea todo lo demás. Dentro de ella: T004 (migración del responsable) bloquea las tareas con base de datos (T022, T024, T026); T012 y T013 (extracción) van antes de T024 y T045; la infraestructura (T005 a T008) es independiente del resto y solo T008 es del responsable.
- **Fase 2 (US1)** depende de la fase 1. **Fase 3 (US2)** depende de la fase 1 y reutiliza el actor, los mensajes y las tablas de la fase 2. **Fase 4 (US3)** depende de las tablas de la fase 2. **Fase 5 (US4)** depende de las tablas de la fase 2 y del diálogo de confirmación `confirm-dialog.tsx` que se crea en T058 (US3): US4 no es del todo independiente de US3; si se prioriza US4 antes, crear ese componente primero. Si hay que priorizar, las fases 2 y 3 (ambas P1) son el mínimo útil.
- **Fase 6** depende de todas las anteriores.

### Parallel opportunities

- Fase 1: T005, T006, T009, T010, T011, T016, T017, T020 en paralelo tras sus dependencias.
- Fase 2: T028, T029, T030 y las tareas T031, T033, T034 en paralelo.
- Fase 3: T038 a T044 (pruebas y esquemas) en paralelo; T048, T049.
- Fase 4 y Fase 5: las pruebas de cada una en paralelo.

## Implementation Strategy

1. **MVP:** fases 1 a 3. Con las listas y el alta directa, la clínica ya puede sumar gente sin link y ver quién pertenece.
2. **Incremental:** US3 (asignar) y US4 (bajas) se suman después; cada una se puede probar y commitear sola.
3. **Antes de empezar a implementar**, el responsable hace la migración (T004) y, si va a probar con Cognito real, T008. El agente se detiene en esos puntos.
