# Feature Specification: Infraestructura base y servicio de identidad

**Feature Branch**: `003-infra-base-cognito`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Infraestructura base como código (carpeta `infra/` de este repositorio). Primera entrega: que el responsable del proyecto pueda crear y mantener, de forma reproducible y revisable, el entorno de desarrollo en AWS con el almacenamiento remoto, cifrado y con bloqueo, del estado de la infraestructura, y el servicio de identidad (grupo de usuarios de Amazon Cognito) configurado exactamente como exige el contrato de la funcionalidad 002, sin guardar secretos en el repositorio, con las reglas de la constitución v1.6.1 y con revisión automática en CI. Quedan fuera: S3 de estudios, RDS, EC2, SageMaker, el entorno de producción, el correo con SES y el dominio."

## Clarifications

### Session 2026-11-09

- Q: ¿Con qué identidad fija la aplicación local la contraseña en el servicio de identidad? → A: un usuario IAM dedicado con un único permiso (fijar contraseñas en este grupo de usuarios) y una clave de acceso guardada en el archivo local de entorno del responsable. En producción se reemplaza por un rol del servidor sin claves.
- Q: ¿El plan de CI se calcula contra la infraestructura real o solo contra la configuración? → A: contra AWS, con un rol de solo lectura que GitHub asume por federación (sin claves guardadas), con confianza limitada a las propuestas de cambio de este repositorio.
- Q: ¿La comprobación del contrato del servicio de identidad se hace sobre el plan o contra el servicio real? → A: pruebas de Terraform sobre el plan (sin crear recursos), ejecutadas en CI en cada propuesta que toque `infra/`.

## User Scenarios & Testing *(mandatory)*

El único usuario directo de esta funcionalidad es el **responsable del proyecto**, quien crea, revisa y aplica la infraestructura. De forma indirecta la usan la aplicación (que necesita un servicio de identidad real) y, más adelante, todas las personas que ingresen a la plataforma. Hoy la aplicación solo funciona con un servicio de identidad simulado: esta funcionalidad es la que permite probar el ingreso real de la funcionalidad 002 y cierra sus pendientes con el servicio real.

### User Story 1 - Preparar el entorno de desarrollo y su estado remoto (Priority: P1)

El responsable parte de una cuenta de AWS de desarrollo ya creada y protegida. Siguiendo una guía del repositorio, ejecuta una sola vez el paso de arranque, que crea el lugar donde se guarda de forma remota, cifrada y con bloqueo el estado de la infraestructura. Desde entonces, toda la infraestructura del entorno de desarrollo se describe en el repositorio y se aplica de forma repetible.

**Why this priority**: sin un estado compartido, protegido y bloqueado, ninguna otra pieza de infraestructura puede gestionarse con seguridad. Es la base de todo lo demás y de las futuras funcionalidades de infraestructura.

**Independent Test**: se puede probar siguiendo la guía en una cuenta de desarrollo sin recursos del proyecto: al terminar existe el almacenamiento del estado, el entorno puede inicializarse contra él y una segunda ejecución del paso de arranque no cambia nada.

**Acceptance Scenarios**:

1. **Given** una cuenta de desarrollo con la protección de la cuenta raíz y una identidad de trabajo que no es la raíz, **When** el responsable ejecuta el paso de arranque siguiendo la guía, **Then** se crea un almacenamiento de estado privado, cifrado y con versiones, y el entorno de desarrollo puede usarlo con bloqueo.
2. **Given** que el estado ya existe, **When** el responsable repite el paso de arranque, **Then** no se propone ningún cambio.
3. **Given** el estado en uso por una operación, **When** otra operación intenta modificarlo a la vez, **Then** la segunda es rechazada por el bloqueo.
4. **Given** el repositorio, **When** se revisan todos los archivos versionados, **Then** no hay ningún archivo de estado, de planes guardados ni de variables con valores sensibles.

---

### User Story 2 - Crear el servicio de identidad conforme al contrato (Priority: P1)

El responsable crea, con la infraestructura descrita en el repositorio, el servicio de identidad del entorno de desarrollo configurado exactamente como exige el contrato de la funcionalidad 002. Al terminar, la aplicación puede registrar, verificar e ingresar personas reales y fijar la contraseña al verificar el correo.

**Why this priority**: es lo que desbloquea el ingreso real. Sin este servicio, la funcionalidad 002 solo puede probarse con la simulación y sus pendientes de verificación con el servicio real quedan abiertos.

**Independent Test**: se puede probar creando el servicio y comprobando, con una verificación automática y con un recorrido manual, que cada punto del contrato se cumple y que el recorrido registro, verificación e ingreso de la funcionalidad 002 funciona contra él.

**Acceptance Scenarios**:

1. **Given** el estado remoto listo, **When** el responsable crea el servicio de identidad, **Then** se cumple cada punto del contrato: ingreso con correo sin distinguir mayúsculas, registro abierto, verificación por código numérico de 6 dígitos, atributos obligatorios de correo y nombre, política de contraseña de 8 caracteres con al menos una mayúscula, y sin segundo factor.
2. **Given** el servicio creado, **When** se inspecta su cliente de aplicación, **Then** es el único cliente con registro habilitado, es confidencial (tiene secreto), solo permite el ingreso con usuario y contraseña, no emite credenciales de renovación, oculta si un correo tiene cuenta y emite tokens de identidad de la vida más corta permitida.
3. **Given** el servicio creado, **When** se inspeccionan sus opciones de interfaz alojada, **Then** no existe ninguna que permita registrarse por fuera del cliente de la aplicación.
4. **Given** el servidor de la aplicación en desarrollo, **When** necesita fijar la contraseña al verificar el correo, **Then** puede hacerlo con una identidad cuyo único permiso es esa operación sobre este servicio, y no puede hacer ninguna otra tarea de administración.
5. **Given** una persona que se registra, verifica el correo con el código recibido y elige su contraseña, **When** ingresa, **Then** entra a la aplicación y ve el estado vacío de la funcionalidad 002.

---

### User Story 3 - Conectar la aplicación sin guardar secretos en el repositorio (Priority: P2)

El responsable obtiene los datos de conexión del servicio de identidad (región, identificador del servicio, identificador del cliente y secreto del cliente) y los entrega a la aplicación en su entorno local, sin que ninguno quede escrito en archivos versionados, en el historial, en registros ni en las salidas de las comprobaciones automáticas.

**Why this priority**: es la conexión entre la infraestructura y la aplicación. Es P2 porque puede hacerse a mano mientras el servicio existe, pero sin una forma segura de hacerlo el secreto terminaría expuesto.

**Independent Test**: se puede probar siguiendo la guía de conexión: con los datos de conexión cargados localmente, la aplicación inicia con el servicio real, y una búsqueda del secreto en todos los archivos versionados y en los resultados de las comprobaciones no lo encuentra.

**Acceptance Scenarios**:

1. **Given** el servicio creado, **When** el responsable consulta los datos de conexión, **Then** obtiene la región, el identificador del servicio y el del cliente sin restricciones, y el secreto del cliente solo mediante una consulta explícita que lo marca como sensible.
2. **Given** los datos cargados en el archivo local de entorno del responsable (ya excluido del repositorio), **When** la aplicación inicia en modo de servicio real, **Then** el ingreso funciona contra el servicio creado.
3. **Given** cualquier cambio propuesto al repositorio, **When** se ejecutan las comprobaciones, **Then** ninguna salida, registro o archivo contiene el secreto.

---

### User Story 4 - Revisar cada cambio de infraestructura antes de aplicarlo (Priority: P2)

Cada cambio dentro de `infra/` se revisa antes de llegar a la rama principal: comprobaciones automáticas en cada propuesta de cambio (formato, validación, análisis de seguridad y un plan de lo que cambiaría) y la revisión de la revisora de infraestructura. Aplicar el cambio a la infraestructura real lo hace después, y solo, el responsable.

**Why this priority**: la infraestructura mal configurada es una falla de seguridad sobre datos clínicos, y un error aplicado es difícil de deshacer. La revisión previa es la defensa, pero solo tiene sentido cuando ya existe algo que revisar.

**Independent Test**: se puede probar proponiendo un cambio de prueba que incumpla una regla (por ejemplo, un secreto en un archivo o un permiso demasiado amplio) y comprobando que las comprobaciones fallan y que la revisora lo señala.

**Acceptance Scenarios**:

1. **Given** una propuesta de cambio que toca `infra/`, **When** se ejecutan las comprobaciones, **Then** se verifican el formato, la validez de la configuración y los riesgos de seguridad, y se muestra el plan de cambios.
2. **Given** un cambio que incumple una regla de seguridad, **When** se ejecutan las comprobaciones, **Then** la propuesta no puede incorporarse hasta corregirlo.
3. **Given** un plan que propone destruir o reemplazar el servicio de identidad, **When** se revisa, **Then** queda señalado como riesgo bloqueante y no se aplica sin decisión explícita del responsable.
4. **Given** un cambio ya revisado, **When** llega a la rama principal, **Then** ninguna automatización lo aplica a la infraestructura real.

---

### Edge Cases

- **Estado bloqueado por un proceso que se cortó:** debe existir un procedimiento documentado para liberar el bloqueo con seguridad, sin editar el estado a mano.
- **Plan que reemplaza el servicio de identidad:** reemplazar el servicio borraría a todos sus usuarios. Debe estar protegido contra ese cambio accidental.
- **Pérdida del secreto del cliente:** debe existir un procedimiento documentado para obtener uno nuevo sin perder las cuentas existentes.
- **Cambio hecho a mano en la consola de AWS:** la comprobación del plan debe mostrar la diferencia con lo descrito en el repositorio.
- **Dos operaciones simultáneas:** el bloqueo debe impedir que dos personas o procesos modifiquen el estado a la vez.
- **Cuenta sin protección de la cuenta raíz:** la guía debe exigir comprobar los requisitos previos antes de crear nada.
- **Credenciales del responsable vencidas o ausentes:** las operaciones deben fallar con un mensaje claro y sin dejar cambios a medias.
- **Almacenamiento del estado eliminado accidentalmente:** debe estar protegido contra el borrado y conservar versiones anteriores.
- **Cuenta de desarrollo en plan pago:** el 2026-11-09 el responsable eligió la cuenta `896618135592`, que había vencido su plan gratuito de 6 meses y estaba suspendida, y la pasó a un plan pago (conserva unos 119 USD de crédito). **Verificado el 2026-11-09:** una cuenta del plan gratuito, como la otra cuenta del responsable, bloquea S3, Cognito y SageMaker con "explicit deny" por una política de servicio de la organización que administra AWS; en la cuenta ya actualizada S3 responde sin ese bloqueo. Cognito estaba aún habilitándose y debe re-verificarse. La cuenta DEBE tener la alerta de costos y el límite de gasto antes de aplicar. La otra cuenta (`365816237483`) no se usa para MedicIA. Importante: unir cuentas en una organización de AWS hace vencer el crédito restante al instante, por lo que no se hace en esta funcionalidad.
- **Correo de verificación limitado:** el remitente por defecto del servicio tiene un tope diario bajo. Es suficiente para desarrollo y debe quedar documentado.

## Requirements *(mandatory)*

### Functional Requirements

**Estado y entornos**

- **FR-001**: Toda la infraestructura de esta funcionalidad DEBE estar descrita en la carpeta `infra/` de este repositorio y poder crearse desde cero a partir de ella.
- **FR-002**: El entorno de desarrollo DEBE tener su propio estado y su propia configuración, independientes de los de cualquier otro entorno. DEBE quedar establecida la separación con producción desde el comienzo, sin crear aún el entorno de producción.
- **FR-003**: El estado de la infraestructura DEBE guardarse de forma remota, privada, cifrada, con versiones y con bloqueo, y NUNCA en el repositorio.
- **FR-004**: DEBE existir un paso de arranque, que se ejecuta una sola vez, que crea el almacenamiento del estado. DEBE poder repetirse sin cambiar nada y DEBE estar protegido contra el borrado accidental.
- **FR-005**: Los requisitos previos de la cuenta (protección de la cuenta raíz con segundo factor, una identidad de trabajo que no sea la raíz y una alerta de costos) DEBEN estar documentados y comprobarse antes de crear recursos.
- **FR-006**: Todo el entorno DEBE ubicarse en una única región, São Paulo (`sa-east-1`), para mantener los datos dentro de Sudamérica.

**Servicio de identidad**

- **FR-007**: El servicio de identidad DEBE cumplir todos los puntos de la sección "Configuración requerida del grupo de usuarios" de `specs/002-ingreso-sesion/contracts/identity-provider.md`: ingreso con correo sin distinguir mayúsculas, registro abierto, verificación del correo por código numérico de 6 dígitos, atributos obligatorios de correo y nombre, y segundo factor desactivado.
- **FR-008**: La política de contraseña DEBE exigir entre 8 y 128 caracteres con al menos una mayúscula, y nada más. DEBE coincidir con la política de la aplicación.
- **FR-009**: DEBE existir un único cliente de aplicación, confidencial (con secreto), que solo permita el ingreso con usuario y contraseña, sin credenciales de renovación, con la protección contra la revelación de qué correos tienen cuenta y con la vida más corta posible para los tokens de identidad.
- **FR-010**: NO DEBE existir ninguna otra vía de registro: ningún otro cliente con registro habilitado ni interfaz alojada que lo permita.
- **FR-011**: DEBE existir un usuario IAM dedicado a la aplicación, cuyo único permiso es fijar la contraseña de una cuenta de este servicio (y ninguna otra tarea de administración). Su clave de acceso se obtiene mediante una consulta explícita marcada como sensible y se guarda solo en el archivo local de entorno del responsable. En producción esta identidad se reemplaza por un rol del servidor sin claves de larga duración.
- **FR-012**: El servicio de identidad DEBE estar protegido contra su destrucción o reemplazo accidental, porque reemplazarlo borra a todos sus usuarios.

**Conexión con la aplicación**

- **FR-013**: La región, el identificador del servicio y el identificador del cliente DEBEN poder consultarse libremente. El secreto del cliente y la clave de acceso del usuario de la aplicación DEBEN obtenerse solo mediante una consulta explícita, marcados como sensibles.
- **FR-014**: Ningún secreto, estado, plan guardado ni archivo de variables con valores sensibles DEBE existir en archivos versionados, en el historial, en registros ni en salidas de comprobaciones. Lo que se ignore DEBE estar declarado, y el archivo de bloqueo de versiones DEBE versionarse.

**Revisión y operación**

- **FR-015**: Las versiones de Terraform y de los proveedores DEBEN estar fijadas, y sus actualizaciones DEBEN hacerse en cambios separados de los funcionales.
- **FR-016**: Todos los recursos DEBEN llevar etiquetas de proyecto, entorno y gestión.
- **FR-017**: Cada propuesta de cambio que toque `infra/` DEBE ejecutar en CI el formato, la validación, un análisis de seguridad y un plan sin aplicarlo. El plan DEBE calcularse contra la infraestructura real, con un rol de solo lectura que GitHub asume por federación (sin claves de larga duración guardadas), cuya confianza esté limitada a las propuestas de cambio de este repositorio. Ese rol y la confianza con GitHub forman parte de esta funcionalidad y se crean en el paso de arranque.
- **FR-018**: Los comandos que modifican la infraestructura real (aplicar, destruir, importar y modificar el estado) DEBEN ser ejecutados solo por el responsable. NINGUNA automatización de CI DEBE aplicarlos.
- **FR-019**: Todo cambio de `infra/` DEBE pasar por la revisora de infraestructura.
- **FR-020**: DEBE existir una comprobación automática que falle si el servicio de identidad deja de cumplir cualquier punto del contrato. Se implementa con pruebas de Terraform sobre el plan (sin crear recursos ni usar credenciales de escritura) y corre en CI en cada propuesta de cambio que toque `infra/`.
- **FR-021**: DEBE existir una guía en el repositorio que cubra el arranque, el uso diario, la conexión de la aplicación, la recreación desde cero, el desbloqueo del estado, la obtención de un nuevo secreto y la liberación de los recursos al terminar.

### Key Entities

- **Entorno**: una copia completa y aislada de la infraestructura (hoy solo desarrollo; producción queda reservado). Tiene su propio estado, su propia configuración y su propia cuenta de AWS.
- **Estado remoto**: el registro de qué recursos existen y cómo se configuraron. Es privado, cifrado, versionado y bloqueable, y no pertenece al repositorio.
- **Servicio de identidad**: el servicio que guarda las cuentas, verifica los correos y comprueba las contraseñas. Pertenece a una región y a un entorno, y no puede reemplazarse sin perder a sus usuarios.
- **Cliente de aplicación**: la credencial con la que la aplicación habla con el servicio de identidad. Tiene un identificador y un secreto.
- **Permiso del servidor**: la autorización mínima que permite a la aplicación fijar la contraseña al verificar el correo.
- **Datos de conexión**: región, identificador del servicio, identificador del cliente y secreto del cliente, que la aplicación necesita para iniciar.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con los requisitos previos cumplidos, el responsable puede crear el entorno de desarrollo desde cero en menos de 30 minutos siguiendo solo la guía, sin ningún paso no documentado.
- **SC-002**: Una segunda ejecución de la creación, sin cambios en el repositorio, propone 0 cambios.
- **SC-003**: El 100 % de los puntos del contrato del servicio de identidad están verificados por una comprobación automática, y un cambio que incumple uno la hace fallar.
- **SC-004**: 0 secretos, archivos de estado o planes guardados en el repositorio, en su historial o en las salidas de las comprobaciones, verificado por una búsqueda automática.
- **SC-005**: El 100 % de las propuestas de cambio sobre `infra/` pasan por formato, validación, análisis de seguridad y plan antes de incorporarse, y 0 se aplican por una automatización.
- **SC-006**: El recorrido registro, verificación con elección de contraseña e ingreso de la funcionalidad 002 funciona contra el servicio real, y quedan resueltos con él los pendientes de verificación de esa funcionalidad.
- **SC-007**: El costo mensual del entorno de desarrollo es menor a 1 USD con el uso de desarrollo.

## Assumptions

- **Región:** `sa-east-1` por los datos de salud y la latencia. La disponibilidad de los servicios de inferencia en esa región se verifica en la funcionalidad que los incorpore.
- **Cuenta de desarrollo:** la cuenta `896618135592` del responsable, ya en plan pago, con unos 119 USD de crédito que se descuentan primero (la fecha de vencimiento del crédito se lee en la página de Créditos de facturación). El costo esperado es casi cero. La cuenta de producción se creará con la funcionalidad de producción, para mantener separados los permisos.
- **Requisitos previos de la cuenta:** la protección de la cuenta raíz, la identidad de trabajo y la alerta de costos los hace el responsable en la consola de AWS. Esta funcionalidad los documenta y los comprueba, pero no los automatiza.
- **Identidad de trabajo del responsable:** hoy el perfil local de la cuenta usa una clave de acceso de la cuenta raíz, lo que no se admite: se borra esa clave y se crea un usuario IAM propio de Terraform, con segundo factor y una clave guardada solo en la máquina del responsable (nunca en el repositorio). Como la cuenta ya es de pago, se puede migrar a credenciales temporales (IAM Identity Center) en una etapa posterior.
- **Un solo operador:** una única persona aplica la infraestructura, desde su máquina y con su identidad de trabajo. No hay despliegue automático.
- **Dónde guarda la aplicación el secreto en desarrollo:** en el archivo local de entorno del responsable, que ya está excluido del repositorio. Un gestor de secretos se evalúa con el entorno de producción.
- **Herramienta:** Terraform, según la constitución v1.6.1. El diseño de los módulos y el backend concreto se deciden en el plan.
- **Correo de verificación:** se usa el remitente por defecto del servicio de identidad, con su tope diario bajo. El correo con SES llega con la funcionalidad de invitaciones.
- **Recursos fuera de alcance:** el almacenamiento de estudios, la base de datos, el servidor de la aplicación, la inferencia, el entorno de producción y el dominio propio se especifican por separado.
- **Idioma:** los documentos y la guía están en español rioplatense.
- **Interacción con la funcionalidad 002:** esta funcionalidad no modifica la aplicación. Las pendientes T072, T080 y T083 de la funcionalidad 002 se cierran con ella.
