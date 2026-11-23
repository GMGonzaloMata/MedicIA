# Feature Specification: Vinculación de personal y pacientes a una clínica

**Feature Branch**: `feat/vinculacion-clinica`

**Created**: 2026-11-23

**Status**: Draft

**Input**: User description: "Administración de la clínica: vinculación de personal y pacientes. Hoy existen en el modelo de datos las clínicas, las membresías de personal, los pacientes y las asignaciones médico–paciente, pero no hay ningún flujo ni pantalla para crearlos: solo el script de siembra. Se necesita que una clínica pueda incorporar a sus médicos y pacientes desde la aplicación."

## Clarifications

### Session 2026-11-23

- Q (al implementar): la base no permite un nombre en un paciente pendiente (`patients_state_fields`, spec 001); ¿el administrador carga el nombre al dar de alta? → A: No. El alta se hace solo con tipo y número de documento; el nombre se completa cuando el paciente vincula su cuenta.

- Q: ¿Cómo se incorpora al personal? → A: invitación por correo con enlace de un solo uso y con vencimiento.
- Q: ¿Quién puede crear una clínica? → A: solo el equipo de la plataforma; queda fuera de esta funcionalidad.
- Q: ¿El paciente tiene cuenta propia y cómo se verifica? → A: cuenta propia, verificada por documento.
- Q: ¿Quién carga la especialidad y la matrícula de un médico? → A: el administrador, al invitarlo; la base de datos exige las dos a todo médico (spec 001, FR-012) y ninguna a quien no lo es. Detectado al implementar.
- Q: ¿Cuántos intentos fallidos de vinculación se permiten? → A: 5; al quinto fallo el código se anula y la clínica genera uno nuevo, y además se limita la frecuencia de intentos por cuenta.
- Q: ¿Cuánto vale una invitación o un código de vinculación? → A: 7 días, en ambos casos.
- Q: Al desactivar a un médico con pacientes asignados, ¿qué pasa con esas asignaciones? → A: quedan vigentes pero inactivas (no dan acceso mientras esté desactivado y se recuperan al reactivarlo); el paciente ve un aviso de que su médico ya no está disponible.
- Q: ¿Alcanza el documento como única prueba para vincular la cuenta de un paciente? → A: no; además del documento, el paciente debe indicar un código de un solo uso con vencimiento que le entrega la clínica.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El administrador incorpora personal a su clínica (Priority: P1)

Una persona que administra una clínica quiere que sus médicos, y otros administradores, puedan usar MedicIA dentro de esa clínica. Hoy, una cuenta nueva que se registra solo ve el aviso "todavía no tenés acceso a una clínica": no existe forma de incorporarla desde la aplicación. El administrador incorpora a la persona indicando su rol (médico, administrador o ambos) y, cuando la persona se vincula con su cuenta de ingreso, queda como miembro activo del personal de esa clínica.

**Why this priority**: sin esto una clínica no puede empezar a operar. Es el primer paso de toda la cadena: sin personal no hay pacientes asignados, estudios ni análisis. Entrega valor por sí sola: una clínica con su equipo completo.

**Independent Test**: con una clínica existente y un administrador con sesión, incorporar a una persona como médico; esa persona ingresa con su cuenta y llega a la clínica con el rol de médico, sin haber tocado la base de datos ni el script de siembra.

**Acceptance Scenarios**:

1. **Given** un administrador de la clínica A con sesión, **When** incorpora a una persona como médico, **Then** la persona queda pendiente de vincularse y, al hacerlo, pasa a ser médico activo de la clínica A.
2. **Given** una persona ya incorporada como médico, **When** el administrador la incorpora también como administrador, **Then** conserva un solo vínculo con la clínica y suma el rol.
3. **Given** un usuario sin rol de administrador en la clínica A, **When** intenta incorporar personal, **Then** la operación se rechaza y no se crea ningún vínculo.
4. **Given** una persona que ya es miembro activo de la clínica A, **When** el administrador intenta incorporarla de nuevo, **Then** el sistema informa que ya pertenece a la clínica y no duplica el vínculo.
5. **Given** un administrador que invita a un médico, **When** no indica la especialidad o la matrícula, o indica una matrícula que ya tiene otro miembro de la clínica, **Then** la invitación se rechaza antes de enviar el correo, con un mensaje que indica qué corregir.

---

### User Story 2 - El administrador da de alta pacientes y los asigna a un médico (Priority: P1)

El administrador registra a los pacientes de su clínica y los asigna a un médico. Un médico con una asignación vigente ve a esos pacientes y puede trabajar con ellos; un médico sin asignación a un paciente no lo ve. El administrador que no es médico gestiona los vínculos, pero no accede a los estudios.

**Why this priority**: el producto existe para analizar estudios de pacientes, y la regla de acceso (solo ve al paciente el médico asignado) depende de que estas asignaciones se puedan crear desde la aplicación. Es independiente de la Historia 1 si el médico ya existe.

**Independent Test**: dar de alta un paciente con su documento, asignarlo a un médico de la misma clínica, y comprobar que ese médico lo ve en su lista, mientras que otro médico de la clínica no lo ve.

**Acceptance Scenarios**:

1. **Given** un administrador de la clínica A, **When** da de alta un paciente con tipo y número de documento, **Then** el paciente queda registrado en la clínica A, sin asignación.
2. **Given** un paciente registrado y un médico activo de la misma clínica, **When** el administrador los asigna, **Then** el médico ve al paciente en su lista de pacientes.
3. **Given** dos médicos de la clínica A y un paciente asignado solo al primero, **When** el segundo médico consulta pacientes, **Then** no ve a ese paciente.
4. **Given** un administrador que no es médico, **When** intenta abrir los estudios de un paciente, **Then** el acceso se rechaza.
5. **Given** un paciente con el mismo tipo y número de documento ya registrado en la clínica A, **When** el administrador intenta darlo de alta otra vez, **Then** se rechaza el duplicado.
6. **Given** un médico de la clínica B, **When** el administrador de la clínica A intenta asignarle un paciente de la clínica A, **Then** se rechaza: la asignación solo puede unir a personas de la misma clínica.

---

### User Story 3 - Una persona se vincula con su cuenta existente, en una o más clínicas (Priority: P2)

Una persona incorporada (médico o paciente) usa la cuenta con la que ya ingresa a MedicIA para quedar vinculada a la clínica que la incorporó. El personal se vincula con la invitación que recibe por correo. El paciente se vincula acreditando su identidad con el documento con el que la clínica lo registró. Si ya pertenece a otra clínica, suma una segunda sin perder la primera, y elige en cuál trabajar con la selección de clínica que ya existe.

**Why this priority**: cierra el circuito de las dos historias anteriores: sin vincularse, la invitación queda pendiente. Es P2 porque las Historias 1 y 2 ya entregan valor a la clínica sin ella, pero sin vincularse nadie puede usar lo que la clínica preparó.

**Independent Test**: una persona con cuenta existente y sin clínica es invitada; al abrir el enlace con su cuenta queda vinculada y accede a la clínica. Si luego otra clínica la invita, ve ambas en la selección de clínica. Un paciente registrado por la clínica se vincula con su documento y ve sus datos.

**Acceptance Scenarios**:

1. **Given** una persona con cuenta y sin clínica que recibió una invitación de la clínica A, **When** la abre con esa cuenta, **Then** ingresa a la clínica A y deja de ver el aviso de falta de acceso.
2. **Given** una persona vinculada a la clínica A, **When** la clínica B también la invita y ella acepta, **Then** pertenece a ambas y elige en cuál trabajar, y los datos de una nunca aparecen en la otra.
3. **Given** una invitación dirigida a un correo, **When** una persona que ingresó con otro correo intenta usarla, **Then** la vinculación se rechaza.
4. **Given** una invitación vencida, revocada o ya usada, **When** se intenta usar, **Then** se rechaza con un mensaje que indica cómo pedir una nueva.
5. **Given** un paciente registrado por la clínica A que recibió su código, **When** vincula su cuenta e indica el mismo tipo y número de documento y el código vigente, **Then** su cuenta queda asociada a ese registro y ve sus propios datos.
6. **Given** un paciente que indica un documento o un código incorrecto, **When** intenta vincularse, **Then** se rechaza con el mismo mensaje en ambos casos, sin revelar cuál dato falló ni qué documento tenía cargado la clínica.
7. **Given** un código ya usado, vencido o reemplazado por uno nuevo, **When** se intenta usar, **Then** se rechaza, y la clínica puede generar un código nuevo para ese paciente.
8. **Given** un registro de paciente ya vinculado a una cuenta, **When** otra cuenta intenta vincularse a él, **Then** se rechaza.

---

### User Story 4 - El administrador ve y desactiva miembros y asignaciones sin perder el historial (Priority: P2)

El administrador necesita ver quién pertenece a su clínica y cuáles son las asignaciones, y poder desactivar a un miembro o terminar una asignación cuando la relación termina. Nada se borra: el historial de quién atendió a quién y cuándo se conserva.

**Why this priority**: una clínica real cambia: se van médicos, se reasignan pacientes. Sin esto, el acceso concedido nunca se puede retirar. Es P2 porque se puede operar un tiempo corto sin ella, pero no es aceptable para un uso real.

**Independent Test**: desactivar a un médico y comprobar que pierde el acceso a la clínica de inmediato y que sus asignaciones pasadas siguen visibles como historial; terminar una asignación y comprobar que el médico deja de ver al paciente.

**Acceptance Scenarios**:

1. **Given** un médico activo con pacientes asignados, **When** el administrador lo desactiva, **Then** el médico pierde el acceso a la clínica de inmediato, aun con una sesión abierta; sus asignaciones no se modifican, pero mientras esté desactivado no le dan acceso a ningún paciente.
2. **Given** una asignación vigente, **When** el administrador la termina, **Then** el médico deja de ver al paciente, y queda registrada la fecha y quién la terminó.
3. **Given** un médico desactivado, **When** el administrador lo reactiva, **Then** recupera el acceso a la clínica y a los pacientes cuyas asignaciones seguían vigentes, y sus asignaciones terminadas siguen terminadas.
6. **Given** un paciente con cuenta vinculada cuyo médico asignado está desactivado, **When** consulta a quién lo atiende, **Then** ve un aviso de que ese médico ya no está disponible, sin datos personales del médico más allá de lo que ya veía.
7. **Given** un administrador, **When** consulta las asignaciones, **Then** distingue las que están vigentes con el médico activo de las que están vigentes con el médico desactivado, para poder reasignar a esos pacientes.
4. **Given** una clínica con un único administrador activo, **When** ese administrador intenta desactivarse, **Then** se rechaza: una clínica no puede quedar sin administrador.
5. **Given** un paciente con asignación terminada, **When** el administrador asigna a otro médico, **Then** la nueva asignación convive con el historial de la anterior.

---

### Edge Cases

- Una persona es incorporada a una clínica con un correo distinto del de su cuenta de ingreso: no debe poder reclamar el vínculo de otra persona.
- Una persona ya vinculada a una clínica es desactivada mientras tiene la sesión abierta: la desactivación debe tener efecto en la siguiente operación, no al vencer la sesión.
- Dos administradores incorporan a la misma persona a la vez: queda un solo vínculo.
- El administrador intenta asignar un paciente a un miembro que está desactivado o que no es médico: se rechaza.
- Un paciente se da de alta en una clínica y la misma persona ya es paciente de otra: son registros independientes y ninguna clínica ve la existencia del otro.
- Una clínica suspendida: sus miembros no pueden operar, y no se pueden incorporar personas.
- Se intenta operar sobre una persona, un paciente o una asignación de otra clínica por identificador: se rechaza como si no existiera, sin revelar si existe.
- Se pierde el acceso al correo con el que se incorporó a alguien: se debe poder revocar y volver a incorporar.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: El sistema DEBE permitir que un administrador activo de una clínica incorpore personal a esa clínica, indicando su rol: médico, administrador o ambos.
- **FR-002**: El sistema DEBE permitir que un administrador de una clínica dé de alta pacientes de esa clínica con tipo y número de documento, y rechazar un paciente duplicado en la misma clínica.
- **FR-003**: El sistema DEBE permitir que un administrador asigne un paciente a un médico activo de la misma clínica, y rechazar asignaciones entre personas de clínicas distintas.
- **FR-004**: Un médico DEBE ver únicamente a los pacientes con los que tiene una asignación vigente; un administrador que no es médico NO DEBE acceder a los estudios.
- **FR-005**: El sistema DEBE permitir que una persona incorporada se vincule a la clínica usando la cuenta de ingreso que ya tiene, sin crear una cuenta nueva.
- **FR-006**: Una misma cuenta DEBE poder pertenecer a más de una clínica, sin que los datos de una sean visibles desde la otra.
- **FR-007**: El sistema DEBE permitir que el administrador vea los miembros de su clínica con su rol y estado, y las asignaciones con su estado.
- **FR-008**: El sistema DEBE permitir desactivar y reactivar a un miembro, y terminar una asignación, sin borrar ningún registro: el historial se conserva con fecha y autor.
- **FR-009**: La desactivación de un miembro DEBE tener efecto en la siguiente operación que haga, aunque tenga la sesión abierta. Desactivar a un médico NO modifica sus asignaciones: siguen vigentes pero no le dan acceso mientras esté desactivado, y se recuperan al reactivarlo.
- **FR-010**: El sistema NO DEBE permitir que una clínica quede sin administrador activo.
- **FR-011**: Toda operación de esta funcionalidad DEBE validar la sesión, el rol y la pertenencia a la clínica activa en el servidor; la clínica se toma del contexto autenticado y nunca de un dato enviado por el cliente.
- **FR-012**: Un identificador de otra clínica (persona, paciente, asignación o invitación) DEBE tratarse como inexistente, sin revelar que existe.
- **FR-013**: Una invitación DEBE poder usarse una sola vez, tener vencimiento y poder revocarse antes de usarse.
- **FR-014**: El sistema NO DEBE registrar en logs datos clínicos ni datos personales (correos, documentos, nombres) de las personas incorporadas.
- **FR-015**: El sistema DEBE informar con mensajes claros, sin lenguaje técnico, cuando una operación se rechaza, indicando el siguiente paso posible.
- **FR-016**: El sistema DEBE incorporar al personal mediante una invitación por correo con un enlace de un solo uso que vence a los 7 días. Solo la persona que ingresa con el correo invitado puede usarla.
- **FR-017**: La creación de una clínica NO forma parte de esta funcionalidad: la realiza el equipo de la plataforma, que designa al primer administrador. Ningún usuario registrado puede crear una clínica por su cuenta.
- **FR-018**: Un paciente DEBE poder vincular su cuenta de ingreso al registro que la clínica le creó. Para vincularse, DEBE acreditar su identidad con el documento (tipo y número) con el que la clínica lo registró **y** con un código de un solo uso que la clínica le entrega; si cualquiera de los dos no coincide, la vinculación se rechaza con un mismo mensaje, sin revelar cuál falló ni los datos cargados.
- **FR-019**: Mientras un paciente no vincule su cuenta, su registro DEBE existir y poder asignarse a un médico, sin que ninguna cuenta tenga acceso a él como paciente.
- **FR-020**: El código de vinculación del paciente DEBE ser de un solo uso, vencer a los 7 días, poder volver a generarse (lo que invalida el anterior) y no mostrarse a ningún usuario después de entregarse a la clínica. Cada intento fallido de vinculación cuenta contra los códigos vigentes de los pacientes con el documento ingresado, exista o no un código que coincida; al quinto intento fallido ese código DEBE quedar anulado y la clínica DEBE generar uno nuevo. Además, una misma cuenta con 10 intentos fallidos en 15 minutos DEBE esperar antes de intentar de nuevo, sin que se evalúe el código mientras tanto.
- **FR-022**: Al invitar a una persona con el rol de médico, el administrador DEBE indicar su especialidad y su matrícula profesional, ambas obligatorias; el sistema DEBE rechazar, antes de enviar el correo, una matrícula que ya tiene un miembro o una invitación pendiente de la clínica. Una invitación sin el rol de médico no lleva esos datos. Quien ya es médico conserva su especialidad y su matrícula si una invitación le suma otro rol.
- **FR-021**: Un paciente con cuenta vinculada cuyo médico asignado esté desactivado DEBE ver un aviso de que ese médico ya no está disponible, en lugar de un error o de no ver nada.

### Key Entities

- **Clínica**: la institución, frontera de aislamiento de todos sus datos. Tiene un estado (activa o suspendida).
- **Persona (cuenta)**: quien ingresa a MedicIA. Es global a la plataforma y puede pertenecer a varias clínicas.
- **Miembro del personal**: el vínculo de una persona con una clínica, con rol de médico, administrador o ambos, y un estado (activo o desactivado). Un médico tiene además especialidad y matrícula.
- **Paciente**: el registro de una persona dentro de una clínica, identificado por tipo y número de documento. Puede existir antes de estar vinculado a una cuenta.
- **Asignación médico–paciente**: un período de atención de un paciente por un médico, con fecha de inicio, quién la creó y, si terminó, fecha y quién la terminó. Las terminadas se conservan como historial.
- **Invitación**: la propuesta pendiente de sumar a una persona al personal de una clínica, dirigida a un correo, con su rol, vencimiento, un solo uso y estado (pendiente, usada, revocada o vencida).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador puede incorporar a un médico y dejarlo listo para usar la aplicación en menos de 3 minutos, sin intervención técnica ni acceso a la base de datos.
- **SC-002**: Un administrador puede dar de alta un paciente y asignarlo a un médico en menos de 2 minutos.
- **SC-003**: En el 100 % de las pruebas con dos clínicas, ningún usuario de una clínica ve, lista ni opera sobre personas, pacientes, asignaciones o incorporaciones de la otra.
- **SC-004**: Un médico solo ve a los pacientes con asignación vigente en el 100 % de los casos probados, incluyendo tras terminar o reasignar.
- **SC-005**: Un miembro desactivado pierde el acceso en su siguiente operación en el 100 % de los casos, aun con una sesión abierta.
- **SC-006**: Después de desactivar, terminar asignaciones o reasignar, el 100 % de los registros previos sigue consultable como historial.
- **SC-007**: Una persona sin clínica deja de ver el aviso de falta de acceso en su primer ingreso tras vincularse.
- **SC-008**: Ningún registro de log de esta funcionalidad contiene correos, documentos ni nombres de personas.

## Assumptions

- Ya existen y se reutilizan, sin cambiarlos de significado: el registro e ingreso de cuentas, la selección de la clínica activa, las sesiones y el modelo de clínicas, personal, pacientes y asignaciones.
- Un miembro puede ser médico, administrador o ambos a la vez, como ya define el modelo de datos. Un administrador que además es médico accede a los estudios solo de sus pacientes asignados, igual que cualquier médico.
- La interfaz está en español rioplatense, como el resto de la aplicación, y sigue su diseño y accesibilidad existentes.
- Esta funcionalidad corre con datos de demostración; no se opera con pacientes reales hasta definir los plazos de conservación exigidos por la constitución.
- El envío de las invitaciones usa el servicio de correo que se defina en el plan, y en pruebas se reemplaza por un envío simulado.
- La invitación por correo es el mecanismo para el personal. Cómo se le ofrece al paciente el acceso para vincularse (enlace, aviso al ingresar u otro) queda para la fase de clarificación; lo que esta especificación fija es que la vinculación del paciente se verifica con su documento.
- La primera clínica y su primer administrador los crea el equipo de la plataforma fuera de esta funcionalidad (FR-017). Para la demo se hace con el script de siembra o con SQL a cargo del responsable, y el procedimiento queda documentado en `infra/README.md`. Sin ese primer administrador, ninguna invitación puede enviarse.
- Queda fuera de alcance: registro de auditoría detallado, facturación, importación masiva de pacientes y la identificación automática del tipo de estudio.
- Se implementa desde cero en esta rama, sin reutilizar ni integrar trabajo de otras ramas.
