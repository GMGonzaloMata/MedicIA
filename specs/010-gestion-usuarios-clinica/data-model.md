# Modelo de datos: Gestión de usuarios de una clínica

**Funcionalidad**: `010-gestion-usuarios-clinica`

Las tablas `staff_memberships`, `patients`, `doctor_patient_assignments`, `users` y `sessions` no cambian de forma: esta funcionalidad solo cambia sus estados y crea sus filas con las reglas de la spec 001. Lo único nuevo es el registro de gestión.

## Tabla nueva: `clinic_user_events`

Constancia de quién hizo cada alta, asignación, baja y reactivación, sobre quién y cuándo (FR-030). Solo se inserta; nunca se modifica ni se borra.

### Enumerado `ClinicUserAction` (`clinic_user_action`)

- `STAFF_ENROLLED`: alta de un médico.
- `PATIENT_ENROLLED`: alta de un paciente (nuevo, revocado que se recupera o ya vinculado al que solo se le agregó la asignación).
- `STAFF_DEACTIVATED`, `STAFF_REACTIVATED`.
- `PATIENT_REVOKED`, `PATIENT_REACTIVATED`.
- `ASSIGNMENT_CREATED`, `ASSIGNMENT_ENDED`.
- `ACCESS_RESENT`: reenvío del correo de acceso.

### Campos

- `id` (uuid v7).
- `tenantId`: la clínica donde ocurrió. Clave foránea a `tenants`.
- `action`: `ClinicUserAction`.
- `actorUserId`: la cuenta de quien lo hizo. Clave foránea a `users`.
- `actorMembershipId`: la membresía de quien lo hizo. Clave foránea compuesta `(tenantId, actorMembershipId)` a `staff_memberships`, para que no se pueda atribuir a una membresía de otra clínica.
- `targetMembershipId` (opcional): el integrante del personal afectado, o el médico de una asignación. Clave foránea compuesta con `tenantId`.
- `targetPatientId` (opcional): el paciente afectado. Clave foránea compuesta con `tenantId`.
- `createdAt`: lo pone la aplicación con su reloj (`timestamptz(3)`).

No se guardan correo, documento, matrícula ni nombre: se resuelven por las claves. Un evento de una persona sigue siendo legible después, porque las filas de membresía y paciente nunca se borran (FR-021).

### Restricciones (a mano en la migración)

- `CHECK (num_nonnulls("target_membership_id", "target_patient_id") >= 1)`: todo evento apunta al menos a una persona.
- `CHECK` de coherencia entre la acción y los destinos: las acciones `STAFF_*` exigen `target_membership_id` y no `target_patient_id`; las `PATIENT_*` exigen `target_patient_id` y no `target_membership_id`; las `ASSIGNMENT_*` exigen ambos. `ACCESS_RESENT` exige uno de los dos.

### Índices

- `(tenant_id, created_at DESC)`: revisar la actividad reciente de una clínica.
- `(tenant_id, target_membership_id, created_at DESC)` y `(tenant_id, target_patient_id, created_at DESC)`: revisar la historia de una persona.

### Relaciones nuevas en el esquema

- `Tenant.clinicUserEvents`, `User.clinicUserEventsMade`, `StaffMembership.eventsAsActor` y `StaffMembership.eventsAsTarget`, `Patient.events`.

## Transiciones de estado que esta funcionalidad ejecuta

Todas son actualizaciones condicionales dentro de una transacción; si la condición no se cumple, no se escribe nada y el resultado es «ya estaba así» o «no encontrado».

- **Personal.** `ACTIVE → DEACTIVATED` (desactivar) y `DEACTIVATED → ACTIVE` (reactivar). Desactivar a un administrador exige otro administrador activo y que no sea uno mismo (R5). Los roles, la matrícula y la especialidad no cambian.
- **Paciente.** `LINKED → REVOKED` (revocar: `revoked_at = ahora`) y `REVOKED → LINKED` (reactivar: `revoked_at = NULL`; `linked_at` se conserva). Un paciente `PENDING` no se revoca ni se reactiva por esta vía. Cumple los `CHECK` de la 001 sobre `linked_at` y `revoked_at`.
- **Asignación.** Crear inserta una fila vigente (el índice único parcial `doctor_patient_assignments_one_active_per_pair` evita el duplicado); quitar completa `ended_at` y `ended_by_user_id` solo si sigue vigente. Nunca se borra. Volver a asignar crea una fila nueva.
- **Alta.** Crea (o reutiliza) la cuenta propia, la membresía o el registro de paciente y, si corresponde, la asignación, con las mismas reglas de la 009 (`apply-relationship.ts`).

Dar de baja o revocar **no** toca las asignaciones (FR-023, FR-024).

## Validaciones de entrada

- Correo: normalizado (minúsculas, sin espacios en los extremos) con `normalizeEmail`.
- Nombre: no vacío, el mismo máximo que el registro de cuenta.
- Paciente: tipo de documento del enumerado `DocumentType` y número no vacío tras normalizar.
- Médico: matrícula y especialidad no vacías.
- Identificadores de membresía, paciente y asignación: UUID, siempre buscados con la clínica del actor.
- Número de página: entero positivo; un valor inválido vuelve a la página 1.

## SQL a mano en la migración

Pegar al final del `migration.sql` generado, después de las sentencias que crea Prisma:

```sql
-- clinic_user_events: todo evento apunta al menos a una persona
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_has_target"
    CHECK (num_nonnulls("target_membership_id", "target_patient_id") >= 1);

-- clinic_user_events: los destinos son coherentes con la acción
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_action_targets"
    CHECK (
        ("action" IN ('STAFF_ENROLLED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED')
            AND "target_membership_id" IS NOT NULL AND "target_patient_id" IS NULL)
        OR ("action" IN ('PATIENT_ENROLLED', 'PATIENT_REVOKED', 'PATIENT_REACTIVATED')
            AND "target_patient_id" IS NOT NULL AND "target_membership_id" IS NULL)
        OR ("action" IN ('ASSIGNMENT_CREATED', 'ASSIGNMENT_ENDED')
            AND "target_membership_id" IS NOT NULL AND "target_patient_id" IS NOT NULL)
        OR ("action" = 'ACCESS_RESENT'
            AND num_nonnulls("target_membership_id", "target_patient_id") = 1)
    );
```

## Migración

La genera y aplica el responsable (no se ejecuta `prisma migrate`, `db` ni `generate`):

```text
npx prisma migrate dev --create-only --name add_clinic_user_events
```

Después de generarla, pegar en el `migration.sql` los `CHECK` de arriba, y ejecutar:

```text
npx prisma migrate dev
npx prisma generate
```
