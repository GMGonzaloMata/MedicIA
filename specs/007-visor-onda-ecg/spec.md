# Feature Specification: Visor de la onda de un estudio de ECG

**Feature Branch**: `007-visor-onda-ecg`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Visor de la onda de un estudio de ECG (funcionalidad 007): permitir ver la onda de un estudio de electrocardiograma ya guardado por la funcionalidad 006, con las 12 derivaciones durante 10 segundos, de forma clara y legible en escritorio, tablet y móvil. Es el paso previo al análisis con el modelo (008)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Ver las 12 derivaciones de un estudio (Priority: P1)

Un paciente abre uno de sus estudios desde «Mis estudios», o un médico abre un estudio de un paciente asignado desde la lista de estudios de ese paciente, y ve la onda completa: las 12 derivaciones (I, II, III, aVR, aVL, aVF, V1 a V6), cada una con su nombre, sobre una cuadrícula y con el eje de tiempo en segundos.

**Why this priority**: es el valor central de la funcionalidad. Hoy un estudio es solo una fila de la lista; quien lo cargó no puede comprobar que se guardó lo esperado. Sin esta pantalla no hay contexto donde mostrar el análisis de la 008.

**Independent Test**: se carga el archivo sintético de `make_synthetic.py`, se abre el estudio desde la lista y se comprueba que aparecen las 12 derivaciones con sus nombres, la cuadrícula, el eje de tiempo de 0 a 10 segundos y la forma de latidos esperada. No requiere el modelo.

**Acceptance Scenarios**:

1. **Given** un paciente con un estudio guardado, **When** lo abre desde su lista, **Then** ve las 12 derivaciones con su nombre, una cuadrícula y el eje de tiempo en segundos.
2. **Given** un médico con un paciente asignado que tiene estudios, **When** abre uno desde la lista de estudios de ese paciente, **Then** ve la misma onda, incluso si el estudio lo cargó el paciente.
3. **Given** la pantalla del estudio, **When** se la lee, **Then** muestra el número del estudio, la fecha y hora de carga, quién lo cargó y el nombre del paciente (este último solo donde corresponde por el acceso).
4. **Given** la onda en pantalla, **When** se la lee, **Then** aclara que está normalizada y sin unidades de milivolts, y no muestra amplitudes en mV ni simula papel milimetrado calibrado.
5. **Given** un estudio abierto, **When** se mira la lista de la que se vino, **Then** cada estudio tenía un vínculo para abrirlo y desde el estudio se puede volver a la lista.

---

### User Story 2 - Ampliar una derivación con zoom y desplazamiento (Priority: P2)

Quien mira el estudio cambia de la vista de las 12 derivaciones juntas a una vista ampliada de una sola derivación, y se acerca y se desplaza horizontalmente por el tiempo, con teclado o con gestos táctiles.

**Why this priority**: con las 12 derivaciones juntas en un móvil los latidos son chicos. Ampliar una derivación permite revisar la forma de la onda con detalle, pero la vista completa ya aporta valor por sí sola.

**Independent Test**: se abre un estudio, se elige una derivación, se acerca y se recorre el tiempo solo con teclado, y se repite con gestos táctiles en un dispositivo móvil.

**Acceptance Scenarios**:

1. **Given** la vista de las 12 derivaciones, **When** se elige una derivación, **Then** se muestra ampliada con su nombre y se puede volver a la vista de las 12.
2. **Given** una derivación ampliada, **When** se acerca o se aleja con el teclado, **Then** cambia la cantidad de tiempo visible y el eje de tiempo se actualiza.
3. **Given** una derivación acercada, **When** se desplaza en el tiempo con el teclado o con un gesto táctil, **Then** se ve otro tramo de la onda y el eje de tiempo lo refleja, sin salirse del rango de 0 a 10 segundos.
4. **Given** un dispositivo táctil, **When** se hace el gesto de pellizco o de arrastre horizontal, **Then** se acerca o se desplaza igual que con el teclado.

---

### User Story 3 - Acceso restringido y estados claros (Priority: P1)

Solo ven la onda el paciente dueño del estudio y los médicos con asignación vigente. Cualquier otro caso, y cualquier falla al leer el archivo, se resuelve con un mensaje claro y sin exponer datos.

**Why this priority**: es información clínica de una persona. El aislamiento por clínica y por paciente es una regla no negociable de la plataforma, y los estados de error evitan una pantalla vacía o rota.

**Independent Test**: con cuentas de prueba de dos clínicas, pacientes y médicos con y sin asignación, se intenta abrir el mismo estudio desde cada una y se comprueba que solo ven la onda las permitidas; además se fuerzan los casos de estudio sin archivo y de archivo ilegible.

**Acceptance Scenarios**:

1. **Given** un estudio de otro paciente, **When** un paciente intenta abrirlo, **Then** no ve datos y recibe el mismo resultado que si el estudio no existiera.
2. **Given** un estudio de un paciente que el médico no tiene asignado, o cuya asignación terminó, **When** el médico intenta abrirlo, **Then** no ve datos.
3. **Given** un estudio de otra clínica, **When** un usuario intenta abrirlo, **Then** no ve datos.
4. **Given** un administrador de clínica que no es médico, **When** intenta abrir un estudio, **Then** no ve datos.
5. **Given** un identificador de estudio inexistente, **When** se intenta abrirlo, **Then** el resultado es indistinguible del caso de un estudio ajeno.
6. **Given** un estudio cuyo archivo ya no existe (por ejemplo, tras una falla de limpieza) o no se puede leer, **When** se lo abre, **Then** se muestra un mensaje claro de que la onda no está disponible, sin detalles internos, y se puede volver a la lista.
7. **Given** la lectura de la onda en curso, **When** todavía no terminó, **Then** se muestra un estado de carga.

---

### User Story 4 - Uso accesible y en cualquier pantalla (Priority: P2)

La pantalla se puede usar completa con teclado, con foco visible, tiene una alternativa textual de la onda, contrasta bien en modo claro y oscuro, no depende del color para entender la información y se adapta a móvil, tablet y escritorio.

**Why this priority**: la constitución del proyecto exige interfaz responsiva y accesible. Se puede entregar la visualización antes y pulir esto después, pero no dar la funcionalidad por terminada sin ello.

**Independent Test**: se abre un estudio a 375, 768 y 1280 px de ancho, en modo claro y oscuro, y se completa todo el recorrido solo con teclado; se revisa que el resumen textual esté disponible para lectores de pantalla.

**Acceptance Scenarios**:

1. **Given** cualquiera de los tres anchos, **When** se abre un estudio, **Then** no hay desplazamiento horizontal de la página y la onda es legible.
2. **Given** el modo claro y el modo oscuro, **When** se abre un estudio, **Then** las derivaciones, la cuadrícula y los textos mantienen un contraste suficiente.
3. **Given** un uso solo con teclado, **When** se recorre la pantalla, **Then** todos los controles son alcanzables, tienen foco visible y se pueden operar sin ratón.
4. **Given** un lector de pantalla, **When** se llega a la onda, **Then** hay un resumen textual con las derivaciones, la duración y la frecuencia de muestreo.
5. **Given** la onda dibujada, **When** se la mira sin distinguir colores, **Then** sigue siendo comprensible porque cada derivación está identificada por su nombre.

### Edge Cases

- Un estudio de la 006 siempre tiene 12 derivaciones, 2.500 muestras (10 s a 250 Hz) y valores finitos dentro de los límites validados; si el archivo guardado no cumple el formato (corrupto, firma o tamaño incorrectos), se trata como «onda no disponible».
- Un estudio eliminado mientras otra persona lo tiene abierto: al recargar, se muestra como inexistente.
- Una derivación plana (señal constante) o con valores extremos: se dibuja igual, con una escala que no oculte el resto de las derivaciones.
- Zoom en el máximo o el mínimo, o desplazamiento más allá de los extremos: se detiene en el límite sin error.
- El estudio se abre con una asignación que termina entre la lista y el clic: se aplica la regla de acceso vigente en el momento de abrir.
- Pantalla muy angosta o texto ampliado por el usuario: las 12 derivaciones siguen siendo legibles, apiladas o con la vista ampliada como alternativa.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La plataforma MUST permitir abrir un estudio desde cada fila de la lista de estudios del paciente y de la lista de estudios de un paciente del médico, con un vínculo por estudio.
- **FR-002**: La pantalla del estudio MUST mostrar las 12 derivaciones (I, II, III, aVR, aVL, aVF, V1 a V6), cada una con su nombre, sobre una cuadrícula, con el eje de tiempo en segundos (0 a 10 s).
- **FR-003**: La pantalla MUST permitir alternar entre la vista de las 12 derivaciones juntas y una vista ampliada de una sola derivación.
- **FR-004**: En la vista ampliada, quien mira MUST poder acercar, alejar y desplazarse horizontalmente en el tiempo, tanto con teclado como con gestos táctiles, sin salir del rango del estudio.
- **FR-005**: La pantalla MUST aclarar que la onda está normalizada y no tiene unidades de milivolts, y NO MUST mostrar amplitudes en mV ni simular papel milimetrado calibrado.
- **FR-006**: La pantalla MUST mostrar el número del estudio, su fecha y hora de carga, quién lo cargó y el nombre del paciente, según lo que el acceso de quien mira permita ver.
- **FR-007**: Solo MUST poder ver la onda de un estudio el paciente dueño y los médicos con asignación vigente de ese paciente en la misma clínica. Un estudio ajeno, de otra clínica, de un paciente sin asignación vigente, o inexistente MUST dar el mismo resultado sin datos. Un administrador de clínica que no es médico MUST NO acceder.
- **FR-008**: La lectura y decodificación del archivo guardado MUST ocurrir en el servidor. El navegador NO MUST recibir la clave del objeto ni acceder directo al almacenamiento; solo recibe la onda del estudio autorizado.
- **FR-009**: El acceso MUST evaluarse al abrir el estudio con la asignación vigente en ese momento, no con la que había al listar.
- **FR-010**: La pantalla MUST mostrar un estado de carga mientras se lee la onda, un estado de error claro y sin detalles internos si la lectura falla, y un estado de «onda no disponible» para un estudio sin archivo o con archivo ilegible, y MUST ofrecer volver a la lista en todos los casos.
- **FR-011**: La pantalla MUST poder usarse por completo con teclado, con foco visible en todos los controles.
- **FR-012**: La pantalla MUST ofrecer una alternativa textual de la onda con un resumen: derivaciones, duración y frecuencia de muestreo.
- **FR-013**: La pantalla MUST mantener contraste suficiente en modo claro y oscuro, y NO MUST depender solo del color para distinguir la información.
- **FR-014**: La pantalla MUST ser utilizable a 375, 768 y 1280 px de ancho, sin desplazamiento horizontal de la página.
- **FR-015**: Los textos MUST NO usar lenguaje de diagnóstico ni interpretar la señal: es una visualización, no un análisis.
- **FR-016**: La funcionalidad MUST NO descargar ni exponer ningún archivo original, ni mostrar las siete variables tabulares, ni permitir editar o filtrar la señal.

### Key Entities

- **Estudio (existente, 006)**: pertenece a un paciente y a una clínica; tiene número correlativo por paciente, fecha y hora de carga, quién lo cargó y la referencia al archivo guardado. Esta funcionalidad solo lo lee.
- **Onda del estudio**: las 12 derivaciones por 2.500 muestras (10 s a 250 Hz), normalizada y sin unidades, leída del formato guardado por la 006. No se persiste de nuevo ni se modifica.
- **Derivación**: una de las 12 series de la onda, identificada por su nombre (I, II, III, aVR, aVL, aVF, V1 a V6).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Un estudio sintético cargado se ve con sus 12 derivaciones, la cuadrícula y el eje de 0 a 10 s, y la forma de los latidos coincide con la del archivo de origen en una comprobación visual del responsable.
- **SC-002**: Un usuario autorizado llega desde la lista a ver la onda en un solo clic y la ve completa en menos de 3 segundos en una conexión de oficina típica.
- **SC-003**: En las pruebas de acceso, el 100 % de los intentos de un paciente ajeno, un médico sin asignación vigente, una clínica distinta, un administrador sin rol médico y un identificador inexistente terminan sin recibir datos de la onda.
- **SC-004**: En ninguna respuesta que llega al navegador figuran la clave del objeto ni la ruta del almacenamiento.
- **SC-005**: El recorrido completo (abrir el estudio, cambiar de derivación, acercar, desplazarse y volver a la lista) se puede hacer solo con teclado, sin pérdida del foco visible.
- **SC-006**: La pantalla es utilizable a 375, 768 y 1280 px en modo claro y oscuro, sin desplazamiento horizontal de la página y con contraste que cumple el mínimo de accesibilidad exigido por el proyecto.
- **SC-007**: Los casos de estudio sin archivo y de archivo ilegible muestran un mensaje claro en el 100 % de las pruebas, sin pantalla vacía ni detalles internos.

## Assumptions

- Los estudios existentes en el formato guardado por la 006 son la única fuente; no se guarda el `.npz` original.
- Las reglas de acceso y el aislamiento por clínica y por paciente son las mismas de la 006 y se reutilizan sin cambios.
- La onda llega al navegador ya decodificada desde el servidor: unos 30.000 valores por estudio.
- El dibujo en el navegador es suficiente para 12 series de 2.500 puntos; no hay requisitos de rendimiento especiales más allá de la fluidez del zoom y el desplazamiento.
- Las siete variables tabulares no se muestran porque están estandarizadas y no son interpretables por una persona.
- Se prueba solo con archivos sintéticos; nunca con datos reales de pacientes.
- Es un proyecto académico, sin uso comercial por ahora.
- Fuera de alcance: el análisis con el modelo y sus resultados (008); mediciones, calibración en mV, anotaciones o marcadores; exportar o imprimir; comparar estudios; editar o filtrar la señal; ver las siete variables; estudios que no sean ECG.
