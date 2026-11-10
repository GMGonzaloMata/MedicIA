# Modelo de datos: estudios de ECG

Se agregan al esquema de `prisma/schema.prisma` (001 y 002) dos tablas y dos enumeraciones. No se modifica ninguna tabla existente: `Tenant`, `User` y `Patient` reciben solo la relación inversa que exige Prisma. Las restricciones `CHECK` se agregan a mano en el SQL de la migración que genera el responsable con `prisma migrate dev --create-only` (los agentes no ejecutan Prisma).

## Enumeraciones

- `StudyType` (`study_type`): `ECG`. Hoy solo existe el electrocardiograma; la selección explícita se mantiene en la interfaz para no cambiar el flujo cuando se sumen modalidades.
- `StudyStatus` (`study_status`): `UPLOADED` (cargado). El estado del proceso de análisis vive en el análisis (008), no acá.

## Entidad `Study` (`studies`)

Un estudio de un paciente de una clínica.

- `id`: UUID v7, clave primaria.
- `tenantId` (`tenant_id`): UUID, la clínica. Clave foránea a `tenants`, `onDelete: Restrict`.
- `patientId` (`patient_id`): UUID, el paciente dueño del estudio. Clave foránea **compuesta** `(tenant_id, patient_id)` a `patients (tenant_id, id)`, `onDelete: Restrict`, para que un estudio no pueda quedar en una clínica distinta de la de su paciente.
- `uploadedByUserId` (`uploaded_by_user_id`): UUID, la cuenta que cargó el estudio (el propio paciente o su médico). Clave foránea a `users`, `onDelete: Restrict`. Se toma siempre de la sesión autenticada, nunca del cliente.
- `number`: entero positivo, el número correlativo dentro del paciente (1, 2, 3…). Se asigna al guardar y no cambia.
- `type`: `StudyType`, por defecto `ECG`.
- `status`: `StudyStatus`, por defecto `UPLOADED`.
- `storageKey` (`storage_key`): texto, la clave del objeto en el bucket de estudios. Forma fija: `studies/<tenantId>/<id>.ecg1`. Se arma en el servidor, nunca viene del cliente.
- `uploadedAt` (`uploaded_at`): `timestamptz(3)`, por defecto `now()`.

Lo que **no** tiene, a propósito: nombre del archivo subido, y ninguna de las variables del estudio (edad, sexo, etc.). Esas viven solo dentro del archivo guardado en S3.

Restricciones e índices:
- `@@unique([tenantId, patientId, number])`: un número por paciente. Sirve también al orden de la lista (`ORDER BY number DESC` para un paciente).
- `@@unique([tenantId, id])`: destino de la clave foránea compuesta de los análisis de la 008, igual que `Patient` y `StaffMembership`.
- `@@unique([storageKey])`.
- `@@index([uploadedByUserId])`: la clave foránea hacia `users`, para consultas por quien cargó.
- `CHECK (number > 0)` (a mano en la migración).
- Mapeo a la tabla `studies`, columnas en `snake_case`.

Relaciones: pertenece a un `Tenant`, a un `Patient` y a un `User` (quien lo cargó). En la 008 tendrá muchos `Analysis`, con clave foránea compuesta `(tenant_id, study_id)` y `onDelete: Cascade`.

## Entidad `StudyCounter` (`study_counters`)

El último número asignado a cada paciente. Existe para asignar el número de forma atómica y para que un número eliminado no se reutilice.

- `patientId` (`patient_id`): UUID, clave primaria.
- `tenantId` (`tenant_id`): UUID. Clave foránea compuesta `(tenant_id, patient_id)` a `patients (tenant_id, id)`, `onDelete: Restrict`.
- `lastNumber` (`last_number`): entero, el último número entregado. Nunca disminuye.
- `CHECK (last_number > 0)` (a mano en la migración).

La fila se crea al cargar el primer estudio del paciente (`INSERT … ON CONFLICT DO UPDATE`, ver `research.md`, R1). Se actualiza solo desde el caso de uso de carga y siempre dentro de la misma transacción que inserta el `Study`.

## Datos existentes que usa esta funcionalidad (sin cambios)

- `Patient` (001): `status` (`PENDING`, `LINKED`, `REVOKED`), `userId`, `fullName`, `documentType`, `documentNumber`. Solo un paciente `LINKED` carga y ve estudios.
- `DoctorPatientAssignment` (001): una fila con `endedAt` nulo es una asignación vigente. Da al médico (por `membershipId`) acceso a los estudios del paciente mientras dure.
- `StaffMembership` (001): `isDoctor` y `status` (`ACTIVE`). Solo un médico activo carga y ve estudios de pacientes.
- `AccessContext` (002): de ahí salen la clínica, el vínculo y los identificadores del actor; nunca del cliente.

## Reglas y transiciones

- Un `Study` nace en `UPLOADED` y, por ahora, no cambia de estado.
- No se actualiza ningún campo de un estudio: es de solo inserción y borrado.
- Solo `uploadedByUserId` puede eliminar un estudio, y solo mientras conserve el acceso al paciente.
- Eliminar un `Study` borra la fila (y, desde la 008, sus análisis por cascada). El contador no se modifica.
- Una carga fallida no deja fila ni consume número: el contador y el estudio se escriben en la misma transacción.
- Un número consumido por una transacción que luego se revierte se devuelve con ella, así que no quedan huecos por fallas de la base. Los huecos solo aparecen por eliminaciones, que es lo esperado.
- Cuando una asignación termina, el médico pierde el acceso al paciente; los estudios que cargó siguen siendo del paciente. Si se reasigna, recupera el acceso.

## Archivo del estudio (en S3, no en la base)

Un objeto por estudio, con el formato canónico `ecg1` descrito en `contracts/stored-study-format.md`: 120.036 bytes con la onda de 2500 por 12 y las 7 variables en `float32`. Bucket `medicia-studies-dev-<cuenta>`, privado, cifrado, sin versionado. El objeto no contiene ningún dato personal: la relación con el paciente vive solo en la base.

La base y el bucket son consistentes por construcción en un solo sentido: no hay fila sin objeto (se guarda el objeto primero). Puede haber un objeto sin fila si falla la compensación; `npm run studies:reconcile` lo detecta y lo borra (ver `research.md`, R6).

## Datos de salida de los casos de uso

- `StudySummary` (lista de estudios): `id`, `number`, `type`, `status`, `uploadedAt` y `uploadedBy` (`"PATIENT"` si lo cargó el paciente, `"DOCTOR"` y el nombre del médico si lo cargó un médico). El nombre sale de `User.fullName`, ya existente.
- `PatientSummary` (lista de pacientes del médico): `id`, `fullName`, `documentType`, `documentNumber`, `studyCount`. Son datos que la clínica ya tiene registrados.
- `Page<T>`: `items`, `page`, `pageSize` (20), `totalItems`, `totalPages`.
