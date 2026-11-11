# Feature Specification: Link de vinculación a una clínica

**Feature Branch**: `009-link-vinculacion`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Link de vinculación a una clínica. El administrador de una clínica puede generar un link para incorporar a un médico o a un paciente; un médico puede generar un link solo para incorporar a un paciente. Quien recibe el link, si no tiene cuenta, se registra y al terminar queda vinculado; si ya tiene cuenta, inicia sesión y queda vinculado. Si el link lo generó el administrador, la persona queda vinculada a la clínica con el rol indicado (médico o paciente). Si lo generó un médico, el paciente queda vinculado a la clínica y asignado a ese médico. El link vence, se puede revocar y no se puede reutilizar. Quien genera links ve sus links pendientes. Si la persona ya está vinculada a esa clínica, no se duplica el vínculo. Quedar vinculado a una segunda clínica debe permitir elegir entre ambas con la selección de clínica existente (spec 002). Fuera de alcance: el alta directa de usuarios (se hace en la 010), la lista de usuarios de la clínica, la asignación de médicos a pacientes ya existentes desde la interfaz, dar de baja vínculos, y la selección de clínica (ya existe)."

## Clarifications

### Session 2026-11-11

- Q: ¿El link sirve solo para la cuenta con el correo verificado indicado al generarlo, o para cualquiera que lo tenga? → A: Atado al correo: con otro correo se rechaza y, si la persona quiere usar otro, se genera un link nuevo (FR-011).
- Q: ¿Cómo le llega el link a la persona invitada? → A: La plataforma lo envía automáticamente por correo al correo indicado. Quien invita carga el correo y el documento del paciente, o el correo y la matrícula del médico. El nombre del paciente sale de su propia cuenta (FR-004, FR-034).
- Q: ¿Para qué se pide el documento del paciente y la matrícula del médico al invitar? → A: Son una verificación de seguridad por si quien invita se equivoca de correo. Para vincularse, la persona DEBE ingresar el mismo documento (paciente) o la misma matrícula (médico) que cargó quien la invitó; si no coincide, no se vincula (FR-011, FR-037).
- Q: ¿Cuánto tiempo puede usarse el link antes de vencer? → A: 7 días desde que se genera, sin posibilidad de extenderlo (FR-006).

## User Scenarios & Testing *(mandatory)*

Los usuarios de esta funcionalidad son tres: el administrador de una clínica, que incorpora médicos y pacientes; el médico, que incorpora a sus pacientes; y la persona invitada, que puede ser un médico o un paciente. Hoy una cuenta nueva no pertenece a ninguna clínica y ve un estado vacío que dice que necesita una invitación (spec 002). Esta funcionalidad es esa invitación. No incluye listas de usuarios, el alta directa de usuarios ni la baja de vínculos.

### User Story 1 - El administrador incorpora a un médico (Priority: P1)

El administrador de la clínica indica que quiere invitar a un médico e ingresa su correo y su matrícula. La plataforma envía automáticamente un correo con el link a esa dirección. La persona abre el link: si no tiene cuenta, se registra; si ya tiene cuenta, inicia sesión. En ambos casos completa su especialidad y queda vinculada a la clínica como médico, con su membresía activa.

**Why this priority**: sin médicos vinculados a la clínica no hay pacientes que atender ni estudios que cargar. Es la primera pieza del flujo y la que habilita todas las demás.

**Independent Test**: se puede probar con un administrador que genera un link para un correo sin cuenta y otro para un correo con cuenta, abriendo cada link con la persona correspondiente y comprobando que ambas quedan como médicos activos de la clínica y la ven en su lista de clínicas.

**Acceptance Scenarios**:

1. **Given** un administrador de clínica, **When** invita a un médico indicando su correo y su matrícula, **Then** la plataforma envía el link a ese correo y la invitación aparece entre sus links pendientes, con el correo, el rol y la fecha de vencimiento.
2. **Given** un link para un médico y una persona sin cuenta con ese correo, **When** abre el link, **Then** se la lleva a registrarse y, al terminar el registro, ingresa su matrícula y completa su especialidad, y queda vinculada a la clínica como médico.
3. **Given** un link para un médico y una persona que ya tiene cuenta con ese correo, **When** abre el link, inicia sesión e ingresa su matrícula, **Then** completa su especialidad y queda vinculada a la clínica como médico, sin cambiar su cuenta ni su contraseña.
4. **Given** un link para un médico, **When** la persona ingresa una matrícula distinta de la que cargó el administrador, **Then** no se vincula y se le informa que los datos no coinciden.
4. **Given** una persona que quedó vinculada como médico, **When** ingresa a la plataforma, **Then** la clínica aparece en su lista como vínculo de personal.
5. **Given** una persona que ya es parte del personal de esa clínica, **When** abre un link para esa misma clínica, **Then** no se duplica su vínculo y se le informa que ya pertenece a ella.
6. **Given** una persona que ya es paciente de esa clínica, **When** abre un link de personal para esa misma clínica, **Then** el vínculo se rechaza con un mensaje claro, porque en una clínica una persona solo puede tener un tipo de vínculo.

---

### User Story 2 - El administrador incorpora a un paciente (Priority: P1)

El administrador indica que quiere invitar a un paciente e ingresa su correo y su documento. La plataforma envía automáticamente un correo con el link a esa dirección. La persona abre el link, se registra o inicia sesión y queda vinculada a la clínica como paciente, sin médico asignado.

**Why this priority**: es la otra mitad de las incorporaciones. Permite que una clínica incorpore pacientes aunque todavía no tengan un médico asignado.

**Independent Test**: se puede probar con un administrador que genera un link de paciente, lo abre una persona sin cuenta y otra con cuenta, y se comprueba que quedan como pacientes vinculados de la clínica, sin asignaciones.

**Acceptance Scenarios**:

1. **Given** un administrador de clínica, **When** invita a un paciente con correo y documento, **Then** la plataforma envía el link a ese correo y la invitación queda pendiente hasta que la persona la acepte. Mientras tanto no se crea ningún registro de paciente: el paciente nace vinculado al aceptar.
2. **Given** un link de paciente y una persona sin cuenta, **When** se registra desde el link e ingresa su documento, **Then** queda vinculada como paciente de la clínica con ese documento y el nombre de su cuenta.
3. **Given** un link de paciente y una persona con cuenta, **When** inicia sesión desde el link e ingresa su documento, **Then** queda vinculada como paciente de la clínica sin cambiar su cuenta.
7. **Given** un link de paciente, **When** la persona ingresa un documento distinto del que cargó quien la invitó, **Then** no se vincula y se le informa que los datos no coinciden.
8. **Given** un invitado por error a un correo equivocado, **When** quien recibe el correo abre el link sin conocer el documento, **Then** no puede vincularse.
4. **Given** un paciente cuyo vínculo fue revocado antes, **When** abre un nuevo link para la misma clínica, **Then** se reutiliza su mismo registro y recupera el vínculo, con su historial.
5. **Given** un documento que ya pertenece a otro paciente de la clínica, **When** el administrador intenta generar el link, **Then** se rechaza con un mensaje claro y no se crea el link.
6. **Given** un paciente vinculado desde un link del administrador, **When** se revisa su vínculo, **Then** no tiene ningún médico asignado.

---

### User Story 3 - El médico incorpora a un paciente suyo (Priority: P1)

El médico invita a un paciente con su correo y su documento, y la plataforma le envía el link por correo. Al aceptarlo, el paciente queda vinculado a la clínica y asignado a ese médico, de modo que el médico lo ve entre sus pacientes sin ningún paso adicional.

**Why this priority**: es el camino más natural para el trabajo diario y deja a los pacientes listos para cargar y analizar estudios con su médico.

**Independent Test**: se puede probar con un médico que genera un link para un paciente nuevo, el paciente lo acepta, y se comprueba que el paciente figura entre los pacientes del médico y que otro médico de la clínica no lo ve.

**Acceptance Scenarios**:

1. **Given** un médico de la clínica, **When** genera un link para un paciente, **Then** puede hacerlo y lo ve entre sus links pendientes.
2. **Given** un link generado por un médico, **When** la persona lo acepta, **Then** queda vinculada a la clínica como paciente y con una asignación vigente a ese médico.
3. **Given** un paciente que ya estaba vinculado a la clínica con otro médico, **When** abre el link de un médico nuevo, **Then** queda además asignado al médico nuevo, sin perder la asignación anterior ni duplicar su vínculo.
4. **Given** un paciente que ya tiene una asignación vigente con ese médico, **When** abre un link del mismo médico, **Then** no se crea una asignación duplicada.
5. **Given** un médico, **When** intenta generar un link para incorporar a otro médico o a un administrador, **Then** no puede, porque solo puede invitar pacientes.
6. **Given** un integrante del personal que es solo administrador, **When** genera un link de paciente, **Then** el paciente queda vinculado sin médico asignado, como en el caso del administrador.

---

### User Story 4 - Controlar los links pendientes (Priority: P2)

Quien genera links ve los que siguen pendientes y puede revocarlos. Un link deja de servir cuando se usa, se revoca o vence. Cada link puede usarse una sola vez y solo sirve para la persona a quien se lo invitó.

**Why this priority**: un link que alguien puede reenviar o encontrar es una puerta de entrada a datos clínicos. Controlarlo protege a la clínica, pero no bloquea el camino principal de incorporación.

**Independent Test**: se puede probar generando un link y revocándolo antes de usarlo, usándolo dos veces, usándolo después de vencido y abriéndolo con una cuenta cuyo correo no es el invitado.

**Acceptance Scenarios**:

1. **Given** links pendientes de quien los generó, **When** consulta su lista, **Then** ve el destinatario, el rol, el estado y el vencimiento de cada uno, y solo los de su propia clínica.
2. **Given** un link pendiente, **When** quien lo generó lo revoca, **Then** deja de servir de inmediato y su estado pasa a revocado.
3. **Given** un link ya aceptado, **When** alguien lo abre otra vez, **Then** se rechaza con un mensaje claro.
4. **Given** un link vencido, **When** alguien lo abre, **Then** se rechaza y se indica que debe pedir uno nuevo.
5. **Given** un link generado para un correo, **When** lo abre una cuenta con otro correo, **Then** se rechaza y no se vincula nada.
8. **Given** un link y una persona que ingresa cinco veces un documento o una matrícula incorrectos, **When** hace el quinto intento, **Then** el link queda invalidado y quien invitó puede generar uno nuevo.
6. **Given** un médico, **When** consulta los links pendientes, **Then** ve solo los que él generó y no los de otros integrantes de la clínica.
7. **Given** un link revocado, vencido o inexistente, **When** alguien lo abre, **Then** el mensaje no permite distinguir un link inexistente de uno vencido o revocado, más allá de indicar que no es válido.

---

### User Story 5 - Pertenecer a más de una clínica (Priority: P2)

Una persona que ya pertenece a una clínica acepta un link de otra y pasa a pertenecer a ambas. Al ingresar, elige entre las dos con la selección de clínica que ya existe.

**Why this priority**: el modelo de datos ya permite una cuenta en varias clínicas. Esta historia comprueba que el flujo nuevo no rompe esa posibilidad, pero no agrega pantallas propias.

**Independent Test**: se puede probar con una cuenta vinculada a la clínica A que acepta un link de la clínica B, y se comprueba que ve las dos en la selección y que los datos de una no aparecen en la otra.

**Acceptance Scenarios**:

1. **Given** una cuenta vinculada a la clínica A, **When** acepta un link de la clínica B, **Then** queda vinculada a ambas y su vínculo con A no cambia.
2. **Given** una cuenta vinculada a dos clínicas, **When** ingresa, **Then** elige entre ellas con la selección de clínica existente.
3. **Given** una cuenta que es médico en A y acepta un link de paciente de B, **When** trabaja en B, **Then** solo cuenta con lo que corresponde a un paciente en B.

---

### Edge Cases

- ¿Qué pasa si la persona que abre el link no tiene sesión? Se la lleva a iniciar sesión o a registrarse y, al terminar, vuelve al link para completar la vinculación.
- ¿Qué pasa si el registro desde el link no se completa (por ejemplo, no verifica el correo)? No queda vinculada a nada y el link sigue pendiente mientras no venza.
- ¿Qué pasa si el correo del link y el de la cuenta difieren solo en mayúsculas? Se tratan como el mismo correo, igual que en el resto de la plataforma.
- ¿Qué pasa si se generan dos links pendientes para el mismo correo y la misma clínica? El segundo reemplaza al primero, que queda revocado, para que no haya dos vigentes.
- ¿Qué pasa si la clínica se suspende mientras el link está pendiente? El link deja de servir y no se vincula a nadie.
- ¿Qué pasa si la membresía de quien generó el link se desactiva antes de que se use? El link deja de servir.
- ¿Qué pasa si quien generó el link de paciente es un médico que se desactiva? El link deja de servir, porque no existiría a quién asignar.
- ¿Qué pasa si falla el servicio de identidad o el de correo durante el registro? Se informa un error general sin detalles internos y no se vincula a nadie; el link sigue pendiente.
- ¿Qué pasa si no se puede enviar el correo con el link? Quien invita ve que el envío falló y puede reintentar; la invitación no queda como enviada. El link no se muestra en pantalla.
- ¿Qué pasa si el correo no llega o se perdió? Quien invita genera una invitación nueva, que revoca la anterior (FR-009).
- ¿Qué pasa si dos personas abren el mismo link a la vez? Solo una lo acepta; la otra recibe el mensaje de link no válido.
- ¿Qué pasa si el documento del link de paciente ya pertenece a un paciente vinculado de la clínica con otra cuenta? Se rechaza la vinculación y se informa a la persona que debe comunicarse con la clínica.
- ¿Qué pasa si quien acepta un link de médico ya es administrador de esa clínica, sin rol de médico? Se rechaza sin cambiar su membresía y se le indica que sumar el rol de médico lo gestiona la clínica; agregarle ese rol queda fuera de esta funcionalidad.
- ¿Qué pasa si la matrícula del link ya pertenece a otro integrante de la clínica? Se rechaza al invitar (FR-008); si pasó a estar en uso entre la invitación y la aceptación, se rechaza al aceptar y se pide a la clínica generar una invitación nueva.
- ¿Qué pasa si la misma persona intenta usar un link de otra clínica con un correo distinto del invitado? Se rechaza, como en cualquier link.

## Requirements *(mandatory)*

### Functional Requirements

**Generación de links**

- **FR-001**: El administrador de una clínica DEBE poder generar un link para incorporar a un médico o a un paciente a su clínica.
- **FR-002**: Un médico de la clínica DEBE poder generar un link solo para incorporar a un paciente. NO DEBE poder generar links para personal.
- **FR-003**: Un integrante del personal que no sea administrador ni médico, o con la membresía desactivada, NO DEBE poder generar links. Un paciente tampoco.
- **FR-004**: Quien invita DEBE indicar el correo de la persona invitada y el tipo de vínculo (médico o paciente). Para un paciente DEBE indicar además su documento (tipo y número); para un médico, su matrícula. El nombre del paciente NO se carga: se toma de su cuenta al aceptar.
- **FR-005**: La clínica del link DEBE obtenerse del contexto autenticado de quien lo genera, y NUNCA de un dato enviado por el cliente.
- **FR-006**: Cada link DEBE vencer a los 7 días de generado.
- **FR-007**: Un link generado por un médico DEBE quedar asociado a ese médico, para asignarle el paciente al aceptarlo. Un link generado por un administrador que no es médico NO DEBE asignar ningún médico.
- **FR-008**: Al generar un link de paciente, la plataforma DEBE rechazar un documento que ya pertenezca a otro paciente de la clínica con una cuenta vinculada distinta, y DEBE aceptar el de un paciente pendiente o revocado de esa misma persona. Al generar un link de médico, DEBE rechazar una matrícula que ya pertenezca a otro integrante del personal de la clínica.
- **FR-009**: Si ya existe un link pendiente para el mismo correo y la misma clínica, el nuevo DEBE reemplazar al anterior, que pasa a revocado.

**Aceptación del link**

- **FR-010**: Una persona que abre un link sin sesión DEBE ser llevada a registrarse o a iniciar sesión y, al terminar, DEBE volver al link para completar la vinculación.
- **FR-011**: La vinculación DEBE completarse solo con una cuenta cuyo correo, ya verificado, coincida con el del link, sin distinguir mayúsculas de minúsculas. Con cualquier otro correo, el link DEBE rechazarse sin vincular nada.
- **FR-037**: Para completar la vinculación, la persona DEBE ingresar el documento (tipo y número) o la matrícula que cargó quien la invitó, según sea paciente o médico. Si no coincide, NO DEBE vincularse. El dato cargado NO DEBE mostrarse en el correo ni en ninguna pantalla previa a esta comprobación, y la comparación DEBE ignorar espacios y mayúsculas.
- **FR-038**: Los intentos fallidos de esta comprobación DEBEN limitarse. Tras cinco intentos incorrectos sobre un mismo link, el link DEBE quedar invalidado y quien invitó DEBE poder generar uno nuevo. El mensaje ante un dato incorrecto NO DEBE revelar el dato correcto ni cuántos caracteres coinciden.
- **FR-012**: Aceptar un link NO DEBE modificar la cuenta existente ni su contraseña.
- **FR-013**: Al aceptar un link de médico, la persona DEBE completar su especialidad, y DEBE quedar con una membresía de personal activa con el rol de médico y la matrícula indicada en el link. Si ya tenía una membresía en esa clínica, DEBE rechazarse sin duplicarla.
- **FR-014**: Al aceptar un link de paciente, la persona DEBE quedar vinculada como paciente de la clínica con el documento del link y el nombre de su cuenta. Si su registro estaba pendiente o revocado, DEBE reutilizarse el mismo registro.
- **FR-015**: Al aceptar un link de paciente generado por un médico, DEBE crearse una asignación vigente entre ese médico y el paciente. Si ya existe una asignación vigente de esa pareja, NO DEBE duplicarse. Las asignaciones con otros médicos DEBEN conservarse.
- **FR-016**: Una persona NO DEBE tener, en una misma clínica, vínculo de personal y vínculo de paciente a la vez. Aceptar un link que lo provocaría DEBE rechazarse con un mensaje claro. Esta regla completa la que la spec 001 dejó para este flujo.
- **FR-017**: Vincularse a una clínica DEBE ser una operación indivisible: o se completan el vínculo y, si corresponde, la asignación, o no queda ningún cambio.
- **FR-018**: Una misma persona DEBE poder aceptar links de varias clínicas y quedar vinculada a todas, sin que los datos de una se mezclen con los de otra.

**Estado y control de los links**

- **FR-019**: Un link DEBE tener un estado explícito: pendiente, aceptado, revocado o vencido. Solo uno pendiente y no vencido puede aceptarse.
- **FR-020**: Un link DEBE poder usarse una sola vez. Dos intentos simultáneos de aceptarlo DEBEN resolverse de modo que solo uno tenga éxito.
- **FR-021**: Quien generó un link DEBE poder revocarlo mientras esté pendiente, y el link DEBE dejar de servir de inmediato. El administrador de la clínica DEBE poder revocar además los links pendientes generados por cualquier integrante de su clínica, porque puede verlos (FR-022). Un médico que no es administrador no puede revocar los de otros.
- **FR-022**: Quien genera links DEBE poder ver los links pendientes de su clínica que él mismo generó, con destinatario, tipo de vínculo, estado y vencimiento. Un administrador DEBE poder ver además los links pendientes de su clínica generados por cualquier integrante.
- **FR-023**: Un link DEBE dejar de servir si la clínica se suspende o si desaparece la vigencia de quien lo generó (membresía desactivada, o médico que se desactiva en un link de paciente).
- **FR-024**: Ante un link inexistente, vencido, revocado, ya usado o dirigido a otro correo, el mensaje visible DEBE ser claro pero NO DEBE revelar a quién estaba dirigido ni a qué clínica pertenece, ni confirmar que existe una cuenta con ese correo.
- **FR-025**: El link DEBE ser imposible de adivinar: no DEBE poder deducirse a partir de otros links ni del correo.
- **FR-026**: Los links DEBEN almacenarse de forma que quien acceda a los datos no pueda reconstruir un link vigente a partir de lo guardado.

**Aislamiento y permisos**

- **FR-027**: Toda operación de esta funcionalidad (generar, ver, revocar y aceptar) DEBE validar autenticación, autorización y pertenencia a la clínica, tanto en las pantallas como en las acciones y servicios, sin depender de que la interfaz oculte opciones.
- **FR-028**: Un integrante de la clínica A NO DEBE poder ver, revocar ni usar links de la clínica B, ni generar links para ella.
- **FR-029**: Un administrador de plataforma que no pertenece a la clínica NO DEBE generar links para ella desde esta funcionalidad.

**Seguridad y registro**

- **FR-030**: La plataforma NO DEBE registrar el link completo, contraseñas, códigos de verificación ni datos de sesión sensibles en sus registros de actividad.
- **FR-031**: DEBE conservarse quién generó cada link, cuándo, a qué correo, con qué vínculo y qué resultado tuvo, para poder revisarlo después.

**Interfaz**

- **FR-032**: Las pantallas de generación, lista de links pendientes y aceptación DEBEN estar en español, funcionar en móvil, tablet y escritorio, en modo claro y oscuro, ser operables por teclado y comunicar los estados y errores sin depender solo del color.
- **FR-033**: El estado vacío de una cuenta sin clínica (spec 002) DEBE seguir indicando que se necesita una invitación, y DEBE funcionar bien cuando la persona llega desde un link.

**Envío del link**

- **FR-034**: Al generar una invitación, la plataforma DEBE enviar automáticamente un correo con el link al correo indicado. El correo DEBE indicar el nombre de la clínica y el tipo de vínculo (médico o paciente), sin incluir datos clínicos ni el documento ni la matrícula.
- **FR-035**: El link NO DEBE mostrarse a quien invita. Solo llega por el correo al destinatario.
- **FR-036**: Si el envío del correo falla, la invitación NO DEBE quedar como enviada: quien invita DEBE ver el error y poder reintentar sin crear invitaciones duplicadas.

### Key Entities *(include if feature involves data)*

- **Link de vinculación**: invitación para unirse a una clínica. Tiene la clínica, el correo de la persona invitada, el tipo de vínculo (médico o paciente), quién lo generó, un estado (pendiente, aceptado, revocado o vencido), su vencimiento y el momento y la cuenta de quien lo aceptó. En un link de paciente incluye además el documento y, si lo generó un médico, ese médico. En un link de médico incluye la matrícula.
- **Membresía de personal**: pertenencia de una cuenta al personal de una clínica (spec 001). Esta funcionalidad la crea al aceptar un link de médico.
- **Paciente**: registro de una persona dentro de una clínica (spec 001). Esta funcionalidad lo crea o lo reactiva al aceptar un link de paciente.
- **Asignación médico–paciente**: relación entre un médico y un paciente de la misma clínica (spec 001). Esta funcionalidad la crea al aceptar un link generado por un médico.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Una persona sin cuenta, desde que abre el link hasta quedar vinculada, completa el proceso en menos de 5 minutos, contando desde que tiene el código de verificación en su correo.
- **SC-002**: Una persona con cuenta queda vinculada con tres pasos como máximo desde que abre el link (iniciar sesión, completar los datos que falten y confirmar).
- **SC-003**: El 100 % de los intentos de usar un link vencido, revocado, ya usado, de una clínica suspendida o dirigido a otro correo son rechazados, sin vincular nada.
- **SC-004**: El 100 % de los intentos de generar, ver, revocar o aceptar links de una clínica desde otra clínica, o desde un rol sin permiso, son rechazados.
- **SC-005**: Ante dos intentos simultáneos de aceptar el mismo link, exactamente uno tiene éxito y no queda ningún vínculo ni asignación duplicados.
- **SC-006**: Un paciente invitado por un médico aparece entre los pacientes de ese médico apenas termina de vincularse, sin ningún paso adicional de la clínica.
- **SC-007**: Los mensajes de error de un link no válido son indistinguibles entre un link inexistente, uno vencido y uno revocado, verificado con casos de prueba.
- **SC-009**: El 100 % de los intentos de vincularse con un documento o una matrícula distintos de los cargados por quien invitó son rechazados, y ningún mensaje ni correo revela ese dato.
- **SC-008**: Cada regla de este documento tiene al menos una prueba que intenta violarla, incluida una prueba de que un link de una clínica no vincula a nadie a otra.

## Assumptions

- **Alcance:** esta funcionalidad cubre generar, ver, revocar y aceptar links de vinculación para médicos y pacientes. El alta directa de usuarios por el administrador o el médico, la lista de usuarios de la clínica, la asignación de médicos a pacientes ya existentes y la baja de vínculos quedan fuera. El alta directa corresponde a la funcionalidad 010 y reutilizará la regla de vinculación que esta funcionalidad deja construida.
- **Invitar administradores:** los links incorporan médicos y pacientes. Un administrador de clínica adicional no se incorpora con link; se resolverá en otra funcionalidad.
- **Envío del link:** la plataforma envía el link por correo al invitado (FR-034). Esto exige un servicio de envío de correo para mensajes propios de la plataforma, distinto del que usa el servicio de identidad para sus códigos; cuál se usa se define en el plan.
- **Link atado al correo:** el link sirve solo para la cuenta cuyo correo, verificado, coincide con el indicado al generarlo. Esto evita que un link reenviado o filtrado vincule a otra persona.
- **Vencimiento:** 7 días desde la generación. No se puede extender; para dar más tiempo se genera uno nuevo.
- **Datos del paciente:** quien invita indica solo el documento; el nombre sale de la cuenta de la persona, que lo carga al registrarse. No se pide ningún otro dato personal ni clínico (spec 001, FR-020). La persona debe ingresar ese mismo documento para vincularse.
- **Datos del médico:** quien invita indica la matrícula; la persona debe ingresar esa misma matrícula para vincularse y completa además su especialidad.
- **Doble comprobación:** el documento o la matrícula funcionan como segunda verificación, por si quien invita se equivoca de correo. Junto con el link atado al correo, evita que un correo mal tipeado vincule a un desconocido.
- **Registro:** la persona sin cuenta se registra con el flujo existente de la spec 002, incluida la verificación del correo. Esta funcionalidad no cambia las reglas del registro, la verificación ni el ingreso. Solo agrega, a esas pantallas, un aviso de que hay una invitación pendiente y, al ingresar, la lleva a aceptarla (aunque todavía no tenga ninguna clínica).
- **Vínculo único por clínica:** una persona no puede ser personal y paciente de la misma clínica (spec 001). Esta funcionalidad hace cumplir esa regla en el flujo que crea los vínculos.
- **Roles de quien invita:** un integrante con membresía activa y rol de administrador de clínica puede invitar médicos y pacientes. Con rol de médico, solo pacientes. Si tiene ambos roles, tiene los permisos de ambos, y sus links de paciente lo asignan como médico.
- **Pacientes sin médico:** un paciente invitado por un administrador que no es médico queda sin médico asignado hasta que otra funcionalidad lo asigne.
- **Idioma:** los textos están en español rioplatense.
- **Dependencias:** se apoya en el modelo de datos de acceso (spec 001), en el ingreso y la selección de clínica (spec 002) y en la carga y el análisis de estudios ya existentes (specs 006 a 008), sin modificarlos.
- **Servicios reales:** durante el desarrollo, el servicio de identidad y el de correo pueden reemplazarse por simulaciones, como en la spec 002.
