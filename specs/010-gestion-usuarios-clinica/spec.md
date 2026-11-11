# Feature Specification: Gestión de usuarios de una clínica

**Feature Branch**: `010-gestion-usuarios-clinica`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Gestión de usuarios de una clínica. Es la continuación de la 009 (link de vinculación) y de la selección de clínica de la 002. (1) Lista de integrantes: el administrador ve a todo el personal (administradores y médicos) y a todos los pacientes de su clínica, con su estado (activo o desactivado, vinculado o revocado); el médico ve solo a sus pacientes asignados. (2) Alta directa: el administrador puede crear el usuario de un médico o de un paciente, y el médico puede crear el usuario de un paciente, sin usar el link. Quien lo crea nunca conoce ni define la contraseña: la persona recibe un correo y define la suya. Si el correo ya tiene cuenta, se vincula la cuenta existente sin duplicarla ni cambiar su contraseña. Si lo crea un médico, el paciente queda además asignado a ese médico. Mismas reglas que la 009: un solo tipo de vínculo por clínica, sin duplicar vínculos, matrícula y documento únicos por clínica. (3) Asignación de médicos a pacientes ya existentes: el administrador asigna y quita médicos de un paciente. (4) Dar de baja vínculos: el administrador desactiva y reactiva personal, y revoca y reactiva pacientes. Fuera de alcance: las vistas por rol del paciente y del médico, sumar el rol de médico a un administrador que todavía no lo tiene, editar datos personales de la cuenta y la plataforma de administración global."

## Clarifications

### Session 2026-11-11

- Q: Al dar de baja a un médico o revocar a un paciente, ¿sus asignaciones se conservan o se terminan? → A: Se conservan sin efecto mientras dure la baja y recuperan su efecto al reactivar (FR-023, FR-024).
- Q: Si el correo del alta ya tiene cuenta, ¿el vínculo es inmediato o la persona debe aceptarlo antes? → A: Inmediato, tenga o no cuenta la persona. Quien da de alta lo hace porque la persona se lo pidió, así que no se exige confirmación; la persona recibe igualmente un correo de aviso (FR-009).
- Q: ¿Quien da de alta puede reenviar el correo de acceso a una persona nueva? → A: Sí, mientras la persona no haya ingresado por primera vez (FR-014). Reenvía el administrador o el médico que tiene asignado al paciente (precisado en el análisis, porque nada registra quién dio de alta a quién salvo el registro de gestión).
- Q: ¿El administrador puede dar de alta a otra persona como administrador? → A: No. El alta directa es solo de médicos y pacientes; los administradores se crean por fuera de esta funcionalidad (FR-006).

## User Scenarios & Testing *(mandatory)*

Los usuarios de esta funcionalidad son dos: el administrador de una clínica, que gestiona a las personas de su clínica, y el médico, que da de alta a sus propios pacientes. Hasta ahora, la única forma de incorporar a alguien es el link de vinculación (spec 009), y una vez incorporado nadie puede ver quién pertenece a la clínica, asignarle médicos ni darlo de baja. Esta funcionalidad cierra ese ciclo de vida. No incluye las pantallas propias del paciente y del médico (se hacen aparte), ni sumar el rol de médico a un administrador, ni editar los datos de una cuenta.

### User Story 1 - Ver a las personas de la clínica (Priority: P1)

El administrador abre la gestión de usuarios y ve, en dos listas, al personal de su clínica (administradores y médicos) y a sus pacientes, cada uno con su estado. El médico, por su lado, sigue viendo solo a sus pacientes asignados.

**Why this priority**: sin saber quién pertenece a la clínica y en qué estado, el administrador no puede decidir a quién asignar, dar de baja o reactivar. Es la base de las demás historias.

**Independent Test**: se puede probar con una clínica con personal y pacientes en distintos estados, y otra clínica con sus propios datos; el administrador de cada una ve exactamente a los suyos, y un médico ve solo a sus pacientes asignados.

**Acceptance Scenarios**:

1. **Given** un administrador de clínica, **When** abre la lista del personal, **Then** ve a cada integrante con su nombre, correo, roles, estado (activo o desactivado) y, si es médico, su especialidad y matrícula.
2. **Given** un administrador de clínica, **When** abre la lista de pacientes, **Then** ve a cada paciente con su nombre, documento, estado (vinculado, revocado o pendiente) y los médicos que tiene asignados.
3. **Given** una clínica con más personas de las que entran en una pantalla, **When** el administrador recorre una lista, **Then** la ve por páginas, ordenada por nombre.
4. **Given** un médico, **When** consulta a sus pacientes, **Then** ve solo a los pacientes vinculados con una asignación vigente a él, y no ve al resto del personal ni a otros pacientes.
5. **Given** un paciente o un integrante del personal que no es administrador ni médico, **When** intenta abrir la gestión de usuarios, **Then** no puede y no ve ningún dato.
6. **Given** un administrador de la clínica A, **When** consulta las listas, **Then** nunca ve personas de la clínica B, aunque la misma cuenta pertenezca a ambas.

---

### User Story 2 - Dar de alta a una persona sin link (Priority: P1)

El administrador da de alta a un médico o a un paciente, y el médico da de alta a un paciente, indicando los datos de la persona. La persona queda vinculada de inmediato, sin usar el link. Quien la da de alta nunca conoce ni define su contraseña: la persona recibe un correo y la define ella.

**Why this priority**: es el camino directo cuando la clínica ya conoce a la persona (por ejemplo, en el mostrador) y no quiere esperar a que acepte una invitación. Junto con la lista, es lo que la clínica usa todos los días.

**Independent Test**: se puede probar dando de alta a una persona con correo nuevo y a otra cuyo correo ya tiene cuenta; ambas quedan vinculadas, la primera recibe un correo para definir su contraseña, y la segunda conserva su cuenta y su contraseña sin cambios.

**Acceptance Scenarios**:

1. **Given** un administrador, **When** da de alta a un médico con correo, nombre, matrícula y especialidad, **Then** la persona queda vinculada como médico activo y recibe un correo para definir su contraseña.
2. **Given** un administrador, **When** da de alta a un paciente con correo, nombre y documento, **Then** la persona queda vinculada como paciente, sin médico asignado, y recibe un correo para definir su contraseña.
3. **Given** un médico, **When** da de alta a un paciente, **Then** el paciente queda vinculado a la clínica y asignado a ese médico, y aparece entre los pacientes del médico.
4. **Given** un correo que ya tiene cuenta, **When** se da de alta a esa persona, **Then** se la vincula con su cuenta existente, sin duplicarla ni cambiar su contraseña ni su nombre, y recibe un correo que le avisa de la nueva clínica.
5. **Given** la persona ya vinculada a esa clínica con ese mismo tipo de vínculo, **When** se la da de alta otra vez, **Then** no se duplica el vínculo y se informa que ya pertenece. Si lo hace un médico, igualmente se agrega la asignación si faltaba.
6. **Given** una persona que ya tiene en esa clínica el otro tipo de vínculo (personal que se da de alta como paciente, o paciente como personal), **When** se la da de alta, **Then** se rechaza con un mensaje claro.
7. **Given** una matrícula o un documento que ya pertenecen a otra persona de la clínica, **When** se intenta el alta, **Then** se rechaza con un mensaje claro y no se crea nada.
8. **Given** un paciente cuyo vínculo estaba revocado, **When** se lo da de alta de nuevo, **Then** se reutiliza su registro y recupera el vínculo, con su historial.
9. **Given** una persona dada de alta que todavía no ingresó, **When** no le llega el correo, **Then** el administrador, o el médico que tiene asignado al paciente, puede reenviárselo.
10. **Given** el alta de una persona con un correo determinado, **When** ingresa otra cuenta con un correo distinto, **Then** esa otra cuenta no obtiene ningún vínculo con la clínica: el vínculo es solo con la cuenta del correo indicado.

---

### User Story 3 - Asignar y quitar médicos a pacientes existentes (Priority: P2)

El administrador elige a un paciente vinculado y le asigna uno o más médicos de la clínica, o le quita alguno. El médico asignado ve al paciente entre los suyos; al quitarlo, deja de verlo.

**Why this priority**: los pacientes que ingresan por el administrador (link o alta directa) quedan sin médico. Sin esta historia nadie puede atenderlos. No bloquea el alta, pero sí el uso clínico.

**Independent Test**: se puede probar con un paciente sin médico: el administrador le asigna un médico, el médico lo ve; luego se lo quita y el médico deja de verlo, conservándose el historial.

**Acceptance Scenarios**:

1. **Given** un paciente vinculado sin médico, **When** el administrador le asigna un médico activo de la clínica, **Then** el médico lo ve entre sus pacientes.
2. **Given** un paciente con un médico asignado, **When** el administrador le asigna otro, **Then** queda con los dos y la asignación anterior no cambia.
3. **Given** un paciente con un médico asignado, **When** el administrador le quita ese médico, **Then** el médico deja de ver al paciente y la asignación terminada queda registrada, con quién y cuándo la terminó.
4. **Given** un médico que ya tiene al paciente asignado, **When** se intenta asignarlo otra vez, **Then** no se crea una asignación duplicada.
5. **Given** un paciente y un médico, **When** se vuelve a asignar un médico a quien antes se le quitó, **Then** se crea una asignación nueva y la anterior queda como historial.
6. **Given** un integrante del personal que no tiene rol de médico o está desactivado, **When** el administrador intenta asignarlo a un paciente, **Then** no se permite.
7. **Given** un paciente que no está vinculado (pendiente o revocado), **When** el administrador intenta asignarle un médico, **Then** no se permite.
8. **Given** un médico, **When** intenta asignar o quitar médicos a un paciente, **Then** no puede: solo el administrador gestiona asignaciones.

---

### User Story 4 - Dar de baja y reactivar vínculos (Priority: P2)

El administrador desactiva a un integrante del personal o revoca el vínculo de un paciente, y puede revertirlo más tarde. La persona deja de poder operar en esa clínica de inmediato, pero conserva su cuenta, sus otras clínicas y todos los datos de la clínica.

**Why this priority**: es el control de acceso que la clínica necesita cuando alguien se va o se equivocó, y la contracara de poder sumar gente. Se hace después de poder verla y sumarla.

**Independent Test**: se puede probar desactivando a un médico con sesión abierta y comprobando que pierde el acceso a esa clínica en su siguiente acción, que conserva su acceso a otra clínica, y que al reactivarlo lo recupera.

**Acceptance Scenarios**:

1. **Given** un integrante del personal activo, **When** el administrador lo desactiva, **Then** su estado pasa a desactivado y deja de poder operar en esa clínica, aunque tenga una sesión abierta.
2. **Given** un integrante del personal desactivado, **When** el administrador lo reactiva, **Then** vuelve a operar en la clínica con sus mismos roles, matrícula y asignaciones.
3. **Given** un paciente vinculado, **When** el administrador revoca su vínculo, **Then** deja de poder operar en esa clínica y sus estudios, su documento y su historial de asignaciones se conservan.
4. **Given** un paciente revocado, **When** el administrador lo reactiva, **Then** recupera el vínculo con el mismo registro.
5. **Given** una persona vinculada a dos clínicas, **When** una la da de baja, **Then** conserva el acceso a la otra.
6. **Given** el único administrador activo de la clínica, **When** se intenta desactivarlo, **Then** se rechaza, porque la clínica quedaría sin quien la administre.
7. **Given** un administrador, **When** intenta desactivarse a sí mismo, **Then** se rechaza.
8. **Given** un médico desactivado con pacientes asignados, **When** se consulta a esos pacientes, **Then** siguen vinculados y sus asignaciones se conservan; el médico no puede verlos mientras esté desactivado y los recupera al reactivarse.
9. **Given** un médico, un paciente o un integrante sin rol de administrador, **When** intenta dar de baja o reactivar a alguien, **Then** no puede.

---

### Edge Cases

- ¿Qué pasa si dos personas dan de alta al mismo correo a la vez? Se crea un solo vínculo y una sola cuenta; la otra operación informa que ya pertenece.
- ¿Qué pasa si falla el servicio de identidad o el de correo al dar de alta? No queda ningún vínculo a medias: o se completa el alta o no se cambia nada, y quien la hace ve un error general sin detalles internos.
- ¿Qué pasa si la cuenta se creó y el correo no pudo enviarse? Quien dio de alta ve que el envío falló y puede reintentarlo; el vínculo no se duplica.
- ¿Qué pasa si el correo del alta ya tiene una cuenta en otra clínica? La respuesta a quien da de alta es la misma que con un correo nuevo: no se revela si la cuenta existía.
- ¿Qué pasa si una persona dada de alta nunca define su contraseña? Sigue vinculada y visible; el administrador puede reenviarle el correo o darla de baja.
- ¿Qué pasa si se da de alta como médico a quien ya es administrador de la clínica, sin rol de médico? Se rechaza sin cambiar su membresía, igual que en la 009: sumar el rol de médico queda fuera de esta funcionalidad.
- ¿Qué pasa si se da de baja al único médico asignado a un paciente? El paciente queda vinculado y su asignación se conserva; simplemente ningún médico activo lo ve hasta que se reactive al médico o se le asigne otro.
- ¿Qué pasa con las invitaciones pendientes (009) de una persona dada de baja o de quien las generó? Las del emisor desactivado dejan de servir (spec 009); las dirigidas a esa persona no cambian.
- ¿Qué pasa con una invitación pendiente (009) para un correo al que se da de alta directamente? Queda como está: si la persona la acepta, se la informa como ya perteneciente y el link se consume sin duplicar nada. No se cierra automáticamente.
- ¿Qué pasa si la clínica se suspende? Esta funcionalidad no opera sobre una clínica suspendida: ni la gestión ni las altas.
- ¿Qué pasa si el administrador es también médico y se da de baja a sí mismo? Se rechaza, como cualquier auto-baja.

## Requirements *(mandatory)*

### Functional Requirements

**Lista de integrantes**

- **FR-001**: El administrador de una clínica DEBE poder ver al personal de su clínica, con nombre, correo, roles, estado (activo o desactivado) y, si es médico, especialidad y matrícula.
- **FR-002**: El administrador DEBE poder ver a los pacientes de su clínica, con nombre, documento, estado (vinculado, revocado o pendiente) y los médicos que tiene asignados.
- **FR-003**: Las listas DEBEN mostrarse por páginas, ordenadas por nombre.
- **FR-004**: Un médico DEBE ver únicamente a los pacientes vinculados con una asignación vigente a él. NO DEBE ver al personal ni a pacientes que no le estén asignados.
- **FR-005**: Un paciente, y un integrante del personal que no sea administrador ni médico o que esté desactivado, NO DEBE poder abrir ninguna de estas listas.

**Alta directa**

- **FR-006**: El administrador DEBE poder dar de alta a un médico o a un paciente de su clínica sin usar el link. El médico DEBE poder dar de alta solo a pacientes. NO DEBE poder dar de alta personal. Nadie DEBE poder dar de alta a un administrador por esta vía.
- **FR-007**: Quien da de alta DEBE indicar el correo y el nombre de la persona. Para un paciente DEBE indicar además su documento (tipo y número); para un médico, su matrícula y su especialidad.
- **FR-008**: Quien da de alta NUNCA DEBE conocer ni definir la contraseña de la persona. Si la cuenta es nueva, la persona DEBE recibir un correo con lo necesario para definir la suya.
- **FR-009**: Si el correo ya tiene una cuenta, el alta DEBE vincular esa cuenta sin duplicarla y SIN cambiar su contraseña ni su nombre. La persona DEBE recibir un correo que le avise de la clínica a la que fue vinculada, sin incluir datos clínicos ni el documento ni la matrícula.
- **FR-010**: La respuesta a quien da de alta DEBE ser la misma exista o no una cuenta con ese correo en la plataforma. Los rechazos por conflicto DEBEN basarse solo en datos de la clínica de quien da de alta.
- **FR-011**: Un alta hecha por un médico DEBE dejar al paciente asignado a ese médico. Si ya existe una asignación vigente de esa pareja, NO DEBE duplicarse. Un alta hecha por un administrador que no es médico NO DEBE asignar a ningún médico.
- **FR-012**: El alta DEBE respetar las reglas de la 009: una persona NO DEBE tener en una misma clínica vínculo de personal y de paciente a la vez; NO DEBE duplicarse un vínculo existente del mismo tipo; la matrícula y el documento DEBEN ser únicos dentro de la clínica; un paciente con vínculo revocado o pendiente DEBE reutilizar su mismo registro; y quien ya es administrador sin rol de médico NO DEBE recibir ese rol por esta vía.
- **FR-013**: El alta DEBE ser una operación indivisible: o se completan la cuenta, el vínculo y, si corresponde, la asignación, o no queda ningún cambio.
- **FR-014**: Si el correo de acceso no se puede enviar, quien da de alta DEBE ver el error y poder reintentarlo sin duplicar nada. Mientras la persona no haya ingresado por primera vez, el administrador, o el médico que tiene asignado al paciente, DEBE poder reenviarle el correo.

**Asignación de médicos**

- **FR-015**: El administrador DEBE poder asignar un médico a un paciente existente y quitarle una asignación vigente. Un médico NO DEBE poder asignar ni quitar asignaciones.
- **FR-016**: Solo se DEBE poder asignar a pacientes vinculados y a integrantes del personal activos con rol de médico, ambos de la misma clínica.
- **FR-017**: NO DEBE existir más de una asignación vigente por pareja de médico y paciente. Un paciente DEBE poder tener varios médicos y un médico varios pacientes.
- **FR-018**: Quitar una asignación DEBE terminarla, no borrarla: DEBE conservarse quién la terminó y cuándo. Volver a asignar a la misma pareja DEBE crear una asignación nueva.

**Baja y reactivación**

- **FR-019**: El administrador DEBE poder desactivar y reactivar a un integrante del personal, y revocar y reactivar el vínculo de un paciente de su clínica.
- **FR-020**: Una persona dada de baja en una clínica DEBE dejar de poder operar en ella de inmediato, incluso con una sesión abierta, sin perder su cuenta ni su acceso a otras clínicas.
- **FR-021**: Dar de baja NUNCA DEBE eliminar datos: la cuenta, el registro del paciente, sus estudios, su documento y el historial de asignaciones DEBEN conservarse. Reactivar DEBE reutilizar el mismo registro y restituir los mismos roles, matrícula y asignaciones.
- **FR-022**: NO DEBE poder desactivarse al único administrador activo de una clínica, y un administrador NO DEBE poder desactivarse a sí mismo.
- **FR-023**: Dar de baja a un médico NO DEBE terminar sus asignaciones: DEBEN conservarse, sin efecto mientras esté desactivado, y volver a tenerlo al reactivarlo.
- **FR-024**: Revocar el vínculo de un paciente NO DEBE terminar sus asignaciones.

**Aislamiento y permisos**

- **FR-025**: Toda operación de esta funcionalidad (ver, dar de alta, asignar, dar de baja y reactivar) DEBE validar autenticación, autorización y pertenencia a la clínica, en las pantallas, en las acciones y en los servicios, sin depender de que la interfaz oculte opciones.
- **FR-026**: La clínica de cualquier operación DEBE obtenerse del contexto autenticado de quien la realiza, NUNCA de un dato enviado por el cliente.
- **FR-027**: Un integrante de la clínica A NO DEBE poder ver, dar de alta, asignar, dar de baja ni reactivar a personas de la clínica B. Un administrador de plataforma que no pertenece a la clínica NO DEBE operar sobre ella desde esta funcionalidad.
- **FR-028**: Una clínica suspendida NO DEBE admitir ninguna de estas operaciones.

**Seguridad y registro**

- **FR-029**: La plataforma NO DEBE registrar contraseñas, códigos, vínculos de acceso, documentos ni matrículas en sus registros de actividad.
- **FR-030**: DEBE conservarse quién hizo cada alta, asignación, baja y reactivación, cuándo y sobre quién, para poder revisarlo después.

**Interfaz**

- **FR-031**: Las pantallas DEBEN estar en español, funcionar en móvil, tablet y escritorio, en modo claro y oscuro, ser operables por teclado y comunicar los estados y errores sin depender solo del color. Las acciones que dan de baja o quitan una asignación DEBEN pedir confirmación.

### Key Entities *(include if feature involves data)*

- **Membresía de personal**: pertenencia de una cuenta al personal de una clínica, con roles (administrador, médico o ambos), estado (activa o desactivada) y, si es médico, especialidad y matrícula (spec 001). Esta funcionalidad la crea en el alta de un médico y cambia su estado al dar de baja o reactivar.
- **Paciente**: registro de una persona dentro de una clínica, con documento, nombre, cuenta vinculada y estado (pendiente, vinculado o revocado) (spec 001). Esta funcionalidad lo crea o lo reutiliza en el alta, y cambia su estado al revocar o reactivar.
- **Asignación médico–paciente**: relación entre un médico y un paciente de la misma clínica, vigente hasta que se la termina (spec 001). Esta funcionalidad la crea y la termina.
- **Cuenta**: la identidad de la persona en la plataforma, que puede pertenecer a varias clínicas (spec 001). Esta funcionalidad puede crearla en el alta y nunca modifica una existente.
- **Registro de gestión**: constancia de quién hizo cada alta, asignación, baja o reactivación, sobre quién y cuándo.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un administrador da de alta a una persona con los datos a mano en menos de 1 minuto, y la persona queda vinculada sin pasos adicionales de la clínica.
- **SC-002**: El 100 % de los intentos de ver, dar de alta, asignar, dar de baja o reactivar a personas de una clínica desde otra clínica, o desde un rol sin permiso, son rechazados.
- **SC-003**: La respuesta al dar de alta es indistinguible entre un correo con cuenta en la plataforma y uno sin cuenta, verificado con casos de prueba.
- **SC-004**: En el 100 % de los casos, una persona dada de baja pierde el acceso a esa clínica en su siguiente acción, y conserva el acceso a las otras.
- **SC-005**: Ante dos altas simultáneas del mismo correo en una clínica, queda exactamente un vínculo y una cuenta, sin duplicados.
- **SC-006**: Es imposible dejar a una clínica sin administradores activos: el 100 % de los intentos de desactivar al último, o de desactivarse a sí mismo, son rechazados.
- **SC-007**: La primera página de cualquier lista se muestra en menos de 2 segundos con una clínica de 500 personas.
- **SC-008**: Cada regla de este documento tiene al menos una prueba que intenta violarla, incluida una que comprueba que una persona dada de baja o de alta en la clínica A no cambia nada en la clínica B.

## Assumptions

- **Alcance:** esta funcionalidad cubre ver, dar de alta, asignar médicos y dar de baja y reactivar a las personas de una clínica. Las pantallas propias del paciente (ver sus médicos) y del médico (invitar desde su lista) quedan fuera, igual que sumar el rol de médico a un administrador, editar datos personales de una cuenta, buscar o filtrar las listas y la administración global de la plataforma.
- **Quién gestiona:** solo el administrador de la clínica ve las listas completas, asigna y da de baja. El médico solo da de alta a pacientes (que quedan asignados a él) y sigue viendo a sus pacientes en la lista que ya tiene (spec 006). Un integrante con ambos roles tiene los permisos de ambos.
- **Datos del alta:** quien da de alta indica correo, nombre y, según el caso, documento o matrícula y especialidad. El nombre solo se usa para crear una cuenta nueva: con una cuenta existente prevalece el nombre de la cuenta y no se modifica.
- **Vínculo inmediato:** a diferencia del link (spec 009), el alta vincula sin que la persona acepte ni repita ningún dato, porque quien da de alta ya conoce a la persona y la incorpora a pedido de ella (decidido en la clarificación). Por eso la persona recibe un aviso por correo y el alta solo afecta a esa clínica. Los estudios son de cada clínica, así que vincularla no expone nada previo.
- **Contraseña de la persona nueva:** la define ella desde el correo que recibe, con el flujo del servicio de identidad (spec 002). Cuál es el flujo exacto se define en el plan.
- **Reglas de la 009:** se reutiliza el vínculo único por clínica, la unicidad de matrícula y documento, la reutilización del registro de un paciente revocado y el rechazo de sumar el rol de médico a un administrador.
- **Reglas de flujo de la 001:** esta funcionalidad hace cumplir las reglas que la 001 dejó para el flujo: asignar solo a pacientes vinculados y a médicos activos, y no desactivar al último administrador.
- **Baja sin borrado:** dar de baja solo cambia un estado (spec 001, FR-025). Las asignaciones no se terminan automáticamente al desactivar a un médico ni al revocar a un paciente; se conservan y recuperan su efecto al reactivar.
- **Idioma y servicios reales:** los textos están en español rioplatense. Durante el desarrollo, el servicio de identidad y el de correo pueden reemplazarse por simulaciones, como en las specs 002 y 009.
- **Dependencias:** se apoya en el modelo de datos de acceso (spec 001), en el ingreso y la selección de clínica (spec 002), en el link de vinculación y el envío de correo (spec 009) y en los estudios (specs 006 a 008), sin modificarlos.
