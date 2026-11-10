# Feature Specification: Carga y almacenamiento de estudios de ECG

**Feature Branch**: `006-carga-estudios-ecg`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Carga y almacenamiento de estudios de ECG (funcionalidad 006): permitir que un paciente o su médico suba un electrocardiograma, que la plataforma lo valide y lo guarde de forma aislada por clínica y por paciente, y que luego lo vea en una lista. Es la base del visor de la onda (007) y del análisis con el modelo EchoNext-Mini (008)."

## Clarifications

### Session 2026-11-10

- Q: ¿Cómo reconoce el usuario cada estudio en la lista, si no se guarda el nombre del archivo? → A: Número correlativo más la fecha y hora de carga.
- Cambio de alcance pedido por el responsable: los estudios **pertenecen a un paciente** (ya no son anónimos). El paciente carga y ve sus propios estudios; el médico carga estudios de sus pacientes y ve a sus pacientes y los estudios de cada uno. Esto reemplaza el supuesto anterior de estudios anónimos y sin vínculo con un paciente.
- Q: ¿Cómo se resuelve que hoy no existe ninguna pantalla para registrar pacientes ni asignarles un médico? → A: La 006 incluye la lista de pacientes del médico y los estudios de cada uno, en solo lectura; los pacientes y las asignaciones se crean con un script de datos de prueba. Registrar pacientes y asignar médicos queda para otra funcionalidad.
- Q: ¿Qué puede ver un administrador de la clínica que no es médico? → A: Ningún estudio. Solo ven estudios el paciente dueño y los médicos con asignación vigente.
- Q: ¿Quién puede eliminar un estudio? → A: Solo quien lo cargó.
- Decisiones derivadas, a confirmar por el responsable: el número es correlativo **por paciente** (no por clínica, para que un paciente no deduzca cuántos estudios tiene la clínica); tamaño máximo de 2 MB comprimido y 20 MB descomprimido; la lista va paginada, del más reciente al más antiguo y sin filtros; el estudio solo tiene el estado "cargado" porque el estado del proceso vive en cada análisis; si una asignación termina, el médico pierde el acceso a los estudios del paciente (incluso los que cargó), que siguen siendo del paciente.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - El paciente sube un estudio y lo ve en su lista (Priority: P1)

Un paciente vinculado a una clínica entra a «Mis estudios», sube un archivo `.npz` con la onda y las siete variables del estudio, y al terminar lo ve en su lista.

**Why this priority**: es el flujo más corto de punta a punta y el que abre la puerta a las funcionalidades siguientes. Sin estudios guardados no hay nada que visualizar (007) ni analizar (008).

**Independent Test**: se puede probar sin el modelo ni el visor: un paciente de prueba sube un archivo válido y lo ve en su lista con su número, fecha de carga y estado.

**Acceptance Scenarios**:

1. **Given** un paciente vinculado con sesión en su clínica, **When** sube un archivo válido, **Then** el estudio queda guardado a su nombre, aparece en su lista con número, fecha y hora de carga y estado "cargado", y recibe una confirmación.
2. **Given** dos pacientes de la misma clínica, **When** uno sube un estudio, **Then** el otro no lo ve.
3. **Given** un estudio guardado, **When** se revisa lo que conserva la plataforma, **Then** no figura el nombre del archivo subido ni los campos adicionales que traía.

---

### User Story 2 - El médico sube y consulta estudios de sus pacientes (Priority: P1)

Un médico ve la lista de los pacientes que tiene asignados, entra a uno de ellos, ve los estudios de ese paciente y puede subir uno nuevo a su nombre.

**Why this priority**: es el uso clínico principal de la plataforma. Sin esto, el médico no puede trabajar con los estudios de quienes atiende.

**Independent Test**: con un médico y dos pacientes asignados y uno sin asignar, el médico ve solo a los dos asignados, sube un estudio a uno y lo ve en la lista de ese paciente.

**Acceptance Scenarios**:

1. **Given** un médico con pacientes asignados, **When** abre «Mis pacientes», **Then** ve solo a los pacientes con una asignación vigente con él, en una lista paginada.
2. **Given** un paciente asignado, **When** el médico lo abre, **Then** ve los estudios de ese paciente, incluidos los que cargó el propio paciente.
3. **Given** un paciente asignado, **When** el médico sube un archivo válido, **Then** el estudio queda a nombre de ese paciente y aparece en su lista.
4. **Given** un paciente que el médico no tiene asignado, **When** el médico intenta verlo, subirle un estudio o ver sus estudios, **Then** se rechaza.
5. **Given** una asignación que terminó, **When** el médico abre al paciente, **Then** ya no tiene acceso, y los estudios que haya cargado siguen siendo del paciente.

---

### User Story 3 - Rechazar archivos inválidos con un motivo claro (Priority: P1)

Si el archivo no cumple los requisitos del electrocardiograma, quien lo sube ve un mensaje que explica qué falla y no se guarda nada.

**Why this priority**: un estudio mal formado que llegue a la lista rompería el visor y el análisis. La validación en la entrada es parte del núcleo, no un extra.

**Independent Test**: se suben archivos con un defecto cada uno (formato incorrecto, demasiado grande, onda con otra forma, falta un campo, valores no finitos, variable fuera de rango, sexo distinto de 0 o 1, contenido que intenta ejecutar código) y se comprueba que cada uno se rechaza, con un motivo claro, y que la lista y el almacenamiento quedan sin cambios.

**Acceptance Scenarios**:

1. **Given** un archivo que no es `.npz` o que supera el tamaño máximo, **When** se sube, **Then** se rechaza con un mensaje que indica el motivo y no se guarda nada.
2. **Given** un `.npz` al que le falta la onda o las variables, o cuya onda no tiene 2500 muestras por 12 derivaciones, **When** se sube, **Then** se rechaza y el mensaje nombra el campo y la forma esperada.
3. **Given** un `.npz` con valores no finitos, variables fuera de rango o sexo distinto de 0 o 1, **When** se sube, **Then** se rechaza sin repetir en el mensaje los valores del estudio.
4. **Given** un archivo que contiene objetos serializados capaces de ejecutar código, **When** se sube, **Then** se rechaza sin ejecutar nada de su contenido.
5. **Given** cualquier rechazo, **When** se revisan los registros del sistema, **Then** no contienen datos del estudio.

---

### User Story 4 - Aislamiento entre clínicas y entre pacientes (Priority: P1)

Cada persona ve solo lo que le corresponde: el paciente, sus propios estudios; el médico, los de sus pacientes asignados; el administrador sin rol de médico, ningún estudio. Nada es accesible desde otra clínica ni adivinando identificadores.

**Why this priority**: el aislamiento entre clínicas es una regla no negociable del producto, y los estudios de un paciente son datos clínicos suyos. Un estudio visible para quien no corresponde es una falla de seguridad, no un defecto menor.

**Independent Test**: con dos clínicas, pacientes y médicos en cada una, se intenta ver, listar, subir y eliminar con las identidades y los identificadores equivocados, y se comprueba que todos los intentos son rechazados y no cambian nada.

**Acceptance Scenarios**:

1. **Given** estudios de varios pacientes de las clínicas A y B, **When** un paciente de A abre su lista, **Then** ve solo los suyos.
2. **Given** el identificador de un estudio de otro paciente o de otra clínica, **When** alguien sin derecho intenta consultarlo o eliminarlo, **Then** se rechaza y el estudio no cambia.
3. **Given** una solicitud de carga, **When** el cliente envía un identificador de clínica o de paciente que no le corresponde, **Then** se rechaza o se ignora: el estudio solo se guarda a nombre del paciente de la sesión o de un paciente asignado al médico.
4. **Given** un administrador de la clínica que no es médico, **When** abre las pantallas de estudios, **Then** no ve ningún estudio.
5. **Given** una persona sin sesión, **When** intenta subir, listar o eliminar, **Then** se rechaza.

---

### User Story 5 - Eliminar un estudio (Priority: P2)

Quien cargó un estudio puede eliminarlo: desaparece de la lista y se borra de verdad el registro y el archivo, sin papelera.

**Why this priority**: permite corregir cargas equivocadas y retirar datos de prueba. No bloquea las funcionalidades siguientes, por eso va después.

**Independent Test**: se elimina un estudio propio y se comprueba que ya no figura en la lista, que su archivo ya no existe en el almacenamiento y que no se puede recuperar; y que no se puede eliminar uno cargado por otra persona.

**Acceptance Scenarios**:

1. **Given** un estudio cargado por el paciente, **When** el paciente lo elimina tras confirmar, **Then** desaparece de su lista y de la de sus médicos, y su archivo se borra.
2. **Given** un estudio cargado por un médico, **When** el paciente intenta eliminarlo, **Then** se rechaza; y a la inversa, un médico no puede eliminar uno que cargó el paciente ni uno que cargó otro médico.
3. **Given** una eliminación en curso, **When** falla el borrado del archivo, **Then** el usuario recibe un aviso y el sistema no deja un estudio visible sin archivo ni un archivo huérfano sin registro que no pueda detectarse.
4. **Given** un estudio que otra funcionalidad ya haya analizado, **When** se elimina, **Then** también se eliminan sus análisis asociados, salvo que haya uno en curso, caso en que la eliminación se rechaza con un aviso (aplica cuando exista la 008).
5. **Given** un estudio eliminado, **When** se sube uno nuevo del mismo paciente, **Then** el número del estudio eliminado no se reutiliza.

---

### Edge Cases

- Se sube el mismo archivo dos veces: se guardan dos estudios distintos; la plataforma no detecta duplicados.
- La subida se corta a mitad de camino: no queda un estudio a medias en la lista ni un archivo huérfano.
- Se elige un tipo de estudio sin soporte: solo el electrocardiograma está disponible; los demás no se ofrecen.
- Dos personas suben archivos al mismo tiempo al mismo paciente: ambos se guardan, con números distintos.
- El archivo `.npz` es válido en forma pero su tamaño descomprimido es desproporcionado respecto del comprimido: se rechaza antes de expandirlo en memoria.
- Un `.npz` incluye campos adicionales además de los esperados: se ignoran y no se conservan.
- El almacenamiento no está disponible al guardar: quien sube recibe un aviso y no queda registro de un estudio inexistente.
- La lista de estudios o la de pacientes crece con el tiempo: sigue siendo usable con muchos elementos (se pagina).
- Un valor dudoso pero posible, como una edad muy alta: se acepta si cae dentro del rango razonable y se rechaza si lo excede.
- Un paciente cuyo vínculo con la clínica se revoca, o una membresía desactivada, o una clínica suspendida: pierde el acceso a los estudios hasta que el vínculo vuelva a estar vigente; los estudios no se borran.
- Una persona es a la vez administradora y médica: actúa como médica para los estudios y ve solo a sus pacientes asignados.
- Una persona tiene vínculos en varias clínicas: ve y carga estudios solo en la clínica activa de su sesión.
- Un médico con una asignación terminada que volvió a asignarse: recupera el acceso con la nueva asignación a los estudios del paciente, incluidos los que cargó antes.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Un paciente vinculado DEBE poder subir, de a uno por vez, un archivo `.npz` de electrocardiograma a su propio nombre, eligiendo explícitamente el tipo de estudio.
- **FR-002**: Un médico DEBE poder subir un archivo `.npz` de electrocardiograma a nombre de un paciente que tenga asignado con una asignación vigente, eligiendo explícitamente el tipo de estudio.
- **FR-003**: El archivo DEBE traer la onda de 2500 muestras por 12 derivaciones y siete variables tabulares en este orden: sexo (0 mujer, 1 hombre), edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS y QT corregido, según el contrato de entrada de la 005.
- **FR-004**: La plataforma DEBE validar el archivo antes de guardarlo: formato, tamaño máximo (2 MB comprimido y 20 MB descomprimido), presencia y forma de la onda y de las variables, valores finitos, rango razonable de cada variable y sexo igual a 0 o 1. Un archivo inválido DEBE rechazarse sin guardar nada.
- **FR-005**: La plataforma DEBE leer el `.npz` sin ejecutar código ni deserializar objetos del archivo, y DEBE limitar el tamaño que alcanza al descomprimirse.
- **FR-006**: Los mensajes de rechazo del archivo DEBEN indicar qué requisito falla y cuál es el valor esperado, y NO DEBEN repetir valores del estudio.
- **FR-007**: Cada estudio DEBE guardarse asociado a un paciente de la clínica activa de la sesión y a la persona que lo cargó. La clínica, el paciente y quien carga se obtienen del contexto autenticado y de las asignaciones vigentes, nunca de datos enviados por el cliente: el paciente solo puede cargar a su propio nombre y el médico solo a nombre de un paciente asignado.
- **FR-008**: La plataforma NO DEBE conservar ni mostrar el nombre del archivo subido ni los campos adicionales que traiga. Lo único que conserva del archivo es la onda y las siete variables.
- **FR-009**: Los archivos DEBEN guardarse en un almacenamiento privado, cifrado y sin acceso público, con separación por clínica. La separación por clínica NO DEBE ser la única barrera: el acceso se autoriza en cada operación.
- **FR-010**: Cada estudio DEBE tener un estado propio, hoy solo "cargado". El estado del proceso de análisis vive en cada análisis, no en el estudio, de modo que la funcionalidad 008 agregue los análisis sin cambiar este modelo. Un estudio puede tener varios análisis a lo largo del tiempo.
- **FR-011**: Un paciente vinculado DEBE poder ver la lista de sus propios estudios, con número, fecha y hora de carga, estado y quién lo cargó (él mismo o su médico), ordenada del más reciente al más antiguo, paginada y sin filtros.
- **FR-011a**: Cada estudio DEBE recibir al guardarse un número correlativo dentro de su paciente (1, 2, 3…), único para ese paciente, asignado aun cuando dos personas suban al mismo tiempo y nunca reutilizado tras una eliminación. Es la forma de identificar un estudio en la lista, ya que no se conserva el nombre del archivo.
- **FR-012**: Un médico DEBE poder ver la lista paginada de los pacientes que tiene asignados con una asignación vigente, con los datos que la clínica ya tiene registrados de cada uno (nombre y documento), y abrir a cada uno para ver sus estudios, con los mismos datos y orden del requisito anterior.
- **FR-013**: Solo ven estudios el paciente dueño y los médicos con una asignación vigente con él. Un administrador de la clínica que no es médico NO DEBE ver ningún estudio. Al terminar la asignación, el médico pierde el acceso a los estudios del paciente, incluidos los que cargó.
- **FR-014**: Todo acceso a un estudio o a una lista (listar, consultar, cargar, eliminar) DEBE verificar autenticación, autorización, pertenencia a la clínica y relación con el paciente. Un acceso sin derecho DEBE rechazarse sin cambiar ningún dato.
- **FR-015**: Quien cargó un estudio DEBE poder eliminarlo tras una confirmación explícita, y solo esa persona (y mientras conserve el acceso al estudio). La eliminación DEBE borrar el registro y el archivo de forma definitiva, sin papelera, y DEBE eliminar también los análisis del estudio. NO DEBE permitirse mientras el estudio tenga un análisis en curso (aplica desde la 008).
- **FR-016**: Una carga o una eliminación fallida a mitad de camino NO DEBE dejar un estudio visible sin archivo ni un archivo guardado sin registro que pase inadvertido.
- **FR-017**: La plataforma NO DEBE registrar en logs, errores ni mensajes los datos del estudio (onda, variables, contenido del archivo).
- **FR-018**: La interfaz DEBE funcionar en móvil, tablet y escritorio, en modo claro y oscuro, con navegación por teclado, foco visible y estados que no dependan solo del color.
- **FR-019**: Los textos de la interfaz DEBEN estar en español y NO DEBEN presentar un estudio como diagnóstico ni anticipar resultados que dependan de la 008.
- **FR-020**: Para poder probar, DEBE existir un script de datos de prueba que cree una clínica, un administrador, médicos, pacientes vinculados y asignaciones. Registrar pacientes y asignar médicos desde la interfaz queda fuera de esta funcionalidad.

### Key Entities *(include if feature involves data)*

- **Estudio**: material médico cargado a nombre de un paciente de una clínica. Tiene tipo (electrocardiograma por ahora), estado, número correlativo dentro del paciente, fecha y hora de carga, la clínica, el paciente, la persona que lo cargó y la referencia a su archivo guardado. Puede tener varios análisis (los agrega la 008).
- **Archivo del estudio**: el contenido validado del `.npz` (la onda y las siete variables, nada más), guardado en un formato propio de la plataforma, de forma privada y cifrada, con separación por clínica. No conserva el nombre original ni los campos adicionales del archivo subido.
- **Paciente**: persona registrada en una clínica, ya definida en la 001. Dueña de sus estudios.
- **Asignación médico-paciente**: relación vigente entre un médico y un paciente, ya definida en la 001. Da al médico acceso a los estudios del paciente mientras dure.
- **Clínica**: espacio de trabajo propio, ya definido en la 001. Es la frontera de aislamiento de los estudios.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un paciente o un médico sube un estudio válido y lo ve en la lista correspondiente en menos de 10 segundos.
- **SC-002**: El 100 % de los archivos de un conjunto de prueba con un defecto cada uno (como mínimo: formato, tamaño, forma, campo faltante, valores no finitos, rango, sexo y contenido ejecutable) se rechaza, sin dejar estudios ni archivos guardados.
- **SC-003**: Los mensajes de rechazo nombran el requisito incumplido en el 100 % de los casos y no contienen valores del estudio.
- **SC-004**: En una prueba con dos clínicas, pacientes, médicos y un administrador, el 100 % de los intentos de listar, consultar, cargar o eliminar fuera de lo permitido es rechazado, incluso con identificadores exactos, y no modifica datos.
- **SC-005**: Tras eliminar un estudio, no queda rastro de su registro ni de su archivo.
- **SC-006**: Ninguna fila del registro de actividad del sistema, tras una tanda de cargas válidas y rechazadas, contiene datos del estudio.
- **SC-007**: La lista de estudios de un paciente y la de pacientes de un médico siguen siendo usables con 500 elementos.
- **SC-008**: Un médico ve exactamente a los pacientes con asignación vigente: ni uno más ni uno menos, incluso tras terminar o reiniciar asignaciones.

## Assumptions

- **Roles**: los estudios los cargan y los ven pacientes vinculados y médicos. El «médico» es una membresía activa con rol de médico. Un administrador de la clínica que no es médico no ve estudios. No se distinguen otros roles.
- **Paciente vinculado**: solo un paciente en estado vinculado y con cuenta puede usar la plataforma; los pacientes pendientes o con vínculo revocado no cargan ni ven estudios, y un médico solo puede cargar a nombre de pacientes vinculados.
- **Datos de pacientes y asignaciones**: ya existen en el modelo de la 001; esta funcionalidad no los crea desde la interfaz. Para probar se usa un script de datos de prueba.
- **Datos que se muestran del paciente**: los que la clínica ya tiene en el registro (nombre y documento); esta funcionalidad no agrega ni cambia datos personales.
- **Un archivo por vez**: no hay carga masiva.
- **Eliminación definitiva**: borra el registro y el archivo; no hay papelera ni recuperación.
- **Formato de entrada**: el `.npz` trae los arreglos ya preprocesados, tal como vienen en el conjunto EchoNext-Mini (onda ya normalizada y variables ya estandarizadas), según el contrato de la 005. No se lee XML ni se preprocesa señal cruda.
- **Rangos razonables**: se fijan en el plan, a partir del contrato de la 005. Deben ser lo bastante amplios para aceptar cualquier estudio del conjunto de prueba. El tamaño máximo ya está definido en FR-004 (un estudio real ocupa unos 120 KB).
- **Datos**: proyecto académico, sin uso comercial; solo se usan datos de prueba del conjunto de datos asociados a pacientes de prueba, nunca pacientes reales. Los plazos de conservación se definirán antes de operar con datos reales.
- **Tipo de estudio**: solo el electrocardiograma está disponible, pero la selección explícita del tipo se mantiene para no cambiar el flujo cuando se sumen otras modalidades.
- **Permisos de AWS**: los que haga falta sumar para el almacenamiento de estudios se aplican por la vía de administración ya documentada.
- **Dependencias**: clínicas, personal, pacientes y asignaciones provienen de las funcionalidades 001 a 003; el contrato de entrada, de la 005.

## Out of Scope

- El visor de la onda (007).
- El análisis con el modelo y la pantalla de resultados (008).
- Registrar pacientes y asignar médicos desde la interfaz, e invitar o vincular cuentas de pacientes.
- La historia clínica y cualquier dato clínico del paciente más allá de sus estudios.
- La inferencia por uso (sin servidor).
- La lectura de XML de electrocardiógrafos y el preprocesamiento desde la señal cruda.
- Otros tipos de estudio además del electrocardiograma.
- La detección de duplicados y la carga masiva.
- La validación clínica.
