# Feature Specification: Entorno de prueba compartible en EC2 y RDS

**Feature Branch**: `feature/EC2-RDS`

**Created**: 2026-11-13

**Status**: Especificación finalizada para planificación; la implementación posterior requiere lectura del plan y tareas por el orquestador. No autoriza ejecución en AWS.

**Input**: User description: "armemos el codigo de terraform y dejemoslo implementado, despues vemos quien lo ejecuta"; "es para prueba"; "si tiene que ser una demo para compartir"; "no, no tenemos un dominio ni sub dominio aun"; aceptación de DuckDNS + HTTPS con Let's Encrypt; construir sobre la cuenta AWS del compañero sin romper el flujo de Spec Kit. Fuente completa y trazabilidad: `odd/tasks/ec2-rds-test.md`, S1–S8. Delta autorizado de preparación automática desde imagen estándar: `odd/tasks/ec2-standard-bootstrap.md`, S1–S3.

## Clarifications

### Session 2026-11-14

- Q: ¿La demo debe ejecutar modelos reales? → A: Sí, dos servicios SageMaker reales; una simulación no satisface la demo. [S7]
- Q: ¿Cuáles son los dos servicios? → A: EchoNext-Mini y la cadena FEVI ECGFounder + E022; backbone y head pertenecen al mismo servicio FEVI, no a endpoints separados. E022 es candidato pendiente de validación externa. [S8]
- Q: ¿Dónde se preparan los modelos? → A: Código, pesos y empaquetado Python pertenecen al repositorio ML externo; no hay acceso autorizado a ese repositorio, Colab o Drive. Artefactos y contrato FEVI son dependencias, no motivo para detener EC2/RDS.
- Q: ¿Hace falta aprobar gasto para preparar Terraform? → A: Se prepara la propuesta facturable solicitada; costo, duración y cierre se aprueban antes de ejecutar, no nuevamente para planificar. [S1, S2, S6]
- Q: ¿El responsable debe construir una imagen personalizada con herramientas preinstaladas? → A: No. El usuario aceptó con «si» que la ejecución humana también prepare automáticamente la máquina desde una imagen estándar. La preparación ocurre solo en la futura EC2; no requiere acceso AWS del usuario ni instala herramientas en su equipo. Los artefactos reales de aplicación/modelos, secretos y comandos reservados siguen siendo externos. [Delta S1–S3]

Aclaraciones integradas desde hechos aceptados de la conversación, sin preguntas nuevas. Cobertura: alcance, datos, interacción, seguridad, fallas, terminología y aceptación claros; capacidad, operación y contrato externo se tratan en el plan como decisiones técnicas o dependencias, sin inventar compromisos de disponibilidad.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Preparar una entrega desplegable sin tocar la cuenta (Priority: P1)

El responsable recibe una definición reproducible del entorno de prueba y las instrucciones necesarias para ejecutarla más adelante en la cuenta compartida. Puede distinguir lo implementado y comprobado localmente de lo que todavía requiere su intervención y validación en la nube.

**Why this priority**: el pedido es dejar preparada la infraestructura, no ejecutarla; evita confundir una entrega de código con una demo ya disponible y evita afectar servicios ajenos.

**Independent Test**: revisar la entrega futura sin credenciales de AWS, comprobar su coherencia con las verificaciones locales previstas y verificar que identifica todos los pasos y controles pendientes del responsable. Esta especificación no realiza esas verificaciones de implementación.

**Acceptance Scenarios**:

1. **Given** la cuenta con servicios existentes, **When** se prepara la entrega, **Then** se identifican las dependencias existentes y los recursos nuevos, sin aplicar cambios ni sustituir el backend o servicios existentes.
2. **Given** una entrega todavía no ejecutada, **When** el responsable lee sus resultados, **Then** encuentra separados los controles locales observados y los controles de nube pendientes, sin afirmaciones de disponibilidad real.
3. **Given** un paso que necesita credenciales o un comando reservado, **When** se documenta la operación, **Then** queda asignado al responsable y no se ejecuta por el agente.
4. **Given** la entrega documental autorizada, **When** termina la planificación, **Then** existen especificación, checklist, aclaraciones, plan, tareas y análisis en ese orden, sin implementación hasta que el orquestador lea los resultados.
5. **Given** una imagen estándar compatible y los insumos externos declarados, **When** el compañero ejecuta la infraestructura autorizada, **Then** la máquina prepara automáticamente sus herramientas sin exigir una imagen personalizada ni instalaciones manuales previas dentro del host.
6. **Given** una imagen incompatible o una falla de preparación, **When** arranca la máquina, **Then** se informa la falla sin declarar lista la aplicación ni ejecutar generación de clientes, migraciones o construcción de aplicación/modelos para ocultar la dependencia.

---

### User Story 2 - Compartir la demo con conexión confiable (Priority: P1)

Después de la ejecución autorizada por el responsable, quien recibe el enlace puede abrir la demo desde un navegador habitual sin instalar certificados ni aceptar advertencias de seguridad. Compartir el enlace no otorga acceso a información protegida.

**Why this priority**: una demo compartible es una decisión explícita y necesita una conexión confiable para conservar la seguridad de la sesión existente.

**Independent Test**: tras un despliegue humano, abrir el enlace desde un equipo externo, comprobar la conexión confiable, iniciar y cerrar sesión con una cuenta de prueba y verificar el rechazo del acceso sin sesión. Hasta entonces esta prueba permanece pendiente.

**Acceptance Scenarios**:

1. **Given** el hostname registrado por el responsable y la demo desplegada, **When** un visitante abre el enlace, **Then** accede mediante HTTPS confiable sin advertencias de certificado.
2. **Given** una cuenta de prueba autorizada, **When** inicia sesión y navega, **Then** conserva una sesión válida sin debilitar las protecciones actuales de la cookie; al cerrarla pierde acceso a las operaciones protegidas.
3. **Given** una persona sin autenticación, **When** abre un enlace protegido, **Then** no obtiene datos ni puede realizar operaciones sensibles.
4. **Given** un hostname no configurado o una validación de certificado fallida, **When** se prepara la publicación, **Then** se informa el bloqueo y no se declara lista para compartir ni se recomienda ignorar advertencias.

---

### User Story 3 - Demostrar sin exponer datos ni alterar otros servicios (Priority: P1)

El responsable utiliza datos sintéticos y cuentas de prueba para demostrar capacidades existentes, conservando la separación entre clínicas y el acceso privado a los archivos y a la base de datos.

**Why this priority**: el carácter público del enlace no cambia los límites de acceso ni autoriza datos reales de pacientes.

**Independent Test**: con dos clínicas de prueba, intentar acceder a estudios ajenos y a la persistencia desde fuera del entorno autorizado; comprobar que no se obtienen datos. Revisar además que la entrega no redefine ni elimina servicios existentes. Las comprobaciones de red reales quedan pendientes de ejecución humana.

**Acceptance Scenarios**:

1. **Given** cuentas sintéticas de dos clínicas, **When** una intenta consultar u operar sobre información de la otra, **Then** el acceso se rechaza sin revelar datos ni modificarlos.
2. **Given** un visitante de Internet, **When** intenta conectarse directamente a la base de datos o leer un archivo privado, **Then** no obtiene acceso.
3. **Given** una configuración que necesita secretos, **When** se prepara y revisa la entrega, **Then** no contiene valores secretos en código, ejemplos, salidas compartidas ni registros.
4. **Given** una capacidad de análisis no disponible, **When** se intenta demostrarla, **Then** no se fabrica un resultado clínico ni se presenta una simulación como inferencia real.
5. **Given** servicios ya administrados en la cuenta, **When** se revisa la propuesta futura de cambios, **Then** cualquier sustitución, eliminación o modificación ajena al alcance bloquea su ejecución hasta resolverla con el responsable.

### User Story 4 - Demostrar los dos servicios de inferencia reales (Priority: P1)

Una persona autorizada selecciona explícitamente el análisis apropiado para su estudio sintético y obtiene posibles hallazgos trazables de EchoNext-Mini o del servicio FEVI completo, sin confundir sus resultados ni declarar validación clínica.

**Why this priority**: dos servicios reales son aceptación explícita, aunque su preparación externa no debe frenar la infraestructura independiente.

**Independent Test**: con ambos paquetes y contratos verificados por sus responsables, ejecutar un estudio compatible por cada servicio, comprobar identidad y versión exactas y rechazo de entradas incompatibles. No basta desplegar endpoints ni probar solo EchoNext.

**Acceptance Scenarios**:

1. **Given** ambos servicios preparados y habilitados por el responsable, **When** se solicita cada análisis compatible, **Then** se invoca el servicio seleccionado y se conserva su identidad, versión y resultado validado para esa tarea.
2. **Given** E022 todavía candidato o un paquete/contrato ausente, **When** se evalúa la entrega, **Then** FEVI queda pendiente, no se inventan artefactos o resultados y EC2/RDS pueden avanzar independientemente.
3. **Given** una respuesta FEVI, **When** se integra, **Then** se valida contra su propio contrato acordado, nunca contra las doce probabilidades de EchoNext por conveniencia.
4. **Given** una entrada incompatible o una falla, **When** se solicita el análisis, **Then** se rechaza antes de inferencia o se registra FAILED sin hallazgos; se conserva el aislamiento entre clínicas.

### Edge Cases

- El hostname todavía no existe: se puede preparar la entrega parametrizable, pero no afirmar que el enlace ni su certificado funcionan.
- El hostname cambia o el certificado vence: las instrucciones deben contemplar actualización y renovación; no se desactiva la protección de sesión para sortear la falla.
- Faltan permisos, configuración o disponibilidad de un servicio existente: se informa la dependencia no satisfecha; no se crea un reemplazo silencioso.
- La base de datos no está disponible o no fue preparada por el responsable: no se declara exitoso el despliegue ni se ejecutan comandos reservados para corregirlo.
- Un análisis falla o el servicio de inferencia está apagado: conserva el comportamiento de falla existente, sin resultados inventados y sin encender recursos automáticamente.
- Se encuentra información real de pacientes o un secreto en un insumo: se detiene su uso y se comunica al responsable sin copiarlo a artefactos.
- Una estimación de costo no está aprobada: no se toma como autorización de gasto ni se ejecuta infraestructura real.
- La salida de red aún no está disponible o falta un paquete: la preparación automática espera/reintenta de forma acotada y falla explícitamente; no modifica servicios ajenos ni declara disponibilidad por haber terminado Terraform.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: La entrega futura DEBE preparar mediante Terraform el alojamiento de la aplicación en EC2 y la persistencia en RDS PostgreSQL, conforme al stack constitucional, para un entorno de prueba compartible; NO DEBE presentarse como producción ni como validación clínica. [S1, S2, S3]
- **FR-002**: El entorno DEBE integrarse con los servicios del proyecto en la cuenta AWS del compañero, preservando su backend remoto y los servicios existentes. NO DEBE asumir que el estado desplegado coincide con los archivos del repositorio sin comprobación posterior del responsable. [S6]
- **FR-003**: La demo DEBE ofrecer una dirección pública configurable con HTTPS confiable, usando la decisión aceptada de DuckDNS y Let's Encrypt. El responsable registra el hostname y proporciona los secretos por una vía segura fuera del código y del chat; no se requiere comprar un dominio. [S3, S4, S5]
- **FR-004**: El acceso público DEBE conservar la autenticación, autorización, aislamiento entre clínicas y protección de sesión existentes. Compartir la dirección NO DEBE habilitar acceso anónimo a información protegida ni requerir desactivar cookies seguras. [S3; Constitución II]
- **FR-005**: La base de datos DEBE permanecer privada, sin acceso directo desde Internet y accesible solo a los componentes autorizados que la necesiten. Los archivos de estudios DEBEN conservar su acceso privado y autorizado. [Constitución II, VI]
- **FR-006**: La entrega DEBE definir cómo suministrar la configuración y los permisos mínimos necesarios sin incrustar credenciales ni divulgar secretos en archivos versionados, ejemplos, registros o salidas compartidas. El estado remoto existente contiene secretos y NO DEBE consultarse ni copiarse durante este trabajo. [S6]
- **FR-007**: Las instrucciones futuras DEBEN identificar prerrequisitos, configuración pendiente, preparación de datos, arranque, verificación, renovación del certificado y cierre del entorno de prueba, distinguiendo las tareas humanas y sus efectos sobre recursos y costos. [S1, S2, S4]
- **FR-008**: La entrega DEBE separar evidencia de implementación desplegable y verificaciones locales de evidencia de ejecución real. Certificado, conectividad, sesión, persistencia e integraciones en AWS DEBEN quedar como pendientes hasta observar sus comprobaciones autorizadas. [S1, S6]
- **FR-009**: Este entorno DEBE utilizar solo datos sintéticos y cuentas de prueba. NO autoriza datos reales de pacientes, políticas de conservación clínica ni uso para entrenamiento. Los resultados DEBEN conservar la presentación como posibles hallazgos, nunca diagnósticos. [S2; Constitución I, VI]
- **FR-010**: La demo DEBE ejecutar inferencia real mediante DOS servicios SageMaker: EchoNext-Mini y la cadena FEVI ECGFounder + E022, sin separar backbone y head en endpoints independientes. E022 permanece candidato hasta validación externa; una simulación NO satisface aceptación. El repositorio declara solo EchoNext-Mini y no demuestra disponibilidad en AWS. [S7, S8]
- **FR-013**: La preparación de código, pesos e imagen ML DEBE permanecer externa. Antes de habilitar FEVI se requieren paquete versionado real, evidencia de validación de E022, requisitos de entrada/salida y serving verificados; NO se inventarán URI, versión, esquema ni equivalencias. Su ausencia NO bloquea preparar EC2/RDS. [S7, S8]
- **FR-014**: El plan DEBE evaluar el contrato monomodelo actual y separar la futura integración de selección explícita, validación por tarea y trazabilidad de los dos servicios. FEVI NO DEBE reutilizar silenciosamente el esquema de doce probabilidades EchoNext. Esa integración requiere contrato externo aceptado y tareas acotadas antes de modificar la aplicación. [S7, S8; Constitución IV, V, VIII]
- **FR-011**: Se DEBE preparar la propuesta Terraform solicitada, identificando los recursos facturables y una estimación documentada. Antes de ejecutar, el responsable DEBE aprobar costo, duración y cierre; no se presume un presupuesto ni se autoriza gasto o acciones de nube por el agente. [S1, S2, S6]
- **FR-012**: El trabajo DEBE respetar especificación, aclaración, plan, tareas, análisis e implementación de Spec Kit en ese orden. Esta entrega se limita a artefactos de planificación; no impide la implementación autorizada posterior tras revisión del orquestador. Los commits y comandos reservados de Prisma y Terraform siguen siendo exclusivos del responsable; no habrá push ni acciones de AWS por el agente. [S1, S6]

- **FR-015**: La entrega DEBE preparar automáticamente en la futura EC2 las herramientas del host desde una imagen estándar compatible, sin exigir una imagen personalizada previa. DEBE identificar la imagen compatible y los insumos externos que conserva a cargo del responsable. Una falla de preparación NO DEBE presentarse como arranque exitoso ni autoriza instalar herramientas localmente, construir aplicación/modelos en EC2 o ejecutar comandos reservados. [Delta S1–S3]

### Key Entities

- **Entorno de prueba**: conjunto de aplicación, persistencia y dependencias del proyecto que permite la demo; tiene configuración pendiente, responsable y estado de validación explícitos, sin redefinir datos de negocio.
- **Dirección compartible**: hostname configurable registrado por el responsable, asociado a una conexión confiable y a su renovación; no contiene secretos.
- **Dependencia existente**: servicio o backend que debe preservarse; su configuración conocida por repositorio no equivale a disponibilidad comprobada en la cuenta.
- **Evidencia de entrega**: registro de qué controles se observaron localmente y cuáles requieren ejecución humana en la nube; no incluye secretos ni datos clínicos reales.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: El responsable puede identificar en la entrega el 100 % de los prerrequisitos y pasos manuales declarados, y distinguir en cada control si fue observado localmente o sigue pendiente de ejecución real. Ningún control pendiente figura como aprobado.
- **SC-002**: Tras ejecución autorizada, un visitante externo puede abrir una dirección compartida sin advertencias de seguridad y una cuenta de prueba puede completar inicio de sesión, navegación protegida y cierre de sesión sin excepciones de seguridad.
- **SC-003**: En la validación posterior, el 100 % de los intentos definidos de acceso sin sesión, entre clínicas o directo desde Internet a datos privados se rechazan sin exponer ni modificar datos.
- **SC-004**: La revisión de la entrega encuentra cero valores secretos divulgados y cero sustituciones o eliminaciones de servicios existentes fuera del alcance acordado.
- **SC-005**: Después de la preparación humana, un usuario autorizado puede guardar un estudio sintético, volver a abrirlo y consultar su onda. La demostración del análisis se evalúa según FR-010, sin presentar resultados simulados como reales ni fallas como hallazgos.
- **SC-006**: Antes de cualquier ejecución real, el responsable dispone de una estimación de gasto, duración prevista y procedimiento de cierre acordes con FR-011; ninguno se presenta como aprobado sin su decisión.

- **SC-007**: El responsable puede preparar el host desde una imagen estándar compatible con cero pasos manuales de instalación de herramientas dentro de la máquina y sin fabricar una imagen personalizada; los insumos externos y las comprobaciones reales pendientes permanecen identificados. La evidencia local de preparación y rechazo de fallas no se presenta como despliegue observado.

## Assumptions

### Decisiones aceptadas y límites

- Es una prueba y una demo para compartir, no una autorización de producción o de tratamiento de datos reales. La rama activa es `feature/EC2-RDS`; la carpeta de especificación independiente es `specs/009-ec2-rds-test`. [S1, S2, S3]
- No hay dominio ni subdominio registrado para esta demo. DuckDNS + HTTPS con Let's Encrypt fue aceptado; el nombre concreto y su registro quedan a cargo del responsable. No se solicitan tokens ni secretos en el chat. [S4, S5]
- Se construirá sobre la cuenta del compañero y se preservará lo existente. No se accedió a AWS ni se verificaron despliegues, estado, disponibilidad o costos reales. [S6]
- La constitución fija el stack; nombrarlo en los requisitos expresa una restricción existente, no una elección nueva de arquitectura aprobada por el usuario.
- La preparación automática desde imagen estándar sustituye únicamente la decisión previa de exigir herramientas preinstaladas en una AMI personalizada. No reinicia ciclos de corrección/verificación detenidos ni resuelve permisos, TLS runtime, artefactos ML o integración de aplicación pendientes. [Delta S1–S3]

### Dependencias y decisiones técnicas del plan

- El mapa de repositorio aportado identifica seis módulos existentes en el entorno de desarrollo y un backend remoto S3; todavía no hay módulos de red, EC2 o RDS. Se toma `sa-east-1` como contexto del código existente, no como comprobación de la cuenta real.
- El plan posterior deberá evaluar topología de red, capacidad, disponibilidad, administración, permisos, suministro de secretos, compatibilidad de versiones y costos. Esta especificación NO aprueba una topología, tamaño, estrategia operativa ni mecanismo de despliegue propuestos.
- La disponibilidad de identidad, archivos e inferencia existentes y los permisos para integrarlos dependen del responsable. No se presume que todos estén desplegados o habilitados.
- La validación en nube depende de hostname registrado, credenciales suministradas de forma segura, aprobación económica, preparación humana de la base y autorización de ejecución. La entrega de código no satisface por sí sola SC-002, SC-003 ni SC-005.
- Presupuesto, duración de la prueba y conservación o eliminación de datos sintéticos no se fijan arbitrariamente; se deberán registrar en la preparación operativa. Cualquier uso futuro de datos reales exige resolver antes los requisitos institucionales y legales de conservación y seguridad.

### Fuera de alcance

- Ejecutar acciones de AWS; comprar o registrar dominios por el agente; leer estado, archivos de secretos o credenciales; aplicar migraciones o generar clientes de datos; realizar commits o push.
- Reemplazar servicios existentes, migrar el backend, entrenar modelos o introducir cambios funcionales en la aplicación durante esta entrega documental. La integración futura de los dos servicios solicitados está incluida como trabajo condicionado al contrato externo, no como capacidad clínica ya disponible.
- Garantías de alta disponibilidad, escalado de producción o validación clínica. La estrategia técnica de disponibilidad para la prueba se justificará en el plan, sin presumir aprobación de una arquitectura concreta.
