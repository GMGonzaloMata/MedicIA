# Feature Specification: Ingreso y sesión

**Feature Branch**: `002-ingreso-sesion`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Ingreso y sesión: que una persona pueda crear una cuenta con correo verificado, iniciar y cerrar sesión, recuperar su contraseña, y elegir la clínica activa entre aquellas a las que pertenece (como personal o como paciente vinculado). Una cuenta sin ninguna clínica ve un estado vacío indicando que necesita una invitación. Cada solicitud posterior debe poder identificar quién es la persona y en qué clínica trabaja, revalidando en el servidor que la pertenencia siga vigente (clínica activa, membresía activa, paciente vinculado). Quedan fuera: invitaciones y vinculación, gestión de clínicas y usuarios, carga de estudios y análisis."

## User Scenarios & Testing *(mandatory)*

Los usuarios de esta funcionalidad son todas las personas que usan la plataforma: personal de las clínicas (administradores y médicos) y pacientes. Todas entran por la misma puerta y, una vez dentro, trabajan en el contexto de una clínica a la vez. Esta funcionalidad no incluye lo que se hace dentro de cada clínica; solo cómo se entra, cómo se sale y cómo la plataforma sabe, en cada solicitud, quién es la persona y a qué clínica pertenece lo que está haciendo.

### User Story 1 - Crear una cuenta e ingresar (Priority: P1)

Una persona que todavía no usa la plataforma crea su cuenta con su correo, su nombre y una contraseña. Para activarla debe demostrar que el correo es suyo con un código que recibe en esa casilla. Una vez verificada, puede iniciar sesión con su correo y su contraseña.

**Why this priority**: sin una cuenta verificada nadie puede entrar, y la verificación del correo es la primera barrera para que no cualquiera use la plataforma.

**Independent Test**: se puede probar registrando una cuenta nueva, verificando el correo e iniciando sesión, y también intentando ingresar sin verificar o con credenciales incorrectas.

**Acceptance Scenarios**:

1. **Given** una persona sin cuenta, **When** completa el registro con un correo válido, su nombre y una contraseña que cumple la política, **Then** recibe un código de verificación en ese correo y la cuenta queda pendiente de verificación.
2. **Given** una cuenta pendiente de verificación, **When** ingresa el código correcto antes de que venza, **Then** la cuenta queda verificada y puede iniciar sesión.
3. **Given** una cuenta sin verificar, **When** intenta iniciar sesión, **Then** no ingresa y se le ofrece completar la verificación o recibir un código nuevo.
4. **Given** una cuenta verificada, **When** inicia sesión con el correo y la contraseña correctos, **Then** ingresa a la plataforma.
5. **Given** un correo inexistente o una contraseña incorrecta, **When** se intenta iniciar sesión, **Then** el mensaje es el mismo en ambos casos y no permite saber si el correo tiene cuenta.
6. **Given** varios intentos fallidos seguidos sobre una misma cuenta, **When** se supera el límite, **Then** se bloquean temporalmente nuevos intentos, con el mismo mensaje para cuentas existentes y no existentes.
7. **Given** una persona que se registra con un correo que ya tiene cuenta, **When** envía el formulario, **Then** la respuesta visible es la misma que la de un registro nuevo, y no revela que el correo ya estaba registrado.
8. **Given** un correo escrito con otras mayúsculas que el de una cuenta existente, **When** se registra o se inicia sesión, **Then** se lo trata como el mismo correo.

---

### User Story 2 - Elegir la clínica activa (Priority: P1)

Después de ingresar, la persona ve las clínicas a las que pertenece y elige en cuál va a trabajar. Pertenece a una clínica como personal (con membresía activa) o como paciente (con vínculo vigente), y puede ser personal en una clínica y paciente en otra. Si pertenece a una sola, entra directamente. Si no pertenece a ninguna, ve un estado vacío que le explica que necesita una invitación.

**Why this priority**: toda operación posterior ocurre dentro de una clínica. Elegirla explícitamente evita que alguien cargue o consulte datos en una clínica equivocada.

**Independent Test**: se puede probar con cuentas que tengan cero, una y varias clínicas, en distintas combinaciones de vínculo y estado, verificando qué se ofrece en cada caso.

**Acceptance Scenarios**:

1. **Given** una cuenta que pertenece a varias clínicas, **When** ingresa, **Then** ve la lista de esas clínicas con el nombre de cada una y su tipo de vínculo (personal o paciente), y elige una.
2. **Given** una cuenta que pertenece a una sola clínica, **When** ingresa, **Then** entra directamente a esa clínica, sin paso de selección.
3. **Given** una cuenta que no pertenece a ninguna clínica, **When** ingresa, **Then** ve un estado vacío que explica que necesita una invitación de una clínica, con la opción de cerrar sesión.
4. **Given** una cuenta con una membresía desactivada, un vínculo de paciente revocado o pendiente, o una clínica suspendida, **When** ingresa, **Then** esas clínicas no se ofrecen para elegir.
5. **Given** una cuenta cuyas únicas pertenencias no están vigentes, **When** ingresa, **Then** ve el estado vacío con un mensaje que no afirma que nunca tuvo acceso.
6. **Given** una persona que intenta activar una clínica a la que no pertenece, **When** envía esa elección, **Then** la plataforma la rechaza sin revelar si la clínica existe.
7. **Given** una persona con la clínica A activa, **When** cambia a la clínica B de su lista, **Then** desde ese momento todo lo que haga ocurre en la clínica B y nada de la A queda disponible.

---

### User Story 3 - La plataforma sabe quién es y dónde trabaja (Priority: P1)

En cada solicitud posterior al ingreso, la plataforma identifica a la persona y a su clínica activa, y vuelve a comprobar en ese momento que la clínica siga activa y que la persona siga perteneciendo a ella (membresía activa, o vínculo de paciente vigente). Si algo dejó de ser vigente, el acceso se corta en la solicitud siguiente, sin esperar a que venza la sesión.

**Why this priority**: es la base del aislamiento entre clínicas (constitución, principio II). Todas las funcionalidades siguientes dependen de que este contexto sea confiable y de que un cambio de estado tenga efecto inmediato.

**Independent Test**: se puede probar con una sesión abierta a la que se le cambia el estado de la clínica, de la membresía o del vínculo, y comprobando que la solicitud siguiente es rechazada.

**Acceptance Scenarios**:

1. **Given** una sesión con una clínica activa elegida, **When** llega cualquier solicitud, **Then** la plataforma sabe quién es la persona, cuál es su clínica activa y con qué vínculo trabaja en ella.
2. **Given** una sesión abierta, **When** se suspende la clínica activa, **Then** la siguiente solicitud se rechaza y la persona vuelve a la selección de clínica o al estado vacío.
3. **Given** una sesión de personal abierta, **When** se desactiva su membresía, **Then** la siguiente solicitud en esa clínica se rechaza.
4. **Given** una sesión de paciente abierta, **When** se revoca su vínculo, **Then** la siguiente solicitud en esa clínica se rechaza.
5. **Given** una solicitud que declara una clínica distinta de la activa, **When** se procesa, **Then** la plataforma ignora esa declaración y usa solo la clínica activa verificada.
6. **Given** una persona que es personal en la clínica A y paciente en la clínica B, **When** trabaja en la clínica B, **Then** solo cuenta con lo que corresponde a un paciente, y viceversa.
7. **Given** una persona sin sesión válida, **When** intenta abrir una pantalla o enviar una acción que requiere ingreso, **Then** se la lleva a iniciar sesión y, al ingresar, vuelve al destino original si este es una dirección interna de la plataforma.

---

### User Story 4 - Cerrar sesión y recuperar la contraseña (Priority: P2)

La persona puede cerrar su sesión en cualquier momento, y si olvidó su contraseña puede recuperarla con un código que recibe en su correo. Cambiar la contraseña invalida las sesiones abiertas anteriormente.

**Why this priority**: son necesidades básicas y también una defensa: cerrar sesión protege los equipos compartidos, y el cambio de contraseña es la forma de expulsar a quien haya obtenido acceso indebido.

**Independent Test**: se puede probar cerrando sesión y comprobando que la sesión ya no sirve, y recuperando una contraseña con otra sesión abierta para verificar que esta queda invalidada.

**Acceptance Scenarios**:

1. **Given** una persona con sesión iniciada, **When** cierra sesión, **Then** la sesión deja de ser válida de inmediato y las pantallas protegidas ya no se abren con ella.
2. **Given** una persona que olvidó su contraseña, **When** pide recuperarla con su correo, **Then** la respuesta es la misma exista o no una cuenta con ese correo, y si la cuenta existe recibe un código de un solo uso con vencimiento.
3. **Given** un código de recuperación válido, **When** la persona define una contraseña nueva que cumple la política, **Then** puede iniciar sesión con ella y la anterior deja de servir.
4. **Given** una persona con sesiones abiertas en otros dispositivos, **When** cambia su contraseña, **Then** todas las sesiones anteriores al cambio dejan de ser válidas.
5. **Given** un código de recuperación ya usado, vencido o incorrecto, **When** se intenta usar, **Then** se rechaza con un mensaje claro y sin cambiar la contraseña.
6. **Given** una sesión que supera el tiempo máximo de inactividad o el tiempo máximo total, **When** llega una nueva solicitud, **Then** se la lleva a iniciar sesión.

---

### Edge Cases

- ¿Qué pasa si el código de verificación vence o no llega? Se puede pedir uno nuevo; el anterior deja de valer.
- ¿Qué pasa si se ingresa un código incorrecto varias veces? Se limita la cantidad de intentos y hay que pedir un código nuevo.
- ¿Qué pasa si una cuenta verificada ingresa por primera vez? La plataforma crea su cuenta propia con el correo y el nombre del registro. Si ya existe, usa la existente sin duplicarla.
- ¿Qué pasa si una cuenta es administradora de la plataforma y no pertenece a ninguna clínica? Ve el estado vacío; su panel propio corresponde a otra funcionalidad.
- ¿Qué pasa si una clínica se suspende o se desactiva la membresía mientras la persona está trabajando? Pierde acceso en la siguiente solicitud y vuelve a la selección de clínica o al estado vacío.
- ¿Qué pasa si la persona tiene la sesión abierta en dos dispositivos con clínicas activas distintas? Cada sesión tiene su propia clínica activa y no se afectan entre sí.
- ¿Qué pasa si la persona ya tenía una sesión iniciada y entra de nuevo a la pantalla de ingreso? Se la lleva directamente a donde corresponda según su estado de clínica activa.
- ¿Qué pasa si se pide volver a un destino externo después de iniciar sesión? Se ignora y se la lleva al inicio.
- ¿Qué pasa si falla el servicio de identidad o el de correo? Se informa un error general sin detalles internos y no se abre ninguna sesión.
- ¿Qué pasa con la persona que cambia su correo? Queda fuera de esta funcionalidad.

## Requirements *(mandatory)*

### Functional Requirements

**Registro y verificación**

- **FR-001**: Cualquier persona DEBE poder crear una cuenta con su correo, su nombre completo y una contraseña, sin necesitar invitación previa.
- **FR-002**: La cuenta DEBE permanecer sin activar hasta que la persona ingrese el código de verificación que recibió en su correo. El código DEBE ser de un solo uso y tener vencimiento.
- **FR-003**: Una cuenta sin verificar NO DEBE poder iniciar sesión, y DEBE ofrecer completar la verificación o recibir un código nuevo.
- **FR-004**: El correo DEBE tratarse sin distinguir mayúsculas de minúsculas, y DEBE existir una sola cuenta por correo.
- **FR-005**: La respuesta visible del registro, del ingreso y de la recuperación NO DEBE permitir saber si un correo ya tiene cuenta.
- **FR-006**: La contraseña DEBE cumplir una política mínima de seguridad, comunicada a la persona antes de enviar el formulario.
- **FR-007**: La primera vez que una cuenta verificada ingresa, la plataforma DEBE crear su cuenta propia con el mismo correo y nombre. Si ya existe, DEBE reutilizarla sin duplicarla.

**Inicio y cierre de sesión**

- **FR-008**: Una cuenta verificada DEBE poder iniciar sesión con su correo y su contraseña.
- **FR-009**: Ante credenciales inválidas, el mensaje DEBE ser el mismo para un correo inexistente y para una contraseña incorrecta.
- **FR-010**: Tras intentos fallidos repetidos sobre una cuenta, la plataforma DEBE bloquear temporalmente nuevos intentos, con el mismo comportamiento visible para cuentas existentes y no existentes.
- **FR-011**: La persona DEBE poder cerrar sesión desde cualquier pantalla protegida, y la sesión DEBE dejar de ser válida de inmediato.
- **FR-012**: La sesión DEBE vencer por inactividad y por un tiempo máximo total, tras lo cual se exige iniciar sesión de nuevo.
- **FR-013**: Una persona sin sesión válida que intenta abrir una pantalla o ejecutar una acción protegida DEBE ser llevada a iniciar sesión. Al ingresar, DEBE volver al destino original solo si es una dirección interna de la plataforma.

**Recuperación de contraseña**

- **FR-014**: Una persona DEBE poder pedir recuperar su contraseña con su correo. La respuesta DEBE ser la misma exista o no la cuenta, y si existe DEBE recibir un código de un solo uso con vencimiento.
- **FR-015**: Con un código válido, la persona DEBE poder definir una contraseña nueva que cumpla la política. Un código usado, vencido o incorrecto DEBE rechazarse sin cambiar la contraseña.
- **FR-016**: Al cambiar la contraseña, TODAS las sesiones iniciadas antes del cambio DEBEN dejar de ser válidas.

**Clínica activa**

- **FR-017**: Tras ingresar, la plataforma DEBE ofrecer las clínicas a las que la persona pertenece de forma vigente: como personal, con membresía activa en una clínica activa; o como paciente, con vínculo vigente en una clínica activa. No DEBE ofrecer clínicas suspendidas, membresías desactivadas ni vínculos de paciente pendientes o revocados.
- **FR-018**: La lista DEBE mostrar el nombre de cada clínica y el tipo de vínculo de la persona en ella (personal o paciente).
- **FR-019**: Si la persona tiene una sola clínica vigente, DEBE entrar directamente a ella. Si no tiene ninguna, DEBE ver un estado vacío que explique que necesita una invitación de una clínica y le permita cerrar sesión.
- **FR-020**: La persona DEBE poder cambiar de clínica activa entre las de su lista sin cerrar sesión. Desde el cambio, nada de la clínica anterior DEBE quedar disponible en la sesión.
- **FR-021**: Cada sesión DEBE tener su propia clínica activa, independiente de las demás sesiones de la misma persona.
- **FR-022**: Elegir una clínica a la que la persona no pertenece de forma vigente DEBE rechazarse sin revelar si la clínica existe.

**Contexto verificado en cada solicitud**

- **FR-023**: En cada solicitud posterior al ingreso, la plataforma DEBE determinar quién es la persona, cuál es su clínica activa y con qué vínculo trabaja en ella (roles de personal o paciente).
- **FR-024**: La clínica activa DEBE obtenerse del contexto verificado de la sesión, y NUNCA de un dato enviado por el cliente. Si una solicitud declara otra clínica, DEBE ignorarse.
- **FR-025**: En cada solicitud, la plataforma DEBE volver a comprobar que la clínica activa esté activa y que la pertenencia de la persona siga vigente (membresía activa o paciente vinculado). Si no lo está, DEBE rechazar la solicitud y llevar a la persona a la selección de clínica o al estado vacío.
- **FR-026**: Los permisos de la persona DEBEN corresponder únicamente al vínculo que tiene en la clínica activa, no a los que tenga en otras clínicas.
- **FR-027**: Estas comprobaciones DEBEN cumplirse tanto en pantallas como en acciones y servicios, sin depender de que la interfaz oculte opciones.

**Seguridad y registro**

- **FR-028**: La plataforma NO DEBE registrar contraseñas, códigos de verificación ni de recuperación, ni datos de sesión sensibles en sus registros de actividad.
- **FR-029**: Los errores de ingreso, verificación y recuperación NO DEBEN revelar detalles internos ni la existencia de cuentas.

**Interfaz**

- **FR-030**: Las pantallas de ingreso, registro, verificación, recuperación, selección de clínica y estado vacío DEBEN estar en español, funcionar en móvil, tablet y escritorio, en modo claro y oscuro, ser operables por teclado y comunicar los errores sin depender solo del color.

### Key Entities *(include if feature involves data)*

- **Cuenta de acceso**: identidad de la persona ante el servicio de identidad. Tiene correo, contraseña (que la plataforma no guarda) y estado de verificación. Es la base de la cuenta propia (Usuario) definida en el modelo de datos de acceso.
- **Sesión**: periodo en que la persona está dentro de la plataforma. Tiene su propia clínica activa, un momento de inicio, un tiempo de inactividad y un tiempo máximo. Deja de valer al cerrarla, al vencer o al cambiar la contraseña.
- **Clínica activa**: la clínica en la que la persona trabaja en una sesión. Determina qué datos puede ver y qué puede hacer.
- **Vínculo vigente**: pertenencia actual de la persona a una clínica. Puede ser membresía de personal activa o registro de paciente vinculado, en una clínica activa.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona nueva completa registro, verificación del correo y primer ingreso en menos de 5 minutos, contando desde que tiene el código en su correo.
- **SC-002**: El 100 % de las solicitudes posteriores a la suspensión de una clínica, la desactivación de una membresía o la revocación de un vínculo son rechazadas, sin esperar el vencimiento de la sesión.
- **SC-003**: El 100 % de los intentos de activar una clínica a la que la persona no pertenece, o de declarar otra clínica en una solicitud, son rechazados o ignorados.
- **SC-004**: El ingreso, el registro y la recuperación devuelven respuestas indistinguibles entre un correo con cuenta y uno sin cuenta, verificado con casos de prueba.
- **SC-005**: Tras cambiar la contraseña, el 100 % de las sesiones anteriores al cambio son rechazadas.
- **SC-006**: Una persona con una sola clínica vigente llega a ella sin pasos de selección, y una con varias elige en un solo paso.
- **SC-007**: El 100 % de las pantallas y acciones protegidas rechazan o redirigen a quien no tiene una sesión válida.
- **SC-008**: Cada regla de este documento tiene al menos una prueba que intenta violarla, incluida una prueba de que una sesión de una clínica no accede a otra.

## Assumptions

- **Alcance:** esta funcionalidad cubre registro, verificación, ingreso, cierre de sesión, recuperación de contraseña, elección de clínica y la identificación verificada en cada solicitud. No incluye invitaciones ni vinculación, gestión de clínicas o usuarios, estudios ni análisis.
- **Registro abierto:** cualquier persona puede crear una cuenta, pero sin una invitación no pertenece a ninguna clínica y no puede usar el análisis. Las invitaciones corresponden a la funcionalidad siguiente.
- **Proveedor de identidad:** la verificación del correo, el almacenamiento de contraseñas y los códigos los resuelve el servicio de identidad aprobado en la constitución. La plataforma no guarda contraseñas ni códigos.
- **Política de contraseña:** longitud mínima de 12 caracteres, sin exigir combinaciones de tipos de caracteres. Se confirmará en el plan.
- **Intentos y vencimientos:** los límites de intentos fallidos y la duración de los códigos de verificación y recuperación los define el servicio de identidad con sus valores recomendados. La spec exige que existan, no fija los números.
- **Duración de la sesión (a confirmar):** por tratarse de datos clínicos, se propone vencer a los 30 minutos de inactividad y a las 12 horas como máximo.
- **Cambio de clínica (a confirmar):** se propone permitir cambiar de clínica desde la sesión, sin cerrarla, revalidando la pertenencia en cada cambio.
- **Administrador de plataforma (a confirmar):** su panel y su ingreso a la gestión de clínicas quedan fuera de esta funcionalidad. Mientras tanto, ve el estado vacío si no pertenece a ninguna clínica.
- **Idioma:** los textos están en español rioplatense.
- **Cuentas ya existentes:** se asume que el modelo de datos de acceso (spec 001) ya está disponible y es la fuente de las pertenencias vigentes.
- **Cambio de correo:** modificar el correo de una cuenta queda para otra funcionalidad.
- **Servicios reales:** durante el desarrollo, el servicio de identidad y el de correo pueden reemplazarse por simulaciones. Probar el flujo real requiere un entorno de desarrollo del servicio de identidad que el responsable del proyecto levanta por separado.
