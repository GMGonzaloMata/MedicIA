# Investigación: Ingreso y sesión

**Plan**: [plan.md](plan.md) | **Spec**: [spec.md](spec.md)

Decisiones técnicas con sus alternativas. Las que necesitan aprobación del responsable del proyecto están marcadas **(aprobación)** y se resumen en el plan.

Fuentes consultadas: `node_modules/next/dist/docs/` (guías de autenticación, autenticación con Cache Components y `proxy`), la constitución v1.5.0 y los documentos de `memory/`. Las versiones de las librerías se leyeron del registro de npm el 2026-11-09. Lo que no pudo comprobarse sin un grupo de usuarios real de Cognito está marcado **a verificar** y figura en los riesgos del plan.

## R1. Sesión guardada en la base de datos, con una cookie opaca

**Decisión:** al iniciar sesión, la aplicación crea una fila en una tabla `sessions` y entrega al navegador solo un identificador aleatorio de 256 bits en una cookie. La base guarda el hash SHA-256 de ese identificador, nunca el valor. Cada solicitud busca la sesión por ese hash.

**Por qué:** la spec exige cosas que una sesión sin estado no puede dar:
- **Cierre inmediato (FR-011):** cerrar sesión debe invalidarla ya. Una cookie firmada sigue valiendo hasta que vence si alguien copió su valor.
- **Clínica activa propia de cada sesión (FR-021):** debe guardarse del lado del servidor, no en un valor que el cliente pueda reenviar.
- **Inactividad (FR-012):** requiere recordar la última actividad.
- **Cambio de contraseña (FR-016):** se resuelve con `sessionsValidFrom`, que ya existe en `users`.

**Alternativas descartadas:**
- **Cookie firmada o cifrada sin estado** (la opción de ejemplo de las guías de Next): no permite cerrar una sesión ni invalidar solo una de las sesiones de la persona. Cerrar sesión con la fecha `sessionsValidFrom` cerraría todos los dispositivos.
- **Guardar los tokens de Cognito en la cookie y validarlos en cada solicitud:** acopla la duración de la sesión a la de los tokens, no tiene dónde guardar la clínica activa y deja la revocación en manos de Cognito.

**Costo:** una consulta por solicitud (R6) y una tabla nueva. La tabla no estaba en el modelo de la funcionalidad 001, que dejó la sesión fuera de alcance; se diseña en [data-model.md](data-model.md).

## R2. Validación de los JWT de Cognito al iniciar sesión **(aprobación)**

**Decisión:** al iniciar sesión, la aplicación valida el token de identidad (ID token) que devuelve Cognito con `aws-jwt-verify`: firma, emisor, cliente, expiración y tipo de token. Después descarta los tokens: no los guarda, no los registra ni los manda al navegador. A partir de ahí la aplicación se apoya en su propia sesión (R1).

**La constitución dice:** "La aplicación DEBE validar los JWT y autorizar cada operación". Esta decisión la cumple así:
- **Validar los JWT:** se validan en el único punto donde se reciben.
- **Autorizar cada operación:** cada solicitud se autoriza contra la sesión de la base y los vínculos vigentes (R6).

Es una interpretación del texto, no una enmienda. Si el responsable la rechaza, la alternativa es mantener los tokens en la cookie y validarlos en cada solicitud, con las limitaciones de R1, o enmendar la constitución. `memory/architecture.md` (sección Autenticación) debe actualizarse si se aprueba.

**Por qué validar aunque los tokens lleguen directo de AWS por TLS:** es una defensa en profundidad barata. Comprueba además `email_verified`, que es lo que habilita la creación de la cuenta propia (FR-007).

## R3. Flujo con Cognito desde el servidor

**Decisión:**
- **Interfaz propia:** las pantallas son de la aplicación, no la interfaz alojada de Cognito, para controlar la experiencia y el idioma (FR-030).
- **Operaciones:** `SignUp`, `ConfirmSignUp`, `ResendConfirmationCode`, `InitiateAuth` con el flujo `USER_PASSWORD_AUTH`, `ForgotPassword` y `ConfirmForgotPassword`, todas desde Server Actions. El navegador nunca habla con Cognito.
- **Cliente confidencial:** el cliente de aplicación de Cognito tiene secreto, guardado solo en el servidor, y cada llamada lleva `SECRET_HASH` (HMAC-SHA256 en base 64 del correo más el ID de cliente).
- **Sin SRP:** `USER_PASSWORD_AUTH` envía la contraseña al servidor de la aplicación por TLS, que es de confianza. SRP solo aportaría algo si el navegador hablara directo con Cognito.

**Alternativas descartadas:**
- **Interfaz alojada de Cognito (OAuth con redirección):** menos código propio, pero la pantalla no es nuestra, la personalización es limitada y el estado vacío y la selección de clínica quedarían desconectados del ingreso.
- **Amplify:** agrega una dependencia grande pensada para el navegador.

**A verificar:** que las operaciones sin autenticación de AWS (todas las anteriores lo son) funcionan con el SDK v3 sin credenciales de AWS configuradas en el servidor. Si el SDK exigiera credenciales, se pasa una configuración anónima explícita. Se comprueba en la primera tarea del adaptador.

**Configuración que requiere el grupo de usuarios:** está en [contracts/identity-provider.md](contracts/identity-provider.md), para pasarla al repositorio de Terraform.

## R4. Respuestas uniformes que no revelan si un correo tiene cuenta

**Decisión:** el cliente de Cognito se configura con `PreventUserExistenceErrors` activado, y la aplicación mapea todos los errores a un conjunto cerrado de mensajes (FR-005, FR-009, FR-029):
- **Inicio de sesión:** cualquier fallo (correo inexistente, contraseña incorrecta, cuenta bloqueada, desafío no soportado) muestra el mismo mensaje.
- **Registro:** si el correo ya existe (`UsernameExistsException`), la aplicación lo absorbe y responde igual que en un registro nuevo. La persona dueña del correo recibe, según el caso, un código nuevo (cuenta sin verificar) o nada (cuenta ya verificada).
- **Recuperación y reenvío de código:** siempre responden igual.
- **Código incorrecto o vencido:** un único mensaje para los dos casos. Es el único error que dice algo sobre el estado, pero exige conocer el correo y tener un código vigente.

**FR-003 (cuenta sin verificar al ingresar):** Cognito puede distinguir a una cuenta sin verificar con un error propio. Mostrarlo directamente revelaría que el correo tiene cuenta. Por eso la pantalla de ingreso muestra siempre, para todos, el enlace "¿No verificaste tu correo?" hacia la pantalla de verificación, y el mensaje de error es uno solo. Así se ofrece completar la verificación o pedir un código nuevo sin ramificar por existencia. **A verificar** con el grupo real cómo responde Cognito en este caso.

**Bloqueo por intentos (FR-010):** lo aplica Cognito, que bloquea temporalmente la cuenta tras varios intentos fallidos con tiempos crecientes; no es configurable en los grupos estándar. La aplicación muestra el mismo mensaje y no agrega un contador propio.

## R5. La clínica activa se guarda como el vínculo, no como el identificador de la clínica

**Decisión:** la sesión guarda `activeStaffMembershipId` o `activePatientId` (a lo sumo uno), nunca un `tenantId` que venga del cliente. La clínica se deduce del vínculo verificado. El navegador solo envía el identificador opaco del vínculo que eligió, y la aplicación comprueba que sea de esa persona.

**Por qué:** cumple la constitución II (el `tenantId` sale del contexto autenticado) y resuelve que la persona pueda ser personal en una clínica y paciente en otra, con permisos distintos en cada una (FR-026). Si por un error de datos tuviera ambos vínculos en una misma clínica, aparecen como dos opciones y se elige una (la regla "un solo tipo de vínculo por clínica" no la garantiza la base, ver spec 001).

**Garantía en la base:** claves foráneas compuestas `(userId, activeStaffMembershipId)` hacia `staff_memberships(userId, id)` y `(userId, activePatientId)` hacia `patients(userId, id)`, con las unicidades `(userId, id)` agregadas en esas dos tablas. Una sesión no puede apuntar al vínculo de otra persona, ni siquiera por un error de la aplicación, en línea con el aislamiento de la funcionalidad 001.

**A verificar:** que Prisma 7.10.1 acepte una clave foránea compuesta opcional que comparte la columna `userId` con la relación hacia `users`. Es lo primero que se prueba al escribir el schema. La alternativa es una clave foránea simple por vínculo más la comprobación de pertenencia en la consulta, que de todos modos se hace.

## R6. Revalidación en cada solicitud, sin caché

**Decisión:** una función `getAccessContext` (la capa de acceso a datos recomendada por la guía de Next) lee la cookie, busca la sesión y resuelve en una sola consulta la persona, el vínculo activo y el estado de la clínica. Se memoiza con `cache` de React solo dentro de un mismo render. No se usa `use cache` de ninguna variante.

**Por qué no `use cache: private`:** la guía de autenticación con Cache Components lo propone para que la navegación sea instantánea, pero guarda el resultado en el navegador con una vigencia (cinco minutos por defecto). Una clínica suspendida o un vínculo revocado seguirían pareciendo vigentes hasta que venza esa copia, lo que viola FR-025 y SC-002. Se paga con streaming: las pantallas que leen la sesión van dentro de `<Suspense>`, que `cacheComponents: true` exige de todos modos.

**Dónde se aplica:**
- **Server Components:** dentro de `<Suspense>`, en componentes hoja o en la página. No se lee la sesión en el nivel superior de un layout.
- **Server Actions y Route Handlers:** cada uno llama a `getAccessContext` por su cuenta. Las acciones se pueden invocar con un POST directo y el `proxy` no las cubre si se mueven de ruta (guía de `proxy`).
- **`proxy.ts`:** solo una comprobación optimista: si no hay cookie de sesión y la ruta es protegida, redirige a iniciar sesión. No consulta la base de datos, como indica la guía. La validación real nunca depende de él.

**Resultado de la resolución:** una unión cerrada, para que los llamadores no puedan olvidar un caso:
- `anonymous`: sin sesión válida.
- `no-clinic`: sesión válida sin clínica activa vigente (hay que elegir una o ver el estado vacío).
- `ready`: sesión válida con clínica activa vigente y el vínculo con el que trabaja.

Detalle en [contracts/access-context.md](contracts/access-context.md).

## R7. Vencimiento por inactividad y absoluto

**Decisión:** el vencimiento absoluto se fija al crear la sesión (`expiresAt` = inicio + 12 horas) y queda guardado, de modo que un cambio posterior de la política no altere sesiones ya abiertas. La inactividad (30 minutos) se calcula con `lastActivityAt`. Para no escribir en la base en cada solicitud, `lastActivityAt` solo se actualiza si pasó más de un minuto desde el valor guardado.

**Consecuencia aceptada:** la inactividad real puede medirse con hasta un minuto de diferencia. Las precargas (prefetch) de Next también cuentan como actividad, porque llegan como solicitudes autenticadas; es un efecto menor que se documenta en vez de resolverlo.

**Hora de referencia:** todas las comparaciones y escrituras usan el reloj de la aplicación (`now` inyectado), nunca `CURRENT_TIMESTAMP` de la base, para evitar el desfase que ya apareció en la funcionalidad 001.

## R8. Cambio de contraseña e invalidación de sesiones

**Decisión:** al confirmar el restablecimiento en Cognito, la aplicación pone `sessionsValidFrom = now` en el usuario con ese correo. Una sesión solo es válida si `createdAt >= sessionsValidFrom`. Es una sola actualización y no depende de cuántas sesiones haya.

**Orden:** primero Cognito, después la base. Invalidar antes permitiría que alguien con un código incorrecto cerrara las sesiones de otra persona.

**Riesgo conocido:** si Cognito acepta el cambio y la actualización de la base falla, las sesiones anteriores siguen vivas hasta que venzan. Se registra el error sin datos personales (R12) y se informa a la persona que reintente cerrando sesión. No hay forma de reintentar el cambio con el mismo código.

**Persona sin cuenta propia todavía:** si el correo nunca inició sesión, no tiene fila en `users` ni sesiones, y no hay nada que invalidar.

## R9. Redirección posterior al ingreso

**Decisión:** el destino se recibe como parámetro `next` en la pantalla de ingreso. Solo se acepta una ruta relativa que empiece con `/` seguida de un carácter que no sea `/` ni `\`, sin esquema ni host y sin caracteres de control. Cualquier otra cosa se reemplaza por `/`. Es una función pura en `src/shared/utils/` con pruebas unitarias.

**Por qué:** evita redirecciones abiertas hacia sitios externos (FR-013) y las variantes con `//`, `/\` o codificaciones.

## R10. Cookie de sesión

**Decisión:**
- **Atributos:** `HttpOnly`, `SameSite=Lax`, `Path=/`, sin `Domain`, y `Secure` cuando `NODE_ENV` es `production`.
- **Duración:** `Max-Age` igual al tiempo restante de la sesión absoluta. La cookie es opaca y estática: no se renueva, la vigencia real la decide el servidor.
- **Nombre:** `medicia-session`.
- **Escritura:** solo en Server Actions y Route Handlers, nunca durante el render.

**CSRF:** las Server Actions de Next verifican que el encabezado `Origin` coincida con el host y exigen POST, y la cookie es `SameSite=Lax`. Si la aplicación va detrás de un balanceador que cambia el host, hay que configurar `serverActions.allowedOrigins`; queda anotado para el despliegue.

**A verificar:** que Chromium acepte la cookie `Secure` en `http://localhost` durante las pruebas E2E con el servidor de producción.

## R11. Proveedor de identidad simulado para desarrollo y pruebas

**Decisión:** un adaptador en memoria que implementa el mismo puerto que el de Cognito, con un código de verificación fijo, para las pruebas y para usar la aplicación sin AWS. Vive en `src/modules/users/infrastructure/adapters/` y se elige con `IDENTITY_PROVIDER=fake`.

**Resguardos, porque un proveedor falso en producción sería un acceso indebido:**
- **Sin valor por defecto:** si `IDENTITY_PROVIDER` no está definida, la aplicación no arranca.
- **Excluyente con Cognito:** el proveedor falso se niega a iniciar si están definidas las variables de Cognito (`COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, `COGNITO_CLIENT_SECRET`). Un despliegue real siempre las tiene.
- **Pruebas:** hay una prueba unitaria de cada resguardo.

**Por qué no solo en `tests/`:** las pruebas E2E arrancan el servidor de producción compilado (`npm run build && npm run start`), que necesita el adaptador dentro del código de la aplicación. El resguardo por `NODE_ENV` no sirve para esa razón.

## R12. Registros de actividad sin datos sensibles

**Decisión:** los errores de ingreso, verificación y recuperación se registran con un código interno y la categoría (por ejemplo `COGNITO_THROTTLED`, `SESSION_WRITE_FAILED`), sin contraseña, código, token, correo ni valor de cookie (FR-028). Los errores del SDK de AWS no se muestran a la persona ni se guardan completos.

## R13. Validación de los datos de entrada y política de contraseña

**Decisión:** `zod` valida los formularios antes de llamar a los casos de uso, y también las variables de entorno de Cognito al iniciar. Reglas:
- **Contraseña:** entre 12 y 128 caracteres, sin exigir composición. Cognito aplica su propia política, que debe coincidir (ver el contrato del proveedor).
- **Correo:** válido, recortado y pasado a minúsculas (coincide con el `CHECK` de `users`).
- **Nombre:** entre 2 y 120 caracteres, sin ser solo espacios.
- **Código:** exactamente 6 dígitos.

**Por qué zod:** es la librería que usan las guías de Next, hace falta para cumplir la constitución VIII (validar los datos externos) y evita escribir validadores a mano.

## R14. Nombres de rutas y pantallas

**Decisión:** las rutas usan nombres en inglés, como el resto de los identificadores del proyecto (`memory/coding-standards.md`), y los textos de la interfaz están en español. Pantallas:
- `(auth)`: `/sign-in`, `/sign-up`, `/verify-email`, `/forgot-password`, `/reset-password`.
- `(dashboard)`: `/select-clinic`, `/no-access` y `/`, que reemplaza la página de plantilla de Next con un inicio provisional (clínica activa, vínculo, selector de clínica y cierre de sesión).

El inicio provisional existe para poder verificar la funcionalidad de punta a punta; las funcionalidades siguientes lo reemplazan. Hay que actualizar la prueba unitaria y la E2E que hoy apuntan a la plantilla.

## R15. Dependencias nuevas **(aprobación)**

- **`@aws-sdk/client-cognito-identity-provider`** `3.1164.0`: cliente oficial de Cognito. Es parte del stack aprobado (Cognito) y la constitución exige un adaptador para él.
- **`aws-jwt-verify`** `5.2.1`: la librería oficial de AWS para validar los JWT de Cognito, con caché de las claves públicas. Evita escribir la verificación a mano (R2).
- **`zod`** `4.6.7`: validación de entradas (R13).

Se instalan con la versión exacta. El SDK de AWS publica varias veces por semana, así que la versión indicada es la más reciente al 2026-11-09 y se revisa al instalar. `jose` no hace falta.

## R16. Pruebas

**Decisión:**
- **Unitarias** (`tests/unit/`): reglas de sesión (puras), casos de uso con dobles en memoria, función de redirección segura, esquemas de validación, mapeo de errores del adaptador de Cognito con el cliente del SDK simulado, y los resguardos del proveedor simulado.
- **Integración** (`tests/integration/`, PostgreSQL real): repositorios de sesión y de acceso, revalidación por cambio de estado, rechazo de una sesión que apunta al vínculo de otra persona, invalidación por cambio de contraseña, y rechazo del acceso desde otra clínica (exigido por la constitución para toda operación sobre datos de una clínica).
- **E2E** (Playwright, con el proveedor simulado): registro y verificación, ingreso, estado vacío, selección y cambio de clínica, cierre de sesión, redirección de rutas protegidas y destino `next` externo ignorado.

**CI:** el job de E2E hoy no tiene base de datos. Hay que agregar el servicio de PostgreSQL y la aplicación de migraciones, igual que en el job `check`.

## R17. Límites conocidos que quedan fuera de esta funcionalidad

- **Limitación de tasa propia:** solo la de Cognito (por usuario). No hay límite por IP. Alguien puede disparar correos de verificación o recuperación hacia un tercero dentro de los límites de Cognito. Se evalúa antes de operar con datos reales.
- **Limpieza de sesiones vencidas:** las filas de `sessions` no se borran. Se agrega una tarea de mantenimiento cuando el volumen lo justifique.
- **Correo de Cognito por defecto:** el remitente por defecto de Cognito tiene un tope diario bajo (50 correos por día al momento de escribir esto) y es suficiente para desarrollo, no para producción. El cambio a SES corresponde a la funcionalidad de invitaciones, que ya lo necesita.
- **Cambio de correo, MFA, inicio de sesión social:** fuera de alcance.
- **Sesiones activas visibles para la persona** ("cerrar las demás sesiones"): la tabla lo permite, pero queda para otra funcionalidad.
