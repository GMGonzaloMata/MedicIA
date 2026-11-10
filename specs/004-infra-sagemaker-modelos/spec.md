# Feature Specification: Infraestructura base de SageMaker

**Feature Branch**: `004-infra-sagemaker-modelos`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "Infraestructura base de SageMaker como código (carpeta `infra/` de este repositorio), segunda entrega de infraestructura después de la 003. Que el responsable del proyecto pueda crear, de forma reproducible y revisable, en el entorno de desarrollo de AWS (cuenta 896618135592, región sa-east-1), la base sobre la que más adelante se desplegarán los modelos de inferencia de ECG, sin desplegar ningún modelo todavía: (1) un bucket privado y cifrado para los artefactos de los modelos, (2) el rol de ejecución de SageMaker con el mínimo permiso para leer esos artefactos y escribir sus registros, con su propio límite de permisos, y (3) una estructura del código en `infra/` pensada para sumar después un modelo y su punto de inferencia como una entrada nueva, sin rehacer lo anterior. El costo es un requisito central: todo punto de inferencia futuro nace apagado por defecto, se enciende y se apaga con un solo cambio revisable sin perder el resto de la infraestructura, y su costo por hora queda documentado antes de aplicar. Quedan fuera: desplegar cualquier modelo o punto de inferencia, probar la inferencia, la integración con la aplicación, el S3 de estudios de pacientes, RDS, EC2, el entorno de producción, SES y el dominio."

## User Scenarios & Testing *(mandatory)*

El único usuario directo de esta funcionalidad es el **responsable del proyecto**, quien crea, revisa y aplica la infraestructura. De forma indirecta, la usarán las funcionalidades que desplieguen modelos de inferencia y, a través de ellas, las personas que analicen estudios en la plataforma. Esta entrega **no despliega ningún modelo, no crea ningún punto de inferencia y no prueba ninguna inferencia**: deja lista, segura y barata la base sobre la que se hará después.

### User Story 1 - Crear el almacenamiento privado de artefactos de modelos (Priority: P1)

El responsable crea, con la infraestructura descrita en el repositorio, el lugar donde se guardarán los artefactos de los modelos (pesos y código de inferencia empaquetados). Es privado, cifrado y protegido contra el borrado accidental, y no contiene datos de pacientes.

**Why this priority**: los artefactos de los modelos no pueden guardarse en el repositorio, y sin este lugar ningún modelo puede desplegarse. Es la primera pieza de la que dependen las demás.

**Independent Test**: se puede probar creando el almacenamiento y comprobando, con una verificación automática y una inspección, que es privado, cifrado y con versiones, que una segunda ejecución no propone cambios y que no existe ningún acceso público ni a través de otra cuenta.

**Acceptance Scenarios**:

1. **Given** la infraestructura de la 003 aplicada, **When** el responsable crea el almacenamiento de artefactos, **Then** existe un almacenamiento privado, cifrado, con versiones, con transporte seguro obligatorio y sin ninguna forma de acceso público.
2. **Given** el almacenamiento ya creado, **When** el responsable repite la creación, **Then** no se propone ningún cambio.
3. **Given** el almacenamiento con artefactos, **When** alguien intenta borrarlo por accidente, **Then** la protección lo impide.
4. **Given** el repositorio, **When** se revisan todos sus archivos y su historial, **Then** no hay ningún artefacto de modelo, peso ni dato clínico.

---

### User Story 2 - Crear el rol de ejecución de SageMaker con el mínimo permiso (Priority: P1)

El responsable crea el rol con el que SageMaker ejecutará más adelante los modelos. Su único permiso es leer los artefactos de ese almacenamiento y escribir sus propios registros, y lleva su propio límite de permisos, distinto del que usan la aplicación y el plan de CI.

**Why this priority**: es la identidad con la que correrán los modelos, que más adelante procesarán datos clínicos. Un rol con permisos de más es una falla de seguridad, y el límite existente (solo lectura y fijar contraseñas) no puede usarse para este rol.

**Independent Test**: se puede probar creando el rol y verificando que solo SageMaker puede asumirlo, que sus permisos son los de lectura de artefactos y escritura de registros (sin comodines) y que un permiso adicional no puede superar el límite.

**Acceptance Scenarios**:

1. **Given** el almacenamiento de artefactos, **When** el responsable crea el rol de ejecución, **Then** solo el servicio SageMaker de esta cuenta puede asumirlo.
2. **Given** el rol creado, **When** se inspeccionan sus permisos, **Then** solo puede leer los artefactos de este almacenamiento y escribir sus registros, sin acciones ni servicios comodín y sin acceso a otros almacenamientos.
3. **Given** el rol creado, **When** alguien le agrega un permiso fuera de su límite, **Then** el límite lo impide.
4. **Given** el rol y el límite propios, **When** se compara con la aplicación y el rol de plan de CI, **Then** estos conservan su límite actual sin cambios.

---

### User Story 3 - Dejar la estructura lista para sumar un modelo, apagado por defecto (Priority: P2)

El responsable deja en el repositorio una estructura en la que sumar un modelo y su punto de inferencia más adelante es agregar una entrada nueva, sin rehacer el almacenamiento ni el rol. Todo punto de inferencia nace apagado: encenderlo y volver a apagarlo es un solo cambio revisable que no toca el resto de la infraestructura, y el costo por hora de tenerlo encendido está documentado antes de aplicar.

**Why this priority**: el costo es el riesgo central de la inferencia: un punto de inferencia encendido sin uso consume los créditos del proyecto. Es P2 porque, sin ningún modelo todavía, la estructura puede construirse después de la base, pero debe quedar establecida antes de que exista el primer modelo.

**Independent Test**: se puede probar con una verificación automática sobre el plan, sin crear recursos: con el catálogo de modelos vacío no se propone ningún modelo ni punto de inferencia; con una entrada de ejemplo agregada solo en la prueba, se propone el modelo pero ningún punto de inferencia mientras el interruptor está apagado, y exactamente uno al encenderlo.

**Acceptance Scenarios**:

1. **Given** la estructura sin ningún modelo, **When** se calcula el plan, **Then** no se propone ningún modelo ni punto de inferencia, y el costo de cómputo es cero.
2. **Given** una entrada de modelo nueva, **When** se calcula el plan con su interruptor en el valor por defecto, **Then** el punto de inferencia queda apagado y no genera costo de cómputo.
3. **Given** una entrada de modelo, **When** el responsable enciende el interruptor con un cambio revisable, **Then** el plan propone el punto de inferencia, y al apagarlo se propone quitarlo sin tocar el almacenamiento, el rol ni los demás modelos.
4. **Given** la guía del repositorio, **When** el responsable la consulta antes de encender un punto de inferencia, **Then** encuentra el costo por hora, por día y por mes de cada tipo de cómputo permitido y cómo apagarlo.

---

### User Story 4 - Revisar cada cambio y otorgar los permisos por la vía de administración (Priority: P2)

Cada cambio de esta infraestructura pasa por las comprobaciones automáticas y la revisión de la revisora de infraestructura antes de llegar a la rama principal, igual que el resto de `infra/`. Los permisos nuevos que el operador y el rol de plan de CI necesitan para estos recursos se otorgan por la vía de administración ya documentada, sin que el operador amplíe sus propios permisos.

**Why this priority**: es la misma defensa de la 003, aplicada a una pieza que más adelante manejará datos clínicos. Es P2 porque solo tiene sentido cuando ya existe código que revisar.

**Independent Test**: se puede probar proponiendo un cambio de prueba que incumpla una regla (por ejemplo, un permiso comodín en el rol de ejecución) y comprobando que las comprobaciones fallan, y verificando que el plan de CI calcula los recursos nuevos con el rol de plan de solo lectura.

**Acceptance Scenarios**:

1. **Given** una propuesta que toca esta infraestructura, **When** se ejecutan las comprobaciones, **Then** se verifican formato, validez, riesgos de seguridad y plan, y la propuesta no puede incorporarse si alguna falla.
2. **Given** un permiso comodín o un acceso a otros almacenamientos en el rol de ejecución, **When** se ejecutan las comprobaciones, **Then** fallan.
3. **Given** que el operador y el rol de plan necesitan permisos nuevos para estos recursos, **When** el responsable los otorga, **Then** lo hace por la vía de administración documentada, con permisos de mínimo privilegio, y sin otra ampliación del límite de la aplicación y del rol de plan que las lecturas indicadas en FR-008.
4. **Given** un cambio ya revisado, **When** llega a la rama principal, **Then** ninguna automatización lo aplica a la infraestructura real.

---

### Edge Cases

- **El operador no tiene permisos para crear estos recursos:** hoy su política no incluye SageMaker ni un límite de permisos nuevo. La guía debe indicar el paso de administración que los otorga antes de aplicar, y, si faltan, la operación debe fallar con el error de acceso denegado de AWS, sin dejar cambios a medias, y la guía debe explicar ese error y qué paso lo corrige.
- **El plan de CI no puede leer los recursos nuevos:** hasta que el rol de plan reciba su permiso de lectura, el plan de CI falla. La guía debe indicar el orden: primero los permisos, después la propuesta.
- **El límite de permisos actual no sirve para el rol de ejecución:** solo permite lectura y fijar contraseñas. El rol de ejecución necesita su propio límite, y el operador solo puede crear roles que lleven un límite aprobado.
- **Almacenamiento de artefactos eliminado por error:** los artefactos no están en el repositorio y pueden provenir de una fuente de acceso restringido, por lo que su pérdida es costosa. Debe estar protegido contra el borrado y conservar versiones anteriores.
- **Costo de almacenar versiones antiguas:** las versiones no vigentes de los artefactos deben vencer por sí solas para que el costo no crezca sin control.
- **Cuota de servicio en una cuenta reciente:** las cuentas nuevas o de plan reciente pueden tener cupo cero para ciertos tipos de cómputo de SageMaker. Es un problema del primer despliegue y debe documentarse cómo comprobarlo y pedir el aumento. No afecta a esta entrega, que no crea cómputo.
- **Punto de inferencia futuro olvidado encendido:** la guía debe indicar cómo comprobar qué hay encendido y cómo apagarlo, y el presupuesto de costos existente debe alertar el gasto.
- **Modelo con licencia restringida:** un modelo de investigación con acceso restringido o patente no puede subirse ni usarse hasta revisar su licencia. Los artefactos nunca van al repositorio.
- **Credenciales del responsable vencidas o ausentes:** las operaciones deben fallar con un mensaje claro y sin dejar cambios a medias.
- **Región sin disponibilidad:** si un tipo de cómputo no estuviera disponible en la región elegida, la funcionalidad que lo despliegue lo debe verificar. Esta entrega no lo necesita.

## Requirements *(mandatory)*

### Functional Requirements

**Almacenamiento de artefactos**

- **FR-001**: Toda la infraestructura de esta funcionalidad DEBE estar descrita en la carpeta `infra/` de este repositorio y poder crearse desde cero a partir de ella, en el mismo entorno de desarrollo y con el mismo estado remoto que la 003.
- **FR-002**: DEBE existir un almacenamiento para los artefactos de los modelos que sea privado, cifrado en reposo, con versiones, con transporte seguro obligatorio y sin ninguna forma de acceso público ni desde otras cuentas.
- **FR-003**: El almacenamiento DEBE estar protegido contra el borrado accidental, y las versiones no vigentes DEBEN vencer automáticamente para acotar el costo.
- **FR-004**: El almacenamiento NO DEBE contener datos de pacientes ni estudios. Está reservado a los artefactos de los modelos. El almacenamiento de estudios es otra funcionalidad.
- **FR-005**: Ningún artefacto de modelo, peso ni dato clínico DEBE existir en el repositorio ni en su historial. Los artefactos los sube el responsable a mano, con una forma documentada.

**Rol de ejecución**

- **FR-006**: DEBE existir un rol de ejecución de SageMaker que solo el servicio SageMaker de esta cuenta pueda asumir.
- **FR-007**: El rol DEBE tener únicamente los permisos de leer los artefactos de este almacenamiento y escribir sus registros, sin acciones ni servicios comodín y sin acceso a otros almacenamientos.
- **FR-008**: El rol DEBE llevar un límite de permisos propio, distinto del de la aplicación y del rol de plan de CI, que fije su techo. Estos dos últimos conservan su límite actual, que solo puede ampliarse con lecturas enumeradas de los recursos de esta funcionalidad (el almacenamiento y el rol de ejecución), sin escrituras, sin comodines y sin cambiar los permisos efectivos de la aplicación. *Ampliado por la funcionalidad 005 (2026-11-10): se suman lecturas enumeradas de SageMaker (`DescribeModel`, `DescribeEndpointConfig`, `DescribeEndpoint` y `ListTags` sobre recursos `medicia-dev-*`) y de ECR (`DescribeRepositories`, `GetLifecyclePolicy`, `GetRepositoryPolicy` y `ListTagsForResource` sobre repositorios `medicia-dev-*`), también sin escrituras ni comodines. El techo del usuario de la aplicación sube con ellas, pero su política real no se las concede.*
- **FR-009**: El rol y su límite DEBEN respetar las reglas de la 003 para el operador: solo se crean con un límite aprobado y el operador no puede editar las políticas que lo limitan.

**Estructura para sumar modelos y costo**

- **FR-010**: DEBE existir una estructura en `infra/` en la que sumar un modelo y su punto de inferencia sea agregar una entrada nueva, sin modificar el almacenamiento ni el rol, y sin rehacer lo existente.
- **FR-011**: Esta entrega NO DEBE crear ningún modelo, configuración de modelo ni punto de inferencia, y DEBE tener costo de cómputo cero.
- **FR-012**: Todo punto de inferencia futuro DEBE nacer apagado por defecto. Encenderlo y volver a apagarlo DEBE ser un solo cambio revisable que no altere el almacenamiento, el rol ni los demás modelos.
- **FR-013**: DEBE existir una comprobación automática, sobre el plan y sin crear recursos, que falle si una entrada de modelo propone un punto de inferencia sin que su interruptor esté encendido.
- **FR-014**: La guía DEBE documentar, antes de cualquier despliegue, el costo por hora, por día y por mes de cada tipo de cómputo permitido, cómo comprobar qué está encendido y cómo apagarlo.
- **FR-015**: El costo adicional de esta base, con todo apagado, DEBE ser mínimo y comprobable, y el gasto DEBE seguir acotado por el presupuesto y las alertas de costos existentes del entorno.

**Revisión y permisos**

- **FR-016**: Todos los recursos DEBEN llevar las etiquetas de proyecto, entorno y gestión que exige la 003.
- **FR-017**: Cada propuesta que toque esta infraestructura DEBE ejecutar en CI el formato, la validación, un análisis de seguridad y un plan de solo lectura, y las pruebas de Terraform sobre el plan (sin crear recursos).
- **FR-018**: DEBE existir una comprobación automática que falle si el rol de ejecución tiene acciones comodín, acceso a otros almacenamientos o un principal distinto de SageMaker, y si el almacenamiento deja de ser privado o cifrado.
- **FR-019**: Los permisos nuevos que el operador y el rol de plan de CI necesiten para estos recursos DEBEN otorgarse por la vía de administración documentada en la 003, con permisos de mínimo privilegio, sin acciones ni servicios comodín, y sin otra ampliación del límite de la aplicación y del rol de plan que las lecturas indicadas en FR-008. La guía DEBE indicar el orden de los pasos.
- **FR-020**: Los comandos que modifican la infraestructura real (aplicar, destruir, importar y modificar el estado) DEBEN ser ejecutados solo por el responsable. NINGUNA automatización de CI DEBE aplicarlos. Todo cambio DEBE pasar por la revisora de infraestructura.
- **FR-021**: La guía de `infra/` DEBE actualizarse con esta funcionalidad: la base de SageMaker, cómo se sube un artefacto, el costo por hora, cómo sumar un modelo, cómo encender y apagar un punto de inferencia, y el orden de los permisos del operador y del rol de plan.
- **FR-022**: La guía DEBE advertir que un modelo de investigación con acceso restringido o patente (como EchoNext-Mini) requiere revisar su licencia y su acuerdo de uso antes de subir sus artefactos o usarlo, y que todo resultado de un modelo se presenta siempre como posible hallazgo, nunca como diagnóstico.

### Key Entities

- **Almacenamiento de artefactos**: el lugar privado y cifrado donde se guardan los artefactos de los modelos. No contiene datos de pacientes.
- **Artefacto de modelo**: los pesos y el código de inferencia empaquetados de un modelo. Nunca se guarda en el repositorio.
- **Rol de ejecución**: la identidad con la que SageMaker corre un modelo. Solo lee artefactos y escribe sus registros, y tiene un límite de permisos propio.
- **Límite de permisos propio**: el techo de permisos del rol de ejecución, distinto del de la aplicación y del plan de CI.
- **Catálogo de modelos**: la lista de modelos que la estructura sabe desplegar. En esta entrega está vacía. Cada entrada futura describe un modelo y su punto de inferencia.
- **Punto de inferencia**: el servicio encendido que ejecuta un modelo y recibe estudios. Genera costo mientras está encendido. En esta entrega no existe ninguno.
- **Interruptor de encendido**: el valor, por entrada de modelo, que decide si su punto de inferencia existe. Nace apagado.
- **Vía de administración**: el procedimiento documentado de la 003 con el que se otorgan permisos nuevos al operador, porque este no puede editar sus propias políticas.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Con la 003 aplicada, el responsable puede crear la base (almacenamiento y rol) en menos de 20 minutos siguiendo solo la guía, sin ningún paso no documentado.
- **SC-002**: Una segunda ejecución de la creación, sin cambios en el repositorio, propone 0 cambios.
- **SC-003**: El costo adicional mensual de esta base, con todo apagado, es menor a 1 USD.
- **SC-004**: El 100 % de los permisos del rol de ejecución son explícitos (0 comodines) y solo cubren leer los artefactos y escribir sus registros, verificado por una comprobación automática; un cambio que lo incumple la hace fallar.
- **SC-005**: 0 artefactos de modelos, datos clínicos o secretos en el repositorio, en su historial o en las salidas de las comprobaciones, verificado por una búsqueda automática.
- **SC-006**: Con el catálogo vacío, el plan propone 0 modelos y 0 puntos de inferencia. Con una entrada de ejemplo, propone 0 puntos de inferencia hasta encenderla y exactamente 1 al hacerlo, verificado por una comprobación automática sin crear recursos.
- **SC-007**: El 100 % de las propuestas sobre esta infraestructura pasan por formato, validación, análisis de seguridad, pruebas y plan antes de incorporarse, y 0 se aplican por una automatización.
- **SC-008**: El costo por hora, por día y por mes de cada tipo de cómputo permitido está documentado antes de que exista el primer punto de inferencia, y el responsable puede comprobar qué hay encendido y apagarlo siguiendo solo la guía.

## Assumptions

- **Base de la 003:** esta funcionalidad depende de la 003 (estado remoto, cuenta de desarrollo, rol de plan de CI, política del operador con su límite y flujo de CI) y la extiende sin modificar su comportamiento.
- **Cuenta y región:** la cuenta `896618135592`, ya en plan pago con unos 119 USD de crédito, y la región `sa-east-1`. La disponibilidad del cómputo de SageMaker en esa región y la cuota de servicio de la cuenta se verifican cuando se cree el primer punto de inferencia, no en esta entrega, que no usa cómputo.
- **Sin cómputo:** esta entrega solo crea almacenamiento e identidades, que no generan costo de cómputo. El costo esperado es casi cero (centavos de almacenamiento). El costo por hora de un punto de inferencia se documenta con los precios vigentes al momento de escribir la guía y se recomprueba antes del primer despliegue.
- **Un solo operador:** una única persona aplica la infraestructura, con la política del operador de la 003. Los permisos nuevos para esta funcionalidad los otorga ella misma, con un administrador, por la vía de administración documentada.
- **Límite propio para el rol:** el límite actual de la 003 (lectura y fijar contraseñas) no sirve para el rol de ejecución. Esta funcionalidad crea un límite propio y la política del operador se ajusta, por la vía de administración, para que solo pueda crear roles con un límite aprobado. La forma concreta se decide en el plan.
- **Artefactos subidos a mano:** el responsable sube los artefactos al almacenamiento con sus propias credenciales. Esta entrega no los gestiona ni los despliega.
- **Código de modelos fuera del repositorio:** el entrenamiento y el código Python de los modelos viven fuera de este repositorio, según la constitución. La estructura solo referencia artefactos ya empaquetados.
- **Cómputo de CPU:** el cómputo con GPU requiere una decisión de costo aparte y no forma parte de esta entrega.
- **Modelo EchoNext-Mini:** es un modelo de investigación de acceso restringido, con un acuerdo de uso de PhysioNet y una solicitud de patente de Columbia. Su licencia debe revisarse antes de subir sus artefactos o usarlo. No forma parte de esta entrega.
- **Herramienta:** Terraform, según la constitución. El diseño de los módulos y el límite de permisos concreto se deciden en el plan.
- **Recursos fuera de alcance:** desplegar cualquier modelo o punto de inferencia, probar la inferencia, la integración con la aplicación, el almacenamiento de estudios de pacientes, la base de datos, el servidor de la aplicación, el entorno de producción, el correo con SES y el dominio se especifican por separado.
- **Idioma:** los documentos y la guía están en español rioplatense.
