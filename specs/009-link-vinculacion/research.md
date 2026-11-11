# Investigación: Link de vinculación a una clínica

**Funcionalidad**: `009-link-vinculacion` | **Fecha**: 2026-11-11

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. Las decisiones R1 a R6 responden a las seis preguntas que pidió el plan; R7 a R12 salen de leer el código existente.

## R1. Servicio de envío de correo propio

**Decisión**: un servidor SMTP, usado con una cuenta de Gmail dedicada al proyecto y una contraseña de aplicación, detrás de un puerto de salida `InvitationMailer`. Hay dos adaptadores, elegidos por la variable `INVITATION_MAILER` (`smtp` o `fake`, sin valor por defecto, como `MODEL_INFERENCE` y `STUDY_STORAGE`). El adaptador `smtp` es genérico: no sabe nada de Gmail. Gmail es solo el servidor que se configura (`smtp.gmail.com`), así que más adelante se puede apuntar a Amazon SES por SMTP, a Brevo o a otro servidor cambiando variables, o escribir un adaptador propio de SES sin tocar el resto. La librería es `nodemailer`, en una versión exacta fijada al instalarla: la 10.2.1 (publicada el 2026-10-22), con `@types/nodemailer` 8.0.2. Se evitó la última, la 10.5.0, porque se había publicado el día anterior y la librería maneja la contraseña del correo.

**Por qué**:
- Es gratis y no necesita dominio ni infraestructura nueva: no hay módulo de Terraform ni permisos de IAM.
- Puede enviar a cualquier destinatario desde el primer día. Amazon SES, en cambio, arranca en modo de prueba y solo envía a direcciones verificadas una por una, lo que complica una demostración con personas que no se conocen de antemano.
- Cognito no sirve: solo envía sus propios mensajes (códigos de verificación y de recuperación) con plantillas fijas. No puede mandar un correo con un link propio.
- Los correos salen firmados por Google desde su propia dirección, así que la alineación con DMARC es correcta. Eso evita el problema que tendría una dirección de Gmail enviada a través de SES.

**Qué hay que aceptar** (riesgos y límites, no bloquean):
- **Credencial en el servidor.** La contraseña de aplicación (`SMTP_PASSWORD`) permite enviar correos como esa cuenta. Se guarda en `.env.local` (fuera de git), nunca se registra y nunca llega al navegador. Quien tenga acceso al entorno del servidor puede usarla, así que la cuenta debe ser una dedicada al proyecto, con verificación en dos pasos y sin ningún otro dato, y la contraseña se revoca desde la cuenta de Google si se filtra. Es un secreto que no maneja Terraform.
- **Límite diario.** Una cuenta común de Gmail permite unos 500 envíos por día (el responsable debe confirmar la cifra vigente) y Google puede bloquear envíos que considere automáticos. Alcanza de sobra para una demostración.
- **Remitente.** Los correos salen desde esa dirección de Gmail, no desde un dominio de la clínica ni de la plataforma. No es presentable para una clínica real.
- **Solo es válido para esta etapa.** Antes de operar con clínicas reales hay que pasar a un servicio transaccional con dominio propio (Amazon SES, por ejemplo). El puerto hace que ese cambio sea escribir o configurar otro adaptador, no rehacer la funcionalidad.

**Seguridad del adaptador**:
- Conexión siempre cifrada: puerto 465 con TLS implícito o 587 con `STARTTLS` obligatorio. Cualquier otra combinación se rechaza al armar el adaptador.
- Tiempos máximos de conexión, saludo y envío de 10 segundos.
- Los errores se traducen a `MailDeliveryError` con un código genérico: ni el mensaje del servidor (que puede contener el destinatario) ni la contraseña llegan a los registros.

**¿Requiere enmienda de la constitución?** Sí, una enmienda MINOR. La constitución fija el stack aprobado ("cambiar cualquiera de estas tecnologías requiere una enmienda") y no lista un servicio de correo. Agregar uno no cambia ninguna de las tecnologías aprobadas, pero deja una dependencia fuera de la lista. La propuesta es agregar una línea al stack ("Correo transaccional: servidor SMTP, consumido mediante un adaptador; en esta etapa, una cuenta de Gmail dedicada con contraseña de aplicación") y subir la versión de 1.6.1 a 1.7.0, actualizando `memory/architecture.md` y `memory/project-structure.md`. La enmienda necesita la aprobación del responsable y queda como la primera tarea.

**Alternativas descartadas**:
- Amazon SES: es la opción correcta para producción, pero hoy suma modo de prueba con destinatarios verificados, un módulo de Terraform, permisos del operador por la vía de administración y un remitente que idealmente requiere un dominio. Queda como el siguiente adaptador cuando haya una clínica real.
- Servicios de terceros (Resend, SendGrid, Postmark, Brevo): algunos tienen capa gratuita, pero suman un proveedor y una clave fuera de Terraform; varios exigen un dominio verificado para enviar a terceros. El adaptador SMTP genérico permite usar alguno de ellos sin cambiar el código.
- Mostrar el link a quien invita para que lo reenvíe: ya descartado en la clarificación.

**Infraestructura**: sin cambios. Este plan no toca `infra/`.

## R2. Generación y almacenamiento del link

**Decisión**: el token es un valor aleatorio de 32 bytes (`randomBytes`) en base64url, de 43 caracteres: la misma forma que el identificador de la cookie de sesión. La base guarda solo su hash SHA-256 en hexadecimal, con índice único. El valor original solo existe en el correo y en la memoria de la solicitud que lo genera; no se guarda ni se registra.

**Por qué**:
- 256 bits de entropía hacen imposible adivinarlo o deducirlo del correo u otro link (FR-025).
- Con el hash guardado, una copia de la base no permite reconstruir un link vigente (FR-026). Un hash rápido alcanza porque el valor ya es aleatorio y largo; un hash lento (como el de contraseñas) no aporta nada.
- Reutiliza el criterio ya aprobado en `src/modules/users/domain/session-token.ts`. Se crea un archivo propio, `invitation-token.ts`, con las mismas tres operaciones (generar, hashear, validar la forma) en vez de renombrar el de sesión y tocar sus usos: son tres líneas, y los dos identificadores pueden evolucionar por separado.

**Dónde viaja**: el link del correo es `<APP_BASE_URL>/invite/<token>`. La dirección base sale siempre de la variable `APP_BASE_URL`, nunca del encabezado `Host` de la solicitud: usar el encabezado permitiría que un atacante hiciera enviar correos con un link a un sitio propio.

**Riesgo residual**: el token queda en la ruta del link y por lo tanto en los registros de acceso del servidor mientras el link sea válido (7 días). Lo mitigan el segundo dato (documento o matrícula, R4), la atadura al correo y que el valor se retira de la barra de direcciones en el primer paso (R5). Se documenta; no se resuelve con un token en el fragmento de la URL porque el servidor no lo recibe.

## R3. Aceptación atómica y de un solo uso

**Decisión**: la aceptación es una transacción de base de datos que empieza con una actualización condicional (compare-and-swap) de la fila del link: pasa a `ACCEPTED` solo si sigue `PENDING`, no venció y le quedan intentos. Si la actualización no afecta ninguna fila, el link no es válido y no se escribe nada más. Si afecta una, la misma transacción crea o reactiva el vínculo y, si corresponde, la asignación. Cualquier fallo revierte todo, incluida la marca de aceptado (FR-017).

**Por qué**:
- Dos aceptaciones simultáneas del mismo link compiten por el bloqueo de esa fila: la segunda espera a que termine la primera y, al reevaluar la condición, ya no encuentra el link pendiente (FR-020, SC-005). No hace falta ningún bloqueo en la aplicación.
- Es el mismo patrón que la 008 usa con su índice único parcial: dejar que la base de datos arbitre.

**Alternativas descartadas**: leer el estado, decidir en la aplicación y escribir (carrera entre dos solicitudes); aislamiento serializable en toda la transacción (reintentos y complejidad sin necesidad, porque la condición sobre una fila alcanza).

## R4. Límite de intentos y comparación del documento o la matrícula

**Decisión**:
- Cada link tiene un contador de intentos fallidos (`failed_attempts`). Solo cuenta cuando la persona que intenta es la dueña del correo del link (la comprobación del correo va primero), así que nadie con otra cuenta puede gastar los intentos de un link ajeno.
- Un dato incorrecto incrementa el contador con una actualización atómica (`failed_attempts + 1`) fuera de la transacción de aceptación, para que no se revierta. Al llegar a 5 el link pasa a `REVOKED` con motivo `ATTEMPTS_EXCEEDED` (FR-038). La condición `failed_attempts < 5` de la actualización condicional de R3 cierra la carrera con los últimos intentos.
- La comparación normaliza los dos lados con una función de dominio: recorta, pasa a mayúsculas y quita espacios, puntos y guiones. Un DNI escrito como `12.345.678` y uno escrito como `12345678` son iguales; también `mn 123` y `MN123`. Para el tipo de documento se compara el valor exacto (DNI, pasaporte u otro).
- La comparación usa igualdad de cadenas de tiempo constante (`timingSafeEqual` sobre los hashes de ambos lados) para no filtrar por tiempo cuántos caracteres coinciden. Con un límite de 5 intentos el riesgo es mínimo; es una línea y evita discutirlo en la revisión.
- El dato normalizado es lo que se guarda en el paciente o en la membresía al aceptar, de modo que `patients.document_number` y `staff_memberships.license_number` quedan en un formato único y la unicidad de la 001 (por clínica) compara siempre lo mismo.

**A verificar al implementar (tarea T010)**: que los documentos del script `seed:demo` y de la 006 ya estén en formato normalizado (sin puntos ni espacios). Si no, la tarea correspondiente agrega la normalización ahí y no al revés.

**Mensajes**: ante un dato incorrecto se informa "los datos no coinciden" y cuántos intentos quedan, sin indicar qué dato falló ni cuánto se parece (FR-038).

## R5. Retomar el link después de registrarse o iniciar sesión

**Problema**: el ingreso de la 002 solo conserva el destino (`next`) cuando la persona ya tiene una clínica activa; sin clínica va a `/no-access`, y justamente quien llega por una invitación suele no tener ninguna. Además, el registro no arrastra ningún destino: son tres pantallas (registro, verificación del correo, ingreso) y el destino se perdería. Poner el token en `next` dejaría el valor en la barra de direcciones, el historial y los registros.

**Decisión**: una cookie corta y propia.
1. El link abre `GET /invite/<token>`, un Route Handler público. Si el token tiene la forma esperada, guarda su valor en la cookie `medicia_invitation` (`httpOnly`, `sameSite=lax`, `secure` en producción, `path=/`, vigencia de 2 horas) y redirige a `/invitation`. El valor del token desaparece de la barra de direcciones en ese mismo momento. La respuesta lleva `Referrer-Policy: no-referrer` y `Cache-Control: no-store`. Si la forma es incorrecta no se guarda nada y se redirige igual, para no distinguir casos.
2. `/invitation` es una pantalla protegida. Sin sesión, el `proxy` ya redirige a `/sign-in?next=/invitation` (el `proxy` solo ve la cookie de sesión y la ruta; el token no viaja).
3. La acción de ingreso, si hay una invitación pendiente en la cookie, redirige a `/invitation` aunque la persona no tenga clínica o deba elegir entre varias. El registro y la verificación del correo no necesitan cambios: la cookie sobrevive a ese recorrido.
4. Las pantallas de ingreso y registro muestran un aviso ("Ingresá o creá tu cuenta con el correo al que llegó la invitación"). `/no-access` ofrece continuar con la invitación.
5. La cookie se borra cuando el resultado es definitivo: aceptada, inválida o agotada.

**Por qué no abrir la invitación con una GET**: los programas de seguridad del correo abren los links para analizarlos. La GET solo guarda una cookie en el cliente de quien la abre y nunca cambia el estado del link. Aceptar es siempre una acción de servidor (POST) de una persona con sesión.

**Por qué la pantalla no revela datos**: `/invitation` solo muestra la clínica y el tipo de vínculo si la cuenta con sesión tiene el correo del link y el link es utilizable. En cualquier otro caso muestra el mismo mensaje genérico (FR-024).

**Alternativas descartadas**: token en `next` o en la URL de registro (queda en historial y registros); guardarlo en el almacenamiento del navegador (no llega al servidor en una navegación); arrastrarlo como campo oculto por las tres pantallas de la 002 (cambia pantallas que no son de esta funcionalidad y se pierde si la persona cierra y vuelve).

**Verificado en la guía instalada (T003)**: `cookies()` solo permite escribir (`set` y `delete`) en un Route Handler o en una Server Function, nunca durante el render; leer cookies en una pantalla vuelve dinámica la ruta y, con `cacheComponents`, debe ir dentro de `<Suspense>` (guías de `cookies`, Route Handlers y autenticación con Cache Components). Un `GET` que usa `cookies()` es dinámico, sin problema para `/invite/[token]`. Sin diferencias con lo planeado.

## R6. Un solo tipo de vínculo por clínica

**Decisión**: una función de dominio pura, `checkRelationshipCompatibility`, recibe lo que la persona ya tiene en esa clínica (membresía y registro de paciente, con sus estados) y el tipo de vínculo pedido, y devuelve una de estas respuestas: se puede crear, ya pertenece (sin cambios) o hay un conflicto con su motivo. El caso de uso la aplica dentro de la transacción de aceptación, con los datos leídos allí. La base de datos no puede expresar la regla porque cruza dos tablas (así lo dejó dicho la spec 001).

Reglas:
- Vínculo de médico: si ya tiene membresía en la clínica, activa y con rol de médico, "ya pertenece". Si tiene membresía desactivada o solo de administrador, se rechaza sin cambiarla (activar de nuevo o sumar el rol de médico a un administrador es gestión de usuarios, funcionalidad 010). Si tiene un registro de paciente de esa clínica en cualquier estado (vinculado o revocado), conflicto.
- Vínculo de paciente: si es paciente vinculado de la clínica, "ya pertenece" (y se agrega la asignación si corresponde, FR-015). Si es paciente revocado, se reutiliza su registro (spec, historia 2, escenario 4). Si tiene una membresía en la clínica (activa o desactivada), conflicto.

**Concurrencia**: dos aceptaciones simultáneas de la misma persona (una como médico y otra como paciente) podrían pasar ambas la comprobación y crear los dos vínculos. Para serializarlas, la transacción empieza bloqueando la fila de la persona (`SELECT … FOR UPDATE` sobre `users`). Así todas las aceptaciones de una misma cuenta se ejecutan una detrás de otra, sin bloquear a otras cuentas. Se prueba con una prueba de integración de concurrencia, como la de la 008.

**Al generar el link** se comprueba lo mismo, pero solo con datos de la propia clínica de quien invita y sin revelar si el correo tiene cuenta en la plataforma: se rechaza solo si en esa clínica ya existe una cuenta con ese correo y su vínculo es incompatible. Es un aviso temprano; la regla real se aplica al aceptar.

## R7. Dónde vive el código

**Decisión**: todo en `src/modules/users/` (lo pidió el responsable), sin módulo nuevo. Las invitaciones se apoyan en las tablas que ese módulo ya define (membresía, paciente, asignación) y escriben en ellas, así que ponerlas en otro módulo obligaría a una composición cruzada innecesaria, como la que la 008 tuvo que resolver con cierres perezosos (R1 de la 008).

**Los puertos nuevos** son tres:
- `InvitationRepository`: crea reemplazando, lista, busca por hash, revoca, marca como enviada, cuenta un intento fallido y abre la transacción de aceptación. La transacción se expone como `runAcceptance(userId, trabajo)`: el adaptador de Prisma abre la transacción, bloquea la fila de la persona y entrega un objeto con las operaciones mínimas que necesita el caso de uso. Las reglas de negocio quedan en el caso de uso y en el dominio, no en el repositorio, y se prueban con un repositorio en memoria.
- `InvitationMailer`: `send` (ver R1).
- Se reutiliza el puerto existente `SessionRepository` para activar la clínica nueva.

**Por qué no un módulo `invitations`**: la constitución pide que un patrón responda a una necesidad concreta. Hoy no hay una segunda capacidad que justifique la separación.

## R8. Estados del link y vencimiento perezoso

**Decisión**: el estado guardado es `PENDING`, `ACCEPTED` o `REVOKED`; `EXPIRED` existe como valor del enumerado pero lo calcula la lectura: un link `PENDING` con `expires_at <= ahora` se trata como vencido en cada consulta y cada aceptación, y se marca `EXPIRED` cuando algo lo toca (reemplazo, listado). No hay trabajador que lo recorra, como en la 008. Un motivo de cierre (`end_reason`) distingue las revocaciones: `BY_SENDER`, `REPLACED`, `ATTEMPTS_EXCEEDED`.

**Reemplazo (FR-009)**: un índice único parcial sobre `(tenant_id, email)` donde `status = 'PENDING'` impide tener dos vigentes. Crear un link nuevo cierra primero los pendientes del mismo correo y clínica (los vencidos como `EXPIRED`, los vigentes como `REVOKED` con motivo `REPLACED`) y luego inserta el nuevo, todo en una transacción. Si dos generaciones chocan, el índice hace fallar a la segunda, que se reintenta una vez.

**Envío fallido (FR-036)**: la invitación se guarda antes de enviar el correo, con `sent_at` vacío. Si el envío funciona, se completa `sent_at`; si falla, queda sin completar y la pantalla lo muestra con la opción de reintentar. Reintentar es generar de nuevo con los mismos datos, lo que reemplaza a la anterior (FR-009): nunca quedan dos vigentes. El orden "guardar y después enviar" deja, en el peor caso (el proceso cae entre los dos pasos), un correo enviado con `sent_at` vacío y un link válido, que es inocuo; el orden contrario podría dejar un link enviado que no existe en la base.

**Link cuya clínica se suspende o cuyo emisor pierde vigencia (FR-023)**: no se guarda nada. Se comprueba al aceptar y al previsualizar: clínica activa, membresía del emisor activa y, si el link asigna al emisor, que siga siendo médico. Se aplica el mismo criterio al mostrar la lista.

## R9. Quién puede invitar y cómo se decide la asignación

**Decisión**: el actor se deduce del contexto de acceso de la 002, igual que el actor de los estudios (`src/app/_lib/study-actor.ts`): un archivo `src/app/_lib/invitation-actor.ts` traduce el contexto a un actor de invitaciones y la regla vive en el dominio (`invitation-access.ts`).
- Pacientes: no invitan.
- Personal con rol de administrador: puede invitar médicos y pacientes.
- Personal con rol de médico: solo pacientes.
- Quien tiene ambos roles tiene los permisos de ambos, y sus links de paciente lo asignan como médico (FR-007). Un administrador sin rol de médico genera links de paciente sin asignación.
- El administrador de plataforma que no es miembro de la clínica no puede (FR-029).

**Revocar**: quien generó el link puede revocarlo. Decisión del plan, para cerrar un vacío de la spec: un administrador de la clínica también puede revocar los links pendientes de otros integrantes de su clínica, porque la spec le permite verlos (FR-022) y no tiene sentido que los vea y no pueda anular uno enviado por error. No tiene permiso un médico sobre los de otros. Se confirma en `speckit-analyze` antes de implementar.

## R10. Contenido del correo

**Decisión**: asunto "Invitación a <clínica> en MedicIA"; cuerpo con el nombre de la clínica, si se lo invita como médico o como paciente, el link, la fecha de vencimiento y una línea que dice que debe iniciar sesión o crear su cuenta con ese mismo correo y que se le pedirá su documento o su matrícula. Versión de texto plano y una versión HTML mínima, ambas en español. Nunca incluye el documento, la matrícula, el nombre de quien invita ni datos clínicos (FR-034). El nombre de la clínica se escapa en la versión HTML.

## R11. Configuración

Variables nuevas, todas validadas con zod al armar el adaptador, igual que las de S3 y SageMaker:
- `INVITATION_MAILER`: `smtp` o `fake`. Sin valor por defecto: una ausencia es un error al usarlo, no un envío simulado en producción.
- `APP_BASE_URL`: dirección pública de la aplicación, con `https` obligatorio cuando `NODE_ENV` es producción. Se usa solo para armar el link.
- Con `smtp`: `SMTP_HOST` (para Gmail, `smtp.gmail.com`), `SMTP_PORT` (`465` o `587`), `SMTP_USER`, `SMTP_PASSWORD` (la contraseña de aplicación: es un secreto, nunca se registra ni se versiona) e `INVITATION_FROM_ADDRESS` (la misma dirección de `SMTP_USER`, porque Gmail reescribe cualquier otro remitente).
- `FAKE_MAIL_OUTBOX_FILE`: ruta de un archivo (solo con `fake`). El adaptador simulado agrega una línea JSON por correo (destinatario, asunto y cuerpo), de modo que las pruebas de extremo a extremo y quien desarrolla puedan leer el link sin enviar nada. Es un archivo local fuera de git; el adaptador real nunca lo usa.

## R12. Estrategia de pruebas

- **Unitarias** (`tests/unit/`): dominio (normalización, compatibilidad de vínculos, vigencia, permisos del actor, token), casos de uso con repositorio y mailer en memoria (`tests/support/in-memory/`), adaptador SMTP con un transporte simulado (sin red), adaptador simulado, acciones de servidor, pantallas con lógica.
- **Integración** (`tests/integration/invitations/`, con la base local): repositorio de Prisma, aceptación atómica con dos solicitudes simultáneas, una persona con dos links de tipos distintos a la vez, reemplazo concurrente, aislamiento entre clínicas en cada operación (generar, listar, revocar y aceptar desde otra clínica), y los CHECK de la migración.
- **Extremo a extremo** (`tests/e2e/`): administrador invita a un médico y a un paciente con el correo simulado; el invitado sin cuenta recorre registro, verificación e ingreso y queda vinculado; el médico invita a un paciente y este queda en su lista.
- Cobertura mínima del 80 % por archivo en `src/modules` y `src/infrastructure`, como en las demás funcionalidades.

## R13. Next.js y avisos de la versión instalada

La guía de `node_modules/next/dist/docs/` sobre Route Handlers confirma lo que usa este plan: leer y escribir cookies con `cookies()` dentro de un Route Handler y devolver una redirección. El archivo `proxy.ts` (que reemplaza al antiguo `middleware`) ya existe y su lista de rutas públicas está en `src/shared/utils/route-access.ts`; se agrega `/invite` ahí. Antes de escribir el código de las acciones y del handler hay que releer esa guía y la de Server Actions, como en las funcionalidades anteriores.

## R14. Riesgos residuales y puntos abiertos

- **Abuso del envío**: cualquier integrante con permiso puede mandar correos a direcciones arbitrarias, lo que puede hacer que Google bloquee la cuenta de envío. La spec no define un tope; se recomienda agregar uno (por ejemplo, 30 invitaciones por hora por clínica) en una revisión posterior. No se implementa en esta funcionalidad.
- **Administrador que también atiende**: un administrador sin rol de médico no puede pasar a ser médico con un link (R6). Se resuelve en la gestión de usuarios (010).
- **Credencial de correo**: la contraseña de aplicación de Gmail vive en el entorno del servidor. Una filtración permite enviar correos como esa cuenta hasta que se revoque. Se mitiga con una cuenta dedicada, verificación en dos pasos y la revocación inmediata desde Google (R1).
- **Datos reales**: Gmail como servicio de envío es válido solo para esta etapa académica. Antes de operar con clínicas o personas reales hay que migrar a un servicio transaccional con dominio propio (por ejemplo, SES) y cerrar las vías de acceso del operador descritas en `infra/README.md`.

## Resultados de la implementación

Revisión final con `review-changes` (arquitectura, seguridad e interfaz; sin cambios de infraestructura). Ningún hallazgo fue bloqueante.

Corregido:
- Interfaz: los formularios de aceptar conservan la especialidad y el tipo de documento tras un error (la matrícula y el número no se repueblan a propósito); el correo largo del diálogo de revocar ya no desborda en móvil.
- Seguridad: `claim` y `registerFailedAttempt` ahora también filtran por la clínica de la invitación, con prueba de integración; el correo simulado importa `server-only`.
- Se aparta de R5, punto 5: la cookie `medicia_invitation` no se borra al mostrar «Ya pertenecés a…» ni al agotar los intentos, porque cambiarla vuelve a renderizar la pantalla y tapa el mensaje. La borra el botón «Ir al inicio». Tampoco se borra al cerrar sesión, para que quien ingresó con otro correo retome la invitación; vence sola a las 2 horas.

Pendiente y decidido:
- **Reemplazo entre emisores (FR-009 frente a FR-021):** decidido por el responsable, se mantiene como está. Un link nuevo para un correo reemplaza al pendiente aunque lo haya generado otra persona, incluso si quien invita es un médico y el anterior lo mandó el administrador u otro médico. El efecto (un médico puede anular un link ajeno sin enterarse) es conocido y aceptado.
- **Aviso al paciente de que el médico verá sus estudios:** decidido por el responsable, no se agrega.
- La vista previa y la lista no comprueban que quien generó un link con asignación siga siendo médico; solo lo comprueba la aceptación. Hoy ningún código cambia ese rol.
- Sugerencias menores: mover `isInvitationUsable` al dominio y `renderInvitationEmail` fuera de `use-cases/`; ícono de error y `spellCheck` en los campos; texto de ayuda junto a «Envío fallido»; un color de superposición como token en el diálogo; limpiar el error al reabrir el diálogo de revocar.
- Ya documentado: sin tope de envíos y cuota de Gmail compartida (R14); el token queda en los registros de acceso (R2).
