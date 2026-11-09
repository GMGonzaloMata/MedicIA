# Modelo de datos: Acceso multi-clínica

**Funcionalidad**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Decisiones**: [research.md](research.md)

Este documento es el diseño del `schema.prisma`, no el archivo. En el código los campos van en `camelCase` y las enumeraciones en `UPPER_SNAKE_CASE`. En PostgreSQL las tablas y columnas van en `snake_case`, mapeadas con `@map` y `@@map`, según `memory/coding-standards.md`.

## Convenciones

- **Identificadores:** UUID, columna `id` en todas las tablas (ver R10).
- **Fechas:** `timestamptz`. `createdAt` en todas las tablas; `updatedAt` solo donde la fila se modifica de más de una forma.
- **Texto:** los campos de texto obligatorios no pueden estar vacíos ni ser solo espacios (`CHECK`).
- **Borrado:** ninguna clave foránea usa cascada; todas son `Restrict`.
- **`tenantId`:** presente en membresías, pacientes y asignaciones, y siempre es el primer componente de sus unicidades e índices compuestos.

## Enumeraciones

- **`TenantStatus`:** `ACTIVE`, `SUSPENDED`.
- **`MembershipStatus`:** `ACTIVE`, `DEACTIVATED`.
- **`PatientStatus`:** `PENDING`, `LINKED`, `REVOKED`.
- **`DocumentType`:** `DNI`, `PASSPORT`, `OTHER`.

## Entidades

### Tenant (tabla `tenants`)

Clínica: frontera de aislamiento.

- **Campos:** `id`, `name`, `status` (por defecto `ACTIVE`), `createdAt`, `updatedAt`.
- **Reglas:** `name` no vacío.
- **Cubre:** FR-001, FR-002, FR-003.

### User (tabla `users`)

Cuenta de una persona, global a la plataforma.

- **Campos:** `id`, `cognitoSub`, `email`, `fullName`, `isPlatformAdmin` (por defecto `false`), `sessionsValidFrom` (por defecto la fecha de creación), `createdAt`, `updatedAt`.
- **Unicidades:** `cognitoSub` único; `email` único.
- **Reglas:** `email` debe estar en minúsculas (`CHECK email = lower(email)`); `fullName` no vacío.
- **No contiene:** contraseñas, tokens ni datos clínicos.
- **Cubre:** FR-007, FR-008, FR-009.

### StaffMembership (tabla `staff_memberships`)

Pertenencia de una cuenta al personal de una clínica.

- **Campos:** `id`, `tenantId`, `userId`, `isClinicAdmin`, `isDoctor`, `specialty`, `licenseNumber`, `status` (por defecto `ACTIVE`), `createdAt`, `updatedAt`.
- **Claves foráneas:** `tenantId → tenants.id`; `userId → users.id`.
- **Unicidades:**
  - `(tenantId, userId)`: una membresía por cuenta y clínica.
  - `(tenantId, licenseNumber)`: matrícula única por clínica; los nulos no chocan.
  - `(tenantId, id)`: destino de las claves foráneas compuestas de las asignaciones.
- **Reglas (`CHECK`):**
  - Al menos uno de `isClinicAdmin` e `isDoctor` es verdadero.
  - Si `isDoctor` es verdadero, `specialty` y `licenseNumber` no son nulos ni vacíos.
  - Si `isDoctor` es falso, ambos son nulos.
- **Índice:** `(userId)` para listar las clínicas de una persona.
- **Cubre:** FR-010, FR-011, FR-012, FR-013.

### Patient (tabla `patients`)

Registro de una persona dentro de una clínica.

- **Campos:** `id`, `tenantId`, `userId` (opcional), `documentType`, `documentNumber`, `fullName` (opcional), `status` (por defecto `PENDING`), `linkedAt` (opcional), `revokedAt` (opcional), `createdAt`, `updatedAt`.
- **Claves foráneas:** `tenantId → tenants.id`; `userId → users.id`.
- **Unicidades:**
  - `(tenantId, documentType, documentNumber)`: documento único por clínica.
  - `(tenantId, userId)`: a lo sumo un registro por cuenta y clínica; los nulos no chocan.
  - `(tenantId, id)`: destino de las claves foráneas compuestas.
- **Reglas (`CHECK`), según el estado:**
  - `PENDING`: `userId`, `fullName`, `linkedAt` y `revokedAt` nulos.
  - `LINKED`: `userId`, `fullName` y `linkedAt` presentes; `revokedAt` nulo.
  - `REVOKED`: `userId`, `fullName`, `linkedAt` y `revokedAt` presentes.
  - `documentNumber` no vacío.
  - `fullName`, si está presente, no vacío ni solo espacios.
- **Índice:** `(userId)` para listar las clínicas de un paciente.
- **No contiene:** fecha de nacimiento ni datos clínicos.
- **Cubre:** FR-014 a FR-020.

### DoctorPatientAssignment (tabla `doctor_patient_assignments`)

Un período de atención de un paciente por un médico.

- **Campos:** `id`, `tenantId`, `membershipId`, `patientId`, `createdByUserId`, `createdAt`, `endedAt` (opcional), `endedByUserId` (opcional).
- **Claves foráneas:**
  - `tenantId → tenants.id`.
  - `(tenantId, membershipId) → staff_memberships(tenantId, id)` (compuesta).
  - `(tenantId, patientId) → patients(tenantId, id)` (compuesta).
  - `createdByUserId → users.id`; `endedByUserId → users.id`.
- **Unicidad parcial:** `(membershipId, patientId)` donde `endedAt` es nulo, para que haya una sola asignación activa por pareja.
- **Reglas (`CHECK`):**
  - `endedAt` y `endedByUserId` están ambos presentes o ambos ausentes.
  - Si hay `endedAt`, no es anterior a `createdAt`.
- **Índices:**
  - `(tenantId, membershipId)` donde `endedAt` es nulo: pacientes activos de un médico.
  - `(tenantId, patientId)` donde `endedAt` es nulo: médicos activos de un paciente.
  - `(tenantId, membershipId, patientId, createdAt)`: historial de una pareja.
- **Sin `updatedAt`:** ver R8.
- **Cubre:** FR-005, FR-021 a FR-024.

## Relaciones

- Una clínica tiene muchas membresías, pacientes y asignaciones.
- Una cuenta tiene a lo sumo una membresía y un registro de paciente por clínica, y puede no tener ninguno.
- Un médico (membresía) tiene muchas asignaciones; un paciente también.
- Las asignaciones referencian a las cuentas que las crearon y las terminaron.

## Transiciones de estado

- **Clínica:** `ACTIVE` ↔ `SUSPENDED`.
- **Membresía:** `ACTIVE` ↔ `DEACTIVATED`.
- **Paciente:** `PENDING → LINKED → REVOKED → LINKED`. Revincular limpia `revokedAt` y reutiliza el registro.
- **Asignación:** activa → terminada (se completan `endedAt` y `endedByUserId`). Una asignación terminada no vuelve a activarse; asignar de nuevo crea una fila nueva.

## Trazabilidad de requisitos

- **Aislamiento (FR-004, FR-005, FR-006):** `tenantId` obligatorio y claves foráneas compuestas en las asignaciones; el primer componente de los índices permite filtrar solo por clínica.
- **Unicidades (FR-007, FR-011, FR-013, FR-015, FR-016, FR-023):** unicidades simples, compuestas y la parcial de asignaciones activas.
- **Reglas de membresía y paciente (FR-012, FR-017):** `CHECK` por rol y por estado.
- **Integridad (FR-003, FR-025):** `Restrict` en todas las claves foráneas.
- **Historial (FR-018, FR-023):** las asignaciones terminadas se conservan; revocar un paciente no toca su registro ni sus asignaciones.
- **Verificación (FR-027):** una prueba de integración por regla, en [quickstart.md](quickstart.md).

## Qué no garantiza la base (reglas de flujo)

Quedan fuera por decisión de la spec y se validarán en las funcionalidades que las ejecutan:
- Que una persona no sea personal y paciente de la misma clínica.
- Que la asignación apunte a una membresía con rol de médico, activa, y a un paciente vinculado.
- Que no se desactive al último administrador de una clínica.

Reglas que deben cumplir los casos de uso y repositorios futuros, porque la base no las garantiza:
- `createdByUserId` y `endedByUserId` de las asignaciones apuntan a cualquier cuenta de la plataforma. Se toman siempre de la sesión autenticada, nunca de la entrada del cliente.
- Un paciente `REVOKED` conserva su `userId`, y una membresía `DEACTIVATED` o una clínica `SUSPENDED` siguen existiendo. Para autorizar hay que comprobar que el paciente esté `LINKED`, la membresía `ACTIVE` y la clínica `ACTIVE`, no solo que exista el vínculo.
- Los repositorios no aceptan `isPlatformAdmin` ni `tenantId` en los datos de una actualización.

## Cómo se engancha lo que sigue

- **Invitaciones y auditoría:** tendrán sus propias tablas, con claves foráneas compuestas hacia `patients` y `staff_memberships`. No requieren cambiar las tablas de este documento.
- **Estudios y análisis:** referenciarán `patients(tenantId, id)`. La visibilidad por asignación activa ya está resuelta por el índice de asignaciones.
