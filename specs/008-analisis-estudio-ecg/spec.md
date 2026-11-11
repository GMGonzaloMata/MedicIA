# Feature Specification: Análisis de un estudio de ECG con EchoNext-Mini

**Feature Branch**: `008-analisis-estudio-ecg`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Análisis de un estudio de ECG con EchoNext-Mini (funcionalidad 008): permitir que, desde un estudio de ECG ya guardado y visible (006 y 007), una persona con acceso solicite un análisis con el modelo EchoNext-Mini (005) y vea el resultado: 12 probabilidades de posibles hallazgos de cardiopatía estructural, presentadas como apoyo clínico y nunca como diagnóstico."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Solicitar un análisis y ver el resultado (Priority: P1)

Desde la pantalla de un estudio, el paciente dueño o un médico con asignación vigente toca «Analizar estudio». El análisis queda registrado, se ejecuta con el modelo y, al completarse, la misma pantalla muestra las 12 probabilidades de posibles hallazgos con su nombre en español, el modelo y su versión, y la fecha del análisis.

**Why this priority**: es el objetivo del producto. Sin esto la plataforma guarda y muestra la onda, pero no la analiza, y no hay nada que mostrar a quien decide.

**Independent Test**: con un estudio sintético y un modelo simulado, se pide el análisis y se comprueba que pasa de pendiente a completado y que el resultado muestra las 12 probabilidades en el orden fijo del contrato.

**Acceptance Scenarios**:

1. **Given** una persona con acceso a un estudio sin análisis, **When** toca «Analizar estudio», **Then** el análisis queda registrado a su nombre con el estado pendiente o en proceso y la pantalla indica que está en curso.
2. **Given** un análisis en curso, **When** el modelo responde, **Then** el análisis pasa a completado y la pantalla muestra las 12 probabilidades en el orden fijo, cada una como porcentaje y con una barra, con el compuesto «cardiopatía estructural (al menos uno de los otros once)» destacado.
3. **Given** un resultado completado, **When** se lo lee, **Then** muestra el nombre del modelo, su versión y la fecha del análisis, y no muestra umbrales ni etiquetas de sí o no.
4. **Given** un resultado completado, **When** se lo lee, **Then** hay siempre una advertencia visible: son probabilidades estimadas por un modelo de investigación, pueden no estar calibradas, se leen como un indicador relativo de riesgo, son posibles hallazgos de apoyo clínico y no un diagnóstico, y requieren la evaluación de un profesional.
5. **Given** un resultado, **When** se lo mira sin distinguir colores, **Then** cada valor se entiende por su nombre, su porcentaje escrito y su barra.

---

### User Story 2 - Acceso restringido y aislamiento (Priority: P1)

Solo piden y ven análisis el paciente dueño del estudio y los médicos con asignación vigente. Cualquier otra persona, de la misma clínica o de otra, no obtiene datos y no puede provocar un análisis.

**Why this priority**: el resultado es información clínica de una persona. El aislamiento por clínica y por paciente es una regla no negociable, y un análisis consume un recurso con costo.

**Independent Test**: con cuentas de dos clínicas, pacientes y médicos con y sin asignación, se intenta pedir y ver el análisis de un mismo estudio desde cada una y se comprueba que solo lo logran las permitidas y que no se crea ningún análisis en los demás casos.

**Acceptance Scenarios**:

1. **Given** un paciente que no es dueño del estudio, **When** intenta pedir o ver un análisis, **Then** se rechaza sin datos y no se crea ningún análisis.
2. **Given** un médico sin asignación vigente (o con la asignación terminada) sobre el paciente, **When** intenta pedir o ver un análisis, **Then** se rechaza igual.
3. **Given** una persona de otra clínica, **When** usa el identificador exacto de un estudio o de un análisis, **Then** el resultado es indistinguible del de un identificador inexistente.
4. **Given** un administrador de clínica que no es médico, **When** intenta acceder, **Then** no ve ni pide análisis.
5. **Given** una asignación que termina, **When** el médico vuelve a abrir el estudio, **Then** pierde el acceso a sus análisis, que siguen siendo del paciente.

---

### User Story 3 - Fallas claras y sin análisis colgados (Priority: P1)

Cuando el modelo está apagado o no responde, rechaza la entrada o se demora de más, el análisis queda registrado como fallido con un mensaje claro y sin detalles internos, y se puede pedir uno nuevo. Nunca queda un análisis «en proceso» para siempre.

**Why this priority**: el modelo nace apagado para no generar costo, así que la falla es el caso normal de uso hasta que alguien lo enciende. Sin un manejo prolijo, la pantalla quedaría bloqueada por un análisis que nunca termina.

**Independent Test**: con el modelo apagado o simulado en falla, se pide un análisis y se comprueba que queda fallido con un mensaje claro, que no deja nada en proceso y que se puede reintentar.

**Acceptance Scenarios**:

1. **Given** el modelo apagado o inaccesible, **When** se pide un análisis, **Then** el análisis queda fallido, la pantalla explica que el análisis no está disponible en este momento y se puede pedir uno nuevo.
2. **Given** un modelo que rechaza la entrada, **When** se pide el análisis, **Then** queda fallido con un mensaje que indica que el estudio no pudo ser analizado, sin repetir valores del estudio.
3. **Given** un modelo que no responde en un tiempo razonable, **When** se agota ese tiempo, **Then** el análisis queda fallido por demora y se puede reintentar.
4. **Given** un análisis que quedó «en proceso» más allá del tiempo máximo (por ejemplo, porque el servidor se reinició), **When** se abre el estudio, **Then** se lo marca como fallido y se puede pedir uno nuevo.
5. **Given** un análisis fallido, **When** se mira el historial, **Then** figura como fallido con la fecha y no tiene resultado.

---

### User Story 4 - Historial y uno en curso a la vez (Priority: P2)

La pantalla del estudio lista sus análisis del más reciente al más antiguo, con su estado, y permite abrir el resultado de cada uno. Mientras hay un análisis en curso no se puede pedir otro. Pedir uno nuevo no borra los anteriores.

**Why this priority**: da trazabilidad (qué modelo produjo qué resultado y cuándo) y evita duplicar costo, pero el primer análisis ya aporta valor sin el historial.

**Independent Test**: se piden varios análisis sobre un mismo estudio y se comprueba el orden de la lista, que cada resultado se abre y que no se acepta un segundo pedido mientras otro está en curso.

**Acceptance Scenarios**:

1. **Given** un estudio con varios análisis, **When** se abre su pantalla, **Then** se listan del más reciente al más antiguo con su estado y la fecha, y cada uno se puede abrir.
2. **Given** un análisis en curso, **When** se intenta pedir otro, **Then** el botón no está disponible o el pedido se rechaza con un mensaje, y no se crea un segundo análisis.
3. **Given** un análisis completado o fallido, **When** se pide uno nuevo, **Then** se crea uno nuevo y los anteriores se conservan intactos.
4. **Given** dos pedidos simultáneos sobre el mismo estudio, **When** se procesan, **Then** solo uno crea un análisis.

---

### User Story 5 - Eliminar un estudio con análisis (Priority: P2)

Un estudio con un análisis en curso no se puede eliminar. Al eliminar un estudio sin análisis en curso se eliminan también todos sus análisis.

**Why this priority**: cierra el punto de extensión que dejó la 006 y evita resultados huérfanos de un estudio que ya no existe, pero no es parte del recorrido principal.

**Independent Test**: se intenta eliminar un estudio con un análisis en curso (se rechaza) y otro con análisis terminados (se elimina junto con ellos).

**Acceptance Scenarios**:

1. **Given** un estudio con un análisis en curso, **When** quien lo cargó intenta eliminarlo, **Then** se rechaza con un mensaje claro y no se borra nada.
2. **Given** un estudio con análisis completados o fallidos, **When** quien lo cargó lo elimina, **Then** el estudio y todos sus análisis dejan de existir.

### Edge Cases

- El modelo responde con las 12 probabilidades pero con un valor fuera de 0 a 1 o ausente: el análisis falla y no se muestra un resultado parcial.
- El archivo del estudio no existe o está dañado cuando se pide el análisis: no se llama al modelo y el análisis falla con un mensaje claro (la onda no está disponible).
- Dos personas con acceso piden análisis al mismo tiempo sobre el mismo estudio: solo se crea uno.
- La persona cierra la pantalla mientras el análisis está en curso: el análisis termina igual y su resultado está al volver a abrir el estudio.
- Una persona sin acceso adivina el identificador de un análisis: no se distingue de uno inexistente.
- El modelo devuelve su nombre o versión distintos de los esperados: se registran los que el modelo informó, para que la trazabilidad refleje lo que realmente produjo el resultado.
- Pantalla muy angosta: las 12 filas de probabilidades siguen siendo legibles, una debajo de otra.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La pantalla de un estudio MUST ofrecer «Analizar estudio» solo a las personas con acceso al estudio (paciente dueño o médico con asignación vigente) y solo cuando no hay un análisis en curso.
- **FR-002**: Cada pedido MUST registrar un análisis propio sobre el estudio con su estado (pendiente, en proceso, completado o fallido), quién lo solicitó, cuándo, y el modelo y la versión que lo produjeron. Un estudio MUST poder tener varios análisis y pedir uno nuevo NO MUST borrar los anteriores.
- **FR-003**: La plataforma MUST enviar al modelo la onda y las siete variables del estudio guardado, leídas en el servidor. El navegador NO MUST recibir las siete variables ni la clave del archivo.
- **FR-004**: Un análisis completado MUST mostrar las 12 probabilidades con su nombre en español, en el orden fijo del contrato (fracción del ventrículo izquierdo reducida, hipertrofia del ventrículo izquierdo, estenosis aórtica, insuficiencia aórtica, insuficiencia mitral, insuficiencia tricuspídea, insuficiencia pulmonar, disfunción sistólica del ventrículo derecho, derrame pericárdico, presión pulmonar elevada, velocidad de regurgitación tricuspídea elevada y el compuesto de cardiopatía estructural), destacando el compuesto.
- **FR-005**: Cada valor MUST mostrarse como porcentaje escrito y con una barra, de modo que no dependa solo del color. NO MUST haber umbrales, etiquetas de sí o no ni clasificación.
- **FR-006**: Todo resultado MUST ir acompañado de una advertencia permanente que diga que son probabilidades estimadas por un modelo de investigación, que pueden no estar calibradas, que se leen como un indicador relativo de riesgo y que son posibles hallazgos de apoyo clínico y no un diagnóstico, y MUST mostrar el modelo, su versión y la fecha del análisis.
- **FR-007**: La pantalla del estudio MUST listar sus análisis del más reciente al más antiguo, con estado y fecha, y MUST permitir abrir el resultado de cada uno.
- **FR-008**: MUST existir como máximo un análisis en curso por estudio. Un segundo pedido (incluso simultáneo) MUST rechazarse sin crear otro análisis.
- **FR-009**: Solo MUST poder pedir y ver análisis de un estudio el paciente dueño y los médicos con asignación vigente de ese paciente en la misma clínica. Un estudio o un análisis ajeno, de otra clínica o inexistente MUST dar el mismo resultado sin datos. Un administrador de clínica que no es médico MUST NO acceder. El acceso MUST evaluarse al pedir y al ver, con la asignación vigente en ese momento.
- **FR-010**: Si el modelo está apagado o inaccesible, rechaza la entrada, devuelve un resultado inválido, no responde a tiempo o falla internamente, el análisis MUST quedar fallido con un mensaje claro y sin detalles internos, y MUST poder pedirse uno nuevo.
- **FR-011**: Un análisis que permanezca en curso más allá de un tiempo máximo definido MUST marcarse como fallido, de modo que ninguno quede en proceso indefinidamente.
- **FR-012**: Si el archivo del estudio no existe o está dañado, el análisis MUST fallar con un mensaje claro sin llamar al modelo.
- **FR-013**: Un estudio con un análisis en curso MUST NO poder eliminarse, con un mensaje claro. Al eliminar un estudio sin análisis en curso, sus análisis MUST eliminarse junto con él.
- **FR-014**: Los registros de funcionamiento MUST NO incluir probabilidades, valores del estudio ni datos de la persona.
- **FR-015**: Los textos MUST NO usar lenguaje de diagnóstico: el resultado se presenta como posible hallazgo de apoyo clínico que requiere la evaluación de un profesional.
- **FR-016**: Las pantallas nuevas MUST cumplir las reglas de interfaz del proyecto: tokens de color, modo claro y oscuro, utilizables a 375, 768 y 1280 px sin desplazamiento horizontal de la página, uso completo con teclado, foco visible, y estados que no dependan solo del color.
- **FR-017**: En desarrollo y en las pruebas MUST poder reemplazarse el modelo real por uno simulado, sin acceso a AWS.

### Key Entities

- **Análisis**: una ejecución del modelo sobre un estudio. Pertenece a una clínica y a un estudio; tiene estado (pendiente, en proceso, completado o fallido), quién lo solicitó, fecha de pedido y de finalización, el modelo y la versión informados, el motivo de la falla si falló (en términos genéricos) y, si se completó, su resultado. Un estudio tiene muchos análisis.
- **Resultado**: las 12 probabilidades (valores de 0 a 1) de un análisis completado, en el orden fijo del contrato. Es parte del análisis y no existe sin él.
- **Estudio (existente, 006)**: sin cambios en lo que guarda; solo gana la relación con sus análisis y la regla de eliminación.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con un estudio sintético y un modelo simulado, el 100 % de los análisis llegan a completado con las 12 probabilidades en el orden del contrato, y el resultado se ve en la pantalla del estudio sin recargar manualmente.
- **SC-002**: Una persona con acceso pasa de abrir el estudio a ver el resultado en un solo pedido, y con el modelo simulado lo ve en menos de 5 segundos.
- **SC-003**: En las pruebas de acceso, el 100 % de los intentos de un paciente ajeno, un médico sin asignación vigente, una clínica distinta, un administrador sin rol médico y un identificador inexistente terminan sin datos y sin crear ningún análisis.
- **SC-004**: Con el modelo apagado, simulado en falla o con respuesta inválida, el 100 % de los pedidos termina en «fallido» con un mensaje claro, ninguno queda en proceso después del tiempo máximo y todos se pueden reintentar.
- **SC-005**: Dos pedidos simultáneos sobre el mismo estudio crean exactamente un análisis en el 100 % de las pruebas.
- **SC-006**: En ninguna respuesta que llega al navegador figuran las siete variables, la clave del archivo, ni mensajes con detalles internos del modelo o de AWS.
- **SC-007**: Todo resultado mostrado incluye la advertencia, el modelo, su versión y la fecha; ningún texto de la pantalla usa lenguaje de diagnóstico.
- **SC-008**: La pantalla con el resultado y el historial es utilizable a 375, 768 y 1280 px en modo claro y oscuro, sin desplazamiento horizontal, y todo el recorrido (pedir el análisis, leer el resultado y abrir uno del historial) se puede hacer solo con teclado.
- **SC-009**: Con el punto de inferencia real encendido por el responsable y un archivo sintético, el análisis llega a completado con las 12 probabilidades y el modelo y la versión que informa el contenedor.

## Assumptions

- Los estudios, el acceso, la lista y el visor de la onda son los de las funcionalidades 006 y 007 y se reutilizan sin cambios; esta funcionalidad agrega los análisis encima.
- Pueden pedir el análisis tanto el paciente como el médico con acceso; no hay un rol específico para analizar.
- El modelo es EchoNext-Mini de la 005, con el contrato de inferencia ya definido; el nombre y la versión que se guardan son los que el modelo informa en su respuesta.
- El punto de inferencia está apagado por defecto: hasta que el responsable lo enciende, los análisis reales fallan con el mensaje de modelo no disponible. Encenderlo y apagarlo no se hace desde la interfaz.
- El tiempo máximo de un análisis en curso es de unos minutos; el valor exacto se fija en el plan.
- La actualización del estado en la pantalla puede ocurrir al volver a cargar o con una consulta periódica mientras hay un análisis en curso; el mecanismo se decide en el plan.
- La migración de la base y el permiso de invocar el punto de inferencia (acotado a ese único punto, por la vía de administración) los aplica el responsable.
- Se prueba solo con archivos sintéticos; nunca con datos reales de pacientes. La validación clínica, la calibración y la revisión de licencia del modelo están fuera de alcance.
- Es un proyecto académico, sin uso comercial por ahora.
- Fuera de alcance: otros modelos o tipos de estudio; umbrales, calibración o clasificación; encender y apagar el punto de inferencia desde la interfaz; análisis automáticos al cargar un estudio; notificaciones; exportar o imprimir resultados; comparar análisis entre sí; eliminar análisis individuales; reanálisis programado; registro de pacientes y asignación de médicos desde la interfaz.
