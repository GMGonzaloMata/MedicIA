# Investigación: Vinculación de personal y pacientes a una clínica

Resuelve las decisiones técnicas del plan. No quedan marcadores de clarificación abiertos: todo lo de producto está en [spec.md](spec.md), sección Clarifications.

## D1. Dónde vive la funcionalidad

- **Decisión:** el módulo `src/modules/tenants/` (hoy vacío, previsto en `memory/architecture.md` como «Clínicas y aislamiento multi-tenant»). Contiene el padrón de personal, las invitaciones, el padrón de pacientes con sus códigos y las asignaciones.
- **Por qué:** `users` resuelve quién es la persona y su sesión; esta funcionalidad administra los vínculos de una clínica. Mezclarlos haría crecer `users` con otra responsabilidad.
- **Cómo se conectan los módulos:** `eslint.config.mjs` prohíbe que un módulo importe a otro. `tenants` no importa `users`: recibe datos simples (`userId`, `email`, `tenantId`). Las acciones de `app/` llaman a las dos composiciones, como ya hace `toStudyActor`. Después de aceptar una invitación o vincular un paciente, la acción llama a `users.selectActiveClinic` para dejar esa clínica activa.
- **Alternativa descartada:** ampliar `users`. Se evita porque el módulo ya tiene 11 casos de uso de identidad y sesión.

## D2. Enviar el correo de invitación

- **Decisión:** puerto `InvitationMailer` con dos adaptadores elegidos por `INVITATION_MAILER` (`smtp` o `fake`, sin valor por defecto, igual que `MODEL_INFERENCE` y `STUDY_STORAGE`). El real usa **SMTP con `nodemailer`** y la configuración ya definida: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` e `INVITATION_FROM_ADDRESS`. El simulado escribe cada correo en el archivo `FAKE_MAIL_OUTBOX_FILE` (una línea JSON por correo) y lo lee el E2E.
- **Por qué:** el responsable ya tiene un remitente Gmail configurado, no exige infraestructura nueva y el puerto permite cambiar a Amazon SES más adelante sin tocar el negocio.
- **Enmienda necesaria (bloquea la implementación hasta su aprobación):** el stack aprobado de la constitución no incluye un servicio de correo. Hay que sumar «Correo transaccional: servidor SMTP configurable, detrás de un puerto» y la dependencia `nodemailer`. Es una enmienda **MINOR** (1.6.1 → 1.7.0) que, según la gobernanza, debe aprobar el responsable y actualizar `memory/architecture.md`. Este plan **no modifica la constitución**: la tarea correspondiente queda marcada como del responsable.
- **Límites de Gmail:** una cuenta personal de Gmail limita los envíos diarios (unos cientos) y exige una contraseña de aplicación. Sirve para desarrollo y demo; para producción hay que pasar a un servicio de correo transaccional. El puerto lo permite.
- **Alternativas descartadas:** Amazon SES (infraestructura y salida del modo de prueba, innecesario ahora); mostrar el enlace al administrador (cambia la decisión de invitar por correo).

## D3. Invitaciones del personal

- **Token:** 32 bytes aleatorios en base64url, generados con `node:crypto`. Se guarda solo su **hash SHA-256**; el token en claro solo viaja en el correo. Un token de 256 bits no necesita sal ni derivación lenta.
- **Estados:** `PENDING`, `ACCEPTED` y `REVOKED`. «Vencida» no es un estado guardado: se deduce de `expires_at` al leer. Así no hace falta un proceso que las venza.
- **Una pendiente por correo y clínica:** índice único parcial sobre `(tenant_id, email) WHERE status = 'PENDING'`. Reenviar es revocar la anterior y crear otra en una sola transacción.
- **Correo:** se normaliza (minúsculas y sin espacios) al crear y al comparar. La invitación solo puede aceptarla quien ingresó con ese correo, que Cognito ya verificó.
- **Enlace:** `/invitation/<token>`. El token va en la ruta y no en el parámetro de búsqueda para que no aparezca en los registros de consulta. La pantalla envía `Referrer-Policy: no-referrer`.
- **Persona sin cuenta:** el `proxy` ya redirige a quien no tiene sesión a `/sign-in?next=…`. Si no tiene cuenta, se registra con ese mismo correo, verifica y **vuelve a abrir el enlace del correo**. No se cambia el flujo de registro para propagar `next`; el correo lo dice. Es lo más simple y evita tocar autenticación.
- **Miembro existente:** si la persona ya es miembro activo con todos los roles de la invitación, se rechaza al crearla («ya pertenece a la clínica»). Si la invitación suma un rol, al aceptarla se actualiza la misma membresía. Si el miembro está desactivado, se rechaza con el aviso de que debe reactivarlo el administrador: reactivar es una decisión explícita.
- **Médico:** la base exige especialidad y matrícula a todo médico y ninguna a quien no lo es (`staff_memberships_doctor_fields`, spec 001 FR-012), así que **la invitación las lleva** (el administrador las carga al invitar) y se copian a la membresía al aceptar. Se descubrió al implementar: la primera versión de este plan las daba por opcionales y la base habría rechazado la membresía. Una matrícula repetida en la clínica se rechaza al invitar (`LICENSE_IN_USE`), no al aceptar, cuando la persona ya no puede corregirla. Quien ya es médico conserva sus datos si una invitación le suma otro rol.

## D4. Código de vinculación del paciente

- **Formato:** 10 caracteres de un alfabeto de 31 símbolos sin ambiguos (sin `0/O` ni `1/I/L`: quedan 23 letras y 8 dígitos), unos 49,5 bits; se generan descartando bytes sesgados para que ningún símbolo sea más frecuente, mostrados como `XXXXX-XXXXX`. Se generan con `node:crypto`. Se guarda el hash SHA-256 del código normalizado (mayúsculas y sin guion).
- **Entrega:** el código se muestra **una sola vez** al administrador al generarlo o regenerarlo. La clínica se lo entrega al paciente. Nunca se vuelve a mostrar ni se envía por correo (el registro del paciente no tiene correo).
- **Verificación:** el paciente indica tipo y número de documento más el código. Se buscan los registros `PENDING` de **cualquier clínica** con ese documento que tengan un código `ACTIVE` y vigente; se compara el hash del código ingresado. Es la única lectura entre clínicas de la funcionalidad y es inevitable: la persona todavía no pertenece a ninguna. La clínica sale del registro que coincide, nunca de un dato del cliente.
- **Respuesta uniforme:** documento inexistente, código incorrecto, código vencido, usado, reemplazado o bloqueado devuelven el mismo mensaje y el mismo código de resultado. No se revela cuál falló.
- **Intentos por código:** cada fallo suma 1 a `failed_attempts` de los códigos activos de los registros con ese documento. Al llegar a 5, el código pasa a `LOCKED` y la clínica debe generar uno nuevo. Esto cubre al atacante que conoce un documento y adivina códigos. Con 50 bits y 5 intentos por código, adivinarlo no es viable.
- **Costo conocido:** quien conozca un documento puede gastar los 5 intentos y bloquear el código de ese paciente (denegación de servicio acotada; la clínica regenera). Se mitiga con el límite por cuenta.
- **Límite por cuenta:** una tabla de intentos fallidos por usuario; con 10 fallos en 15 minutos se rechaza con un mensaje de espera, sin evaluar el código. Las filas de más de 24 horas se borran al registrar un intento nuevo.
- **Documentos repetidos entre clínicas:** dos clínicas pueden tener un paciente con el mismo documento. El código identifica cuál. Un fallo suma a ambos; es un costo aceptado y está documentado.
- **Normalización del documento:** se quitan espacios, puntos y guiones y se pasa a mayúsculas, tanto al registrar como al verificar. Los datos de siembra existentes ya cumplen este formato.
- **Cuenta que ya es paciente en esa clínica:** `@@unique([tenantId, userId])` ya lo impide; se informa con el mismo mensaje uniforme.

## D5. Desactivar miembros y no dejar la clínica sin administrador

- **Efecto inmediato:** ya existe. `resolveCurrentSession` revalida en cada solicitud el estado de la membresía y de la clínica, y `toActiveClinic` devuelve `null` si no está `ACTIVE`. Esta funcionalidad solo cambia el estado y agrega una **prueba** que lo demuestra con una sesión abierta (FR-009, SC-005).
- **Asignaciones (decidido en la clarificación):** no se tocan al desactivar. Los casos de uso de estudios ya autorizan desde el contexto de acceso, así que un médico desactivado no llega a ellas.
- **Último administrador:** una transacción bloquea la fila de la clínica (`SELECT … FOR UPDATE`), cuenta los administradores activos y rechaza si el miembro a desactivar es el único. El bloqueo evita que dos administradores se desactiven a la vez.
- **Quién desactivó:** se agregan `deactivated_at` y `deactivated_by_user_id` a la membresía. Se limpian al reactivar. Las asignaciones ya guardan `ended_at` y `ended_by_user_id`.

## D6. Asignaciones

- **Ya existe:** el índice único parcial `doctor_patient_assignments_one_active_per_pair` impide dos vigentes para el mismo par médico–paciente, y la clave foránea compuesta impide asignar entre clínicas distintas. La funcionalidad crea y termina filas; no cambia el modelo.
- **Reglas del caso de uso:** el médico debe ser miembro activo y médico de la misma clínica; el paciente, de la misma clínica. Reasignar es terminar la vigente y crear otra en una transacción.
- **Paciente sin cuenta vinculada (`PENDING`):** se puede asignar (FR-019). Mientras tanto nadie accede a él como paciente.

## D7. Aviso al paciente cuando su médico no está disponible

- **Decisión:** en `/studies` (la pantalla del paciente) se agrega un aviso cuando el paciente tiene asignaciones vigentes y **todos** sus médicos están desactivados. Una consulta del módulo `tenants` devuelve solo un booleano `attendingDoctorAvailable`; no devuelve nombres ni datos del médico.
- **Por qué:** cumple FR-021 sin exponer datos personales del médico.

## D8. Autorización

- **Actor administrador:** `ClinicAdminActor { tenantId, userId, membershipId }`, que se arma en `src/app/_lib/clinic-admin-actor.ts` solo si el contexto es `STAFF` con `isClinicAdmin`. Un administrador que además es médico también lo es. Un médico sin rol de administrador no lo es y se rechaza.
- **Una sola puerta:** todas las acciones de administración llaman a `requireClinicContextForAction()` y construyen el actor antes de delegar. El caso de uso nunca recibe un `tenantId` del formulario.
- **Identificadores ajenos:** cualquier identificador de otra clínica se trata como inexistente (`NOT_FOUND`), sin distinguir «no existe» de «es de otra clínica».

## D9. Registros y datos personales

- Los casos de uso y los adaptadores registran solo códigos de resultado (`INVITATION_SENT`, `LINK_FAILED`), nunca correos, documentos, nombres, tokens ni códigos. Una prueba lo comprueba capturando la salida de `console` (SC-008).
- El adaptador SMTP no registra el cuerpo del correo ni los datos de la conexión; ante un error registra solo la clase del error.

## D10. Pruebas

- **Unitarias** (`tests/unit/`): dominio (normalización, formato de códigos, vencimientos, reglas de roles), casos de uso con repositorios en memoria y el generador de correo.
- **Integración** (`tests/integration/`, con la base de `docker-compose.yml`): repositorios de Prisma, la unicidad y los bloqueos, el rechazo entre clínicas de **cada** operación (regla de la constitución), el último administrador con dos desactivaciones concurrentes y el límite de intentos.
- **E2E** (`tests/e2e/`, Playwright con `INVITATION_MAILER=fake`): invitar y aceptar, alta y vinculación de un paciente, asignar y ver, desactivar y perder acceso con sesión abierta.
- **Cobertura:** al menos 80 % de líneas en el código nuevo (tarea compleja: autorización, persistencia e integración externa).

## D11. Migración y comandos reservados

- Una migración de Prisma agrega `staff_invitations`, `patient_link_codes`, `patient_link_attempts` y las dos columnas de `staff_memberships`. **La genera y aplica el responsable** (`prisma migrate`); los índices parciales y los `CHECK` se agregan a mano en el SQL, como en las migraciones anteriores.
- En la base de la demo (RDS) la migración se aplica con el procedimiento que ya se usó, antes de desplegar.
