# Infraestructura de MedicIA

Esta carpeta define con Terraform la infraestructura de AWS del entorno de desarrollo: el almacenamiento remoto del estado, el servicio de identidad (Amazon Cognito), la base para analizar con modelos de IA (Amazon SageMaker) y los accesos que usan la aplicación y la revisión en CI. Todo es reproducible y se revisa como cualquier otro cambio.

Especificación y decisiones: [specs/003-infra-base-cognito/](../specs/003-infra-base-cognito/) (identidad y accesos) y [specs/004-infra-sagemaker-modelos/](../specs/004-infra-sagemaker-modelos/) (base de SageMaker).

## Reglas que no se negocian

- **El estado nunca va a git.** Vive en un bucket privado, cifrado y versionado. El estado contiene secretos (por ejemplo el secreto del cliente de Cognito y la clave de la aplicación): quien pueda leerlo, puede leerlos.
- **Los comandos que modifican infraestructura real los ejecuta solo el responsable del proyecto** desde su terminal: `apply`, `destroy`, `import` y `state`. Los agentes y el CI solo corren `fmt`, `validate`, `test` y `plan`. En esta guía, esos comandos están marcados con **(responsable)**.
- **Ningún secreto en el repositorio.** Los datos de conexión de la aplicación se piden a Terraform y van a `.env.local`, que git ignora.
- **Un entorno separado desde el principio.** Hoy solo existe `dev`. Producción tendrá su propia cuenta y su propio arranque.

## Estructura

- `bootstrap/`: el bucket del estado, el acceso de CI (rol `medicia-dev-plan` y proveedor de GitHub), las dos políticas del operador (`operator-policy.tf` y `operator-policy-ml.tf`, esta última con SageMaker, `iam:PassRole` y ECR) y las dos políticas límite de permisos: `medicia-dev-boundary` (plan y usuario de la aplicación) y `medicia-dev-sagemaker-boundary`, en `sagemaker-boundary.tf` (rol de ejecución de SageMaker). Es la única raíz que arranca con estado local y la aplica un administrador.
- `modules/identity/`: el grupo de usuarios de Cognito, su cliente de aplicación y el usuario de IAM que usa el servidor. Incluye sus pruebas.
- `modules/model-artifacts/`: el bucket privado donde viven los artefactos de los modelos.
- `modules/sagemaker-execution-role/`: el rol que SageMaker asume para leer esos artefactos y escribir registros, con su límite de permisos.
- `modules/model-endpoints/`: el catálogo de modelos y sus puntos de inferencia, apagados por defecto.
- `modules/model-registry/`: el repositorio privado de ECR con la imagen de inferencia de un modelo, con etiquetas inmutables.
- `modules/study-storage/`: el bucket privado donde la aplicación guarda los estudios de ECG de las clínicas.
- `environments/dev/`: el entorno de desarrollo, que usa los seis módulos. El catálogo de modelos es la variable `models` de `variables.tf`.
- `.tflint.hcl` y `.trivyignore`: reglas del análisis estático y sus excepciones justificadas.

Los comandos de esta guía se ejecutan desde la raíz del repositorio con `-chdir`. El perfil de AWS es `medicia-dev`:

```powershell
$env:AWS_PROFILE = "medicia-dev"
```

## Requisitos previos de la cuenta

- Cuenta `896618135592` en plan pago, con el presupuesto `medicia-dev-mensual` creado.
- Usuario `terraform-dev` con MFA y el perfil `medicia-dev` configurado en `sa-east-1`.
- La cuenta raíz con MFA y sin claves de acceso.
- Terraform 1.15.x instalado.

Comprobaciones de solo lectura, antes de crear nada:

- `aws sts get-caller-identity` muestra la cuenta `896618135592` y el usuario `terraform-dev`, no la raíz.
- `aws iam get-account-summary --query "SummaryMap.AccountMFAEnabled"` devuelve `1`.
- En la consola, la página de credenciales de seguridad de la cuenta raíz no muestra claves de acceso.

## Arranque en dos fases

El bucket del estado no puede guardar su propio estado antes de existir, así que `bootstrap` se arranca en dos fases.

**Fase 1: estado local.** Si existe `infra/bootstrap/backend.tf`, no lo uses todavía (renombralo o borralo).

```powershell
terraform -chdir=infra/bootstrap init
terraform -chdir=infra/bootstrap plan
terraform -chdir=infra/bootstrap apply   # (responsable)
```

**Fase 2: migrar el estado al bucket.**

```powershell
Copy-Item infra/bootstrap/backend.tf.example infra/bootstrap/backend.tf
terraform -chdir=infra/bootstrap init -migrate-state   # (responsable) aceptá copiar el estado
```

Después borrá el archivo de estado local que quedó (`infra/bootstrap/terraform.tfstate*`; git lo ignora, pero no tiene por qué quedar ahí). Un `plan` posterior tiene que informar 0 cambios.

Las demás raíces (`environments/dev`) ya apuntan al bucket desde el principio, con su propia clave de estado.

## Uso diario

```powershell
terraform -chdir=infra/environments/dev init
terraform -chdir=infra/environments/dev plan
terraform -chdir=infra/environments/dev apply   # (responsable) solo después de revisar el plan
```

Antes de subir un cambio, desde la raíz:

```powershell
terraform fmt -recursive infra
terraform -chdir=infra/bootstrap test
terraform -chdir=infra/environments/dev test
terraform -chdir=infra/modules/identity test
terraform -chdir=infra/modules/model-artifacts test
terraform -chdir=infra/modules/sagemaker-execution-role test
terraform -chdir=infra/modules/model-endpoints test
terraform -chdir=infra/modules/model-registry test
```

**Qué corre en CI** (`.github/workflows/infra.yml`), solo si el cambio toca `infra/`:

- Trabajo `static`, sin credenciales de AWS: formato, validación, `tflint`, pruebas de Terraform, `trivy` (configuración y secretos), búsqueda de archivos prohibidos (incluidos los artefactos de modelos en todo el repositorio), guarda del contrato de Cognito, guarda de costo de SageMaker, guarda de imágenes, repositorios y permisos de modelos (sin `latest`, sin comodines de SageMaker ni ECR, una instancia por punto de inferencia), guarda de etiquetas y una guarda que impide aplicar desde los flujos.
- Trabajo `plan`, solo en propuestas de cambio de este repositorio (no en forks ni en `main`): asume el rol `medicia-dev-plan` por OIDC, con solo lectura, y vuelca el plan en el resumen del trabajo. Nunca aplica.

Un plan que propone destruir o reemplazar el grupo de usuarios es bloqueante en la revisión: la decisión de aplicarlo es del responsable.

## Conexión de la aplicación

La aplicación necesita siete variables en `.env.local` (ese archivo lo escribe el responsable; no se versiona). El detalle del contrato está en [specs/003-infra-base-cognito/contracts/identity-service.md](../specs/003-infra-base-cognito/contracts/identity-service.md).

- `IDENTITY_PROVIDER`: `cognito`.
- `COGNITO_REGION`: `terraform -chdir=infra/environments/dev output -raw region`
- `COGNITO_USER_POOL_ID`: `terraform -chdir=infra/environments/dev output -raw user_pool_id`
- `COGNITO_CLIENT_ID`: `terraform -chdir=infra/environments/dev output -raw user_pool_client_id`
- `COGNITO_CLIENT_SECRET`: `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret` (sensible)
- `AWS_ACCESS_KEY_ID`: `terraform -chdir=infra/environments/dev output -raw app_access_key_id` (sensible)
- `AWS_SECRET_ACCESS_KEY`: `terraform -chdir=infra/environments/dev output -raw app_secret_access_key` (sensible)

Consultá los sensibles de a uno, en tu terminal, y no los pegues en chats, tickets ni capturas.

En PowerShell, si guardás la ruta en una variable, ponela entre comillas: `"-chdir=$d"`. Sin comillas, PowerShell no expande `$d` dentro de `-chdir=$d`, el comando falla y `.env.local` queda con valores vacíos.

El grupo de usuarios conserva el correo por defecto de Cognito, que tiene un tope diario bajo de mensajes (unas decenas por día). Alcanza para desarrollo; si un registro de prueba no recibe el código, puede ser ese tope. El correo propio con SES queda fuera de esta entrega.

### Cambiar de proveedor simulado a Cognito

Si antes usaste `IDENTITY_PROVIDER=fake`, tu base local puede tener cuentas creadas con el proveedor simulado. Al ingresar con Cognito con el mismo correo, el sistema detecta el conflicto y el ingreso falla con el mensaje de credenciales inválidas. Solución: borrá esas filas de sesión y usuario de la base local de desarrollo y registrate de nuevo contra Cognito. Si querés repetir la prueba con el mismo correo, borrá también el usuario del grupo en Cognito.

## Base de SageMaker

Prepara el lugar donde van a vivir los modelos de IA, sin desplegar ninguno:

- Un bucket privado, cifrado y versionado para los artefactos de los modelos (`medicia-models-dev-896618135592`).
- Un rol de ejecución (`medicia-dev-sagemaker-execution`) que solo SageMaker puede asumir, con permiso de leer ese bucket, descargar la imagen de su repositorio de ECR y escribir sus registros, y con su propia política límite.
- Un catálogo de modelos (la variable `models`) con una entrada, EchoNext-Mini (ver "Modelo EchoNext-Mini"). Cada punto de inferencia nace apagado.

**Con todo apagado no hay ningún punto de inferencia.** El costo adicional es de centavos: el almacenamiento de S3, a 0,0405 USD por GB al mes, y el de la imagen en ECR. Un punto de inferencia cobra por hora mientras existe, y es lo único que cuesta de verdad (ver "Costos de un punto de inferencia").

### Orden de los pasos

1. **Administrador** (el usuario raíz con MFA, o quien administre la cuenta): aplica `bootstrap`. Crea el límite nuevo, ajusta la política del operador y amplía la lectura del plan. Se hace como describe "Cambiar los permisos del operador".
2. **Operador** (`terraform-dev`, responsable): aplica `environments/dev`. Crea el bucket y el rol.
3. **Propuesta de cambio**: se abre después de los dos pasos. El plan de CI ya puede leer los recursos nuevos.

Si se rompe el orden, los errores esperados son:

- **El operador aplica `environments/dev` antes del paso 1:** `AccessDenied` al crear el bucket, o al crear el rol sin el límite nuevo.
- **El operador aplica `bootstrap` sin la vía de administración:** `AccessDenied` con "explicit deny" al modificar su propia política o `medicia-dev-boundary`. Es a propósito. Las políticas límite no se pueden crear, cambiar ni borrar con el operador.
- **Propuesta de cambio antes del paso 1:** el plan de CI falla con `AccessDenied` al leer el bucket o el rol.
- **Credenciales vencidas o ausentes:** Terraform lo informa con un mensaje claro y no deja cambios a medias. Ver "Solución de problemas".

### Subir un artefacto

El operador sube y lee artefactos, pero **no puede borrarlos directamente**: un artefacto puede ser costoso de reconseguir. Conserva el control de la configuración del ciclo de vida y de la política del bucket, así que ese cambio también pasa por la revisión. Con tu perfil `medicia-dev`:

```powershell
aws s3 cp modelo.tar.gz s3://medicia-models-dev-896618135592/<nombre>/<version>/modelo.tar.gz
aws s3 ls s3://medicia-models-dev-896618135592/<nombre>/
```

- Un `aws s3 rm` falla con `AccessDenied`. Si hay que borrar un artefacto, lo hace un administrador. En un bucket versionado hay que borrar también las versiones y los marcadores de eliminación; en la consola de S3, activá "Mostrar versiones", marcá todo y elegí eliminar de forma permanente.
- Las versiones reemplazadas vencen solas a los 90 días.
- **Nunca subas datos de pacientes ni estudios** a este bucket: es solo para artefactos de modelos.
- **No versiones artefactos en git.** El flujo de CI falla si encuentra archivos como `.pt`, `.onnx`, `.safetensors` o `.tar.gz` en el repositorio.

### Costos de un punto de inferencia

Un punto de inferencia cobra por hora mientras existe, aunque nadie lo use. Precios de alojamiento (Hosting) para São Paulo (`sa-east-1`), según la lista oficial de AWS del 2026-11-09, con 730 horas al mes:

- `ml.t2.medium` (por defecto): 0,089 USD por hora, 2,14 por día y 64,97 al mes.
- `ml.c5.large`: 0,157 USD por hora, 3,77 por día y 114,61 al mes.
- `ml.m5.large`: 0,184 USD por hora, 4,42 por día y 134,32 al mes.

El uso previsto es **encenderlo solo mientras se usa** y apagarlo después; el costo mensual de la lista es el de dejarlo siempre prendido. Solo se permiten estos tres tipos, todos de CPU. Las GPU quedan fuera hasta que se decida su costo aparte.

Para repetir la consulta a la lista oficial de AWS: descargá `https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonSageMaker/current/index.json` y buscá los productos de la región `sa-east-1` cuyo uso sea `SAE1-Host:<tipo>`, por ejemplo `SAE1-Host:ml.t2.medium`. Los precios cambian: volvé a comprobarlos antes del primer despliegue.

### Sumar un modelo

Sumar un modelo es agregar una entrada al valor por defecto de la variable `models` de `environments/dev/variables.tf`, en un cambio que pasa por revisión (no se usan archivos `.tfvars`):

```hcl
default = {
  ecg-ejemplo = {
    image_uri      = "896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-<nombre>:<versión>"
    model_data_key = "ecg-ejemplo/1/model.tar.gz"
    model_version  = "1.0.0"
    instance_type  = "ml.t2.medium"   # opcional
    enabled        = false            # opcional; apagado por defecto
  }
}
```

- **El nombre corto** (`ecg-ejemplo`) tiene de 2 a 24 caracteres: minúsculas, números y guiones, y empieza con una letra. El punto de inferencia se llama `medicia-dev-<nombre>`; el modelo lleva además un resumen de 8 caracteres (`medicia-dev-<nombre>-<resumen>`) que cambia si cambia la imagen, el artefacto o el rol. SageMaker no puede actualizar un modelo, así que al cambiar uno de esos campos se crea un modelo nuevo y después se borra el anterior.
- **`image_uri`** debe ser un repositorio ECR del entorno, de esta cuenta y región, con una etiqueta de versión que no sea `latest`: el módulo lo valida. Además, el rol de ejecución solo puede descargar de `medicia-dev-echonext-mini`: un modelo con otro repositorio exige ampliar el rol y su límite por la vía de administración.
- **`model_data_key`** es la clave dentro del bucket de artefactos, sin barra inicial. Subí el artefacto antes con "Subir un artefacto".
- **`model_version`** es la versión exacta del modelo. Queda como etiqueta `ModelVersion` y sirve para saber qué modelo produjo un análisis.

Antes del **primer** modelo hacían falta cuatro cosas. Con EchoNext-Mini ya están resueltas, y sirven de lista para el próximo modelo:

- **Permisos de SageMaker, `iam:PassRole` y ECR para el operador**, otorgados por un administrador con la política `medicia-dev-terraform-operator-ml` (ver "Cambiar los permisos del operador"). Ya están aplicados.
- **Permisos de ECR para el rol de ejecución**, limitados al repositorio de la imagen. Ya están en el rol y en su límite.
- **Revisar la cuota y la disponibilidad** del tipo de instancia en `sa-east-1`. Una cuenta reciente puede tener cupo cero y pedirlo lleva tiempo. Para `ml.t2.medium` se comprobó el 2026-11-10: cuota aplicada de 30.
- **Lecturas de SageMaker y ECR para el plan de CI.** Ya están en `plan_read_statements` (`sagemaker:DescribeModel`, `DescribeEndpointConfig`, `DescribeEndpoint` y `ListTags` sobre `medicia-dev-*`, y cuatro lecturas de ECR). Amplían también `medicia-dev-boundary`, el techo del usuario de la aplicación: ese usuario podría leer esos recursos, pero su política real no se lo concede. Está registrado en FR-008 de la 004.

### Encender y apagar

- **Encender:** poné `enabled = true` en la entrada, abrí la propuesta de cambio y revisá que el plan agregue **un** punto de inferencia y nada más. Aplica el responsable.
- **Apagar:** volvé a `enabled = false`. El plan debe proponer destruir **solo** el punto de inferencia; el bucket, el rol y las demás entradas no cambian.
- **Apagado de emergencia:** si hay un punto de inferencia encendido y no podés esperar la revisión, borralo con la CLI y después dejá `enabled = false` en el código. El estado se concilia en el siguiente plan:

  ```powershell
  aws sagemaker delete-endpoint --endpoint-name medicia-dev-<nombre> --region sa-east-1   # (responsable)
  ```

  Este comando lo permite la política `medicia-dev-terraform-operator-ml`.

- **Ver qué hay encendido:** `aws sagemaker list-endpoints --region sa-east-1`. Todo lo que aparezca cobra. `terraform -chdir=infra/environments/dev output enabled_endpoint_names` muestra los encendidos según el estado.

### Licencias y alcance clínico

- **Modelos de investigación:** revisá la licencia antes de subir sus artefactos. EchoNext-Mini, por ejemplo, se distribuye bajo el acuerdo de uso de PhysioNet, y Columbia tiene una solicitud de patente sobre el método: confirmá que el uso previsto esté permitido. EchoNext-Mini ya está en el catálogo: ver su aviso de licencia en "Modelo EchoNext-Mini".
- **Todo resultado de un modelo es un posible hallazgo de apoyo clínico, nunca un diagnóstico.**

## Modelo EchoNext-Mini

EchoNext-Mini es un modelo de investigación que recibe un electrocardiograma de 12 derivaciones ya preprocesado y devuelve **12 probabilidades de posibles hallazgos de cardiopatía estructural**. Es el primer modelo real del catálogo. El código que lo ejecuta vive en el repositorio aparte `medicia-ml` (GitHub `GMGonzaloMata/medicia-ml`), como exige la constitución. Este repositorio solo referencia la imagen y el artefacto por su versión (`0.1.0`). La especificación completa está en `specs/005-echonext-mini-sagemaker/`.

> Las probabilidades son un **indicador relativo de riesgo de un posible hallazgo**, de apoyo clínico. **Nunca son un diagnóstico.** No hay umbrales publicados y pueden no estar calibradas.

### Entrada y salida

El contrato completo (formato de la solicitud, errores y códigos) está en `specs/005-echonext-mini-sagemaker/contracts/inference-api.md`. Lo esencial:

- **Solicitud:** JSON con `waveform` (2500 filas de 12 números: 250 Hz, 10 segundos, 12 derivaciones, ya filtrada y normalizada) y `tabular` (7 números en este orden: sexo, edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS y QT corregido; el sexo es 0 mujer o 1 hombre y los demás están estandarizados). No preprocesa señal cruda ni lee XML.
- **Respuesta:** `model`, `model_version` y `probabilities`, con 12 valores entre 0 y 1 en este orden fijo: `lvef_lte_45`, `lvwt_gte_13`, `aortic_stenosis`, `aortic_regurgitation`, `mitral_regurgitation`, `tricuspid_regurgitation`, `pulmonary_regurgitation`, `rv_systolic_dysfunction`, `pericardial_effusion`, `pasp_gte_45`, `tr_max_gte_32` y `shd`. La última es el hallazgo compuesto (al menos uno de los otros once).
- **Entrada inválida** (forma incorrecta, no son 7 variables, valores no finitos, sexo distinto de 0 y 1): se rechaza sin devolver probabilidades. Por HTTP directo el código es 400; por `InvokeEndpoint` de SageMaker llega como error 424.
- **No se valida automáticamente** el orden de las derivaciones ni de las variables. Es el del conjunto de datos EchoNext-Mini.

### Límites del modelo

- Se entrenó con adultos en un solo centro (NewYork-Presbyterian/Columbia). Excluye ECG con marcapasos ventricular y de calidad pobre, y esta entrega **no** filtra esos casos.
- Sensibilidad reportada de 70,1 % y AUROC externo reportado de 79,0 (MIMIC-IV). El AUROC del hallazgo compuesto publicado es 82,0.
- Las probabilidades pueden no estar calibradas: tratarlas como indicador relativo, no como la chance literal de tener el hallazgo.

### Licencia

El repositorio original del modelo (`PierreElias/IntroECG`) **no declara licencia**, Columbia tiene una solicitud de patente (#63/555,968) y los datos están bajo la licencia de PhysioNet de datos de salud restringidos. El uso actual es **académico**. **Cualquier uso comercial exige revisar todo eso antes.** La arquitectura en `medicia-ml` está reescrita de forma independiente (no copia el código original) y se verifica contra el original con un procedimiento de paridad.

### Datos: nunca en los repositorios ni en el bucket

El conjunto de datos EchoNext-Mini se usa desde tu máquina y nunca se sube a un repositorio, a su historial ni al bucket de artefactos. `.gitignore` ignora `*.npy`, `*.npz`, `*.parquet`, `*.zip` y los archivos `echonext*`; el CI, que sí frena un `git add -f`, bloquea `*.npy`, `*.npz`, `*.parquet`, los artefactos de modelos y los archivos `echonext*` (csv, xml, zip, npy, npz y parquet). `medicia-ml` tiene su propia comprobación de CI y un gancho local con las mismas reglas. Los resultados que se registren no incluyen datos de estudios individuales.

### Orden de los pasos

1. **Permisos por la vía de administración** (una sola vez): `terraform -chdir=infra/bootstrap apply` con administrador, y volver a dejar las dos políticas del operador. Ver "Cambiar los permisos del operador".
2. **Repositorio de imágenes:** crea `medicia-dev-echonext-mini` (etiquetas inmutables, escaneo al subir, cifrado, últimas 10 imágenes). **En una cuenta limpia**, como el catálogo ya trae la entrada `echonext-mini`, un `apply` completo intentaría crear el modelo antes de que existan la imagen y el artefacto: hacé primero `terraform -chdir=infra/environments/dev apply -target=module.model_artifacts -target=module.model_registry -target=module.sagemaker_execution_role` (responsable): crea el bucket, el repositorio y el rol, que los pasos 3 y 4 necesitan. Dejá el `apply` completo para el paso 5.
3. **Empaquetar y subir el artefacto.** En `medicia-ml`, `scripts/package_artifacts.py` arma `model.tar.gz` (pesos, transformador de variables, parámetros de normalización y un manifiesto con las huellas). Subirlo a una carpeta con la versión:

   ```powershell
   aws s3 cp <ruta>\model.tar.gz s3://medicia-models-dev-896618135592/echonext-mini/0.1.0/model.tar.gz --region sa-east-1
   ```

4. **Construir, probar y subir la imagen.** Desde `medicia-ml`, con Docker:

   ```powershell
   docker build --platform linux/amd64 --provenance=false --sbom=false --build-arg MODEL_VERSION=0.1.0 -t medicia-dev-echonext-mini:0.1.0 .
   cmd /c "aws ecr get-login-password --region sa-east-1 | docker login --username AWS --password-stdin 896618135592.dkr.ecr.sa-east-1.amazonaws.com"
   docker tag medicia-dev-echonext-mini:0.1.0 896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0
   docker push 896618135592.dkr.ecr.sa-east-1.amazonaws.com/medicia-dev-echonext-mini:0.1.0
   ```

   - **`--provenance=false --sbom=false` es obligatorio:** sin eso, Docker sube un índice de manifiestos en lugar de una imagen simple.
   - **El `login` va con `cmd /c`** porque PowerShell 5.1 corrompe el token al pasarlo por la tubería (error `400 Bad Request`).
   - **Las etiquetas son inmutables:** si hay que corregir una imagen ya subida, se sube una versión nueva (`0.1.1`) o un administrador borra la etiqueta desde la consola.
5. **Entrada en el catálogo** (`variables.tf` de `environments/dev`), con `enabled = false`. Para un modelo nuevo se agrega la entrada y se abre la propuesta de cambio; el CI revisa el plan. Con la imagen y el artefacto ya subidos, el `apply` completo crea el modelo y su configuración, sin costo de cómputo.
6. **Encender, probar y apagar** (ver abajo). Recién después de los pasos anteriores.

### Lista previa al encendido

Antes de poner `enabled = true`, comprobá:

- **El artefacto está en el bucket:** `aws s3api head-object --bucket medicia-models-dev-896618135592 --key echonext-mini/0.1.0/model.tar.gz --region sa-east-1`.
- **La imagen está en el repositorio con la etiqueta del catálogo:** `aws ecr describe-images --repository-name medicia-dev-echonext-mini --image-ids imageTag=0.1.0 --region sa-east-1`.
- **La cuota del tipo de cómputo está disponible** (`ml.t2.medium` para endpoint, cuota 30 el 2026-11-10). Repetir la comprobación si se cambia el tipo.
- **No hay nada más encendido:** `aws sagemaker list-endpoints --region sa-east-1`.

### Encender, probar y apagar

- **Encender:** `enabled = true` en la entrada `echonext-mini`. El plan debe agregar **exactamente un** punto de inferencia (`medicia-dev-echonext-mini`). Tarda entre 5 y 10 minutos en estar en servicio y **desde ahí cobra por hora**.
- **Probar:** en `medicia-ml`, con el perfil de AWS puesto (`$env:AWS_PROFILE = "medicia-dev"`):

  ```powershell
  .\.venv\Scripts\python scripts\invoke_endpoint.py --data-dir "<carpeta con la partición de prueba>" --endpoint-name medicia-dev-echonext-mini
  ```

  Compara con la referencia del original y prueba una entrada inválida. Solo imprime índices y diferencias.
- **Apagar:** `enabled = false`. El plan debe quitar **solo** el punto de inferencia. Después, `aws sagemaker list-endpoints --region sa-east-1` debe dar una lista vacía.
- **Apagado de emergencia:** `aws sagemaker delete-endpoint --endpoint-name medicia-dev-echonext-mini --region sa-east-1`, y dejar `enabled = false` en el código.
- **No hagas commit con `enabled = true`.** El test `echonext_mini_apagado_por_defecto` falla a propósito si el catálogo queda encendido.

### Costo

- **Encendido, `ml.t2.medium` en `sa-east-1`:** 0,089 USD por hora, unos 2,14 USD por día y 64,97 USD por mes si quedara todo el mes (precios del 2026-11-09). Una sesión de pruebas de una hora cuesta menos de 0,10 USD.
- **Apagado:** 0 USD de cómputo. Quedan centavos por mes de almacenamiento: el artefacto de 3,5 MB en S3 y la imagen de unos 330 MB comprimida en ECR.
- El presupuesto `medicia-dev-mensual` (20 USD) alerta el gasto.

### Escaneo de vulnerabilidades de la imagen

El escaneo de ECR de la imagen `0.1.0` dio 0 críticas, 13 altas, 10 medias y 4 bajas, todas de paquetes del sistema operativo de la imagen base que el contenedor no usa (detalle y decisión en `specs/005-echonext-mini-sagemaker/research.md`, R13). Se aceptó para esta etapa. **Antes de usar datos reales de pacientes**, reconstruir la imagen con una base actualizada y escanearla de nuevo. El escaneo básico no cubre las librerías de Python.

## Bucket de estudios

El bucket `medicia-studies-dev-896618135592` (módulo `study-storage`) guarda un objeto por estudio de ECG, con la clave `studies/<clínica>/<estudio>.ecg1`, que arma la aplicación en el servidor. Detalle y decisiones en [specs/006-carga-estudios-ecg/](../specs/006-carga-estudios-ecg/) (`research.md` R8 y `contracts/storage-and-permissions.md`).

### Qué es y qué no es

- Privado: bloqueo de acceso público completo, propiedad forzada al propietario (sin ACL) y una política con un único `Deny` para el tráfico sin TLS, sin ninguna `Allow`.
- Cifrado en reposo con SSE-S3 (`AES256`). La aplicación además pide el cifrado en cada subida.
- **Sin versionado, a propósito:** eliminar un estudio debe borrarlo de verdad. Con versionado quedarían versiones recuperables. Una guarda de CI falla si alguien lo agrega.
- Sin vencimiento de objetos: los plazos de conservación se definen antes de operar con datos reales.
- Protegido con `prevent_destroy` y sin `force_destroy`. Un plan que lo reemplace o lo destruya es bloqueante.
- Solo estudios. Los artefactos de modelos van en el bucket de `model-artifacts`, y los datos del conjunto EchoNext nunca van a ninguno de los dos.

### Quién accede

- **La aplicación**, con el usuario `medicia-dev-app`: guardar, leer y borrar objetos del prefijo `studies/`, y listar el bucket solo para ese prefijo (lo usa `npm run studies:reconcile`). Lo concede el módulo `identity` cuando recibe `studies_bucket_arn`, y solo tiene efecto porque `medicia-dev-boundary` incluye las mismas acciones.
- **El operador de Terraform** crea y configura el bucket, pero tiene un `Deny` explícito sobre `GetObject`, `GetObjectVersion`, `DeleteObject` y `DeleteObjectVersion` de sus objetos, que gana a cualquier `Allow` de sus propias peticiones. **Límites conocidos (dev, sin datos reales):** el `Deny` solo frena las peticiones que firma el propio operador y es una defensa adicional, no una garantía. Con las credenciales del operador todavía se llega a los estudios por otras vías: (1) la clave del usuario de la aplicación, que está en el estado y que el operador puede leer o reemplazar; (2) la política y el bloqueo de acceso público del bucket, que el operador puede escribir; (3) crear un usuario o un rol `medicia-dev-*` con `medicia-dev-boundary`, que ahora incluye los permisos de estudios, y que también es el techo del rol de plan de CI. En producción esas vías se cierran con un rol de servidor, un límite propio de la aplicación y la política del bucket aplicada por administración (ver «Antes de cargar datos reales de pacientes»).
- **El plan de CI** lee la configuración del bucket y no tiene permisos sobre sus objetos. Pero lee el estado, que guarda la clave de la aplicación, y `medicia-dev-boundary` es su techo: ver los límites conocidos de arriba.
- **SageMaker y su rol de ejecución** no acceden a este bucket.

### Orden de los pasos

1. **(administrador)** Rotación de permisos del operador, como en "Cambiar los permisos del operador": cambió `medicia-dev-boundary`, la política del operador y el rol de plan. Aplicá `bootstrap` con el perfil de administración.
2. **(responsable)** `terraform -chdir=infra/environments/dev plan` y, si solo crea el bucket y la política de la aplicación, `apply`. Un segundo `plan` debe dar `No changes`.
3. **(responsable)** Migración de Prisma de la 006 y variables de entorno de la aplicación en `.env.local`: `STUDY_STORAGE=s3`, `STUDIES_BUCKET` (salida `studies_bucket_name` del entorno) y `AWS_REGION=sa-east-1`. Con `STUDY_STORAGE=fake` la aplicación guarda los estudios en memoria y no usa AWS.

### Comprobar que quedó bien

```powershell
aws s3api get-public-access-block --bucket medicia-studies-dev-896618135592   # los cuatro valores en true
aws s3api get-bucket-versioning --bucket medicia-studies-dev-896618135592      # sin estado: nunca se versionó
aws s3api get-bucket-encryption --bucket medicia-studies-dev-896618135592      # AES256
```

Con las credenciales del operador, leer un objeto del bucket debe dar `AccessDenied`.

### Antes de cargar datos reales de pacientes

Estas medidas quedan fuera de esta etapa y deben resolverse antes: sacar la clave de la aplicación del estado (o crearla fuera de Terraform), un límite propio de la aplicación (`medicia-dev-app-boundary`) que el operador solo pueda asignar a su usuario, aplicar la política y el bloqueo de acceso público del bucket de estudios por la vía de administración y sumar `PutObject` y `PutBucketVersioning` al `Deny` del operador, registro de accesos del bucket y alarmas, plazos de conservación y eliminación según los requisitos institucionales, un rol del servidor en lugar del usuario de IAM de la aplicación, y limitación de frecuencia de cargas.

## Recreación desde cero

Para levantar todo en una cuenta limpia:

1. Quitá `infra/bootstrap/backend.tf` (la fase 1 del arranque usa estado local).
2. Ajustá `account_id` en `infra/bootstrap/variables.tf`, y la cuenta y el bucket en `infra/environments/dev/providers.tf` y `backend.tf`.
3. Seguí "Arranque en dos fases" y luego "Uso diario" para `environments/dev`, **con una salvedad**: el catálogo ya trae la entrada `echonext-mini`, así que un `apply` completo intentaría crear el modelo antes de que existan la imagen y el artefacto. Primero aplicá solo el bucket, el repositorio y el rol, y subí el artefacto y la imagen, como describe "Modelo EchoNext-Mini", paso 2. Recién después, el `apply` completo.
4. Creá la variable de GitHub `INFRA_PLAN_ROLE_ARN` con `terraform -chdir=infra/bootstrap output -raw plan_role_arn` (Settings → Secrets and variables → Actions → pestaña Variables; es un ARN, no un secreto).

## Operación

**Estado bloqueado por un proceso cortado.** El bloqueo es un objeto `.tflock` en el bucket. Antes de forzar nada, comprobá que no haya otra operación en curso (otra terminal, otra persona, un proceso colgado). Solo entonces:

```powershell
terraform -chdir=infra/environments/dev force-unlock <id>   # (responsable) el id lo muestra el error de bloqueo
```

**Se perdió el secreto del cliente.** Se ve de nuevo con `terraform -chdir=infra/environments/dev output -raw user_pool_client_secret` o en la consola de Cognito (grupo → clientes de aplicación → pestaña "Secretos del cliente"). Si querés uno nuevo, reemplazá el cliente:

```powershell
terraform -chdir=infra/environments/dev apply -replace=module.identity.aws_cognito_user_pool_client.app   # (responsable)
```

El cliente nuevo cambia el identificador y el secreto, así que hay que actualizar `COGNITO_CLIENT_ID` y `COGNITO_CLIENT_SECRET`. Las cuentas del grupo no se pierden: pertenecen al grupo, no al cliente.

**Rotar la clave de la aplicación:**

```powershell
terraform -chdir=infra/environments/dev apply -replace=module.identity.aws_iam_access_key.app   # (responsable)
```

Después actualizá `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` en `.env.local`.

**Cambio hecho a mano en la consola.** El plan de CI muestra la diferencia con el código. Corregilo en el código (si el cambio es deseado) o volvé a aplicar para revertirlo.

### Cambiar los permisos del operador

El operador (`terraform-dev`, con la política `medicia-dev-terraform-operator`) **no puede editar su propia política ni la política límite `medicia-dev-boundary`**: un `Deny` se lo impide a propósito, y solo puede crear usuarios o roles `medicia-dev-*` si llevan ese límite. Así, quien tenga su clave de acceso no puede darse permisos de administrador.

Tampoco puede cambiar la política del bucket del estado ni su bloqueo de acceso público (`aws_s3_bucket_policy` y `aws_s3_bucket_public_access_block` en `state-bucket.tf`): con eso podría darse acceso al estado, que contiene secretos. Esos cambios también van por la vía de administración.

Consecuencia: si el `plan` falla con `AccessDenied` porque falta un permiso, o si hay que cambiar el límite o la política del bucket, hace falta una vía de administración aparte. Se hace así:

1. Corregí `operator-policy.tf` (o `permissions-boundary.tf`) y revisá el cambio en un PR, como cualquier otro.
2. En la consola de AWS, con el usuario raíz y su MFA, **reemplazá** la política de `terraform-dev` (Users → `terraform-dev` → Permissions): quitá `medicia-dev-terraform-operator` y adjuntá `AdministratorAccess`. Hay que quitar **las dos políticas del operador** (`medicia-dev-terraform-operator` y `medicia-dev-terraform-operator-ml`): su `Deny` gana incluso a `AdministratorAccess`, así que con las dos puestas el `apply` falla con "explicit deny". No se puede aplicar con la cuenta raíz: la raíz está bloqueada a propósito para `terraform`.
3. Aplicá `bootstrap` (responsable) con ese perfil y comprobá un `plan` sin cambios.
4. Volvé a adjuntar **las dos** (`medicia-dev-terraform-operator` y `medicia-dev-terraform-operator-ml`) y quitá `AdministratorAccess`. Los dos pasos juntos. Para comprobar que no quedó administrador, `aws iam list-users` tiene que dar `AccessDenied`.

Mientras `AdministratorAccess` está puesto, quien tenga la clave de `terraform-dev` es administrador de la cuenta. Hacelo de corrido y no lo dejes puesto. Más adelante conviene reemplazar este procedimiento por un rol de administración con MFA, fuera del prefijo `medicia-dev-`.

Los permisos del rol de plan y del usuario de la aplicación nunca superan el límite: si un permiso nuevo no entra en `medicia-dev-boundary`, tampoco lo van a tener, aunque se lo agreguen.

**Qué agregó la base de SageMaker a la política del operador** (todo aplicado por un administrador):

- Crear, configurar y borrar el bucket `medicia-models-dev-896618135592`, y leer toda su configuración. El borrado sigue protegido por `prevent_destroy`. No tiene acceso a otros buckets.
- Subir y leer artefactos (`s3:PutObject`, `s3:GetObject` y `s3:GetObjectVersion`) en ese bucket. **No incluye `s3:DeleteObject`**, y un `Deny` lo refuerza: ni siquiera una sentencia en la política del bucket, que el operador puede escribir, le daría el borrado de objetos.
- Crear el rol `medicia-dev-sagemaker-execution` y ponerle su política, solo si lleva el límite `medicia-dev-sagemaker-boundary`. Los demás roles `medicia-dev-*` siguen exigiendo `medicia-dev-boundary`.
- El `Deny` que impide crear, editar o borrar políticas ahora incluye también `medicia-dev-sagemaker-boundary`.
- Un `Deny` adicional obliga a que el rol de ejecución lleve siempre `medicia-dev-sagemaker-boundary`: sin él, la regla genérica de roles `medicia-dev-*` permitiría crearlo o cambiarle el límite a `medicia-dev-boundary`, que es más amplio.

**La segunda política** (`medicia-dev-terraform-operator-ml`, en `bootstrap/operator-policy-ml.tf`) se separó de la primera porque una política administrada de IAM admite 6.144 caracteres y la primera está cerca del tope. Tiene acciones enumeradas, sin comodines de servicio:

- Catorce acciones de SageMaker (crear, describir y borrar modelos, configuraciones y puntos de inferencia, etiquetas e `InvokeEndpoint`) solo sobre recursos `medicia-dev-*`. Los tres listados (`ListModels`, `ListEndpoints` y `ListEndpointConfigs`) van sobre `*` porque AWS no permite limitarlos.
- `iam:PassRole` solo sobre el rol de ejecución, y solo hacia `sagemaker.amazonaws.com`. Es la protección contra escalar privilegios.
- Un `Deny` de defensa adicional contra crear modelos sin aislamiento de red (`sagemaker:NetworkIsolation = false`). Depende de que AWS informe esa clave en la solicitud; la barrera principal es que el módulo `model-endpoints` siempre crea los modelos con aislamiento, y lo prueban sus tests.
- **Límite conocido:** el operador podría crear a mano, con la CLI, una configuración con GPU, porque no hay una condición de IAM por tipo de instancia. La barrera es la validación de Terraform y las guardas de CI, que no cubren la CLI. Agregar un `Deny` por `sagemaker:InstanceTypes` queda pendiente de confirmar esa clave en la referencia de autorización de AWS.
- ECR: gestionar y subir imágenes solo en repositorios `medicia-dev-*`, sin borrar imágenes ni fijar la política del repositorio. `ecr:GetAuthorizationToken` va sobre `*` porque AWS no permite limitarlo.
- El operador **no puede editar ni borrar esta política**: su ARN está en el `Deny` de las políticas de acceso.
- **Falta una lectura:** el operador no puede leer los resultados del escaneo de vulnerabilidades de ECR (`ecr:DescribeImageScanFindings`). Se ven en la consola. Se suma en la próxima rotación de administrador.

El rol de plan de CI también ganó lecturas, y nada más: la configuración del bucket de modelos (no sus objetos), el rol de ejecución, y los modelos, configuraciones y puntos de inferencia de SageMaker y el repositorio de imágenes.

**Qué agregó el bucket de estudios (006):**

- El bucket `medicia-studies-dev-896618135592` se suma a las declaraciones que ya cubrían el de modelos: lectura y configuración, y crear, borrar y fijar política, bloqueo y propiedad.
- Un `Deny` (`NoLeerNiBorrarEstudios`) sobre `GetObject`, `GetObjectVersion`, `DeleteObject` y `DeleteObjectVersion` de los objetos de estudios: el operador crea el bucket pero no lee ni borra su contenido.
- En `medicia-dev-boundary`, el permiso de la aplicación de guardar, leer y borrar objetos del prefijo `studies/` y de listar el bucket para ese prefijo. Son los únicos permisos de escritura de S3 del límite.
- En el rol de plan, la lectura de la configuración del bucket de estudios (sin permisos sobre sus objetos; ver los límites conocidos de la sección «Bucket de estudios»).

## Liberar los recursos al terminar

El grupo de usuarios y los dos buckets (el del estado y el de artefactos de modelos) están protegidos a propósito contra borrados accidentales. Para liberarlos:

1. Agregá `protect_user_pool = false` al bloque `module "identity"` de `environments/dev/main.tf` y aplicá (responsable): apaga la protección de borrado de Cognito. Después quitá el `prevent_destroy` del grupo en `modules/identity/main.tf`.
2. Revisá el plan de destrucción completo antes de ejecutarlo: `terraform -chdir=infra/environments/dev destroy` (responsable).
3. Para el bucket de artefactos, un administrador vacía primero todas las versiones y los marcadores de eliminación (el operador no puede borrar objetos); después quitás su `prevent_destroy` en `modules/model-artifacts/main.tf`. El flujo de CI exige que ese `prevent_destroy` siga ahí, así que el cambio tiene que ir acompañado de ajustar esa guarda.
4. Para el bucket del estado, vaciá primero todas las versiones y luego quitá su `prevent_destroy` en `bootstrap/state-bucket.tf`. Hacelo al final, porque el estado de las demás raíces vive ahí.

Eliminar el grupo borra todas las cuentas de usuarios que contenga.

## Actualizar Terraform y los proveedores

Las actualizaciones de la versión de Terraform, del proveedor de AWS y de los complementos de `tflint` van en un cambio aparte de los cambios funcionales. Así un plan inesperado se atribuye a una sola causa. Subí la versión en `terraform.tf` (y en el flujo de CI), corré `terraform init -upgrade` en cada raíz y versioná los `.terraform.lock.hcl` resultantes.

## El estado contiene secretos

El estado de `environments/dev` incluye el secreto del cliente de Cognito y la clave de acceso de la aplicación. Por eso el bucket es privado, cifrado, versionado y exige TLS, y el rol de CI solo puede leer la clave de estado de `environments/dev/`. Aun así, el rol de CI puede leer esos secretos: es un riesgo aceptado para desarrollo y deberá resolverse antes de producción (por ejemplo, ocultando los secretos del estado o usando un almacén de secretos).

## Solución de problemas

**Credenciales vencidas o ausentes.** Los comandos fallan con un mensaje claro y no dejan cambios a medias. Comprobá la sesión:

```powershell
aws sts get-caller-identity
```

Debe mostrar la cuenta `896618135592` y el usuario `terraform-dev`. Si falla, renová las credenciales del perfil `medicia-dev` (`aws configure --profile medicia-dev`) y volvé a probar.

**`plan` falla con `AccessDenied`.** Mirá la acción que indica el error y agregala a la política correspondiente (el operador, o el rol de plan si falla en CI). Para el operador, ver "Cambiar los permisos del operador".

**El flujo falla en "Guarda de costo".** Lee el mensaje: o hay un punto de inferencia declarado fuera de `modules/model-endpoints`, o un recurso que cobra por tiempo (cuaderno, dominio, perfil, espacio o aplicación de SageMaker), o un tipo de instancia con GPU, o falta el `prevent_destroy` del bucket de artefactos. Todo eso se decide aparte, con su costo documentado.

**El CI falla en `plan` al asumir el rol.** El paso "Mostrar el sujeto del token" imprime el `sub` real. Tiene que coincidir con `github_oidc_subject` en `bootstrap/variables.tf`. Si el repositorio se renombró o se recreó, el `sub` cambia y hay que actualizar la variable y aplicar `bootstrap`.

**El análisis de `trivy` marca un hallazgo.** Corregilo. Si es una excepción deliberada, agregala a `.trivyignore` con un comentario que explique el motivo.
