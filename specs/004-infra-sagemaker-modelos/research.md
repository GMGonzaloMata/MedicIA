# Investigación: Infraestructura base de SageMaker

**Plan**: [plan.md](plan.md) | **Especificación**: [spec.md](spec.md)

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. Al final hay una lista de lo que no se pudo verificar y debe comprobarse al implementar o en el primer despliegue de un modelo. Las versiones de Terraform y del proveedor, el estado remoto y el flujo de CI se heredan de la 003 sin cambios (R1 a R2 y R11 de [esa investigación](../003-infra-base-cognito/research.md)).

## R1. Tres módulos y el catálogo en la raíz

- **Decisión:** tres módulos nuevos en `infra/modules/`: `model-artifacts` (el bucket), `sagemaker-execution-role` (el rol) y `model-endpoints` (el catálogo: modelo, configuración y punto de inferencia por entrada). La raíz `environments/dev` los llama y define la variable `models`, el catálogo, vacío por defecto.
- **Por qué:** el bucket y el rol no cambian cuando se suma un modelo, y FR-010 pide que sumarlo no los toque. Separarlos hace que el cambio de un modelo solo aparezca en `model-endpoints`. El catálogo vive en la raíz porque cada entorno decide qué modelos tiene.
- **Alternativas descartadas:** un solo módulo `sagemaker` (un cambio de modelo reabriría el bucket y el rol en la revisión); el catálogo como archivos `.tfvars` (la constitución y la 003 prohíben `*.tfvars` en git); un módulo por modelo (obliga a escribir código nuevo en vez de una entrada, contra FR-010).

## R2. Bucket de artefactos

- **Decisión:** bucket `medicia-models-dev-<id de cuenta>`. Lleva bloqueo total de acceso público, propiedad forzada del propietario (sin ACL), versionado, cifrado SSE-S3 (AES-256), una política que rechaza el acceso sin TLS y ninguna sentencia `Allow`, `prevent_destroy = true` y `force_destroy = false`. Una regla de ciclo de vida elimina las versiones no vigentes a los 90 días y aborta las cargas multiparte incompletas a los 7.
- **Por qué:** es el mismo patrón ya aprobado para el bucket del estado, adaptado a un bucket sin secretos. Sin `Allow` en la política y con el bloqueo activo no hay acceso desde otras cuentas ni público (FR-002). `prevent_destroy` y el versionado protegen un artefacto que puede ser costoso de reconseguir (FR-003). El ciclo de vida acota el costo de las versiones viejas.
- **Costo:** S3 Estándar en `sa-east-1` cuesta 0,0405 USD por GB al mes (lista de precios de AWS del 2026-11-09). Un modelo de ECG de decenas de MB cuesta centavos; 10 GB, unos 0,41 USD, bajo el tope de 1 USD de SC-003.
- **Excepciones del análisis:** AWS-0132 (SSE-S3 en vez de KMS) y AWS-0089 (sin registro de accesos) ya figuran en `.trivyignore` con motivo y valen igual acá. Una clave propia de KMS costaría unos 1 USD al mes por sí sola y rompería SC-003.
- **Alternativas descartadas:** KMS propio (costo); sin versiones (no permite recuperar un artefacto sobrescrito); reutilizar el bucket del estado (mezcla secretos con artefactos y obliga a ampliar el acceso al estado); un prefijo por modelo con políticas distintas (los prefijos no son una barrera de seguridad, constitución II).

## R3. Rol de ejecución y su límite de permisos

- **Decisión:** rol `medicia-dev-sagemaker-execution` con política de confianza para `sagemaker.amazonaws.com`, acotada con `aws:SourceAccount` y `aws:SourceArn` de esta cuenta (protección contra el "suplente confundido"). Una política en línea con tres declaraciones, sin comodines de acción ni de servicio:
  - leer artefactos: `s3:GetObject` sobre `bucket/*` y `s3:ListBucket` sobre el bucket;
  - escribir registros: `logs:CreateLogGroup`, `logs:CreateLogStream` y `logs:PutLogEvents` sobre `log-group:/aws/sagemaker/Endpoints/medicia-dev-*`.
- **Límite propio:** política `medicia-dev-sagemaker-boundary`, creada en `infra/bootstrap`, con exactamente las mismas tres declaraciones. Es el techo del rol y no se parece al límite de la aplicación y del plan (FR-008). Es una copia deliberada: bootstrap y el módulo son raíces separadas y comparten el estado de cada una; una prueba en cada lado fija la misma lista de acciones, para que el límite nunca quede por debajo de lo que el rol necesita.
- **Por qué:** con el límite igual al permiso, nadie con acceso al rol puede darle más sin pasar antes por la vía de administración. El comodín solo aparece en el final del nombre de los recursos (`/*`, `medicia-dev-*`), nunca en acciones.
- **Alternativas descartadas:** la política administrada `AmazonSageMakerFullAccess` (comodines y acceso a otros buckets, contra FR-007); un límite más amplio que el permiso (deja margen para ampliar sin revisión); un `aws_iam_policy` administrada para el rol en lugar de una en línea (un objeto más sin ganancia con un solo rol).

## R4. Límite del rol de plan: ampliar el techo solo con lecturas

- **Problema:** FR-008 y FR-019 piden que el límite del rol de plan y de la aplicación no se amplíe. Pero el techo de un rol es su límite: sin sumarle la lectura del bucket y del rol de ejecución, el plan de CI falla al refrescar esos recursos (caso borde de la spec).
- **Decisión:** `medicia-dev-boundary` y el rol de plan suman solo lecturas de esos dos recursos (acciones `Get*`, `List*` y `Describe*` enumeradas, sin comodines). No se suma ninguna escritura. El usuario de la aplicación tiene el mismo límite, pero su política en línea solo permite `cognito-idp:AdminSetUserPassword`, así que sus permisos efectivos no cambian.
- **Por qué:** es la única forma de que el plan de CI revise estos recursos. Cualquier otra opción (un segundo límite para el rol de plan, otro rol de plan) también cambia ese límite y agrega una identidad.
- **Confirmado por el responsable (2026-11-09):** se amplía el techo con esas lecturas. FR-008 y FR-019 se redactaron de nuevo para permitirlo y nada más.
- **Alternativas descartadas:** dejar el plan de CI sin leer lo nuevo (el plan falla); permisos de lectura comodín como `s3:Get*` (contra FR-019).

## R5. Política del operador: acotada, y sin SageMaker hasta el primer modelo

- **Decisión:** `infra/bootstrap` ajusta la política del operador, que aplica un administrador:
  - **Rol de ejecución con su límite:** `iam:CreateRole`, `iam:PutRolePolicy` y `iam:PutRolePermissionsBoundary` sobre el rol `medicia-dev-sagemaker-execution`, con la condición `iam:PermissionsBoundary` igual al ARN de `medicia-dev-sagemaker-boundary`. La sentencia existente para los demás roles sigue exigiendo el límite original. Así el operador no puede cambiar el límite del rol de plan por el nuevo ni crear otros roles con él.
  - **Bucket de modelos:** crear, configurar y borrar el bucket `medicia-models-dev-*` (versiones, cifrado, ciclo de vida, bloqueo público, propiedad, política, etiquetas y lectura de su configuración). Para no superar el tope de 6.144 caracteres de una política administrada, el bucket de modelos se suma a la lista de recursos de la declaración existente `GestionarElBucketDelEstado` (lectura, versionado, cifrado, ciclo de vida y etiquetas) y solo se agrega aparte una declaración corta con crear, borrar, política, bloqueo de acceso público y propiedad. Se acepta que el operador pueda editar la política de ese bucket, a diferencia del bucket del estado, porque Terraform no puede crearlo sin hacerlo y el bucket no guarda secretos; el análisis de seguridad y los tests de CI fallan si deja de ser privado o cifrado. Aceptado por el responsable (2026-11-09).
  - **Subir y leer artefactos:** `s3:PutObject`, `s3:GetObject`, `s3:GetObjectVersion` y `s3:ListBucket` sobre el bucket de modelos. No se incluye `s3:DeleteObject` ni `s3:DeleteObjectVersion`: un borrado accidental de un artefacto solo lo puede hacer un administrador (FR-003).
  - **Protección del límite nuevo:** el `Deny` existente sobre `CreatePolicyVersion`, `DeletePolicy`, `DeletePolicyVersion` y `SetDefaultPolicyVersion` suma el ARN de `medicia-dev-sagemaker-boundary`.
- **Sin permisos de SageMaker ahora:** esta entrega no crea ningún recurso de SageMaker, así que el operador no los necesita. Dárselos antes sumaría poder de crear cómputo sin uso. Se otorgan con el primer modelo, por la misma vía de administración, y la guía deja la sentencia lista: acciones de modelo, configuración y punto de inferencia sobre `medicia-dev-*`, `iam:PassRole` solo hacia `sagemaker.amazonaws.com` sobre el rol de ejecución, y `sagemaker:CreateEndpointConfig` con la condición `sagemaker:InstanceTypes` limitada a los tres tipos permitidos (clave verificada en un ejemplo de política de AWS Labs; el soporte exacto por acción se confirma al otorgarla, ver pendientes).
- **Por qué:** mínimo privilegio. La condición de tipos en IAM es una segunda barrera de costo, además de la validación del módulo.
- **Alternativas descartadas:** otorgar SageMaker ahora (permiso sin uso y sin poder probarlo); permitir cualquier límite en `CreateRole` con una lista de ARN (deja que el operador cambie el límite del rol de plan por el del rol de ejecución).

## R6. Catálogo e interruptor

- **Decisión:** `models` es un `map(object)` que se declara en `environments/dev/variables.tf` con default `{}`. Cada entrada exige `image_uri`, `model_data_key` (clave dentro del bucket de artefactos) y `model_version`, y admite `instance_type` (default `ml.t2.medium`) y `enabled` (default `false`). La clave del mapa es el nombre corto del modelo.
- **Qué crea cada entrada:** `aws_sagemaker_model` y `aws_sagemaker_endpoint_configuration` siempre (sin costo mientras no exista un punto de inferencia, y así el plan revisa los errores de una entrada apagada), y `aws_sagemaker_endpoint` solo si `enabled` es `true`. Encender es cambiar `enabled` a `true`; apagar es volver a `false`, y el plan propone destruir únicamente el punto de inferencia (FR-012).
- **Por qué:** la separación entre lo que no cobra y lo que cobra deja la decisión de gasto en un solo valor. El control de FR-013 se prueba sobre el plan: una entrada con `enabled = false` propone 0 puntos de inferencia y con `true` exactamente 1.
- **Validaciones del módulo:** `instance_type` solo puede ser uno de los tres tipos permitidos; `instance_count` no es configurable y vale 1; la clave del mapa cumple `^[a-z][a-z0-9-]{1,23}$` (2 a 24 caracteres; entra en nombres de recursos, con prefijo `medicia-dev-`); `model_data_key` no empieza con `/`.
- **Por qué 24 caracteres como máximo:** la configuración del punto de inferencia usa `name_prefix = "medicia-dev-<clave>-"` y Terraform le agrega un sufijo único de 26 caracteres, mientras que SageMaker limita el nombre a 63. El prefijo no puede pasar de 37 caracteres: 12 de `medicia-dev-`, 1 del guion final y 24 de la clave. Con una clave de 31 caracteres el nombre daría 70 y fallaría al crearlo.
- **Alternativas descartadas:** `count` o `for_each` sobre la lista completa con el interruptor en todos los recursos (apagar borraría también el modelo y la configuración, y esconde errores de una entrada apagada); un archivo por modelo (más código por modelo, contra FR-010); `instance_count` configurable (cada instancia extra multiplica el costo sin un caso que lo pida).

## R7. Cómputo y costos

- **Decisión:** solo CPU, con tres tipos permitidos. Precios de Hosting (inferencia en tiempo real) para South America (São Paulo), según la lista oficial de precios de AWS publicada el 2026-11-09 (`AmazonSageMaker`, región `sa-east-1`). Mes de 730 horas:

  - `ml.t2.medium`: 0,089 USD por hora, 2,14 USD por día, 64,97 USD al mes.
  - `ml.c5.large`: 0,157 USD por hora, 3,77 USD por día, 114,61 USD al mes.
  - `ml.m5.large`: 0,184 USD por hora, 4,42 USD por día, 134,32 USD al mes.

- **Lectura de los números:** el crédito de la cuenta es de unos 119 USD. Un punto de inferencia `ml.t2.medium` encendido todo el mes consume más de la mitad; un `ml.m5.large` lo agota en unos 27 días. Por eso nace apagado. El uso previsto por el responsable es encenderlo solo mientras lo usa y apagarlo al terminar, así que el gasto real es por horas de uso: por ejemplo, 8 horas con `ml.t2.medium` cuestan unos 0,71 USD y con `ml.m5.large`, unos 1,47 USD. La guía lo explica y recuerda apagar al terminar. El presupuesto y las alertas de la 003 siguen acotando el gasto.
- **Inferencia sin servidor (SageMaker Serverless Inference):** también corre en CPU y no cobra mientras está ociosa. En `sa-east-1` cobra por segundo según la memoria: 0,00002 USD por segundo con 1 GB y 0,00008 USD por segundo con 4 GB, más el procesamiento de datos. Para un uso esporádico es mucho más barata que un punto de inferencia permanente. Queda **fuera de esta entrega** (el pedido fija puntos de inferencia con tipo de instancia), pero se registra como alternativa a evaluar antes del primer modelo, porque cambia el costo de forma radical. Su límite de memoria y de tamaño del paquete se verifica entonces.
- **Cómo se recomprueba:** los precios cambian. La guía indica la consulta a la lista oficial de precios (archivo `index.json` de `AmazonSageMaker` para `sa-east-1`, filtrando el uso `SAE1-Host:<tipo>`) para repetirla antes del primer despliegue.
- **Por qué solo tres tipos:** acota el gasto posible y mantiene la tabla de costos corta. `ml.t2.medium` es el más barato; `ml.c5.large` y `ml.m5.large` cubren modelos que necesiten más memoria o cómputo. El cómputo con GPU requiere una decisión de costo aparte (supuesto de la spec).
- **Alternativas descartadas:** permitir cualquier tipo (sin tope de gasto); precios de otras regiones (distintos por región; el de São Paulo es más caro).

## R8. Pruebas y flujo de CI

- **Decisión:** pruebas `terraform test` en modo `plan` con `mock_provider "aws"`, como en la 003:
  - `model-artifacts`: privado, versionado, cifrado, TLS obligatorio, sin sentencias `Allow`, sin ACL, ciclo de vida y `force_destroy` apagado. `terraform test` no ve `prevent_destroy`, así que una guarda de CI (T042) verifica que siga declarado. Las etiquetas del proveedor (`default_tags`) las cubre la guarda existente de `providers.tf`.
  - `sagemaker-execution-role`: confía solo en SageMaker de esta cuenta; sin acciones ni servicios comodín; sin acceso a otros buckets ni a otros grupos de registros; lleva el límite pasado por variable (FR-018).
  - `model-endpoints`: catálogo vacío propone 0 recursos; una entrada apagada propone 1 modelo, 1 configuración y 0 puntos; la misma encendida propone 1 punto; rechaza tipos no permitidos y claves inválidas (FR-013, SC-006).
  - `environments/dev`: con el catálogo por defecto, 0 modelos y 0 puntos de inferencia.
  - `bootstrap`: el límite nuevo y la política del operador conservan las condiciones, el `Deny` y las listas sin comodines.
- **Flujo `.github/workflows/infra.yml`:** se agregan los tres módulos a los bucles de `validate`, `tflint`, `terraform test` y bloqueo de proveedores, y `environments/dev` al de pruebas. Se suma una guarda de costo que falla si `aws_sagemaker_endpoint` se declara fuera de `modules/model-endpoints` o si aparece un recurso de SageMaker que cobra por tiempo y no está en el alcance (cuaderno, dominio, trabajo de entrenamiento, o `GPU`).
- **Por qué:** es el mismo contrato de la 003 aplicado a recursos nuevos; no hay credenciales ni recursos reales en las pruebas.
- **Alternativas descartadas:** `check` blocks de Terraform (avisan sin impedir la propuesta); pruebas contra AWS real (cuestan y requieren credenciales).

## R9. Orden de los pasos y vía de administración

- **Decisión:** primero el administrador aplica `infra/bootstrap` (límite nuevo, política del operador, lectura del plan); después el operador aplica `environments/dev`. Cualquier otro orden falla: sin el permiso el operador recibe un error de acceso denegado en la creación del bucket o del rol, y sin la lectura del plan la propuesta falla en CI.
- **Mensaje claro:** la guía lista los errores esperados por orden equivocado (`AccessDenied` al crear el rol sin límite, o el plan de CI fallido) y el paso que los corrige (edge cases de la spec).
- **Por qué:** el operador no puede editar las políticas que lo limitan (FR-009, FR-019).

## R10. Imagen del contenedor: brecha conocida

- **Hallazgo:** un punto de inferencia con una imagen de contenedor alojada en ECR necesita que el rol de ejecución pueda descargarla (`ecr:GetAuthorizationToken` y las acciones de lectura de capas). FR-007 limita el rol a leer artefactos y escribir registros, así que esta entrega no lo incluye.
- **Decisión:** no agregar permisos de ECR ahora. Se decide con el primer modelo, junto con la imagen que use (propia en ECR de esta cuenta o de AWS), y se otorgan por la vía de administración (la política del rol y su límite cambian juntos).
- **Por qué:** agregar `ecr:GetAuthorizationToken` exige `Resource: "*"` y no se debe decidir sin saber qué imagen se usa.
- **Alternativas descartadas:** `AmazonEC2ContainerRegistryReadOnly` (lee todos los repositorios, contra el mínimo privilegio).
- **Resuelto en la funcionalidad 005 (2026-11-10):** con EchoNext-Mini se eligió una imagen propia en un repositorio ECR de esta cuenta (`medicia-dev-echonext-mini`, módulo `model-registry`). El rol de ejecución y su límite ganaron solo `ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage` y `ecr:GetDownloadUrlForLayer` sobre ese repositorio, más `ecr:GetAuthorizationToken` sobre `*` (AWS no permite limitarlo). El catálogo valida que `image_uri` sea un repositorio ECR del entorno, en esta cuenta y región, con etiqueta de versión que no sea `latest`. Ver `specs/005-echonext-mini-sagemaker/research.md`.

## Pendientes de verificar

- **Tamaño del límite (verificado 2026-11-10):** una política administrada de IAM admite hasta 6.144 caracteres sin espacios. Medido en las pruebas: política del operador 4.868, `medicia-dev-boundary` 1.907 y `medicia-dev-sagemaker-boundary` 645. Las tres entran con margen, sin acortar ni usar comodines.
- **Permisos de la fase 2 (verificado 2026-11-10):** un administrador aplicó `infra/bootstrap` (1 creación, 3 cambios en el lugar, 0 destrucciones). Con `terraform-dev` y el operador restaurado, el plan informa 0 cambios y `aws iam get-policy` devuelve `medicia-dev-sagemaker-boundary` (versión `v1`, con las etiquetas del proyecto). El primer intento de aplicar con el operador falló como corresponde: el `Deny` le impide editar su política y la de `medicia-dev-boundary`, así que esos cambios exigen la vía de administración del README.
- **Condición de tipos de instancia:** la clave `sagemaker:InstanceTypes` aparece en un ejemplo de política de AWS Labs para `CreateEndpointConfig`. Se confirma en la referencia de autorización de servicio al otorgar los permisos del primer modelo.
- **Primer despliegue real:** el módulo `model-endpoints` se verifica con el proveedor simulado; no se aplica en esta entrega. Se comprueba con el primer modelo: que `CreateModel` no exija el artefacto presente, la disponibilidad de los tipos en `sa-east-1` y la cuota de servicio de la cuenta (una cuenta reciente puede tener cupo cero).
- **Sujeto de la confianza de SageMaker:** `aws:SourceArn` con `arn:aws:sagemaker:sa-east-1:<cuenta>:*` se confirma con el primer punto de inferencia; si SageMaker no envía ese contexto, se deja solo `aws:SourceAccount`. Estado al 2026-11-10: IAM aceptó la confianza con ambas condiciones al crear el rol, pero eso no prueba que SageMaker envíe `aws:SourceArn` al asumirlo. Sigue pendiente.
- **Bucket y rol creados (verificado 2026-11-10, T029 y T030):** se aplicaron 9 recursos (el bucket, sus seis configuraciones, el rol y su política en línea) sin tocar la identidad. Un segundo plan informó 0 cambios (SC-002). Se comprobó con AWS:
  - **Bucket:** las cuatro opciones del bloqueo de acceso público en `true`, cifrado `AES256` y versionado `Enabled`.
  - **Rol:** confianza solo para `sagemaker.amazonaws.com` con `aws:SourceAccount` y `aws:SourceArn`, y límite `medicia-dev-sagemaker-boundary`.
  - **Artefactos:** el operador subió y listó un archivo de prueba; `aws s3 rm` falló con `AccessDenied` porque ninguna política permite `s3:DeleteObject`. El objeto `prueba/prueba.txt` queda para que lo elimine un administrador.
  - **Contención de roles:** crear `medicia-dev-x` sin límite, y con `medicia-dev-sagemaker-boundary` fuera del rol de ejecución, falló con `AccessDenied` en los dos casos. No quedó ningún rol de prueba.
  - **Puntos de inferencia:** `aws sagemaker list-endpoints` devolvió `AccessDeniedException`, porque el operador no tiene permisos de SageMaker hasta el primer modelo (R5). No sirve para listar, pero respalda que esta identidad no puede crear puntos de inferencia, y el plan no incluye ninguno.
  - **Permisos:** no faltó ninguna acción en el rol ni en la política del operador durante la creación.
  - **SC-001 (menos de 20 minutos):** no se midió el recorrido completo desde la guía. Queda sin confirmar.
- **Hallazgos de la revisión final (2026-11-10):**
  - **Corregido:** la regla genérica `role/medicia-dev-*` también alcanzaba al rol de ejecución, así que el operador podía crearlo o cambiarle el límite a `medicia-dev-boundary`. Se agregó el `Deny` `ElRolDeEjecucionSoloConSuLimite`, y `iam:CreatePolicy` al `Deny` de las políticas protegidas. **Exigió otra aplicación de `bootstrap` por un administrador: aplicada el 2026-11-10.** Se comprobó con `aws iam get-policy-version` que la política del operador en AWS trae los cuatro `Deny` (`ProtegerLasPoliticasDeAcceso`, `NoBorrarArtefactosDeModelos`, `ElRolDeEjecucionSoloConSuLimite` y `ProtegerElLimiteDeLosPrincipales`) y un plan posterior dio 0 cambios. Verificación sugerida, sin efectos: `aws iam simulate-custom-policy` con la política del operador, la acción `iam:PutRolePermissionsBoundary`, el rol de ejecución y el contexto `iam:PermissionsBoundary=arn:aws:iam::896618135592:policy/medicia-dev-boundary`; debe dar `explicitDeny`.
  - **Corregido:** los modelos se crean con `enable_network_isolation = true`, porque el contenedor procesa estudios de pacientes. Si un contenedor necesita red, se decide aparte.
  - **Corregido (repetición de la revisión):**
    - El modelo lleva un resumen de 8 caracteres de su imagen, artefacto y rol en el nombre. SageMaker no actualiza un modelo y `create_before_destroy` se propaga desde la configuración, así que con nombre fijo la primera actualización habría fallado en `CreateModel`. El punto de inferencia conserva su nombre.
    - Un `Deny` de `s3:DeleteObject` y `s3:DeleteObjectVersion` sobre los objetos del bucket de modelos: el operador puede escribir la política del bucket y, sin él, podría darse el borrado con una sentencia `Allow`.
    - La guarda de artefactos de modelos también corre en `ci.yml` (toda propuesta, no solo las que tocan `infra/`), con más extensiones (`tflite`, `gguf`, `keras`, `mar`) y reglas en `.gitignore`. Se dejaron afuera `.bin` y `.pb` por ser nombres genéricos que darían falsos positivos.
    - La guarda de `prevent_destroy` exige la línea sin comentar.
  - **Pendiente para el primer modelo (plan de CI):** el rol de plan no tiene acciones de `sagemaker:`; sumar `DescribeModel`, `DescribeEndpointConfig`, `DescribeEndpoint` y `ListTags` sobre `medicia-dev-*` amplía `medicia-dev-boundary` (también techo del usuario de la aplicación) y exige ajustar FR-008.
  - **Aceptado (menor):** el operador conserva `iam:UpdateAssumeRolePolicy` sobre el rol de ejecución, de la 003. Si cambiara su confianza, el rol sigue acotado por su límite. Se mantiene porque la condición `aws:SourceArn` puede requerir ajuste con el primer punto de inferencia.
  - **Aceptado (R5):** el operador conserva la configuración del ciclo de vida y la política del bucket de modelos, así que no puede borrar artefactos directamente pero sí podría hacerlo con una regla de ciclo de vida. Lo cubren las pruebas y la revisión.
  - **Pendiente para el primer modelo:** restringir el origen de `image_uri` (ECR de la cuenta) y decidir los permisos de ECR (R10).
  - **Pendiente para el primer modelo (registros):** SageMaker crea los grupos `/aws/sagemaker/Endpoints/<nombre>` sin vencimiento, y si el contenedor registra lo que recibe, los datos clínicos quedarían en CloudWatch indefinidamente. Evaluar crear el grupo en `model-endpoints` con retención fija, quitar `logs:CreateLogGroup` del rol y de su límite, y exigir que el código de inferencia no registre las entradas.
  - **Propuesta pendiente de decisión:** activar el bloqueo de acceso público de toda la cuenta (`aws_s3_account_public_access_block` en `infra/bootstrap`, aplicado por el administrador). Hoy el operador puede cambiar el bloqueo y la política del bucket de modelos con sus claves y volverlo público sin pasar por CI; el bloqueo de la cuenta no lo podría deshacer. Costo: el operador necesitaría `s3:GetAccountPublicAccessBlock` (solo admite `Resource: "*"`) para planificar `bootstrap`, y habría que admitir esa excepción en la prueba de comodines. Alternativa: aplicarlo una sola vez fuera de Terraform. No cambia los dos buckets actuales, ambos privados.
- **Licencia de EchoNext-Mini:** no forma parte de esta entrega. Se revisa antes de subir sus artefactos.
