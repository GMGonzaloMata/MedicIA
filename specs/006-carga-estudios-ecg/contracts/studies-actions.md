# Contrato: operaciones de estudios (Server Actions y lecturas)

Las dos operaciones de escritura son Server Actions en `src/app/(dashboard)/_studies/_actions/` (compartidas por las tres pantallas); las listas se leen en Server Components. Ninguna contiene lógica de negocio: delegan en los casos de uso de `src/modules/studies/`.

## Reglas comunes

- Cada operación llama por su cuenta a `requireClinicContextForAction()` (o `requireClinicContext()` en las pantallas): una acción se puede invocar con un POST directo y el `proxy` no la protege.
- Del contexto de acceso sale el **actor**: un paciente (vínculo `PATIENT`, con su `patientId`) o un médico (vínculo `STAFF` con `isDoctor`, con su `membershipId`). Cualquier otro vínculo —incluido un administrador que no es médico—, una sesión sin clínica o sin sesión: se rechaza (`FORBIDDEN`).
- `tenantId`, el actor y el usuario que carga se toman **solo** del contexto de acceso. Ningún campo del formulario puede transportarlos.
- El único identificador de paciente que acepta del cliente un médico es `patientId`, y se valida contra sus asignaciones vigentes en la clínica activa. Un paciente no envía `patientId`: se ignora el que traiga.
- Las respuestas distinguen `FORBIDDEN` (no corresponde) de `NOT_FOUND` (no existe).
- Ninguna operación escribe en los registros datos del estudio ni el nombre del archivo.

## Acceso a pacientes y estudios

- **Paciente:** su propio paciente. Lista, carga y elimina (solo lo que cargó) a su nombre.
- **Médico:** los pacientes con asignación vigente con su membresía y en estado `LINKED`. Lista pacientes; lista estudios, carga y elimina (solo lo que cargó) a nombre de un paciente asignado.
- Si la asignación termina, el médico deja de acceder a ese paciente y a sus estudios.

## `uploadStudyAction(formData)`

Entrada: campo `file` (un archivo), `type` (hoy solo `ECG`) y, solo para médicos, `patientId`. Se ignora cualquier otro campo.

Pasos: resolver el actor y el paciente destino (el propio, o el asignado); validar el tipo; comprobar `file.size` (máximo 2 MB); leer los bytes; leer y validar el `.npz` (ver `upload-npz.md`); guardar el objeto; insertar el estudio con su número (ver `research.md`, R6).

Respuesta (estado del formulario, sin lanzar excepciones por errores esperados):
- Éxito: `{ ok: true, number }`.
- Rechazo del archivo: `{ ok: false, code, message }` con uno de los códigos de `upload-npz.md`.
- `FORBIDDEN`: sesión ausente, sin clínica, vínculo no habilitado, o paciente que el médico no tiene asignado.
- `NOT_FOUND`: `patientId` inexistente (para un médico).
- `UNAVAILABLE` («No pudimos guardar el estudio. Probá de nuevo en unos minutos.»): falla del almacenamiento o de la base. No queda estudio ni se consume número.

Después de un éxito se actualiza la lista (`revalidatePath`).

## `deleteStudyAction(formData)`

Entrada: campo `studyId` (UUID). Nada más.

Pasos: validar el UUID; buscar el estudio por `tenantId` y `id` y comprobar que el actor conserva el acceso al paciente y que **lo cargó él** (`uploaded_by_user_id`); borrar la fila en una transacción; borrar el objeto.

Respuesta:
- Éxito: `{ ok: true }`.
- `NOT_FOUND`: el estudio no existe (o es de otra clínica).
- `FORBIDDEN`: el actor no tiene acceso al paciente, o el estudio lo cargó otra persona.
- Éxito con el archivo pendiente: `{ ok: true, warning: "El estudio se eliminó, pero su archivo quedó pendiente de limpieza." }` (se registra la clave opaca).
- `IN_USE` (desde la 008, con un análisis en curso): `{ ok: false, code: "IN_USE", message }`.

## Lecturas

- **Estudios de un paciente** — `/studies` (paciente, el suyo) y `/patients/[patientId]` (médico): `Page<StudySummary>` (ver `data-model.md`). Parámetro `?page=N` (entero desde 1; cualquier otro valor se trata como 1). 20 por página, `ORDER BY number DESC`, sin filtros. Una página fuera de rango devuelve la última. Un `patientId` sin acceso muestra `/no-access`.
- **Pacientes del médico** — `/patients`: `Page<PatientSummary>`, solo asignaciones vigentes con pacientes `LINKED`, ordenada por nombre. Mismo parámetro y tamaño de página.

## Configuración que afecta al contrato

`next.config.ts`: `experimental.serverActions.bodySizeLimit: "3mb"`. Si el cuerpo lo supera, Next lo rechaza antes de ejecutar la acción; la interfaz comprueba `File.size` antes de enviar y muestra `FILE_TOO_LARGE`.

## Variables de entorno

- `STUDY_STORAGE`: `s3` o `fake`, sin valor por defecto.
- Con `s3`: `STUDIES_BUCKET` (nombre del bucket) y `AWS_REGION`, más las credenciales estándar del SDK de AWS (el usuario `medicia-dev-app`).
- Con `fake`: ninguna; el almacenamiento vive en memoria del proceso.
