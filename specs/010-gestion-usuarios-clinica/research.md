# Research: Gestión de usuarios de una clínica

**Funcionalidad**: `010-gestion-usuarios-clinica` | **Fecha**: 2026-11-11

Cada decisión resuelve una de las preguntas del plan. Se apoya en el código existente de las specs 001, 002 y 009.

## R1. Cómo se crea la cuenta nueva y cómo define su contraseña

**Decisión.** El alta con un correo sin cuenta propia usa la misma vía que el registro de la 002: se crea la cuenta en el servicio de identidad con una contraseña provisional que nadie conoce, y la persona la define al verificar su correo con el código que el servicio le envía. El puerto `IdentityProvider` suma una operación nueva, `provisionAccount({ email, fullName })`, que devuelve `{ subject, fullName }`:

- Cognito: `SignUp` (la respuesta trae `UserSub`). Si la cuenta ya existía (`UsernameExistsException`), reenvía el código como hace `signUp` y lee el `subject` y el nombre con `AdminGetUser`. Cualquier otro error es `UNAVAILABLE`.
- Simulado: crea la cuenta en memoria como `signUp` y devuelve `fakeSubjectForEmail(email)`.

Con el `subject` se crea la cuenta propia (`UserRepository.upsertFromIdentity`, que ya existe) y el vínculo en una transacción. La persona recibe dos correos: el código de Cognito y un aviso de la plataforma con el nombre de la clínica y la dirección `<APP_BASE_URL>/verify-email`, donde ingresa su correo, el código y elige su contraseña.

**Por qué no la contraseña provisional por correo (`AdminCreateUser`).** Cognito la envía a la persona y exige que la cambie en el primer ingreso. Eso es un desafío `NEW_PASSWORD_REQUIRED` que la aplicación no soporta (`sign-in` lo trata como credenciales inválidas) y que obligaría a construir esa pantalla. La vía de `SignUp` reutiliza el flujo ya probado de la 002 (R18) y no suma pantallas.

**Por qué no crear el vínculo recién en el primer ingreso.** Un vínculo pendiente de personal no existe en el modelo (la membresía exige una cuenta), y el médico no podría recibir pacientes ni figurar en las listas hasta entonces. La spec pide vínculo inmediato (clarificado).

**Permiso nuevo.** `AdminGetUser` es necesario solo cuando la cuenta ya existe en Cognito pero nunca ingresó a MedicIA (no hay fila propia), caso poco frecuente pero real. Se agrega a la política del usuario de la aplicación (`infra/modules/identity/main.tf`) y al límite de permisos (`infra/bootstrap/permissions-boundary.tf`), acotado al grupo de usuarios. Es una acción de lectura de un solo usuario. En producción lo reemplazará el rol del servidor. Se ajustan las pruebas de Terraform que enumeran las acciones.

**Si el correo ya tiene cuenta propia** (hay fila en `users`), no se llama a Cognito: se vincula esa cuenta sin cambiar su nombre ni su contraseña, y se le envía solo el aviso.

**Reenvío (FR-014).** Lo hacen el administrador, o el médico que tiene asignado al paciente (nada registra quién dio de alta a quién). Disponible mientras la cuenta no tenga ninguna sesión (nunca ingresó). Llama a `resendConfirmationCode` (que responde igual exista o no la cuenta) y reenvía el aviso. «No ingresó» se calcula con una consulta de existencia sobre `sessions` por cuenta: no hace falta una columna nueva.

**Alternativas descartadas.** Un enlace propio de un solo uso para definir la contraseña: reimplementaría la verificación de correo de Cognito. Que quien da de alta defina una contraseña inicial: lo prohíbe FR-008.

## R2. Cómo se reutilizan las reglas de vínculo de la 009

**Decisión.** La parte de `accept-invitation.ts` que decide y aplica un vínculo (`applyDoctor` y `applyPatient`: compatibilidad, matrícula y documento únicos, reutilizar el registro del paciente revocado o pendiente, asignación) se extrae a `application/use-cases/apply-relationship.ts`. La usan aceptar un link y el alta directa. Recibe una transacción mínima (`findRelationshipFacts`, `createDoctorMembership`, `linkPatient`, `assignDoctorIfAbsent`) y devuelve el mismo resultado. El caso de uso de la 009 conserva su comportamiento y sus pruebas.

La transacción de Prisma que implementa esas operaciones hoy vive dentro de `prisma-invitation-repository.ts`. Se extrae a `relationship-transaction.ts`, y los dos repositorios la comparten.

**Diferencias propias del alta** (resueltas fuera de la función compartida):
- El alta de un médico sobre una membresía desactivada es un conflicto (`MEMBERSHIP_DEACTIVATED`), igual que en la 009: se la reactiva, no se la da de alta de nuevo.
- Un administrador sin rol de médico no recibe ese rol (`ROLE_CHANGE_NOT_SUPPORTED`).
- Un médico que da de alta un paciente asigna siempre (`assignsCreator`), incluso si el paciente ya pertenecía.

**Puerto nuevo, `ClinicMemberRepository`.** Se crea porque lo nuevo (listas con filtros por actor, cambios de estado, asignaciones, eventos y transacciones de alta y de baja) no pertenece a `InvitationRepository`. Lo que se comparte no es un puerto sino la función de transacción de Prisma.

## R3. Atomicidad del alta ante altas simultáneas y fallas externas

**Decisión.** Orden fijo: (1) comprobaciones de conflicto con datos solo de la clínica del actor; (2) si no hay cuenta propia, `provisionAccount`; (3) transacción de base de datos: crear la cuenta propia si falta, **bloquear la fila de la cuenta (`FOR UPDATE`)**, aplicar el vínculo y la asignación, y escribir el evento; (4) fuera de la transacción, enviar el aviso.

- **Dos altas simultáneas del mismo correo:** `provisionAccount` es idempotente en Cognito; `upsertFromIdentity` ya absorbe la violación de unicidad del segundo; el bloqueo de la fila ordena las dos transacciones, y la segunda ve el vínculo creado y responde «ya pertenece». Un solo vínculo y una sola cuenta (SC-005).
- **Falla de Cognito:** no se escribe nada en la base. El error es genérico (`UNAVAILABLE`).
- **Falla de la base después de Cognito:** queda una cuenta sin verificar en Cognito y ninguna fila nuestra. Es inocuo (igual que un registro abandonado) y un reintento la reutiliza.
- **Falla del correo:** el vínculo ya está hecho; el resultado es `ENROLLED` con `mail: "FAILED"`, y quien dio de alta puede reintentar con el reenvío. Nunca se duplica nada.

**Invitaciones pendientes de la 009.** Dar de alta a un correo que tiene una invitación pendiente no la cierra: si la persona la acepta, la 009 la informa como `ALREADY_MEMBER` y la consume sin duplicar nada. Es lo más simple y no corrompe datos.

El estado de la clínica se vuelve a comprobar dentro de la transacción (clínica activa), por si se suspendió entre medio.

## R4. Cómo se corta el acceso de inmediato ante una baja

**Decisión.** No hace falta un mecanismo nuevo. `findByTokenHash` lee en cada solicitud el estado del vínculo activo de la sesión, y `toActiveClinic` devuelve `null` si la membresía está desactivada, el paciente no está vinculado o la clínica no está activa. Una persona dada de baja con sesión abierta ve «sin acceso» en su siguiente acción, y conserva sus otras clínicas (puede elegir otra).

**Lo que sí se hace:** una prueba de integración que abre una sesión, da de baja el vínculo y comprueba que la siguiente resolución de contexto deja de ser `ready` (SC-004), y otra que comprueba que las demás clínicas siguen disponibles. Las invitaciones pendientes del emisor desactivado ya dejan de servir por la 009.

**Alternativa descartada:** revocar las sesiones de la persona al darla de baja. Cortaría también el acceso a sus otras clínicas, que debe conservarse (FR-020).

## R5. Último administrador y auto-baja

**Decisión.** Reglas puras en `domain/clinic-user-rules.ts`: no se desactiva a uno mismo (la membresía del actor no puede ser la del objetivo) y no se desactiva a un administrador si no queda otro administrador activo. La segunda necesita datos que cambian, así que se ejecuta dentro de una transacción que:

1. bloquea la fila de la clínica (`SELECT ... FROM tenants WHERE id = $1 FOR UPDATE`), lo que ordena cualquier cambio de administradores de esa clínica;
2. cuenta las membresías de administrador activas distintas del objetivo;
3. aplica el cambio condicional (`WHERE status = 'ACTIVE'`) solo si queda al menos una.

Sin el bloqueo, dos administradores que se desactivan entre sí a la vez dejarían la clínica sin ninguno (SC-006). La prueba de integración lo ejerce en paralelo.

## R6. Paginación y registro de gestión

**Paginación.** Páginas de 25 con número de página en la dirección (`?tab=&page=`), orden por nombre y luego por identificador (estable). Se usa `skip`/`take` más un conteo: con 500 personas por clínica la consulta es trivial y no hace falta un cursor. Las restricciones únicas existentes ya empiezan por `tenant_id`, que es el filtro de toda lectura. Los pacientes sin nombre (pendientes) se ordenan al final y se muestran con su documento. Las asignaciones vigentes de la página se cargan con una sola consulta adicional, no una por fila.

**Lista del médico.** La 006 ya ofrece `/patients` con los pacientes con asignación vigente. Esta funcionalidad no la duplica; una tarea comprueba que cumple FR-004 (vinculados, con asignación vigente y el médico activo) y la ajusta si no.

**Registro de gestión (FR-030).** Tabla nueva `clinic_user_events` con la acción, la clínica, quién la hizo, la membresía o el paciente afectado y cuándo (modelo en [data-model.md](data-model.md)). No guarda correo, documento ni matrícula. Las asignaciones ya guardan quién las creó y terminó, pero el registro es un solo lugar para revisar todo; las dos cosas se escriben en la misma transacción. No hay pantalla de consulta: la spec pide conservarlo, no mostrarlo. Solo se escribe un evento cuando algo cambió; el alta de un médico que además crea una asignación escribe también `ASSIGNMENT_CREATED` (ver el contrato de casos de uso).

**Alternativa descartada:** inferir quién dio de baja desde `updated_at`. No dice quién ni distingue la baja de otro cambio.

## R7. Cómo se suman administradores

**Decisión.** Fuera de esta funcionalidad (clarificado). No se construye nada. Hoy un administrador nace del `seed` (`scripts/seed-demo-clinic.ts`); el camino definitivo es la plataforma de administración global, que la spec 010 deja afuera. Consecuencias que ya están cubiertas: el alta directa nunca crea el rol de administrador, y R5 impide dejar una clínica sin administradores. Queda anotado como brecha para la plataforma global: **una clínica solo puede ganar administradores por un camino operativo**.

## R8. Autorización y aislamiento

**Decisión.** El actor se arma en `src/app/_lib` desde el contexto de acceso (como `invitation-actor.ts`) y se reutilizan `resolveInvitationActor`, `canInvite` y `assignsCreator` de la 009: las reglas del alta directa son idénticas (el administrador da de alta médicos y pacientes; el médico, solo pacientes). Las demás operaciones exigen `isClinicAdmin` (regla nueva, `canManageClinicUsers`). Los identificadores que llegan del cliente (membresía, paciente, asignación) nunca llevan la clínica: el repositorio los busca siempre con el `tenantId` del actor y devuelve «no encontrado» para los ajenos, sin distinguirlos de los inexistentes. Una clínica suspendida no tiene contexto activo, así que no hay actor (FR-028).

## R9. Correo de aviso

**Decisión.** El puerto `InvitationMailer` suma `sendAccessNotice({ to, clinicName, kind, setPasswordUrl })`, con `setPasswordUrl` nulo cuando la cuenta ya existía. Los adaptadores `smtp` y `fake` lo implementan; el simulado escribe una línea de JSON con `type: "access-notice"` y mantiene la falla de `fail@invitations.test`. El texto no lleva documento, matrícula ni datos clínicos y se arma en `render-access-notice.ts`, como el de la 009. El puerto conserva su nombre para no mover los usos existentes; si más adelante se suma otro tipo de correo, se renombra a algo más general.

**Aviso a una cuenta existente:** informa la clínica y el rol, y que puede elegirla al ingresar; no incluye ningún enlace de acción.

## R10. Pantallas y sesión del actor

**Decisión.** `/users` con dos pestañas (Personal y Pacientes) y paginación; `/users/new` con el formulario de alta (el tipo «médico» solo se ofrece al administrador). Acciones de fila: desactivar o reactivar, revocar o reactivar, asignar o quitar médico, reenviar el acceso. Quitar una asignación y toda baja piden confirmación con un diálogo accesible, como la revocación de links de la 009. Los textos de resultado salen de un módulo de mensajes. El detalle está en [contracts/clinic-user-ui.md](contracts/clinic-user-ui.md).

**Guías de Next.js leídas (T001).** `searchParams` de una página es una `Promise` que hay que esperar (`await`); `revalidatePath` se llama desde Server Functions con una ruta literal (por ejemplo `/users`) y actualiza la interfaz si se está viendo esa ruta. No hay avisos de deprecación que afecten esta funcionalidad.
