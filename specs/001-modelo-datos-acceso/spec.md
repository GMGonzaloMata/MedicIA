# Feature Specification: Modelo de datos de acceso multi-clínica

**Feature Branch**: `001-modelo-datos-acceso`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Modelado de datos de acceso multi-clínica: definir las entidades Clínica (Tenant), Usuario, Membresía de personal, Paciente y Asignación médico–paciente, sus relaciones, estados y las reglas que la base de datos debe garantizar (aislamiento entre clínicas, unicidades, integridad). Solo modelado de datos; los flujos de ingreso, invitaciones, pantallas y auditoría quedan para funcionalidades posteriores."

## Clarifications

### Session 2026-11-09

- Q: ¿Una misma persona puede ser administrador de la clínica y médico a la vez dentro de la misma clínica? → A: Sí: una misma membresía puede ser administrador de clínica, médico o ambos a la vez.
- Q: Cuando una asignación entre médico y paciente termina y después se retoma, ¿debe conservarse el historial de cada período de atención o alcanza con guardar solo el estado más reciente? → A: Conservar cada período: un registro nuevo cada vez que se asigna, y a lo sumo una asignación activa por pareja.

## User Scenarios & Testing *(mandatory)*

Esta funcionalidad no tiene pantallas ni flujos de usuario propios. Sus "usuarios" son el equipo que construye las funcionalidades siguientes (ingreso, invitaciones, estudios, análisis) y las personas que dependen de que los datos estén aislados y bien relacionados. Cada historia describe una garantía que el modelo de datos debe ofrecer y cómo se comprueba intentando violarla.

### User Story 1 - Información separada por clínica (Priority: P1)

Cada registro clínico (membresías, pacientes, asignaciones) pertenece a una única clínica, y los registros solo pueden relacionarse con otros de esa misma clínica. Ninguna relación puede cruzar el límite entre instituciones.

**Why this priority**: la separación de la información entre clínicas es un requisito de negocio y de confianza (constitución, principio II). Todo lo que se construya después se apoya en esta garantía.

**Independent Test**: se puede probar creando datos de dos clínicas e intentando relacionar registros de una con registros de la otra. Todos los intentos deben ser rechazados por el propio modelo.

**Acceptance Scenarios**:

1. **Given** un médico de la clínica A y un paciente de la clínica B, **When** se intenta crear una asignación entre ambos, **Then** el modelo la rechaza.
2. **Given** un registro de membresía, paciente o asignación, **When** se intenta crear sin indicar a qué clínica pertenece, **Then** el modelo lo rechaza.
3. **Given** datos de varias clínicas, **When** se consultan los registros de la clínica A, **Then** el resultado puede obtenerse filtrando solo por la clínica A, sin recorrer registros de otras.

---

### User Story 2 - Una cuenta, varias clínicas (Priority: P1)

Una misma persona tiene una sola cuenta en toda la plataforma y puede estar vinculada a varias clínicas. En cada clínica tiene a lo sumo un vínculo de un único tipo: personal (con el rol de administrador de clínica, de médico o de ambos) o paciente. Los datos de cada clínica sobre esa persona son independientes de los de las demás.

**Why this priority**: es lo que permite que un paciente se atienda en varias instituciones sin duplicar su cuenta ni mezclar sus datos entre clínicas.

**Independent Test**: se puede probar vinculando una cuenta a varias clínicas, como personal en algunas y como paciente en otras, e intentando duplicar un vínculo dentro de una misma clínica.

**Acceptance Scenarios**:

1. **Given** una cuenta existente, **When** se la vincula como paciente a dos clínicas distintas, **Then** quedan dos registros de paciente independientes asociados a la misma cuenta.
2. **Given** una cuenta que ya es paciente de la clínica A, **When** se intenta crear un segundo registro de paciente de esa cuenta en la clínica A, **Then** el modelo lo rechaza.
3. **Given** una cuenta que ya tiene una membresía de personal en la clínica A, **When** se intenta crear otra membresía de esa cuenta en la misma clínica, **Then** el modelo lo rechaza.
4. **Given** una persona que es administrador de clínica y además médico en la clínica A, **When** se registra su membresía, **Then** queda una sola membresía con ambos roles.
5. **Given** una membresía de personal, **When** se intenta guardar sin ningún rol, **Then** el modelo la rechaza.
6. **Given** dos cuentas con el mismo correo escrito con distintas mayúsculas, **When** se intenta registrar la segunda, **Then** el modelo la rechaza por considerarlas la misma.

---

### User Story 3 - Identificación de personas dentro de una clínica (Priority: P2)

Dentro de una clínica, cada paciente se identifica por su documento (tipo y número) y cada médico por su matrícula profesional. Esos datos no se repiten dentro de la clínica, pero sí pueden coincidir entre clínicas distintas.

**Why this priority**: evita duplicar pacientes o médicos dentro de una institución y es la base de la verificación de identidad de las funcionalidades posteriores.

**Independent Test**: se puede probar registrando documentos y matrículas repetidos dentro de una clínica (deben rechazarse) y en clínicas distintas (deben aceptarse).

**Acceptance Scenarios**:

1. **Given** un paciente con un documento registrado en la clínica A, **When** se intenta registrar otro paciente con el mismo tipo y número de documento en la clínica A, **Then** el modelo lo rechaza.
2. **Given** un paciente con un documento registrado en la clínica A, **When** se registra otro paciente con el mismo tipo y número en la clínica B, **Then** el modelo lo acepta.
3. **Given** dos documentos con el mismo número pero distinto tipo (por ejemplo, DNI y pasaporte), **When** se registran en una misma clínica, **Then** el modelo los acepta como distintos.
4. **Given** un médico con una matrícula en la clínica A, **When** se intenta registrar a otro médico con la misma matrícula en esa clínica, **Then** el modelo lo rechaza.
5. **Given** dos administradores de clínica sin matrícula en la misma clínica, **When** se los registra, **Then** el modelo los acepta, porque la ausencia de matrícula no cuenta como repetición.
6. **Given** una membresía que incluye el rol de médico, **When** se intenta registrarla sin especialidad o sin matrícula, **Then** el modelo la rechaza. Una membresía que es solo de administrador de clínica no requiere ninguna de las dos.

---

### User Story 4 - Asignaciones entre médicos y pacientes (Priority: P2)

Un paciente puede tener varios médicos y un médico varios pacientes dentro de una misma clínica. Cada vez que se asigna se guarda un registro nuevo con quién la creó y cuándo, y puede terminar sin perderse. Las asignaciones terminadas se conservan como historial de los períodos de atención.

**Why this priority**: define qué pacientes ve cada médico, que es la base de la visibilidad de los estudios y resultados en las funcionalidades siguientes.

**Independent Test**: se puede probar creando, terminando y volviendo a crear asignaciones, e intentando duplicar las activas o asignar entre clínicas distintas.

**Acceptance Scenarios**:

1. **Given** un médico y un paciente de la misma clínica, **When** se crea la asignación, **Then** queda activa y registra quién la creó y cuándo.
2. **Given** una asignación activa entre un médico y un paciente, **When** se intenta crear otra igual, **Then** el modelo la rechaza.
3. **Given** una asignación terminada, **When** se vuelve a asignar a la misma pareja, **Then** se crea una asignación nueva y la terminada se conserva con su período.
4. **Given** un médico con varias asignaciones, **When** se consultan sus pacientes, **Then** el resultado incluye solo las asignaciones activas.
5. **Given** un médico y un paciente con asignaciones terminadas y una activa, **When** se consulta el historial de esa pareja, **Then** se obtienen todos los períodos con quién creó cada uno, cuándo empezó y, si terminó, cuándo y quién lo terminó.

---

### User Story 5 - Estados sin pérdida de información (Priority: P2)

Suspender una clínica, desactivar a un integrante del personal, revocar el vínculo de un paciente o terminar una asignación cambian un estado, pero no eliminan información. Ningún registro con relaciones puede eliminarse mientras otros dependan de él.

**Why this priority**: la trazabilidad y el tratamiento responsable de datos clínicos exigen conservar el historial, y evita que un error borre datos de una institución.

**Independent Test**: se puede probar aplicando cada cambio de estado y verificando que todos los registros siguen disponibles, e intentando eliminar registros referenciados.

**Acceptance Scenarios**:

1. **Given** una clínica con personal, pacientes y asignaciones, **When** se la suspende, **Then** todos sus datos y relaciones permanecen sin cambios.
2. **Given** un paciente vinculado, **When** se revoca su vínculo, **Then** su registro, su documento y su historial de asignaciones se conservan.
3. **Given** una membresía referenciada por asignaciones, **When** se intenta eliminarla, **Then** el modelo lo rechaza.
4. **Given** un paciente vinculado, **When** se intenta guardar su estado como vinculado sin cuenta o sin nombre, **Then** el modelo lo rechaza.
5. **Given** un paciente con vínculo revocado, **When** se lo vuelve a vincular, **Then** se reutiliza su mismo registro.

---

### Edge Cases

- ¿Qué pasa si dos clínicas registran pacientes con el mismo documento? Es válido: la unicidad se exige solo dentro de cada clínica.
- ¿Qué pasa si una persona es paciente en una clínica y personal en otra? Es válido: la restricción de un único tipo de vínculo aplica por clínica.
- ¿Qué pasa si quien administra la clínica también atiende pacientes? Tiene una sola membresía con ambos roles, con su especialidad y matrícula.
- ¿Qué pasa si un integrante del personal se desactiva y tiene asignaciones activas? El modelo no se lo impide; las asignaciones siguen existiendo hasta que la funcionalidad correspondiente las termine. Es una regla de flujo, no de datos.
- ¿Qué pasa si se intenta eliminar una clínica que tiene datos? El modelo lo rechaza: las clínicas solo se suspenden.
- ¿Qué pasa si una cuenta existe sin ninguna clínica? Es válido: tener cuenta no implica pertenecer a una clínica.
- ¿Qué pasa si un paciente figura como pendiente? Es válido: puede existir sin cuenta ni nombre hasta que complete su vínculo.
- ¿Qué pasa si el mismo número de documento se guarda con espacios o distinto formato? Queda fuera del modelo; la normalización del dato corresponde a la funcionalidad que lo captura.

## Requirements *(mandatory)*

### Functional Requirements

**Clínicas**

- **FR-001**: El modelo DEBE representar la clínica con un identificador único, un nombre no vacío, un estado (activa o suspendida) y sus fechas de creación y modificación.
- **FR-002**: La suspensión de una clínica DEBE conservar todos sus datos y vínculos, y DEBE poder revertirse.
- **FR-003**: El modelo NO DEBE permitir eliminar una clínica que tenga registros asociados.

**Aislamiento entre clínicas**

- **FR-004**: Todo registro de membresía, paciente y asignación DEBE pertenecer a exactamente una clínica y no puede existir sin ella.
- **FR-005**: Las relaciones entre registros clínicos DEBEN limitarse a registros de la misma clínica. El modelo DEBE rechazar por sí mismo una asignación cuyo médico y paciente pertenezcan a clínicas distintas, sin depender de que la aplicación lo valide.
- **FR-006**: El modelo DEBE permitir obtener todos los registros de una clínica filtrando únicamente por esa clínica.

**Usuarios (cuentas)**

- **FR-007**: El modelo DEBE representar la cuenta de una persona con un identificador único, el identificador externo del proveedor de identidad (único), el correo (único sin distinguir mayúsculas), el nombre, una marca de administrador de plataforma (falsa por defecto), la fecha desde la cual son válidas sus sesiones y sus fechas de creación y modificación.
- **FR-008**: El modelo NO DEBE almacenar contraseñas, tokens ni resultados clínicos en la cuenta.
- **FR-009**: Una cuenta DEBE poder existir sin ninguna clínica y estar vinculada a varias.

**Membresías de personal**

- **FR-010**: El modelo DEBE representar la pertenencia de una cuenta al personal de una clínica con sus roles (administrador de clínica, médico o ambos a la vez), su estado (activa o desactivada) y, si es médico, su especialidad y matrícula profesional.
- **FR-011**: Una cuenta DEBE tener a lo sumo una membresía por clínica.
- **FR-012**: Toda membresía DEBE tener al menos un rol. Si incluye el rol de médico, la especialidad y la matrícula DEBEN ser obligatorias. Si no lo incluye, DEBEN estar ausentes.
- **FR-013**: La matrícula DEBE ser única dentro de cada clínica y puede repetirse entre clínicas. La ausencia de matrícula no cuenta como repetición.

**Pacientes**

- **FR-014**: El modelo DEBE representar al paciente como un registro propio de cada clínica, con su documento (tipo y número), nombre, cuenta vinculada, estado (pendiente, vinculado o revocado), fechas de vinculación y de revocación, y sus fechas de creación y modificación.
- **FR-015**: El tipo de documento DEBE ser uno de DNI, pasaporte u otro. La combinación de tipo y número DEBE ser única dentro de cada clínica y puede repetirse entre clínicas.
- **FR-016**: Una cuenta DEBE tener a lo sumo un registro de paciente por clínica.
- **FR-017**: La cuenta vinculada y el nombre DEBEN estar ausentes mientras el paciente esté pendiente. Un paciente vinculado DEBE tener ambos.
- **FR-018**: Revocar el vínculo de un paciente DEBE conservar su registro, su documento y su historial de asignaciones.
- **FR-019**: Un paciente revocado DEBE poder volver a vincularse reutilizando su mismo registro.
- **FR-020**: El modelo DEBE guardar del paciente únicamente su documento y su nombre; no almacena fecha de nacimiento ni datos clínicos.

**Asignaciones médico–paciente**

- **FR-021**: El modelo DEBE representar la asignación entre una membresía y un paciente de la misma clínica, con quién la creó, cuándo y, si terminó, cuándo y quién la terminó.
- **FR-022**: Una asignación está activa mientras no tenga fecha de fin.
- **FR-023**: DEBE existir a lo sumo una asignación activa por pareja de médico y paciente. Cada nueva asignación de una pareja, incluso si antes hubo otra terminada, DEBE crear un registro nuevo, y las terminadas DEBEN conservarse como historial.
- **FR-024**: Un médico DEBE poder tener muchos pacientes y un paciente muchos médicos.

**Integridad e historial**

- **FR-025**: Las clínicas, las cuentas, las membresías, los pacientes y las asignaciones NO DEBEN eliminarse mientras otros registros dependan de ellos. Los cambios de estado reemplazan al borrado.
- **FR-026**: Cada entidad DEBE registrar cuándo fue creada y, si puede modificarse, cuándo se modificó por última vez.
- **FR-027**: Cada regla del modelo DEBE poder verificarse intentando violarla y comprobando que el intento es rechazado.

### Key Entities *(include if feature involves data)*

- **Clínica (Tenant)**: institución cliente de la plataforma. Tiene nombre y estado (activa o suspendida). Es la frontera de aislamiento de todos los datos clínicos.
- **Usuario**: cuenta de una persona, única en toda la plataforma. Tiene correo, nombre e identificador externo. Puede estar vinculada a cero, una o varias clínicas. La marca de administrador de plataforma identifica a quien gestiona la plataforma sin pertenecer a ninguna clínica.
- **Membresía de personal**: pertenencia de una cuenta al personal de una clínica como administrador de clínica, médico o ambos a la vez. Quienes son médicos tienen especialidad y matrícula, esta última única dentro de la clínica. Tiene un estado (activa o desactivada).
- **Paciente**: registro de una persona dentro de una clínica. Tiene documento (tipo y número, único dentro de la clínica), nombre, cuenta vinculada y estado (pendiente, vinculado o revocado). La misma persona en dos clínicas tiene dos registros independientes.
- **Asignación médico–paciente**: relación entre una membresía de médico y un paciente de la misma clínica. Registra quién la creó, cuándo y, si terminó, cuándo y quién la terminó. Cada período de atención es un registro propio, de modo que el historial de una pareja puede tener varias asignaciones. Determina qué pacientes atiende cada médico.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El 100 % de los intentos de relacionar registros de clínicas distintas son rechazados por el modelo, verificado con casos de prueba que cubren cada relación.
- **SC-002**: El 100 % de los intentos de violar una regla de unicidad (correo, identificador externo, membresía por cuenta y clínica, paciente por cuenta y clínica, documento por clínica, matrícula por clínica, asignación activa por pareja) son rechazados, y los mismos valores en clínicas distintas son aceptados.
- **SC-003**: Una misma cuenta puede vincularse a 5 o más clínicas sin duplicar su correo ni su identidad.
- **SC-004**: Con 100 clínicas y 10.000 pacientes en la clínica más grande, las consultas habituales (clínicas de una persona, pacientes de un médico, médicos de un paciente) responden en menos de 1 segundo.
- **SC-005**: Tras suspender una clínica, desactivar personal, revocar vínculos o terminar asignaciones, el 100 % de los registros anteriores sigue disponible.
- **SC-006**: Cada regla de este documento tiene al menos un caso de prueba que la verifica, y el conjunto completo se ejecuta sin errores como parte de la verificación habitual del proyecto.

## Assumptions

- **Alcance:** esta funcionalidad define únicamente el modelo de datos de cinco entidades: clínica, usuario, membresía de personal, paciente y asignación médico–paciente. No incluye pantallas, ingreso, sesiones, invitaciones, envío de correos ni casos de uso.
- **Funcionalidades posteriores:** las invitaciones y el registro de auditoría se modelarán junto con los flujos que los usan. Los estudios, análisis y hallazgos se modelarán en sus propias funcionalidades y se apoyarán en la clínica y el paciente definidos acá.
- **Un solo tipo de vínculo por clínica:** una persona no puede ser personal y paciente de la misma clínica. Esta regla cruza dos entidades y no se puede expresar solo con restricciones de unicidad, así que se hará cumplir cuando se construya el flujo que crea los vínculos. El modelo la facilita, pero no la garantiza por sí solo.
- **Reglas de flujo, no de datos:** quedan fuera del modelo las reglas que dependen de un flujo: que la asignación apunte a una membresía que incluya el rol de médico, que sea solo a pacientes vinculados y a médicos activos, o que no se desactive al último administrador. Se validan en las funcionalidades que las ejecutan.
- **Administrador de plataforma:** se define fuera de la aplicación; ninguna operación de usuario modifica esa marca.
- **Cuenta sin estado propio:** la cuenta no tiene un estado de activación porque ninguna operación prevista la desactiva por completo. Las desactivaciones ocurren en la membresía y en el vínculo del paciente.
- **Sesiones:** la fecha desde la que son válidas sus sesiones permite invalidar sesiones anteriores, por ejemplo tras cambiar la contraseña.
- **Nombre del paciente:** se guarda como copia en el registro de cada clínica, de modo que cada institución conserva su propio dato.
- **Documento y matrícula:** se guardan tal como los captura la funcionalidad correspondiente, que se ocupa de normalizarlos. La plataforma no valida la matrícula contra un registro oficial.
- **Datos mínimos:** no se guarda fecha de nacimiento ni ningún dato clínico en estas entidades.
- **Aislamiento adicional:** las protecciones extra de acceso a nivel de datos, más allá de las reglas de este modelo, no forman parte de este paso. Se evalúan más adelante, cuando existan datos clínicos sensibles.
- **Quién ejecuta los cambios de base:** los comandos de migración y de generación del cliente los ejecuta el responsable del proyecto desde su terminal.
- **Nombres:** las entidades usan los nombres del dominio definidos en las normas de código del proyecto.
