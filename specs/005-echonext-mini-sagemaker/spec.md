# Feature Specification: Modelo EchoNext-Mini en SageMaker

**Feature Branch**: `005-echonext-mini-sagemaker`

**Created**: 2026-11-10

**Status**: Draft

**Input**: User description: "Dejar el modelo de investigación EchoNext-Mini disponible en SageMaker, sobre la base de la funcionalidad 004, para poder pedirle una predicción sobre un electrocardiograma de 12 derivaciones y recibir 12 probabilidades de posibles hallazgos de cardiopatía estructural. Es el primer modelo real del catálogo de la 004 y el paso previo a que la plataforma (funcionalidad 006) analice estudios de ECG. La entrada son dos arreglos tal como vienen en el dataset EchoNext-Mini de PhysioNet, ya preprocesados: la onda (1 × 2500 × 12, 250 Hz, 10 segundos) y siete variables tabulares en un orden fijo. La salida son doce probabilidades en un orden fijo, sin umbrales, siempre como posible hallazgo de apoyo clínico. Debe empaquetar los artefactos en el bucket de la 004 con la versión etiquetada, sumar el modelo al catálogo apagado por defecto, usar una imagen de inferencia sin acceso a internet, otorgar por la vía de administración los permisos mínimos que la 004 dejó pendientes y documentar cómo subir, encender, apagar y probar el modelo. Se verifica con 3 a 5 estudios del conjunto de prueba contra el código original; la evaluación completa sobre los 5.442 estudios de prueba se hará después. Es un proyecto académico, sin uso comercial por ahora. Quedan fuera: la plataforma (funcionalidad 006), la evaluación completa sobre los 5.442 estudios de prueba, la inferencia por uso (sin servidor), la lectura de XML de electrocardiógrafos, el preprocesamiento desde la señal cruda y la validación clínica."

## User Scenarios & Testing *(mandatory)*

El usuario directo de esta funcionalidad es el **responsable del proyecto**, quien sube el modelo, lo enciende, le envía estudios de prueba y verifica que funciona. De forma indirecta, la usará la funcionalidad 006, que conectará la plataforma con el modelo, y, a través de ella, las personas que analicen electrocardiogramas. Esta entrega **no incluye la plataforma**: no hay carga de archivos, visor de la onda ni pantallas. Deja el modelo funcionando, medido y documentado, para que la 006 se apoye en un contrato claro.

### User Story 1 - Pedir una predicción y recibir las 12 probabilidades (Priority: P1)

El responsable enciende el modelo, le envía los datos de un electrocardiograma (la onda y siete variables) y recibe doce probabilidades, una por hallazgo, en un orden fijo y documentado.

**Why this priority**: es el propósito de la entrega. Sin una predicción que funcione, las demás piezas no tienen sentido.

**Independent Test**: se prueba encendiendo el modelo y enviándole los datos de un estudio del conjunto de prueba. Se espera recibir doce probabilidades entre 0 y 1, en el orden documentado, y un rechazo claro ante una entrada inválida.

**Acceptance Scenarios**:

1. **Given** el modelo encendido, **When** el responsable envía la onda (1 × 2500 × 12) y las siete variables en el orden documentado, **Then** recibe doce probabilidades entre 0 y 1, en el orden fijo documentado, y la última es el hallazgo compuesto.
2. **Given** el mismo estudio enviado dos veces, **When** se comparan las dos respuestas, **Then** son iguales.
3. **Given** una entrada con forma incorrecta, una cantidad de variables distinta de siete, valores no finitos o un sexo distinto de 0 y 1, **When** se envía, **Then** el modelo la rechaza con un mensaje claro y no devuelve probabilidades.
4. **Given** una respuesta del modelo, **When** se la documenta o se la muestra, **Then** se presenta como probabilidad de un posible hallazgo, sin etiquetas de sí o no y sin lenguaje de diagnóstico.

---

### User Story 2 - Comprobar que el modelo desplegado reproduce al original (Priority: P1)

El responsable verifica que lo que corre en SageMaker da los mismos resultados que el código original del modelo, con unos pocos estudios del conjunto de prueba.

**Why this priority**: un modelo mal empaquetado (variables en otro orden, otra normalización, salidas intercambiadas) devuelve números plausibles pero incorrectos, y no se nota a simple vista. Sin esta comprobación, no se puede confiar en nada de lo que muestre la plataforma.

**Independent Test**: se prueba comparando las probabilidades del modelo desplegado con las del código original sobre 3 a 5 estudios de prueba.

**Acceptance Scenarios**:

1. **Given** de 3 a 5 estudios del conjunto de prueba, **When** se comparan las doce probabilidades del modelo desplegado con las que calcula el código original fuera de SageMaker, **Then** la diferencia es menor a 0,001 en cada una.
2. **Given** los estudios elegidos para la verificación, **When** se seleccionan, **Then** salen solo de la partición de prueba, para no usar estudios que el modelo vio al entrenar.
3. **Given** el conjunto de datos, **When** se ejecuta la verificación, **Then** los datos no salen de la máquina del responsable hacia el repositorio ni hacia el bucket de artefactos; solo viajan al modelo de la propia cuenta.

---

### User Story 3 - Encender y apagar el modelo controlando el costo (Priority: P2)

El responsable agrega el modelo al catálogo de la 004, donde nace apagado. Lo enciende solo mientras lo usa, con un cambio revisable, y lo apaga después. El costo por hora está documentado y se puede comprobar qué hay encendido.

**Why this priority**: es el riesgo central de costos de la inferencia y la razón de ser de la 004. Es P2 porque la entrega puede construirse y probarse primero, pero nunca debe quedar un modelo encendido sin uso.

**Independent Test**: se prueba con el plan de cambios: con el modelo apagado se propone el modelo pero ningún punto de inferencia; al encenderlo se propone exactamente uno; al apagarlo se propone quitarlo sin tocar nada más.

**Acceptance Scenarios**:

1. **Given** la entrada del modelo en el catálogo con su valor por defecto, **When** se calcula el plan, **Then** el punto de inferencia queda apagado y no genera costo de cómputo.
2. **Given** la entrada del modelo, **When** el responsable la enciende con un cambio revisable, **Then** el plan propone exactamente un punto de inferencia, y al apagarla propone quitar solo ese punto, sin tocar el bucket, el rol ni otras entradas.
3. **Given** la guía, **When** el responsable la consulta antes de encender el modelo, **Then** encuentra el costo por hora, por día y por mes del tipo de cómputo usado, cómo comprobar qué está encendido y cómo apagarlo de emergencia.
4. **Given** el modelo desplegado, **When** se inspeccionan sus recursos, **Then** llevan la versión exacta del modelo como etiqueta.

---

### User Story 4 - Otorgar los permisos nuevos por la vía de administración (Priority: P2)

Un administrador otorga, por la vía de administración documentada en la 003, los permisos mínimos que la 004 dejó pendientes, para que el responsable pueda crear el modelo y el punto de inferencia y para que el plan de CI pueda leerlos. Cada cambio pasa por las comprobaciones automáticas y por la revisión.

**Why this priority**: sin estos permisos, el responsable no puede crear nada. Es P2 porque se hace una vez, antes de encender el modelo por primera vez.

**Independent Test**: se prueba comprobando que, tras otorgar los permisos, el responsable crea el modelo y el punto de inferencia sin errores de acceso, que no puede pasar otros roles a SageMaker, y que el plan de CI calcula los recursos nuevos.

**Acceptance Scenarios**:

1. **Given** el operador sin permisos de SageMaker, **When** un administrador otorga los permisos mínimos, **Then** el operador puede crear el modelo, su configuración y su punto de inferencia, y solo puede entregar a SageMaker el rol de ejecución de la 004, no otros roles.
2. **Given** el rol de ejecución, **When** se le otorga acceso para descargar la imagen del modelo, **Then** solo puede hacerlo del repositorio de esa imagen, sin permisos comodín.
3. **Given** el plan de CI, **When** se le suman lecturas de SageMaker, **Then** puede calcular los recursos del modelo sin escribir nada, y la ampliación del límite de la aplicación se documenta explícitamente.
4. **Given** una propuesta que incumple una regla (permiso comodín, punto de inferencia encendido sin pedirlo, cómputo con GPU), **When** se ejecutan las comprobaciones, **Then** fallan.
5. **Given** la guía, **When** el responsable sigue el orden documentado, **Then** primero se otorgan los permisos, después se suben los artefactos y se agrega la entrada, y recién entonces se abre la propuesta.

---

### Edge Cases

- **Entrada con la forma o el orden equivocados:** una onda de otra longitud, de 12 derivaciones en otro orden o transpuesta, o variables en otro orden, producen números plausibles pero incorrectos. El modelo valida lo que puede (forma, cantidad, valores finitos, sexo en 0 o 1) y la documentación fija el orden exacto. El orden de las derivaciones y de las variables no se puede validar de forma automática.
- **Estudios fuera del alcance del modelo:** el modelo se entrenó con adultos y sin marcapasos ventricular ni calidad pobre. Esta entrega no filtra esos casos; la documentación debe advertirlo.
- **Modelo encendido y olvidado:** cobra por hora sin uso. La guía indica cómo ver qué hay encendido y cómo apagarlo, y el presupuesto del entorno alerta el gasto.
- **Cuota de cómputo:** una cuenta reciente puede tener cupo cero. La cuenta tiene cupo disponible para el tipo de cómputo previsto, comprobado el 2026-11-10, pero debe repetirse la comprobación si se cambia de tipo.
- **Artefacto o imagen ausentes al encender:** si el artefacto no está en el bucket o la imagen no existe en el repositorio, el punto de inferencia no arranca. La guía debe indicar qué comprobar antes de encender.
- **Falta de acceso a internet:** el modelo se crea con aislamiento de red, así que no puede descargar nada al arrancar. Todo lo que necesita debe venir incluido en la imagen y en los artefactos.
- **Reemplazo al cambiar el modelo:** SageMaker no puede actualizar un modelo existente. Cambiar la imagen, el artefacto o el rol crea un modelo nuevo y borra el anterior; la estructura de la 004 ya lo contempla.
- **Probabilidades que no son literales:** no se sabe si las probabilidades están calibradas. La documentación debe tratarlas como un indicador relativo de riesgo.
- **Estudios sin partición:** parte del conjunto de datos no pertenece a ninguna partición. Los estudios de verificación salen solo de la partición de prueba.
- **Licencia del modelo:** el código del repositorio original no declara licencia y Columbia tiene una solicitud de patente sobre el algoritmo. El uso actual es académico; cualquier uso comercial exige revisar la licencia antes.
- **Credenciales vencidas o permisos ausentes:** las operaciones fallan con un mensaje claro y sin dejar cambios a medias, como en la 003 y la 004.

## Requirements *(mandatory)*

### Functional Requirements

**Entrada y salida del modelo**

- **FR-001**: El modelo desplegado DEBE aceptar, por solicitud, un estudio compuesto por la onda (1 × 2500 × 12: 250 Hz, 10 segundos, 12 derivaciones, ya filtrada y normalizada) y siete variables tabulares en este orden: sexo (0 mujer, 1 hombre), edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS y QT corregido, estandarizadas salvo el sexo.
- **FR-002**: El modelo DEBE devolver doce probabilidades entre 0 y 1 en este orden fijo, documentado en la guía: `lvef_lte_45`, `lvwt_gte_13`, `aortic_stenosis`, `aortic_regurgitation`, `mitral_regurgitation`, `tricuspid_regurgitation`, `pulmonary_regurgitation`, `rv_systolic_dysfunction`, `pericardial_effusion`, `pasp_gte_45`, `tr_max_gte_32` y `shd`. La última es el hallazgo compuesto: al menos uno de los otros once.
- **FR-003**: El modelo DEBE rechazar, con un mensaje claro y sin devolver probabilidades, una entrada con forma de onda incorrecta, una cantidad de variables distinta de siete, valores no finitos o un sexo distinto de 0 y 1.
- **FR-004**: El modelo DEBE devolver el mismo resultado ante la misma entrada.
- **FR-005**: El resultado DEBE ser probabilidades, sin umbrales ni etiquetas de sí o no, y DEBE tratarse siempre como posible hallazgo de apoyo clínico, nunca como diagnóstico. La documentación DEBE advertir que las probabilidades pueden no estar calibradas.
- **FR-006**: Esta funcionalidad NO DEBE preprocesar señal cruda ni leer archivos XML de electrocardiógrafos: la entrada es la que trae el conjunto de datos, ya preprocesada.

**Despliegue y costo**

- **FR-007**: El paquete de inferencia (el código que carga el modelo y responde las solicitudes, y la imagen con sus dependencias fijadas) DEBE producirse fuera de este repositorio, como exige la constitución. Este repositorio DEBE referenciarlo por su versión exacta.
- **FR-008**: Los artefactos del modelo (pesos, transformador de variables y parámetros de normalización) DEBEN guardarse en el bucket de artefactos de la 004, con la versión del modelo etiquetada, y los sube el responsable a mano.
- **FR-009**: El modelo DEBE agregarse al catálogo de la 004 como una entrada que nace apagada y se enciende y apaga cambiando un único valor, sin alterar el bucket, el rol ni otras entradas.
- **FR-010**: La imagen de inferencia DEBE funcionar sin acceso a internet, porque los modelos de la 004 se crean con aislamiento de red: todo lo que necesita viene incluido.
- **FR-011**: El modelo DEBE usar uno de los tipos de cómputo de CPU permitidos por la 004, con una sola instancia, y el tipo por defecto DEBE ser el más económico.
- **FR-012**: El modelo, su configuración y su punto de inferencia DEBEN llevar la versión exacta del modelo como etiqueta, además de las etiquetas obligatorias del proyecto.
- **FR-013**: La guía DEBE documentar el costo por hora, por día y por mes del tipo de cómputo usado, cómo subir los artefactos, cómo encender y apagar el modelo, cómo comprobar qué hay encendido y cómo hacer el apagado de emergencia.

**Verificación**

- **FR-014**: DEBE existir un procedimiento reproducible que compare las doce probabilidades del modelo desplegado con las del código original sobre de 3 a 5 estudios de prueba, con una tolerancia declarada de 0,001.
- **FR-015**: La evaluación completa del modelo sobre los 5.442 estudios de prueba NO forma parte de esta entrega. El responsable la hará después, y se documentará aparte.
- **FR-016**: Los resultados de la verificación DEBEN registrarse, con su fecha, en la documentación de esta funcionalidad.

**Permisos y revisión**

- **FR-017**: Los permisos nuevos del operador DEBEN otorgarse por la vía de administración de la 003, con mínimo privilegio y sin acciones ni servicios comodín: crear y gestionar modelos, configuraciones y puntos de inferencia solo sobre los recursos del entorno; entregar a SageMaker únicamente el rol de ejecución de la 004; y acceso al repositorio de la imagen limitado a ese repositorio.
- **FR-018**: El rol de ejecución DEBE poder descargar la imagen solo del repositorio del modelo, sin permisos comodín, y su límite de permisos DEBE ajustarse en consecuencia.
- **FR-019**: El rol de plan de CI DEBE ganar lecturas enumeradas de SageMaker, sin escrituras. Esa ampliación alcanza también al límite de la aplicación, por lo que DEBE documentarse y actualizar el requisito FR-008 de la 004.
- **FR-020**: Las comprobaciones de la 004 (costo, comodines, artefactos versionados, protección del bucket) DEBEN seguir vigentes, y NINGUNA automatización DEBE aplicar cambios a la infraestructura real.
- **FR-021**: La guía DEBE indicar el orden de los pasos: permisos por la vía de administración, subida de artefactos y de la imagen, entrada en el catálogo y recién después la propuesta de cambio.

**Datos, licencia y alcance clínico**

- **FR-022**: Los datos del conjunto EchoNext-Mini NO DEBEN guardarse en el repositorio, en su historial ni en el bucket de artefactos. Los resultados que se registren NO DEBEN incluir datos de estudios individuales.
- **FR-023**: La guía DEBE advertir que el código del modelo no declara licencia, que Columbia tiene una solicitud de patente sobre el algoritmo y que el uso actual es académico, y que cualquier uso comercial exige revisar la licencia antes.
- **FR-024**: La guía DEBE documentar los límites del modelo: se entrenó con adultos en un solo centro, excluye marcapasos ventricular y calidad pobre, tiene una sensibilidad reportada de 70,1 % y un AUROC externo reportado de 79,0.

### Key Entities

- **Estudio de entrada**: el par de arreglos que recibe el modelo: la onda y las siete variables tabulares. Es anónimo.
- **Resultado**: las doce probabilidades, en un orden fijo, que devuelve el modelo para un estudio.
- **Hallazgo**: cada una de las once condiciones que el modelo estima, más el compuesto que indica que al menos una está presente.
- **Artefactos del modelo**: los pesos, el transformador de variables y los parámetros de normalización, guardados en el bucket de la 004.
- **Paquete de inferencia**: el código que carga el modelo y responde las solicitudes, y la imagen con sus dependencias. Se produce fuera de este repositorio.
- **Entrada del catálogo**: el registro del modelo en el catálogo de la 004, con su versión, su artefacto, su imagen y su interruptor de encendido.
- **Punto de inferencia**: el servicio encendido que ejecuta el modelo. Cobra por hora mientras existe.
- **Referencia de verificación**: las probabilidades que calcula el código original fuera de SageMaker, contra las que se compara el modelo desplegado.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Sobre de 3 a 5 estudios de prueba, las doce probabilidades del modelo desplegado difieren en menos de 0,001 de las del código original, en el 100 % de los casos.
- **SC-002**: El 100 % de las entradas inválidas probadas (forma incorrecta, cantidad de variables distinta de siete, valores no finitos, sexo fuera de 0 y 1) se rechazan con un mensaje claro y sin devolver probabilidades.
- **SC-003**: Con el modelo apagado, el costo de cómputo es 0, y el plan propone 0 puntos de inferencia. Al encenderlo propone exactamente 1, verificado por una comprobación automática sin crear recursos.
- **SC-004**: El responsable puede subir los artefactos, encender el modelo, enviarle un estudio y apagarlo en menos de 30 minutos siguiendo solo la guía, sin ningún paso no documentado.
- **SC-005**: 0 datos del conjunto de datos en el repositorio, en su historial o en el bucket de artefactos, verificado por una búsqueda automática.
- **SC-006**: La guía documenta, sin ambigüedad, el formato de entrada y el orden de las doce salidas, de modo que la funcionalidad 006 pueda construirse sin consultar el código del modelo.

## Assumptions

- **Base de la 004:** esta funcionalidad depende de la 004 (bucket de artefactos, rol de ejecución, catálogo de modelos apagado por defecto, guardas de costo y flujo de CI) y la extiende sin cambiar su comportamiento. Es el primer modelo real del catálogo.
- **Código del modelo fuera del repositorio:** la constitución exige que el código Python y PyTorch de los modelos viva fuera de este repositorio. Ese proyecto de ML separado es el repositorio `medicia-ml` (GitHub, `GMGonzaloMata/medicia-ml`), que el responsable creó el 2026-11-10: contiene el código de inferencia, construye la imagen y guarda los procedimientos de verificación. Este repositorio solo referencia la imagen y los artefactos por versión, y registra los resultados. La estructura interna de `medicia-ml` se decide en el plan.
- **Proyecto académico:** es un proyecto de fin de carrera, sin uso comercial por ahora. La revisión de licencia es previa a cualquier uso comercial.
- **Origen de los datos:** el conjunto de datos es EchoNext-Mini de PhysioNet, que el responsable ya tiene descargado. La partición de prueba tiene 5.442 estudios, con los arreglos alineados fila a fila con los metadatos.
- **Entrada ya preprocesada:** los arreglos del conjunto de datos ya vienen filtrados, normalizados y estandarizados. El orden de las siete variables se comprobó empíricamente contra los metadatos. La plataforma (006) decidirá cómo conseguir esos valores de un estudio propio.
- **Un estudio por solicitud:** el modelo atiende un estudio por solicitud. Procesar varios por tanda es una optimización del procedimiento de verificación, no un requisito del modelo.
- **Tolerancia de verificación:** la diferencia máxima de 0,001 entre probabilidades es un criterio razonable a validar durante el plan, no un valor publicado.
- **Plazo de la guía:** los 30 minutos de SC-004 son un objetivo razonable, no medido. Se ajusta en el plan.
- **Sin umbrales:** los autores no publican un umbral de decisión. Las probabilidades se presentan como están.
- **Cómputo de CPU:** se usa el tipo de cómputo más económico permitido por la 004. La cuota de la cuenta para ese tipo estaba disponible el 2026-11-10 y se repite la comprobación si se cambia de tipo.
- **Encendido manual:** el modelo se enciende y apaga cambiando el catálogo. Pasar a inferencia por uso (sin servidor) es una decisión posterior del responsable.
- **Un solo operador:** una única persona aplica la infraestructura, con un administrador para los permisos nuevos, por la vía de administración documentada.
- **Fuera de alcance:** la plataforma (carga de archivos, visor de la onda, pantallas, tablas de estudios y análisis), que es la funcionalidad 006; la evaluación completa sobre los 5.442 estudios de prueba, que el responsable hará después; la inferencia por uso; la lectura de XML de electrocardiógrafos; el preprocesamiento desde la señal cruda; y la validación clínica.
- **Idioma:** los documentos y la guía están en español rioplatense.
