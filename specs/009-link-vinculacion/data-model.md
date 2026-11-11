# Modelo de datos: Link de vinculación a una clínica

**Funcionalidad**: `009-link-vinculacion` | **Fecha**: 2026-11-11

Una tabla nueva, `invitations`, tres enumerados nuevos y relaciones inversas en tres modelos existentes. No se modifican las columnas de `tenants`, `users`, `staff_memberships`, `patients` ni `doctor_patient_assignments`: la aceptación escribe en ellas con las reglas que ya definió la spec 001.

Los `CHECK` y los índices parciales no se declaran en `schema.prisma`: se agregan a mano en el SQL de la migración, como en las migraciones 001, 002, 006 y 008.

## Enumerados

- **`InvitationKind`** (`invitation_kind`): `DOCTOR`, `PATIENT`.
- **`InvitationStatus`** (`invitation_status`): `PENDING`, `ACCEPTED`, `REVOKED`, `EXPIRED`. `EXPIRED` se escribe de forma perezosa (research R8); la lectura calcula el estado efectivo.
- **`InvitationEndReason`** (`invitation_end_reason`): `BY_SENDER`, `REPLACED`, `ATTEMPTS_EXCEEDED`. Solo se usa con `REVOKED`.

`DocumentType` ya existe (`DNI`, `PASSPORT`, `OTHER`) y se reutiliza.

## Entidad `Invitation` (tabla `invitations`)

Campos:
- `id`: UUID v7, clave primaria.
- `tenantId`: la clínica. Sale siempre del contexto autenticado de quien invita.
- `kind`: `DOCTOR` o `PATIENT`.
- `email`: correo de la persona invitada, normalizado a minúsculas y sin espacios en los extremos.
- `tokenHash`: SHA-256 del token, en hexadecimal. Único. El token no se guarda.
- `documentType`, `documentNumber`: el documento del paciente, solo en `PATIENT`. El número se guarda normalizado (research R4).
- `licenseNumber`: la matrícula del médico, solo en `DOCTOR`, normalizada.
- `createdByMembershipId`: la membresía de quien invita. Con `tenantId` forma una clave foránea compuesta hacia `staff_memberships(tenant_id, id)`: un link no puede quedar en una clínica distinta de la de su emisor.
- `createdByUserId`: la cuenta de quien invita (para el registro de actividad, FR-031).
- `assignToCreator`: verdadero cuando el emisor es médico y el vínculo es de paciente; al aceptar crea la asignación con `createdByMembershipId`. Falso en `DOCTOR` y cuando el emisor es solo administrador.
- `status`: `PENDING` por defecto.
- `endReason`: motivo de cierre, solo con `REVOKED`.
- `failedAttempts`: intentos incorrectos del documento o la matrícula. De 0 a 5.
- `expiresAt`: fecha de vencimiento, 7 días después de `createdAt`.
- `sentAt`: momento en que el servicio de correo aceptó el mensaje. Vacío si el envío falló o todavía no ocurrió.
- `createdAt`, `revokedAt`.
- `acceptedAt`, `acceptedByUserId`: cuándo y con qué cuenta se aceptó.

Relaciones:
- `tenant`: hacia `Tenant`, con `onDelete: Restrict`.
- `createdByMembership`: hacia `StaffMembership` por `(tenantId, createdByMembershipId)`, con `Restrict`.
- `createdBy`: hacia `User` por `createdByUserId`, con `Restrict`.
- `acceptedBy`: hacia `User` por `acceptedByUserId`, con `Restrict`.

Relaciones inversas nuevas: `Tenant.invitations`, `StaffMembership.invitationsCreated`, `User.invitationsCreated` y `User.invitationsAccepted`.

Índices:
- Único sobre `tokenHash`.
- Único parcial `invitations_one_pending_per_email` sobre `(tenant_id, email)` donde `status = 'PENDING'` (a mano en la migración): impide dos links vigentes para el mismo correo y la misma clínica (FR-009).
- `(tenantId, createdByMembershipId, status)` para la lista de quien invita.
- `(tenantId, status, createdAt desc)` para la lista del administrador.

## Restricciones `CHECK` (a mano en la migración)

- `invitations_email_lowercase`: `email = lower(btrim(email))` y no vacío.
- `invitations_kind_fields`: si `kind = 'DOCTOR'`, `license_number` no es vacío y `document_type` y `document_number` son nulos; si `kind = 'PATIENT'`, `document_type` y `document_number` no son vacíos y `license_number` es nulo.
- `invitations_assign_only_patient`: `assign_to_creator` solo puede ser verdadero cuando `kind = 'PATIENT'`.
- `invitations_status_fields`:
  - `PENDING`: `accepted_at`, `accepted_by_user_id`, `revoked_at` y `end_reason` nulos.
  - `ACCEPTED`: `accepted_at` y `accepted_by_user_id` presentes; `revoked_at` y `end_reason` nulos.
  - `REVOKED`: `revoked_at` y `end_reason` presentes; `accepted_at` y `accepted_by_user_id` nulos.
  - `EXPIRED`: los cuatro nulos.
- `invitations_attempts_range`: `failed_attempts` entre 0 y 5.
- `invitations_expiry_after_creation`: `expires_at > created_at`.
- `invitations_sent_after_creation`: `sent_at` nulo o `sent_at >= created_at`.

## Transiciones de estado

- `PENDING → ACCEPTED`: una aceptación válida (compare-and-swap, research R3).
- `PENDING → REVOKED (BY_SENDER)`: quien invitó o el administrador lo revoca.
- `PENDING → REVOKED (REPLACED)`: se genera otro link para el mismo correo y la misma clínica.
- `PENDING → REVOKED (ATTEMPTS_EXCEEDED)`: el quinto dato incorrecto.
- `PENDING → EXPIRED`: lo marca una lectura o escritura posterior al vencimiento.
- `ACCEPTED`, `REVOKED` y `EXPIRED` son finales: ningún link vuelve a `PENDING`. Un link nuevo es una fila nueva.

No se eliminan filas: los cambios de estado reemplazan al borrado, como en el resto del modelo (spec 001, FR-025).

## Efectos de la aceptación sobre las tablas existentes

Todo ocurre en una sola transacción, después de bloquear la fila de la cuenta (research R6):

- **`DOCTOR`**: se crea una `staff_memberships` con `is_doctor = true`, `is_clinic_admin = false`, `status = 'ACTIVE'`, la matrícula del link y la especialidad que escribió la persona. Los `CHECK` y la unicidad por clínica de la 001 son la última defensa; un choque de matrícula se traduce a "matrícula en uso".
- **`PATIENT`**: según lo que exista en la clínica:
  - no hay registro por documento ni por cuenta: se crea un `patients` en `LINKED` con el nombre de la cuenta (`users.full_name`), el documento del link, `linked_at = ahora`.
  - hay un registro propio `REVOKED`: se reutiliza, pasa a `LINKED`, `revoked_at` queda vacío y `linked_at` pasa a ahora (la 001 define `REVOKED → LINKED` así).
  - hay un registro propio `LINKED` con el mismo documento: no se duplica.
  - el documento pertenece al registro de otra cuenta, o la cuenta ya tiene un registro con otro documento: se rechaza.
  - No se crean registros `PENDING` al invitar: el link guarda el documento y el registro nace al aceptar.
- **Asignación**: si `assign_to_creator` es verdadero y la membresía emisora sigue activa y con rol de médico, se crea una `doctor_patient_assignments` con `created_by_user_id` igual a la cuenta emisora, salvo que ya haya una activa para esa pareja (el índice único parcial de la 001 es la defensa final).

## Lo que no cambia

- Ninguna columna ni restricción de las tablas de la 001, la 002, la 006 y la 008.
- La tabla `sessions` no guarda nada nuevo: al aceptar se activa el vínculo recién creado con la operación existente de la 002.

## Volumen esperado

Decenas de links por clínica y por semana. Las consultas frecuentes (buscar por hash y listar los pendientes de una clínica o de una membresía) usan los índices de arriba y devuelven pocas filas. La lista se limita a 100 filas.

## SQL a mano en la migración

Se pega al final del `migration.sql` que genera `prisma migrate dev --create-only`, después de las sentencias que Prisma escribe solo. Los nombres de las restricciones y del índice son los que mencionan las tareas y las pruebas.

```sql
-- invitations: un solo link pendiente por correo y clínica (FR-009)
CREATE UNIQUE INDEX "invitations_one_pending_per_email"
    ON "invitations"("tenant_id", "email")
    WHERE "status" = 'PENDING';

-- invitations: el correo viene normalizado (minúsculas, sin espacios en los extremos) y no vacío
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase"
    CHECK ("email" = lower(btrim("email")) AND btrim("email") <> '');

-- invitations: los datos del tipo de vínculo (matrícula para médico, documento para paciente)
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_kind_fields"
    CHECK (
        ("kind" = 'DOCTOR'
            AND "license_number" IS NOT NULL AND btrim("license_number") <> ''
            AND "document_type" IS NULL AND "document_number" IS NULL)
        OR ("kind" = 'PATIENT'
            AND "document_type" IS NOT NULL
            AND "document_number" IS NOT NULL AND btrim("document_number") <> ''
            AND "license_number" IS NULL)
    );

-- invitations: solo un link de paciente puede asignar a quien lo generó
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_assign_only_patient"
    CHECK (NOT "assign_to_creator" OR "kind" = 'PATIENT');

-- invitations: los campos de aceptación y de revocación dependen del estado
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_status_fields"
    CHECK (
        ("status" = 'PENDING'
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
        OR ("status" = 'ACCEPTED'
            AND "accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
        OR ("status" = 'REVOKED'
            AND "revoked_at" IS NOT NULL AND "end_reason" IS NOT NULL
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
        OR ("status" = 'EXPIRED'
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
    );

-- invitations: intentos incorrectos de 0 a 5
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_attempts_range"
    CHECK ("failed_attempts" BETWEEN 0 AND 5);

-- invitations: el vencimiento es posterior a la creación
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_expiry_after_creation"
    CHECK ("expires_at" > "created_at");

-- invitations: el envío del correo es posterior a la creación
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sent_after_creation"
    CHECK ("sent_at" IS NULL OR "sent_at" >= "created_at");
```

## Migración

El comando lo ejecuta el responsable del proyecto desde su terminal (el agente no corre `prisma migrate`, `prisma db` ni `prisma generate`). Orden:

1. Actualizar `prisma/schema.prisma` (lo hace la implementación).
2. `npx prisma migrate dev --create-only --name add_invitations`
3. Agregar a mano al `migration.sql` generado el índice único parcial y los `CHECK` de arriba (la implementación deja el SQL listo para pegar).
4. `npx prisma migrate dev`
5. `npx prisma generate`

Las pruebas de integración aplican las migraciones sobre la base local de Docker, igual que las anteriores.
