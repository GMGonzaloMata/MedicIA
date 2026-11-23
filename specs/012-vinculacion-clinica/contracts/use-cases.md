# Contrato: casos de uso del módulo `tenants`

Los casos de uso viven en `src/modules/tenants/application/use-cases/` y se obtienen de `getTenantsModule()` (`composition.ts`). Reciben datos simples, nunca un `tenantId` del cliente: el actor trae la clínica del contexto autenticado. Los resultados esperados son uniones discriminadas (`{ ok: true, … } | { ok: false, code }`); los errores inesperados se lanzan y la acción los traduce a «no disponible».

**Actor administrador:** `ClinicAdminActor = { tenantId, userId, membershipId }`. Solo se construye si el contexto es `STAFF` con `isClinicAdmin`. Todo caso de uso de «Administración» lo exige.

## Administración del personal

| Caso de uso | Entrada | Resultado | Códigos de rechazo |
|---|---|---|---|
| `inviteStaff` | `actor`, `email`, `roles`, `doctor?` (`{ specialty, licenseNumber }`, obligatorio si `roles.isDoctor`) | `{ ok, invitationId }` y envía el correo | `INVALID_INPUT`, `ALREADY_MEMBER`, `MEMBER_DEACTIVATED`, `LICENSE_IN_USE`, `MAIL_UNAVAILABLE` |
| `listStaff` | `actor` | miembros (nombre, correo, roles, estado) e invitaciones pendientes | — |
| `revokeInvitation` | `actor`, `invitationId` | `{ ok }` | `NOT_FOUND` |
| `resendInvitation` | `actor`, `invitationId` | `{ ok }` (revoca la anterior y crea otra) | `NOT_FOUND`, `MAIL_UNAVAILABLE` |
| `deactivateMember` | `actor`, `membershipId` | `{ ok }` | `NOT_FOUND`, `LAST_ADMIN`, `ALREADY_DEACTIVATED` |
| `reactivateMember` | `actor`, `membershipId` | `{ ok }` | `NOT_FOUND`, `ALREADY_ACTIVE` |

- `inviteStaff` con la clínica suspendida devuelve `NOT_FOUND`: una clínica suspendida no tiene contexto activo.
- Si el correo falla, la invitación **queda creada** y el resultado es `MAIL_UNAVAILABLE` con `invitationId`, para que el administrador reenvíe.
- `deactivateMember` no toca las asignaciones.

## Aceptación de una invitación (cualquier persona con sesión)

| Caso de uso | Entrada | Resultado | Códigos de rechazo |
|---|---|---|---|
| `acceptStaffInvitation` | `token`, `user: { id, email }` | `{ ok, tenantId, membershipId }` | `INVALID_INVITATION` |

- `INVALID_INVITATION` cubre, sin distinguir: token inexistente, vencida, revocada, ya usada, correo distinto y miembro desactivado. El mensaje de pantalla es único.
- Es idempotente solo en el sentido de que una invitación `ACCEPTED` no se vuelve a usar.
- Crea la membresía, o suma roles a la existente, y marca la invitación como aceptada en una transacción.

## Administración de pacientes y asignaciones

| Caso de uso | Entrada | Resultado | Códigos de rechazo |
|---|---|---|---|
| `registerPatient` | `actor`, `documentType`, `documentNumber` | `{ ok, patientId, linkCode }` | `INVALID_INPUT`, `DUPLICATE_PATIENT` |
| `listClinicPatients` | `actor` | pacientes (documento, estado, médico asignado y su estado; el nombre solo si ya vinculó su cuenta) | — |
| `regeneratePatientLinkCode` | `actor`, `patientId` | `{ ok, linkCode }` | `NOT_FOUND`, `ALREADY_LINKED` |
| `assignPatient` | `actor`, `patientId`, `membershipId` | `{ ok, assignmentId }` | `NOT_FOUND`, `NOT_A_DOCTOR`, `DOCTOR_DEACTIVATED`, `ALREADY_ASSIGNED` |
| `endAssignment` | `actor`, `assignmentId` | `{ ok }` | `NOT_FOUND`, `ALREADY_ENDED` |

- `linkCode` (en claro, `XXXXX-XXXXX`) solo viaja en este resultado. No se guarda ni se vuelve a consultar.
- `registerPatient` crea el paciente y su primer código en una transacción.
- `assignPatient` valida en una sola consulta que el paciente y el médico son de la clínica del actor.
- `listClinicPatients` no devuelve estudios ni nada clínico.

## Vinculación del paciente (cualquier persona con sesión)

| Caso de uso | Entrada | Resultado | Códigos de rechazo |
|---|---|---|---|
| `linkPatientAccount` | `user: { id }`, `documentType`, `documentNumber`, `code` | `{ ok, tenantId, patientId }` | `LINK_FAILED`, `TOO_MANY_ATTEMPTS`, `INVALID_INPUT` |

- `LINK_FAILED` es único para cualquier causa de fallo y no revela cuál. `TOO_MANY_ATTEMPTS` se devuelve antes de evaluar el código.
- Un fallo suma al contador del código y al de la cuenta. Al 5.º fallo el código queda `LOCKED`.
- Una vinculación exitosa asocia `patients.user_id`, pasa el paciente a `LINKED`, marca el código `USED` y borra los intentos fallidos de la cuenta, todo en una transacción.

## Consulta del paciente

| Caso de uso | Entrada | Resultado |
|---|---|---|
| `getAttendingDoctorAvailability` | `patientId` del contexto, `tenantId` del contexto | `'NO_ASSIGNMENT' \| 'AVAILABLE' \| 'UNAVAILABLE'` |

- `UNAVAILABLE` solo si hay asignaciones vigentes y **todas** corresponden a médicos desactivados. No devuelve nombres.

## Puertos de salida

`StaffRepository`, `InvitationRepository`, `PatientRegistryRepository`, `AssignmentRepository`, `LinkAttemptRepository` (Prisma, en `infrastructure/repositories/`), `InvitationMailer` (`smtp` y `fake`, en `infrastructure/adapters/`) y `SecretGenerator` (aleatorio y hash, con una versión determinista para pruebas).
