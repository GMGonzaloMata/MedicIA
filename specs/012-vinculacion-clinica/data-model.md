# Modelo de datos: Vinculación de personal y pacientes a una clínica

Parte del esquema existente (`prisma/schema.prisma`: `Tenant`, `User`, `StaffMembership`, `Patient`, `DoctorPatientAssignment`, `Session`). Esta funcionalidad **no cambia** el significado de ninguna de esas tablas; agrega tres y dos columnas. Toda tabla nueva lleva `tenant_id` y claves foráneas compuestas para que una fila no pueda apuntar a otra clínica.

## Tablas nuevas

### `staff_invitations` (invitación del personal)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid v7 | clave primaria |
| `tenant_id` | uuid | clínica que invita |
| `email` | texto | normalizado: minúsculas, sin espacios |
| `is_clinic_admin` | booleano | rol que se otorga |
| `is_doctor` | booleano | rol que se otorga |
| `specialty`, `license_number` | texto? | especialidad y matrícula del médico; obligatorios si `is_doctor` y ausentes si no (como `staff_memberships_doctor_fields`) |
| `token_hash` | texto, único | SHA-256 del token; el token en claro nunca se guarda |
| `status` | enum `InvitationStatus` | `PENDING`, `ACCEPTED`, `REVOKED` |
| `expires_at` | timestamptz | creación + 7 días |
| `created_by_user_id` | uuid | administrador que invitó |
| `created_at` | timestamptz | |
| `accepted_at`, `accepted_by_user_id` | timestamptz?, uuid? | se llenan al aceptar |
| `revoked_at`, `revoked_by_user_id` | timestamptz?, uuid? | se llenan al revocar |

- **Restricciones:** `CHECK (is_clinic_admin OR is_doctor)`; `CHECK` de datos del médico (si `is_doctor`, `specialty` y `license_number` no nulos ni vacíos; si no, ambos nulos); índice único parcial `(tenant_id, email) WHERE status = 'PENDING'`; `CHECK` de coherencia (`ACCEPTED` exige `accepted_at` y `accepted_by_user_id`, `REVOKED` exige `revoked_at`); índice por `(tenant_id, status, created_at)`.
- **Vencida** no es un estado: es `PENDING` con `expires_at` pasado.
- **Transiciones:** `PENDING → ACCEPTED` (una sola vez) o `PENDING → REVOKED`. `ACCEPTED` y `REVOKED` son finales. Reenviar = revocar y crear otra.

### `patient_link_codes` (código de vinculación del paciente)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid v7 | clave primaria |
| `tenant_id`, `patient_id` | uuid | clave foránea compuesta a `patients(tenant_id, id)` |
| `code_hash` | texto | SHA-256 del código normalizado |
| `status` | enum `PatientCodeStatus` | `ACTIVE`, `USED`, `REPLACED`, `LOCKED` |
| `expires_at` | timestamptz | creación + 7 días |
| `failed_attempts` | entero, por defecto 0 | `CHECK (failed_attempts BETWEEN 0 AND 5)` |
| `created_by_user_id` | uuid | administrador que lo generó |
| `created_at` | timestamptz | |
| `closed_at` | timestamptz? | cuándo dejó de estar activo |

- **Restricciones:** índice único parcial `(patient_id) WHERE status = 'ACTIVE'` (un solo código activo por paciente); índice por `(code_hash)`; índice para buscar por paciente.
- **Transiciones:** `ACTIVE → USED` (al vincular), `ACTIVE → REPLACED` (al generar otro), `ACTIVE → LOCKED` (al 5.º intento fallido). Los cuatro estados finales conservan la fila como historial.
- **Vigente** = `ACTIVE` con `expires_at` en el futuro.

### `patient_link_attempts` (límite por cuenta)

| Campo | Tipo | Notas |
|---|---|---|
| `id` | uuid v7 | clave primaria |
| `user_id` | uuid | cuenta que intentó |
| `attempted_at` | timestamptz | |

- Guarda solo intentos **fallidos**. Índice por `(user_id, attempted_at)`. Se rechaza con 10 o más en los últimos 15 minutos. Al insertar se borran las filas de ese usuario de más de 24 horas.
- No guarda documentos, códigos ni clínica.

## Columnas nuevas

### `staff_memberships`

| Campo | Tipo | Notas |
|---|---|---|
| `deactivated_at` | timestamptz? | cuándo se desactivó por última vez |
| `deactivated_by_user_id` | uuid? | quién; clave foránea a `users` |

- Se llenan al desactivar y se limpian al reactivar. `CHECK ((status = 'DEACTIVATED') = (deactivated_at IS NOT NULL))`.

## Entidades de dominio (sin dependencias externas)

- **`StaffRoles`**: `{ isClinicAdmin, isDoctor }`. Regla: al menos uno verdadero.
- **`NormalizedEmail`** y **`NormalizedDocument`**: valores ya normalizados. Toda comparación pasa por ellos.
- **`StaffInvitation`**: estado derivado `pending | expired | accepted | revoked` calculado con `now`.
- **`PatientLinkCode`**: código en claro (solo existe al generarlo), formato, normalización, estado derivado `active | expired | used | replaced | locked`.
- **`ClinicAdminActor`**: `{ tenantId, userId, membershipId }`.

## Relaciones y aislamiento

- `staff_invitations.tenant_id → tenants.id`; `created_by_user_id`, `accepted_by_user_id` y `revoked_by_user_id → users.id` (`onDelete: Restrict`, como el resto).
- `patient_link_codes (tenant_id, patient_id) → patients (tenant_id, id)`: un código no puede apuntar a un paciente de otra clínica.
- Ninguna consulta de administración se hace sin `tenant_id` del contexto. Las dos únicas lecturas sin clínica previa son aceptar una invitación (se busca por `token_hash`) y vincular un paciente (se busca por documento y código): en ambos casos la clínica **sale del registro encontrado**, nunca de un dato del cliente.

## Migración

Una sola migración de Prisma, a cargo del responsable. Va a mano en el SQL: los índices únicos parciales, los `CHECK` y los `ON DELETE`. El enum `InvitationStatus` y el enum `PatientCodeStatus` son nuevos. No se modifica ninguna fila existente.
