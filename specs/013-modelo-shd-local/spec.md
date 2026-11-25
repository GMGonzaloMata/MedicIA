# Feature Specification: Modelo SHD de cardiopatía estructural (etapa local)

**Feature Branch**: a definir por el responsable (la rama actual es `feat/vinculacion-clinica`)

**Feature Directory**: `specs/013-modelo-shd-local`

**Created**: 2026-11-25

**Status**: Draft

**Input**: Integrar el modelo SHD (fusión de ECG y seis variables de cabecera; posible cardiopatía estructural moderada o mayor) como nuevo análisis de MedicIA. Primera etapa solo en el entorno local de desarrollo, sin cambios en producción ni en SageMaker. SHD analiza un NPZ nuevo con variables crudas y los estudios PDF existentes. Con el NPZ crudo corre solo SHD; EchoNext-Mini sigue sin cambios con el formato `ecg1`. Los resultados son posibles hallazgos de apoyo clínico, nunca diagnósticos.

## User Scenarios & Testing *(mandatory)*

Los permisos no cambian: el paciente dueño y el médico con asignación vigente pueden cargar estudios y pedir análisis del paciente autorizado, siempre dentro de su clínica. La persona elige explícitamente el tipo de estudio, el formato y el análisis. En esta etapa todo el recorrido se prueba en el entorno local de desarrollo con datos de investigación (EchoNext), no con datos reales de pacientes.

### User Story 1 - Analizar un ECG digital con variables crudas (Priority: P1)

Un médico o paciente carga un ECG digital en el formato NPZ nuevo, que trae la señal de 12 derivaciones y las seis variables de cabecera en sus unidades reales (edad en años, sexo, frecuencia ventricular en latidos por minuto, PR, QRS y QTc en milisegundos), pudiendo faltar alguna. Pide el análisis SHD y ve el puntaje de posible cardiopatía estructural en la pantalla del estudio, con la versión del modelo que lo produjo.

**Why this priority**: es el camino más corto para comprobar que el modelo SHD funciona dentro de la plataforma con un archivo controlado, sin depender del lector de PDF.

**Independent Test**: con NPZ crudos armados a partir del conjunto de prueba de EchoNext y el servicio de inferencia local en marcha, cargar el estudio, pedir el análisis y comprobar que el puntaje mostrado coincide con el que da el paquete del modelo ejecutado por fuera para el mismo archivo.

**Acceptance Scenarios**:

1. **Given** un usuario autorizado y un NPZ crudo válido, **When** lo carga como ECG en el formato crudo, **Then** el estudio queda guardado para el paciente correcto y se puede ver su onda como cualquier otro ECG.
2. **Given** un estudio NPZ crudo, **When** el usuario pide el análisis SHD, **Then** el análisis pasa por los estados pendiente, en proceso y completado, y muestra un único puntaje de posible cardiopatía estructural, identificado como resultado de investigación del modelo SHD y su versión.
3. **Given** un NPZ crudo con una o más variables faltantes, **When** se analiza, **Then** el análisis se completa y el resultado indica qué variables faltaban, sin inventar sus valores en la pantalla.
4. **Given** un estudio NPZ crudo, **When** el usuario consulta los análisis disponibles, **Then** no se le ofrece EchoNext-Mini para ese estudio.
5. **Given** un estudio `ecg1` existente, **When** el usuario lo consulta o lo analiza, **Then** todo funciona igual que antes y no se le ofrece SHD.

---

### User Story 2 - Ver SHD en el informe de un ECG cargado como PDF (Priority: P2)

Un usuario carga un ECG en PDF, como ya puede hacerlo hoy, y pide el análisis integrado. Además de los resultados actuales, el informe incluye el puntaje de SHD calculado con la señal y las mediciones extraídas del PDF.

**Why this priority**: el PDF es el formato habitual en la práctica; depende de que el camino NPZ crudo ya haya demostrado que la integración del modelo funciona.

**Independent Test**: con PDFs sintéticos o de prueba autorizados y el servicio local en marcha, pedir el análisis integrado y comprobar que el informe muestra el resultado de SHD junto a los demás, con su procedencia.

**Acceptance Scenarios**:

1. **Given** un estudio PDF compatible, **When** el usuario pide el análisis integrado, **Then** el informe muestra el puntaje de SHD con el modelo y la versión que lo produjo, además de los resultados de los otros modelos disponibles.
2. **Given** un PDF cuyas mediciones no traen alguna de las seis variables, **When** se analiza, **Then** SHD se ejecuta igual, como en el caso NPZ, e informa qué variables faltaban.
3. **Given** que SHD falla o no está disponible, **When** terminan los demás componentes, **Then** el informe se publica con cobertura parcial explícita y SHD figura como no disponible o fallido, sin puntaje.
4. **Given** el informe con el indicador `shd` de EchoNext y el puntaje de SHD, **When** el usuario lo lee, **Then** [NEEDS CLARIFICATION: ¿se muestran ambos al mismo nivel, como las dos estimaciones de FEVI de la spec 010, o SHD reemplaza al `shd` de EchoNext?]

---

### User Story 3 - Preparar archivos NPZ crudos de prueba (Priority: P3)

El responsable genera NPZ crudos de prueba a partir del conjunto de prueba de EchoNext y de su metadata, con ejemplos con y sin cardiopatía estructural, para probar la carga y el análisis de punta a punta.

**Why this priority**: hace posible probar la historia 1 con datos reproducibles; no aporta valor clínico por sí sola.

**Independent Test**: generar un lote de archivos, cargarlos en el entorno local y verificar que todos superan la validación de carga.

**Acceptance Scenarios**:

1. **Given** la señal y la metadata de prueba de EchoNext, **When** el responsable genera los archivos, **Then** cada uno respeta el formato crudo y conserva las variables tal como figuran en la metadata, con el sexo convertido a la codificación del formato.
2. **Given** una fila de metadata con variables vacías, **When** se genera su archivo, **Then** esas variables quedan marcadas como faltantes, no como cero.

### Edge Cases

- El servicio de inferencia local no está en marcha o no responde a tiempo: el análisis termina como fallido con un mensaje claro y sin resultado clínico.
- El paquete del modelo no supera su verificación de integridad (pesos, preprocesamiento, protocolo o código alterados): el servicio no atiende pedidos y el análisis falla sin resultado.
- El NPZ crudo trae una variable fuera de rango fisiológico, un sexo distinto de femenino o masculino, valores no finitos o una señal con forma incorrecta: la carga se rechaza explicando la regla incumplida, sin repetir datos clínicos.
- Se intenta cargar como crudo un archivo con variables estandarizadas, o al revés: la marca de formato del archivo no coincide con el formato elegido y la carga se rechaza.
- Un PDF cuya señal no puede prepararse para SHD: SHD figura como no disponible para ese estudio y no se le envía una entrada supuesta.
- Se pide SHD dos veces sobre el mismo estudio: quedan dos análisis independientes, cada uno con su momento y versión de modelo.
- Un usuario de otra clínica intenta ver el estudio o su análisis: se rechaza como hoy.

## Requirements *(mandatory)*

### Functional Requirements

**Formato NPZ crudo**

- **FR-001**: El sistema DEBE aceptar un nuevo formato de ECG digital, distinto de `ecg1`, identificado por una marca de formato propia dentro del archivo, que contenga una señal de 12 derivaciones con la misma forma y cadencia que `ecg1` y las seis variables de cabecera en sus unidades reales.
- **FR-002**: El sistema DEBE validar las variables del formato crudo con rangos fisiológicos plausibles por variable (no con el límite de valores estandarizados de `ecg1`), aceptar variables faltantes y exigir que el sexo sea femenino, masculino o faltante.
- **FR-003**: El sistema DEBE rechazar un archivo cuya marca de formato no coincida con el formato elegido por el usuario, con un mensaje que no repita datos clínicos ni el nombre del archivo.
- **FR-004**: El formato `ecg1`, su validación, sus estudios existentes y el análisis de EchoNext-Mini sobre ellos NO DEBEN cambiar.

**Análisis SHD**

- **FR-005**: El usuario DEBE poder pedir explícitamente el análisis SHD sobre un estudio NPZ crudo. Sobre esos estudios NO DEBE ofrecerse EchoNext-Mini, y sobre los `ecg1` NO DEBE ofrecerse SHD.
- **FR-006**: El análisis integrado de un estudio PDF DEBE incluir SHD como un componente más, con la señal y las mediciones extraídas del PDF, sin cambiar los componentes existentes.
- **FR-007**: El sistema DEBE enviar al modelo las variables en sus unidades reales y la señal en la forma que el modelo espera para cada origen (digital para NPZ crudo, adaptada con máscara para PDF), y NO DEBE enviar valores supuestos en lugar de variables faltantes.
- **FR-008**: El resultado DEBE presentarse como un puntaje de investigación de posible cardiopatía estructural moderada o mayor, identificado con el modelo y su versión, indicando las variables faltantes, y NUNCA como diagnóstico. [NEEDS CLARIFICATION: ¿se muestra también la alerta del umbral experimental (0,743), o solo el puntaje, como hoy se muestran las probabilidades de EchoNext?]
- **FR-009**: Cada análisis SHD DEBE conservar su estudio, su resultado, el nombre y la versión exacta del modelo, las huellas del paquete del modelo y el momento de ejecución, y tener un estado explícito (pendiente, en proceso, completado o fallido).
- **FR-010**: Un análisis SHD fallido DEBE registrarse como fallido con su error y NO DEBE generar ni mostrar un resultado clínico.
- **FR-011**: El acceso a estudios y análisis SHD DEBE seguir las reglas actuales de autenticación, autorización y aislamiento por clínica.

**Ejecución local**

- **FR-012**: En esta etapa la inferencia de SHD DEBE ejecutarse en un servicio local que use el paquete del modelo sin modificar sus pesos, preprocesamiento ni umbral, y que verifique su integridad antes de atender pedidos.
- **FR-013**: La aplicación DEBE comunicarse con ese servicio a través de un adaptador intercambiable, de modo que la etapa posterior en SageMaker no requiera cambiar las reglas de negocio ni la interfaz.
- **FR-014**: Mientras el servicio local no esté configurado, SHD DEBE figurar como no disponible y no DEBE simular resultados. Las pruebas automatizadas DEBEN poder usar una inferencia simulada explícita.

### Key Entities

- **Estudio ECG con variables crudas**: estudio de un paciente con la señal de 12 derivaciones y las seis variables de cabecera en unidades reales, cualquiera puede faltar. Se distingue del estudio `ecg1` por su formato.
- **Análisis SHD**: ejecución del modelo SHD sobre un estudio. Conserva el puntaje, las variables faltantes, el modelo, su versión, las huellas del paquete, el estado y los momentos de ejecución. Un estudio puede tener varios.
- **Componente SHD del informe integrado**: resultado de SHD dentro del análisis integrado de un estudio PDF, con su estado propio (disponible, completado, fallido o no disponible).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Para el 100 % de los NPZ crudos de prueba, el puntaje que muestra la plataforma coincide con el del paquete del modelo ejecutado por fuera para el mismo archivo (diferencia menor a 0,0001).
- **SC-002**: Un usuario autorizado puede cargar un NPZ crudo, pedir SHD y ver el resultado en menos de 1 minuto en el entorno local.
- **SC-003**: El 100 % de los archivos que no cumplen el formato crudo se rechazan con un mensaje que indica la regla incumplida.
- **SC-004**: Ningún análisis fallido muestra un puntaje o hallazgo.
- **SC-005**: Los estudios `ecg1` y los análisis EchoNext-Mini existentes siguen funcionando sin cambios: todas sus pruebas actuales pasan.
- **SC-006**: Ningún texto de la interfaz presenta el resultado de SHD como diagnóstico.

## Assumptions

- **Alcance de la etapa**: solo entorno local de desarrollo (aplicación local y base de datos local). El despliegue en SageMaker, la demo y producción quedan para una especificación posterior.
- **Código del modelo**: el código Python y PyTorch del modelo y del servicio que lo envuelve vive fuera de este repositorio, como exige la constitución. Este repositorio solo contiene el adaptador, el contrato y los scripts de apoyo que no incluyen el modelo.
- **Datos**: se usan datos de investigación de EchoNext obtenidos por el canal autorizado de PhysioNet. No se usan datos reales de pacientes en esta etapa.
- **Variables faltantes**: el modelo las completa internamente con su mediana de entrenamiento. La plataforma no las rellena y sí informa cuáles faltaban.
- **Evidencia**: la evaluación del modelo es interna en EchoNext (AP 0,803, AUROC 0,833) y no tiene validación clínica local; la interfaz no debe afirmar precisión ni validación clínica.
- **PDF**: se reutiliza la extracción de PDF existente (señal con máscara y mediciones). La preparación de esa señal para SHD usa el adaptador que acompaña al paquete del modelo.
- **Selección del análisis**: la persona elige explícitamente el formato al cargar y el análisis al pedirlo; no hay detección automática.
