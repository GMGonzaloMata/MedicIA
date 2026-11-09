# Modelo de datos: Ingreso y sesión

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md) | **Decisiones**: [research.md](research.md)

Esta funcionalidad agrega una tabla al modelo de [001-modelo-datos-acceso](../001-modelo-datos-acceso/data-model.md) y dos unicidades a tablas existentes. No cambia ningún campo de `users`: reutiliza `cognitoSub`, `email`, `fullName` y `sessionsValidFrom`.

Las convenciones son las de la funcionalidad 001: identificadores UUID v7, fechas `timestamptz`, `camelCase` en el código y `snake_case` en PostgreSQL mapeado con `@map` y `@@map`, y claves foráneas `Restrict`. Las claves foráneas nuevas declaran `onUpdate: Restrict` además de `onDelete: Restrict`. Las nueve de la funcionalidad 001 conservan el `ON UPDATE CASCADE` de Prisma, pendiente de corregir aparte.

## Cambios en tablas existentes

### StaffMembership (`staff_memberships`)

- **Unicidad agregada:** `(userId, id)`. Destino de la clave foránea compuesta de la sesión (R5). No cambia ningún dato ni regla existente.

### Patient (`patients`)

- **Unicidad agregada:** `(userId, id)`, con las mismas razones. `userId` es opcional en esta tabla; los nulos no chocan.

## Entidad nueva

### Session (tabla `sessions`)

Periodo en que una persona está dentro de la plataforma, con su propia clínica activa (FR-021).

- **Campos:**
  - `id`: UUID v7.
  - `userId`: la cuenta dueña de la sesión.
  - `tokenHash`: hash SHA-256 en hexadecimal (64 caracteres) del identificador que viaja en la cookie. Único.
  - `createdAt`: momento del ingreso.
  - `lastActivityAt`: última actividad registrada (se actualiza como máximo una vez por minuto, R7).
  - `expiresAt`: vencimiento absoluto, fijado al crear la sesión (inicio más 12 horas).
  - `revokedAt` (opcional): momento del cierre de sesión.
  - `activeStaffMembershipId` (opcional): membresía de personal con la que trabaja.
  - `activePatientId` (opcional): registro de paciente con el que trabaja.
- **Claves foráneas:**
  - `userId → users.id`.
  - `(userId, activeStaffMembershipId) → staff_memberships(userId, id)` (compuesta).
  - `(userId, activePatientId) → patients(userId, id)` (compuesta).
- **Unicidad:** `tokenHash`.
- **Reglas (`CHECK`):**
  - `tokenHash` tiene exactamente 64 caracteres.
  - `expiresAt` es posterior a `createdAt`.
  - `lastActivityAt` no es anterior a `createdAt`.
  - Si hay `revokedAt`, no es anterior a `createdAt`.
  - A lo sumo uno de `activeStaffMembershipId` y `activePatientId` está presente.
- **Índice:** `(userId)`, para localizar las sesiones de una persona y para las claves foráneas.
- **No contiene:** la contraseña, los tokens de Cognito, el valor de la cookie ni datos clínicos.
- **Cubre:** FR-011, FR-012, FR-016, FR-020, FR-021, FR-024.

## Lecturas derivadas (no son tablas)

Los casos de uso las construyen con consultas sobre las tablas existentes; los tipos viven en el dominio del módulo `users`.

### Clínica disponible

Cada opción de la lista de FR-017. Se obtiene de dos consultas por `userId`, que usan los índices `(userId)` que ya existen:
- **Como personal:** membresías con `status = ACTIVE` en clínicas con `status = ACTIVE`. Aporta el identificador de la membresía, el nombre de la clínica y los roles (`isClinicAdmin`, `isDoctor`).
- **Como paciente:** registros con `status = LINKED` en clínicas con `status = ACTIVE`. Aporta el identificador del registro y el nombre de la clínica.

Una misma clínica aparece dos veces solo si la persona tuviera ambos vínculos en ella, algo que la base no impide (ver 001).

### Contexto de acceso

Lo que devuelve `getAccessContext` en cada solicitud ([contracts/access-context.md](contracts/access-context.md)). Se resuelve con una consulta que une `sessions`, `users`, el vínculo activo y su clínica.

## Estados de la sesión

- **Vigente:** no revocada, `now < expiresAt`, `now - lastActivityAt < 30 minutos` y `createdAt >= users.sessionsValidFrom`.
- **No vigente:** deja de cumplirse alguna de las condiciones anteriores. Es un estado calculado, no una columna: no hay un proceso que la marque como vencida.
- **Con clínica activa vigente:** además de estar vigente, tiene un vínculo activo cuyo estado es `ACTIVE` (personal) o `LINKED` (paciente) en una clínica `ACTIVE`. Si el vínculo o la clínica dejan de serlo, la sesión sigue vigente pero sin clínica activa, y la persona vuelve a elegir (FR-025).

## Transiciones

- **Crear:** al iniciar sesión, sin clínica activa. Si la persona tiene una sola clínica disponible, se activa en el mismo paso.
- **Elegir o cambiar de clínica:** se reemplaza el vínculo activo (uno se limpia y el otro se completa) después de comprobar que el vínculo sea de esa persona y esté vigente.
- **Cerrar:** se completa `revokedAt`. La fila se conserva.
- **Invalidar por cambio de contraseña:** no modifica las filas; se adelanta `users.sessionsValidFrom`.

## Reglas que no garantiza la base

- Que el vínculo activo siga vigente (membresía `ACTIVE`, paciente `LINKED`, clínica `ACTIVE`): cambia después de crear la sesión, así que se revalida en cada solicitud.
- Que la sesión no haya vencido por inactividad o por tiempo absoluto: depende de la hora.
- Que `sessionsValidFrom` no sea posterior al inicio de la sesión: se evalúa al leer.

## Trazabilidad

- **Aislamiento (FR-024, FR-026):** la clave foránea compuesta impide que una sesión apunte al vínculo de otra persona. La clínica nunca se guarda en la sesión: se deduce del vínculo.
- **Cierre inmediato y sesiones independientes (FR-011, FR-021):** cada sesión es una fila propia con `revokedAt` propio y su propio vínculo activo.
- **Vencimientos (FR-012):** `expiresAt` y `lastActivityAt`.
- **Cambio de contraseña (FR-016):** `users.sessionsValidFrom` ya existente.
- **Verificación (SC-008):** una prueba de integración por regla, en [quickstart.md](quickstart.md).

## Cómo se engancha lo que sigue

- **Invitaciones:** al aceptar una invitación se crea el vínculo y la persona lo ve en su lista de clínicas sin cambios en esta tabla.
- **Estudios y análisis:** obtienen la clínica del contexto de acceso, nunca de la entrada.
- **Auditoría:** podrá referenciar `sessions.id` para saber desde qué sesión se hizo cada acción.
