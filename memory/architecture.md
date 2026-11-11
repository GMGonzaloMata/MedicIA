# Arquitectura del proyecto

## 1. Arquitectura de software

- **Estilo:** Monolito modular con Next.js full-stack.
- **Enfoque:** Principios de arquitectura hexagonal y SOLID, aplicados de forma pragmática.
- **Módulos de negocio:** Clínicas (tenants), usuarios, estudios, análisis y catálogo/versiones de modelos.
- **Objetivo:** Mantener la lógica de negocio desacoplada de la interfaz, la base de datos y los servicios AWS, permitiendo incorporar nuevos tipos de estudios y análisis.

### Capas

- **Presentación:** Server Components y Client Components de Next.js; Server Actions para operaciones de la web y Route Handlers para la API REST.
- **Aplicación:** Casos de uso, servicios de aplicación y puertos de entrada y salida que permiten coordinar operaciones sin depender de implementaciones externas.
- **Dominio:** Entidades, objetos de valor y reglas de negocio independientes de tecnologías externas.
- **Infraestructura:** Implementaciones de persistencia y adaptadores para Cognito, S3 y SageMaker.

### Reglas principales

- Separar módulos y capas; evitar lógica de negocio en componentes React o controladores HTTP.
- Validar autenticación, autorización y pertenencia a la clínica en cada operación sensible.
- Un estudio puede tener múltiples análisis. Cada análisis debe conservar trazabilidad de sus hallazgos y de la versión exacta del modelo utilizado.
- Permitir agregar nuevos estudios y modelos sin rehacer el núcleo de la plataforma.

## 2. Componentes y tecnologías

### Aplicación web y API

- **Tecnología:** Next.js, React y TypeScript, ejecutados en Node.js sobre Amazon EC2.
- **Responsabilidad:** Interfaz de usuario, Server Actions, Route Handlers y coordinación de los análisis.

### Acceso a datos

- **Tecnología:** Prisma.
- **Responsabilidad:** Consultas y transacciones sobre PostgreSQL.

### Autenticación

- **Tecnología:** Amazon Cognito.
- **Responsabilidad:** Registro, verificación del correo, inicio de sesión y recuperación de contraseña. La aplicación valida el JWT que emite Cognito al iniciar sesión y lo descarta; después mantiene su propia sesión en la base de datos, con una cookie opaca, y autoriza cada operación contra esa sesión y los vínculos vigentes de la persona.

### Base de datos

- **Tecnología:** Amazon RDS con PostgreSQL.
- **Responsabilidad:** Persistencia de clínicas, usuarios, estudios, análisis, hallazgos y versiones de modelos.

### Almacenamiento de archivos

- **Tecnología:** Amazon S3.
- **Responsabilidad:** Conservar estudios originales y, cuando sea necesario, archivos procesados, con aislamiento por clínica y acceso privado.
- **Estudios de ECG (funcionalidad 006):** el servidor no guarda el `.npz` que sube la persona sino un formato propio y fijo (`ecg1`, 120.036 bytes: la onda y las siete variables, sin nombre de archivo ni datos de la persona). Un objeto por estudio, con la clave `studies/<clínica>/<estudio>.ecg1` que arma la aplicación. El bucket es privado, cifrado y **sin versionado** (eliminar un estudio lo borra de verdad). La vinculación con el paciente vive solo en la base de datos, nunca en el archivo.
- **Estudios y pacientes:** un estudio pertenece a un **paciente** de una clínica y se numera de forma correlativa por paciente (asignación atómica en la base, sin reutilizar números). Lo cargan el propio paciente o un médico con una asignación vigente; lo elimina solo quien lo cargó. Un administrador de clínica que no es médico no accede a los estudios. Toda consulta incluye la clínica del contexto autenticado.
- **Lectura del archivo:** un lector propio y mínimo de `.npz` (solo `node:zlib`) con topes de tamaño, defensa contra bombas de descompresión, sin `eval` ni `pickle`. Las reglas de contenido (formas, valores finitos, sexo 0/1, rangos) viven en el dominio.
- **Pantallas:** `/studies` (paciente) y `/patients` y `/patients/[patientId]` (médico). Las acciones llaman a los casos de uso del módulo `studies` y no contienen lógica de negocio.
- **Visor de la onda (funcionalidad 007):** `/studies/[studyId]` sirve al paciente y al médico. El caso de uso `getStudyWaveform` resuelve el acceso desde el propio estudio (paciente dueño o médico con asignación vigente) antes de leer el objeto con `StudyFileStorage.get`, separa la onda en 12 derivaciones y devuelve solo eso y los datos visibles del estudio: nunca la clave del objeto ni las siete variables. Un archivo ausente o dañado es el resultado «onda no disponible»; una falla del almacenamiento es un error. El dibujo es SVG propio en el navegador, sin librerías de gráficos.
- **Análisis de un estudio (funcionalidad 008):** el módulo `analyses` registra cada análisis en la tabla `analyses` (estado `PENDING`, `PROCESSING`, `COMPLETED` o `FAILED`, quién lo pidió, nombre y versión del modelo tal como los informó el contenedor, y las 12 probabilidades como documento validado con zod). Un índice único parcial garantiza un solo análisis en curso por estudio. `requestAnalysis` comprueba el acceso, lee la onda y las siete variables en el servidor, inserta el análisis y devuelve una función de ejecución que la Server Action entrega a `after()` de Next: la inferencia corre después de responder, con un tope de 30 s, y nunca lanza. La pantalla consulta con `router.refresh()` cada 3 s mientras hay uno en curso. No hay trabajador aparte: un análisis en curso por más de 2 minutos se marca como fallido, de forma perezosa, al abrir el estudio o al pedir otro. El puerto `ModelInference` tiene dos adaptadores elegidos por `MODEL_INFERENCE` (`sagemaker` o `fake`, sin valor por defecto): el real invoca el punto de inferencia con `@aws-sdk/client-sagemaker-runtime` y traduce los errores a cinco códigos genéricos; el simulado es determinista y tiene tres valores centinela para las pruebas. Eliminar un estudio con un análisis en curso se rechaza (`canDeleteStudy`).
- **Dos módulos que se conocen solo por sus composiciones:** `eslint.config.mjs` prohíbe que un módulo importe el dominio, la aplicación o la infraestructura de otro; solo un `composition.ts` puede importar el `composition.ts` del otro. Por eso `analyses` tiene su propio actor y su puerto `StudySource`, `studies` devuelve resultados (`NO_ACCESS`, `FILE_UNAVAILABLE`) en lugar de lanzar errores propios, y las dos composiciones se referencian con cierres perezosos que se ejecutan después de armar los módulos, nunca al evaluarlos. La capa de pantalla reconoce los errores de los módulos por su nombre y no con `instanceof`, porque Next puede cargar un módulo más de una vez.

### Inferencia de inteligencia artificial

- **Tecnología:** Amazon SageMaker AI; modelos desarrollados en Python y PyTorch.
- **Responsabilidad:** Ejecutar modelos especializados y devolver resultados de inferencia. El preprocesamiento científico se realiza en Python dentro de SageMaker o mediante un componente especializado, coordinado por la aplicación.
- **Base aprovisionada:** `infra/` crea el bucket privado de artefactos de modelos, el rol de ejecución de SageMaker con su propia política límite, un repositorio privado de ECR con la imagen de cada modelo (etiquetas inmutables) y un catálogo de modelos. El primer modelo es **EchoNext-Mini** (`specs/005-echonext-mini-sagemaker/`), apagado por defecto. Cada punto de inferencia nace apagado y cobra por hora mientras está encendido, así que se enciende solo mientras se usa. El código de inferencia y la imagen se producen en el repositorio aparte `medicia-ml`; este repositorio solo los referencia por versión. La aplicación lo consumirá mediante un adaptador, sin depender del SDK fuera de `infrastructure/`.

### Infraestructura como código

- **Tecnología:** Terraform, en la carpeta `infra/` de este repositorio.
- **Responsabilidad:** Aprovisionar y gestionar los recursos de AWS; no participa en el procesamiento de cada solicitud.
- **Estado:** vive en un bucket de S3 privado, cifrado, versionado y con bloqueo nativo, nunca en git. Cada entorno (desarrollo y producción) tiene el suyo. El estado contiene secretos (el secreto del cliente de Cognito y la clave de la aplicación), así que su acceso se limita a lo mínimo.
- **Organización:** `infra/bootstrap/` crea el bucket del estado y los accesos; `infra/modules/identity/` define el servicio de identidad; `infra/modules/model-artifacts/` el bucket de artefactos de modelos; `infra/modules/sagemaker-execution-role/` el rol de ejecución de SageMaker; `infra/modules/model-registry/` el repositorio de imágenes de un modelo; `infra/modules/study-storage/` el bucket privado de los estudios de ECG; `infra/modules/model-endpoints/` el catálogo de modelos y sus puntos de inferencia; `infra/environments/dev/` es el entorno de desarrollo y compone los módulos.
- **Revisión en CI:** el flujo `.github/workflows/infra.yml` corre en cambios de `infra/`. Un trabajo estático, sin credenciales de AWS, comprueba formato, validación, `tflint`, pruebas, `trivy` y guardas (entre ellas, una de costo de SageMaker y otra contra artefactos de modelos versionados). Un trabajo de plan, solo en propuestas de este repositorio, asume por OIDC un rol de solo lectura y muestra el plan. Ningún flujo aplica cambios.
- **Accesos:** la aplicación local usa un usuario de IAM que solo puede fijar contraseñas en el grupo de usuarios; el responsable aplica con dos políticas de mínimo privilegio (`medicia-dev-terraform-operator` y `medicia-dev-terraform-operator-ml`, esta última con SageMaker, `iam:PassRole` solo del rol de ejecución y ECR acotado), no con permisos de administrador. Una política límite (`medicia-dev-boundary`) fija el techo del rol de plan y del usuario de la aplicación, y otra (`medicia-dev-sagemaker-boundary`) el del rol de ejecución de SageMaker, que el operador solo puede crear con ese límite. El operador no puede editar las políticas que lo limitan: cambiarlas exige una vía de administración aparte. Sube y lee artefactos de modelos, pero no puede borrarlos directamente (conserva la configuración del ciclo de vida y la política del bucket, protegidas por las pruebas y la revisión). Los modelos se crean con aislamiento de red. Los estudios son datos clínicos: la aplicación puede guardar, leer y borrar objetos del prefijo `studies/`, y el operador crea el bucket pero tiene un `Deny` explícito sobre la lectura y el borrado de sus objetos, que es una defensa adicional y no una garantía: en desarrollo, con las credenciales del operador todavía se llega a los estudios por la clave de la aplicación (que vive en el estado), por la política del bucket y por los principales `medicia-dev-*` que hereden `medicia-dev-boundary`. Cerrar esas vías (rol del servidor, límite propio de la aplicación, política del bucket por administración) es previo a usar datos reales; el detalle está en `infra/README.md`.
- **Comandos reservados:** `terraform apply`, `destroy`, `import` y `state` los ejecuta solo el responsable del proyecto.
- **Revisión:** los cambios de `infra/` los revisa `infra-reviewer` (criterios en `.agents/reviewers/infrastructure.md`), y las skills `terraform-style-guide`, `terraform-test` y `terraform-skill` guían el estilo, las pruebas y el diagnóstico.

## 3. Flujo funcional

1. El usuario se autentica y selecciona el tipo de estudio y análisis.
2. La aplicación valida permisos, recibe el archivo y lo almacena en S3.
3. Registra el estudio y su estado en RDS.
4. Coordina el preprocesamiento correspondiente y envía la entrada al modelo desplegado en SageMaker.
5. Recibe la inferencia y guarda el análisis, los hallazgos y la versión del modelo en RDS. Cada análisis mantiene un estado (PENDING, PROCESSING, COMPLETED o FAILED) y registra errores sin generar resultados clínicos inválidos.
6. Muestra al usuario el resultado y permite consultar el historial autorizado.

## 4. Multi-tenancy

La plataforma atiende a múltiples clínicas con aislamiento lógico de información. El `tenant_id` se obtiene del contexto autenticado y autorizado, nunca de un parámetro arbitrario del cliente. Todas las operaciones verifican la pertenencia a la clínica. RDS restringe las consultas por tenant y puede utilizar Row-Level Security (RLS) como defensa adicional. S3 mantiene los objetos privados con accesos autorizados por clínica; los prefijos por tenant no constituyen por sí solos una barrera de seguridad.

## 5. Evolución

La primera capacidad es el análisis de ECG. La arquitectura permite incorporar nuevos tipos de estudio, procesadores y modelos especializados sin cambiar el flujo general de la plataforma.
