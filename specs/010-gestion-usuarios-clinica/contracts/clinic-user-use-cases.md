# Contrato: casos de uso

**Funcionalidad**: `010-gestion-usuarios-clinica` | Módulo `users`, expuestos por `getUsersModule()`.

Todos reciben un `actor` (`InvitationActor` de la 009: `tenantId`, `userId`, `membershipId`, `isClinicAdmin`, `isDoctor`) armado en `src/app/` desde el contexto de acceso. Ninguno recibe un `tenantId` del cliente. Los resultados son valores cerrados; los errores inesperados se lanzan.

## `enrollMember`

Entrada: `{ actor, kind: "DOCTOR" | "PATIENT", email, fullName, documentType?, documentNumber?, licenseNumber?, specialty? }`.

Pasos: permiso (`canInvite(actor, kind)`), validación con `zod`, normalización, conflictos con datos solo de la clínica del actor, `provisionAccount` si el correo no tiene cuenta propia, transacción de alta (R3) y aviso por correo.

Resultado:
- `{ status: "ENROLLED", kind, relationshipId, assignedToDoctor, mail: "SENT" | "FAILED" }`
- `{ status: "ALREADY_MEMBER", assignedToDoctor }`: ya tenía ese vínculo. Si lo hizo un médico, se agrega la asignación que faltaba.
- `{ status: "CONFLICT", reason }` con `reason` en `ALREADY_STAFF`, `ALREADY_PATIENT`, `MEMBERSHIP_DEACTIVATED`, `ROLE_CHANGE_NOT_SUPPORTED`, `DOCUMENT_IN_USE`, `LICENSE_IN_USE`.
- `{ status: "INVALID_INPUT", fieldErrors }`
- `{ status: "FORBIDDEN" }`: el actor no puede dar de alta ese tipo.
- `{ status: "UNAVAILABLE" }`: falla del servicio de identidad. No se escribió nada.

El resultado no distingue si la cuenta existía (FR-010, SC-003). Los conflictos se calculan solo con datos de la clínica del actor.

## `resendAccess`

Entrada: `{ actor, target: { kind: "STAFF", membershipId } | { kind: "PATIENT", patientId } }`.

Solo si el objetivo es de la clínica del actor, tiene cuenta y esa cuenta no tiene ninguna sesión. Permiso: administrador, o médico sobre un paciente que tiene asignado de forma vigente (nada registra quién dio de alta a quién, así que la regla usa la asignación). Reenvía el código (`resendConfirmationCode`) y el aviso.

Resultado: `{ status: "SENT" } | { status: "MAIL_FAILED" } | { status: "NOT_ELIGIBLE" } | { status: "NOT_FOUND" } | { status: "FORBIDDEN" }`. `NOT_ELIGIBLE` cubre a quien ya ingresó.

## `listClinicStaff`

Entrada: `{ actor, page }`. Solo administrador. Resultado: `{ status: "OK", items, total, page, pageSize }` con, por integrante: `membershipId`, nombre, correo, `isClinicAdmin`, `isDoctor`, `specialty`, `licenseNumber`, `status`, `canResendAccess`. O `{ status: "FORBIDDEN" }`.

## `listClinicPatients`

Entrada: `{ actor, page }`. Solo administrador. Resultado: `{ status: "OK", items, total, page, pageSize }` con, por paciente: `patientId`, nombre (puede ser nulo), `documentType`, `documentNumber`, `status`, `doctors: [{ assignmentId, membershipId, fullName, isActive }]` (solo asignaciones vigentes) y `canResendAccess`. O `{ status: "FORBIDDEN" }`.

## `listActiveDoctors`

Entrada: `{ actor }`. Solo administrador. Resultado: `{ status: "OK", doctors: [{ membershipId, fullName, specialty }] } | { status: "FORBIDDEN" }`. Médicos activos de la clínica del actor, sin paginar (alimenta el selector de «Asignar médico»; una clínica tiene pocos).

## `assignDoctor` y `unassignDoctor`

- `assignDoctor({ actor, patientId, membershipId })`: solo administrador. Resultado: `{ status: "ASSIGNED" } | { status: "ALREADY_ASSIGNED" } | { status: "PATIENT_NOT_LINKED" } | { status: "NOT_AN_ACTIVE_DOCTOR" } | { status: "NOT_FOUND" } | { status: "FORBIDDEN" }`.
- `unassignDoctor({ actor, assignmentId })`: solo administrador. Resultado: `{ status: "UNASSIGNED" } | { status: "NOT_FOUND" } | { status: "FORBIDDEN" }`. Una asignación ya terminada o ajena es `NOT_FOUND`.

## `changeMemberStatus`

Entrada: `{ actor, change: "DEACTIVATE_STAFF" | "REACTIVATE_STAFF" | "REVOKE_PATIENT" | "REACTIVATE_PATIENT", targetId }`. Solo administrador.

Resultado: `{ status: "CHANGED" } | { status: "ALREADY_IN_STATE" } | { status: "NOT_FOUND" } | { status: "FORBIDDEN" } | { status: "CANNOT_DEACTIVATE_SELF" } | { status: "LAST_ADMIN" }`.

`DEACTIVATE_STAFF` usa la transacción con el bloqueo de la clínica (R5). Ninguna transición toca las asignaciones.

## Puertos

- `ClinicMemberRepository` (nuevo): `listStaff`, `listPatients`, `findResendTarget`, `runEnrollment` (transacción de alta: cuenta, bloqueo, vínculo, asignación y evento), `changeStaffStatus`, `changePatientStatus`, `assignDoctor`, `endAssignment`, `recordEvent`. Toda operación recibe `tenantId` del actor.
- `IdentityProvider`: `provisionAccount({ email, fullName }) → { subject, fullName }`. Ver [identity-and-mail.md](identity-and-mail.md).
- `InvitationMailer`: `sendAccessNotice(...)`. Ver [identity-and-mail.md](identity-and-mail.md).
- `UserRepository`: `findByEmail(email) → AccessUser | null`.

## Registro de gestión (qué evento escribe cada resultado)

- Se escribe en la misma transacción que el cambio y solo si algo cambió. Un resultado sin cambios (`ALREADY_MEMBER` sin asignación nueva, `ALREADY_IN_STATE`, `ALREADY_ASSIGNED`) no escribe evento.
- El alta escribe `STAFF_ENROLLED` o `PATIENT_ENROLLED`. Si además crea una asignación (alta de un médico), escribe también `ASSIGNMENT_CREATED` con el médico y el paciente.
- Asignar escribe `ASSIGNMENT_CREATED`; quitar, `ASSIGNMENT_ENDED`; el reenvío, `ACCESS_RESENT`.

## Reglas puras (`domain/clinic-user-rules.ts`)

- `canManageClinicUsers(actor)`: verdadero solo con `isClinicAdmin`.
- `checkStaffDeactivation({ actorMembershipId, targetMembershipId, targetIsClinicAdmin, otherActiveAdmins })`: `OK`, `CANNOT_DEACTIVATE_SELF` o `LAST_ADMIN`.
- `canAssignTo({ patientStatus, membershipStatus, isDoctor })`: solo paciente `LINKED` y médico activo.
