# Feature Specification: ECG desde PDF e informe unificado de posibles hallazgos

**Feature Branch**: `feature/pdf-ecg-ingestion`

**Feature Directory**: `specs/010-pdf-unified-report`

**Created**: 2026-11-16

**Status**: Clarified — decisiones de producto cerradas; listo para planificación con una dependencia técnica explícita de la preparación de EchoNext desde PDF, sin afirmar funcionamiento.

**Input**: Pedido original en [ODD, S1–S13](../../odd/tasks/pdf-unified-report.md#specs). Decisión de alcance: «hagamos informe unificado primero». La entrada habitual será un PDF Mortara compatible, no un archivo preparado por la persona. EchoNext-Mini y E022 son modelos independientes; se unifica la lectura del informe, no sus puntuaciones.

## Clarifications

### Session 2026-11-16

- Q: ¿Qué material conservar de cada carga PDF? → A: También el PDF original privado. Conservar el PDF original, las señales extraídas y los derivados necesarios, con acceso autorizado por clínica. El original puede contener identificadores; conservarlo no autoriza uso para entrenamiento ni retención indefinida.

- Q: ¿Cuándo publicar si un modelo termina y el otro sigue o falla? → A: Esperar ambos y admitir informe parcial. Mostrar progreso mientras alguno siga pendiente o procesando; cuando ambos alcancen un estado terminal, publicar los resultados válidos con cobertura completa o parcial explícita. Si ambos fallan, mostrar fallo sin informe clínico.

- Q: ¿Cómo presentar los indicadores superpuestos de FEVI? → A: Ambos al mismo nivel. Agruparlos en una sección de función ventricular, con igual jerarquía visual, significado y origen identificable; sin comparación clínica, promedio, clasificación de concordancia ni FEVI numérica.

- Alcance posterior S10–S11: avanzar por etapas con E022 real primero y preparar la frontera Mini para después. Mini sin artefactos es capacidad NOT_AVAILABLE, no ejecución fallida, resultado ficticio ni espera. La regla de esperar estados terminales se aplica a los componentes disponibles solicitados; se conserva la meta final de ambos modelos.
- S12–S13 aceptan el recorrido funcional «Soltar o elegir PDF → procesar → mostrar progreso/error → presentar el resultado de E022 en el informe», no una maqueta. Su primer corte acotado agrega selección/drop accesible y feedback veraz de carga al formulario existente. No habilita por sí solo extracción, inferencia ni informe; mientras la acción PDF siga no disponible se informa expresamente, sin éxito o etapas de análisis simulados.

## User Scenarios & Testing *(mandatory)*

El paciente dueño y el médico con asignación vigente conservan sus permisos actuales. El usuario elige explícitamente ECG y el análisis integrado; no necesita elegir modelos ni cambiar de informe entre etapas. Primero se ejecuta E022 disponible, con Mini explícitamente no disponible; más adelante participan ambos cuando estén habilitados. «Informe» significa la presentación dentro de la plataforma, no un PDF descargable.

### User Story 1 - Cargar un ECG desde un PDF compatible (Priority: P1)

Un paciente o su médico carga un PDF Mortara admitido para el paciente autorizado. La primera etapa funcional usa E022 real, sin depender de artefactos Mini. La plataforma extrae lo necesario, valida la compatibilidad y permite consultar el estudio sin pedir que la persona fabrique un archivo NPZ.

**Why this priority**: elimina la preparación manual que hoy impide usar los ECG en su formato habitual.

**Independent Test**: con documentos sintéticos compatibles e incompatibles, sin modelos reales, comprobar la carga, la lista, el acceso al estudio y los rechazos.

**Acceptance Scenarios**:

1. **Given** un paciente con acceso o un médico con asignación vigente, **When** selecciona ECG y carga un PDF compatible, **Then** recibe confirmación y el estudio aparece para el paciente correcto, con número único, fecha y autor de carga, sin solicitar NPZ.
2. **Given** un archivo incompatible, ilegible, protegido, incompleto o que excede los límites publicados, **When** intenta cargarlo, **Then** se explica la regla incumplida sin repetir datos clínicos ni el nombre del archivo; no quedan estudio visible, número consumido ni artefactos persistidos por ese rechazo.
3. **Given** un PDF con identificadores impresos, **When** se determina el paciente destino, **Then** se usa el contexto autorizado y la selección permitida al médico, nunca se crea o cambia un paciente a partir de esos identificadores.
4. **Given** un PDF que el lector puede interpretar pero cuya preparación para un modelo no está validada, **When** se intenta analizarlo, **Then** no se envía una entrada supuesta a ese modelo ni se anuncia compatibilidad por la sola extracción exitosa.
5. **Given** un estudio anterior ya guardado, **When** su dueño o médico autorizado lo consulta, **Then** conserva su acceso, onda e historial existentes sin conversión ni borrado automático.
6. **Given** el formulario PDF, **When** suelta un archivo o usa el selector nativo con teclado/click, **Then** ambos caminos comparten validación de un solo PDF de hasta 2 MiB, muestran nombre/tamaño locales y permiten reemplazarlo o quitarlo. Una selección múltiple o ajena a PDF no se envía; la extensión/MIME no prueba compatibilidad del contenido. Cambiar formato descarta archivo/resultado previos. El feedback de envío dura la promesa real de carga, distingue carga de análisis y no inventa porcentaje, ejecución E022 ni éxito ante indisponibilidad.

---

### User Story 2 - Solicitar un análisis y leer un solo informe (Priority: P1)

Desde el estudio, la persona solicita el mismo análisis integrado de ECG. Encuentra los posibles hallazgos de las capacidades disponibles en un informe organizado por hallazgo, no por pantallas de modelos. En etapa E022-first, Mini es una omisión explícita de cobertura; cuando esté habilitado, ambos aportarán sus resultados independientes.

**Why this priority**: materializa la decisión de informe unificado sin prometer una nueva predicción matemáticamente combinada.

**Independent Test**: con un estudio sintético y respuestas controladas de ambos modelos, verificar un único pedido y un único informe con todas las salidas válidas y su procedencia consultable.

**Acceptance Scenarios**:

1. **Given** una entrada compatible y ambas capacidades disponibles, **When** solicita el análisis integrado, **Then** ve un único proceso solicitado y, al terminar, un informe común con los doce indicadores de EchoNext y el indicador de función ventricular de E022, sin navegar entre pantallas por modelo.
2. **Given** un informe con dos estimaciones sobre FEVI reducida, **When** lo consulta, **Then** no ve una media, máximo, voto, umbral, etiqueta de concordancia ni clasificación derivada; cada estimación conserva su significado y procedencia. Ambos indicadores aparecen al mismo nivel en una única sección de función ventricular, con su significado y procedencia identificables.
3. **Given** un indicador de E022, **When** lo lee, **Then** se explica que estima la posibilidad del objetivo «FEVI menor o igual a 45 %», no un valor de FEVI del paciente: una puntuación de 0,72 no se presenta como «FEVI 72 %».
4. **Given** cualquier resultado válido, **When** lo consulta, **Then** encuentra la advertencia de investigación, posible falta de calibración, apoyo clínico y necesidad de evaluación profesional, y puede consultar modelo, versión exacta y momento de ejecución de cada contribución.
5. **Given** un nuevo pedido terminado, **When** vuelve a un informe previo, **Then** este mantiene sus resultados y procedencia originales, sin mezclarlos con el pedido nuevo.
6. **Given** E022 disponible y Mini NOT_AVAILABLE por artefactos pendientes, **When** solicita el análisis, **Then** se crea solo la ejecución E022 y una omisión de cobertura Mini; al terminar E022 válido se publica el mismo informe explícitamente parcial, sin esperar Mini ni mostrarle error de ejecución o resultados ficticios.

---

### User Story 3 - Distinguir resultados válidos de fallas o análisis ausentes (Priority: P1)

La persona puede saber qué se pudo analizar y qué no, sin interpretar una ausencia como resultado normal o negativo.

**Why this priority**: un informe aparentemente completo con una capacidad fallida puede inducir una conclusión clínica incorrecta.

**Independent Test**: simular ambas respuestas válidas, una válida y otra fallida, ambas fallidas y una ejecución interrumpida; comprobar estados y ausencia de resultados inventados. El informe se publica cuando todos los componentes disponibles solicitados llegan a estado terminal: completo solo con ambos válidos, parcial con alguna contribución válida y cobertura faltante, ninguno si no hay resultado válido. Una capacidad conocida no disponible no crea ejecución ni bloquea la publicación.

**Acceptance Scenarios**:

1. **Given** un componente fallido por entrada rechazada, respuesta inválida, indisponibilidad o demora, **When** se consulta su estado, **Then** figura fallido con motivo genérico, sin puntuación clínica y sin reemplazarla por cero o por el resultado del otro modelo.
2. **Given** dos componentes disponibles solicitados y uno válido mientras el otro falla o sigue en curso, **When** se consulta el pedido, **Then** el resultado permanece sin publicar hasta que ambos sean terminales. Si solo E022 estaba disponible, se publica al terminar E022 con la omisión Mini indicada, nunca una ejecución Mini fabricada.
3. **Given** ambas ejecuciones fallidas, **When** termina el pedido, **Then** no existe resultado clínico del pedido; se informa el fallo y se permite un nuevo pedido autorizado.
4. **Given** un pedido interrumpido que superó el plazo máximo de ejecución, **When** se consulta o se intenta otro, **Then** deja de bloquear indefinidamente el estudio, conserva el motivo de falla y no acepta respuestas tardías que sobrescriban un estado terminal.
5. **Given** dos pedidos simultáneos sobre un estudio, **When** se procesan, **Then** se acepta como máximo un pedido integrado en curso; sus dos componentes no se tratan como dos pedidos competidores.

---

### User Story 4 - Conservar acceso e historial sin ampliar permisos (Priority: P2)

La persona consulta estudios e informes con las mismas reglas de pertenencia, asignación y eliminación que antes. Agregar PDFs y un segundo modelo no amplía quién ve datos médicos.

**Why this priority**: protege la continuidad de uso y la confidencialidad del historial existente.

**Independent Test**: con dos clínicas y pacientes de prueba, verificar carga, consulta, análisis y eliminación con pacientes, médicos asignados, médicos sin asignación y administradores sin rol médico.

**Acceptance Scenarios**:

1. **Given** un usuario sin acceso, de otra clínica o un identificador inexistente, **When** intenta consultar o analizar un estudio, **Then** recibe una respuesta indistinguible sin datos; no se lee el archivo ni se inicia extracción o inferencia.
2. **Given** una asignación médica terminada, **When** el médico intenta consultar de nuevo, **Then** pierde acceso a estudios e informes sin que estos se borren del paciente.
3. **Given** un estudio sin pedido en curso, **When** quien lo cargó confirma su eliminación y conserva acceso, **Then** se aplica la eliminación existente a su estudio, análisis, PDF original, señales y derivados asociados; otra persona no puede eliminarlo y cualquier limpieza pendiente queda identificada.
4. **Given** un pedido integrado en curso, **When** quien cargó intenta eliminar el estudio, **Then** se rechaza sin borrar datos.
5. **Given** un informe con nombres largos, estados de falla y detalles de procedencia, **When** se usa con teclado, en claro u oscuro y a 375, 768 o 1280 px, **Then** toda la información sigue disponible sin desbordamiento horizontal ni depender solo del color.

### Edge Cases

- Un archivo llamado `.pdf` no es necesariamente un PDF compatible. Un PDF escaneado o de otro fabricante no se convierte en compatible por su extensión.
- Una extracción entrega señal pero faltan medidas tabulares, unidades, derivaciones u observaciones requeridas: el lector y la aplicación no rellenan con ceros, medias ni datos clínicos inventados; se indica incompatibilidad para el componente afectado. Esto no niega convenciones documentadas del adaptador experimental existente: solo podrán reutilizarse explícitamente con procedencia y verificación de su contrato, sin afirmar que una imputación fue observada o que prueba equivalencia clínica.
- Un tramo no observado no equivale a una señal medida de amplitud cero. La información de qué fue observado no se descarta antes de validar lo que necesita cada modelo.
- Una respuesta con campos ausentes, valores no finitos o puntuaciones fuera del contrato invalida ese componente entero: no se publica un subconjunto de sus indicadores como si fuera una ejecución exitosa.
- Dos puntuaciones sobre el mismo objetivo pueden diferir; no existe una regla validada que permita llamarlas «concordantes», «discordantes», más certeras o comparables por su magnitud.
- El PDF contiene nombre, documento, fecha de nacimiento u otros datos impresos: no se copian a listados, mensajes, registros operativos ni al contenido enviado a inferencia; el original privado sí se conserva y solo se consulta con los mismos permisos del estudio.
- La persona cierra la pantalla o actualiza durante el pedido: al volver ve ese mismo pedido y su estado; no se dispara uno nuevo automáticamente.
- Se carga dos veces el mismo archivo: se mantienen los dos estudios distintos y su numeración, sin introducir deduplicación.
- Falla la extracción o el guardado: no queda estudio visible incompleto ni archivo persistido huérfano inadvertido; no se consume número si la carga se rechaza.
- Los estudios históricos tienen otra preparación y formato. No se presupone que puedan ejecutarse con E022 ni que su señal normalizada sea equivalente a señal cruda.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada y compatibilidad**

- **FR-001**: La carga habitual DEBE aceptar un PDF Mortara compatible, de a uno por vez, con selección explícita de ECG. El análisis integrado DEBE elegirse explícitamente a nivel de capacidad de producto; no debe requerir seleccionar dos modelos ni aportar NPZ.
- **FR-002**: La plataforma DEBE publicar los formatos y límites admitidos, comprobar contenido real, tamaño y recursos de extracción acotados antes de aceptar el estudio, y rechazar documentos ajenos al alcance, protegidos, dañados o incompletos. La matriz de compatibilidad y los límites concretos deben fijarse y verificarse antes de habilitar la carga PDF real; la implementación y sus pruebas con lectores simulados pueden avanzar antes, sin afirmar soporte de todos los PDFs Mortara.
- **FR-003**: La extracción DEBE conservar el significado de señal, unidades, orden de derivaciones, medidas y observaciones faltantes hasta validar los requisitos propios de cada modelo. Extraer un PDF no demuestra que sea una entrada científicamente compatible.
- **FR-004**: Cada componente DEBE recibir únicamente una preparación reproducible y verificada contra su referencia. Hasta verificar el adaptador experimental EchoNext localizado, sus parámetros exactos y su correspondencia con el contrato de doce salidas desde señal cruda, ese componente NO DEBE anunciarse disponible para PDFs ni ejecutarse con remuestreo, filtrado, normalización, estandarización o imputación supuestos. Esto es una dependencia pendiente, no una decisión delegable al usuario clínico.
- **FR-005**: La carga rechazada DEBE explicar la regla incumplida en español sin datos sensibles; no debe alterar estudios, numeración ni artefactos persistidos. Un fallo al guardar DEBE preservar la coherencia y permitir detectar cualquier limpieza pendiente.

**Informe y significado clínico**

- **FR-006**: Un pedido integrado DEBE coordinar las capacidades disponibles con una instantánea de disponibilidad al solicitarlo y producir una sola presentación por hallazgo, sin pantallas distintas por modelo o etapa. E022 real se entrega primero; Mini NOT_AVAILABLE se registra como omisión, no como ejecución ni error del usuario. Cuando ambos estén disponibles, se solicitan ambos como modelos independientes. No debe incorporar ejecuciones de otros pedidos como si fueran parte del actual.
- **FR-007**: Cuando ambas contribuciones sean válidas, el informe DEBE conservar las doce salidas de EchoNext, incluido su compuesto de cardiopatía estructural, y el indicador independiente E022 sobre FEVI menor o igual a 45 %. En la etapa E022-first solo se muestra su indicador válido y la cobertura Mini no disponible, nunca doce resultados simulados como reales. El compuesto propio de EchoNext NO DEBE recalcularse agregando E022.
- **FR-008**: Cada contribución DEBE mostrar una etiqueta que explique el objetivo y una puntuación con su significado documentado, junto con procedencia consultable. El indicador de E022 NO DEBE presentarse como FEVI numérica, diagnóstico o probabilidad clínicamente calibrada.
- **FR-009**: El informe NO DEBE fusionar, promediar, seleccionar el máximo, votar, clasificar, establecer umbrales ni inferir concordancia entre puntuaciones. Tampoco debe afirmar mejora de precisión, complementariedad clínica demostrada o validación clínica por usar ambos modelos.
- **FR-010**: La advertencia permanente de la 008 DEBE seguir visible y abarcar ambas contribuciones: investigación, posible falta de calibración, indicadores relativos y posibles hallazgos de apoyo clínico, nunca diagnóstico, que requieren evaluación profesional.
- **FR-011**: Cuando ambos modelos informan el objetivo de FEVI reducida, el informe DEBE agruparlo sin ocultar su distinta procedencia. Ambos indicadores DEBEN mostrarse al mismo nivel en una sección de función ventricular, con igual jerarquía visual y origen identificable. No se DEBE sugerir superioridad, equivalencia de escalas o concordancia clínica.

**Estados e historial**

- **FR-012**: Cada ejecución de modelo DEBE conservar estado explícito (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`), estudio, pedido, solicitante, momento y, si produce resultados, modelo y versión exacta informados. Una ejecución fallida DEBE tener motivo genérico y ningún resultado clínico. La cobertura global del informe no sustituye esos estados individuales. Una capacidad NOT_AVAILABLE no tiene ejecución/estado de análisis, versión ejecutada o resultado: conserva solo su disponibilidad y motivo de omisión.
- **FR-013**: Un fallo o ausencia de un componente NO DEBE presentarse como normalidad, cero, hallazgo negativo o informe completo. Los resultados clínicos solo DEBEN publicarse cuando todos los componentes disponibles solicitados alcancen estado terminal, incluyendo fallo por vencimiento. Mientras alguno siga pendiente o procesando, se muestra progreso sin indicadores. En E022-first, Mini conocida NOT_AVAILABLE no genera ejecución ni espera: se publica informe parcial al terminar E022 correctamente. Con ambos disponibles se espera a ambos: dos válidos producen informe completo, uno válido informe parcial. Sin ninguna ejecución válida no hay informe clínico; si no hay capacidades disponibles no se acepta un pedido vacío.
- **FR-014**: Debe existir como máximo un pedido integrado en curso por estudio, incluso con pedidos simultáneos. Deben resolverse ejecuciones vencidas y rechazarse respuestas tardías sobre estados terminales; se permite un nuevo pedido al terminar, sin modificar los anteriores. Los plazos concretos se definirán en el plan sin alterar silenciosamente los del flujo histórico.
- **FR-015**: El historial DEBE permitir consultar pedidos e informes anteriores del más reciente al más antiguo, con estado, fecha y procedencia, manteniendo intactos los análisis históricos de EchoNext. Nunca deben presentarse como informes que incluyeron E022.

**Acceso, conservación y continuidad**

- **FR-016**: Toda carga, extracción, lectura, solicitud de análisis y consulta de informe DEBE validar sesión, clínica activa y relación con el paciente. La clínica proviene del contexto autorizado, nunca del cliente; no se extrae la identidad del paciente desde el PDF para vincularlo automáticamente.
- **FR-017**: Solo el paciente dueño y los médicos con asignación vigente DEBEN acceder. Un administrador sin rol médico no accede. Solicitudes ajenas no leen archivos, no inician procesamiento ni cambian datos; consultar un estudio ajeno o inexistente no permite distinguirlos.
- **FR-018**: Los artefactos conservados DEBEN ser privados, cifrados, autorizados por clínica y limitados a la finalidad del estudio. NO DEBEN guardarse nombres originales ni datos identificatorios extraídos en los derivados de análisis, errores o registros operativos. Se DEBEN conservar el PDF original privado, las señales extraídas con su máscara y procedencia, y los derivados necesarios. El original puede contener identificadores y solo debe consultarse bajo los mismos controles de acceso del estudio.
- **FR-019**: Esta funcionalidad NO DEBE borrar, reescribir ni migrar automáticamente estudios guardados, cambiar sus permisos o retirar el flujo previo de carga sin una decisión explícita posterior. Debe mantener lectura, visor e historial de esos estudios; la compatibilidad de E022 con ellos no se presume.
- **FR-020**: La numeración por paciente, autoría y eliminación existentes DEBEN conservarse: números únicos aun con cargas concurrentes, sin reutilización; solo elimina quien cargó y conserva acceso; ningún estudio se elimina mientras tenga un pedido en curso. La eliminación abarca también el PDF original, las señales extraídas y los derivados asociados; una limpieza pendiente debe quedar identificada, sin retención permanente implícita.
- **FR-021**: El navegador NO DEBE recibir variables tabulares internas, claves de almacenamiento ni detalles internos de errores. Los registros operativos NO DEBEN contener PDF, señal, medidas, puntuaciones, nombres de archivo ni datos personales.
- **FR-022**: Los mensajes DEBEN estar en español con voseo. Carga, informe, estados e historial DEBEN poder utilizarse con teclado y foco visible, en claro y oscuro, a 375, 768 y 1280 px sin desplazamiento horizontal; los estados e indicadores deben tener texto, no solo color.

### Key Entities

- **Estudio ECG**: pertenece a un paciente y clínica, con número, fecha, autoría y origen; admite múltiples pedidos y mantiene los permisos existentes.
- **Artefacto del estudio**: material conservado para consultar o analizar el estudio. Distingue original, extracción y derivados por finalidad y procedencia; conserva el PDF original privado, las señales extraídas y los derivados necesarios, sin implicar uso para entrenamiento.
- **Pedido de análisis integrado**: intención explícita de analizar un estudio con las capacidades disponibles; conserva instantánea de disponibilidad, omisiones y ejecuciones del mismo pedido. E022-first no elimina el objetivo final de ambos modelos.
- **Ejecución de modelo**: contribución independiente con estado, modelo y versión, momento, resultado válido o motivo de falla. No existe puntuación clínica para una ejecución fallida.
- **Informe unificado**: lectura conjunta de resultados de un pedido, organizada por hallazgo, con cobertura y advertencias; no es un ensemble ni una nueva predicción validada.
- **Indicador de posible hallazgo**: puntuación de un objetivo documentado y su procedencia. Dos indicadores sobre un objetivo no constituyen una estimación combinada.

## Success Criteria *(mandatory)*

### Measurable Outcomes

Estos criterios son objetivos de aceptación futura, no verificaciones ejecutadas en esta etapa documental.

- **SC-001**: En todos los casos compatibles de la matriz de aceptación, un paciente y un médico autorizado completan la carga desde PDF sin preparar NPZ y encuentran el estudio en la lista correcta; en el 100 % de rechazos no se consumen números ni quedan datos persistidos de esa carga.
- **SC-002**: Con ambas respuestas válidas, un único pedido permite consultar los trece indicadores de origen en un informe común; cero puntuaciones fusionadas, umbrales, diagnósticos, etiquetas de concordancia o valores numéricos de FEVI inventados.
- **SC-003**: En el 100 % de escenarios de un componente fallido, ambos fallidos, respuesta inválida o ejecución vencida, no se generan indicadores para la ejecución fallida y se distingue la cobertura real. No se publica resultado mientras una ejecución disponible solicitada siga pendiente o procesando; después se muestra completo con dos contribuciones válidas, parcial con alguna válida y cobertura faltante, o ninguno con cero. Mini NOT_AVAILABLE no genera ejecución, error ni espera en la etapa E022-first.
- **SC-004**: El 100 % de las contribuciones válidas mostradas puede relacionarse con estudio, pedido, modelo, versión y momento; los informes previos permanecen iguales al solicitar otro.
- **SC-005**: En la matriz de acceso de dos clínicas, el 100 % de los accesos no autorizados se rechaza sin exposición, lectura clínica ni ejecución de modelos; las reglas de eliminación y numeración anteriores siguen vigentes.
- **SC-006**: Con dos pedidos simultáneos del mismo estudio se acepta exactamente uno; ningún pedido vencido bloquea indefinidamente ni una respuesta tardía sustituye resultados terminales.
- **SC-007**: El recorrido completo de carga y consulta, incluyendo fallas, cobertura y procedencia, es operable con teclado y legible en los tres anchos y ambos temas definidos, sin desplazamiento horizontal.
- **SC-008**: Todos los estudios históricos del conjunto de regresión siguen pudiendo consultarse con su onda e historial originales, sin reescritura ni necesidad de volver a cargarlos.

## Assumptions

**Dependencias verificadas y límites de evidencia**

- Los contratos [005: entrada de EchoNext](../005-echonext-mini-sagemaker/contracts/inference-api.md), [006: almacenamiento existente](../006-carga-estudios-ecg/contracts/stored-study-format.md) y [008: análisis](../008-analisis-estudio-ecg/contracts/analysis-use-cases.md) son la base de continuidad, no una autorización para reescribirlos en esta etapa.
- EchoNext recibe 2500 × 12 muestras y siete variables, con seis estandarizadas; su contrato vigente no prepara señal cruda. La extracción Mortara informada entrega 12 × 5000 muestras a 500 Hz, en microvoltios, con máscara de observaciones y versión 2 del extractor. Son datos distintos: transponer o reducir muestras no demuestra equivalencia con el preprocesamiento de referencia.
- El adaptador experimental EchoNext ya fue localizado y leído en el archivo E031_compare_pdf.py aportado por el humano; no se presume inexistente ni se planea reinventarlo. Faltan el JSON exacto de normalización de onda, verificar sus convenciones de escala/imputación y paridad de preparación/doce salidas, y aislar su runtime. El servicio público `GMGonzaloMata/medicia-ml` auditado en main recibe datos ya preparados; IntroECG se referencia en `15233e9392e9dc10c136a5624abf10199207bce9`, que no fija el servicio ni E031. La evidencia y el gate de reutilización/verificación quedan en research.md; no se autoriza cargar joblib/pickle, ejecutar el script ni seguir sus rutas privadas.
- La evidencia aportada de E022 incluye `pdf_adapter.py` e `inference.py`, con preparación de seis variables, señal y máscara, y objetivo `lvef_lte_45`. No se vuelve a pedir esa preparación ni se transforma su puntuación en FEVI numérica. La evidencia es de lectura, no de funcionamiento ejecutado.
- El lector público de [Anonimizacion](https://github.com/luchoaquinopla/Anonimizacion) es reutilizable como lector en una frontera separada. Su portal institucional no es una interfaz pública para cargar PDFs y no se propone exponerlo. El código de modelos y su preparación científica permanece fuera de este repositorio; no se decide aquí el mecanismo de integración.
- La matriz exacta de variantes Mortara admitidas, sus ejemplos sintéticos y los límites operativos se verifican antes de habilitar carga PDF real. La verificación del adaptador/artefactos EchoNext condiciona solo su etapa posterior, no implementación ni validación de E022, extracción o informe. No se usan PDFs de pacientes ni se afirma compatibilidad de todas las variantes.
- Continúa la etapa académica con datos sintéticos y sin uso clínico real. Retención y eliminación legales o institucionales deben definirse antes de datos reales; la conservación aceptada del PDF original, las señales y los derivados no impone plazos indefinidos ni autoriza entrenamiento.

**Límites de esta entrega**

- Se especifica primero el informe unificado. Quedan fuera ensemble, calibración, umbrales, diagnóstico, afirmaciones de mejora clínica, FEVI numérica, entrenamiento, carga masiva, nuevos fabricantes, extracción genérica de PDFs escaneados y exportación o impresión de informes.
- Se conserva la selección explícita del tipo y análisis. No se agrega detección automática de modalidad, asignación de pacientes desde PDFs, nuevos roles ni gestión de médicos/pacientes.
- El trabajo está aislado en el worktree aprobado por S6; `009` queda reservado a infraestructura y esta función usa `010`. S5 conserva la secuencia de verificaciones locales, entrega de infraestructura y posterior alineación de rebranding condicionada al despliegue del compañero: esta especificación no autoriza despliegue, merge, publicación ni cambios en esas ramas.
- T1 comprende especificación, aclaraciones, plan, tareas y análisis de consistencia antes de código. Las aclaraciones están cerradas y se autoriza completar los artefactos de planificación; el padre decide su cierre. Ningún documento de esta fase demuestra disponibilidad, funcionamiento de modelos o validación clínica.
