# Contrato: catálogo de modelos y punto de inferencia

**Plan**: [../plan.md](../plan.md) | **Decisiones**: [../research.md](../research.md) (R6, R7)

Define la variable `models` de `infra/environments/dev`, lo que crea cada entrada y cómo se enciende y se apaga. Las pruebas de `modules/model-endpoints` y `environments/dev` verifican cada punto.

## La variable `models`

- **Tipo:** mapa de nombre corto a entrada. Valor por defecto: `{}`. Sin archivos `.tfvars` (están prohibidos en git); las entradas se escriben en el código de `environments/dev` y pasan por revisión.
- **Nombre corto (clave del mapa):** cumple `^[a-z][a-z0-9-]{1,23}$` (2 a 24 caracteres, para que el nombre de la configuración con su sufijo único no pase los 63 caracteres que admite SageMaker). Los recursos se llaman `medicia-dev-<nombre>`.

### Campos de una entrada

- **`image_uri`** (texto, obligatorio): imagen del contenedor de inferencia.
- **`model_data_key`** (texto, obligatorio): clave del artefacto dentro del bucket de artefactos. No empieza con `/` ni incluye el nombre del bucket. El módulo arma la ruta `s3://<bucket>/<clave>`.
- **`model_version`** (texto, obligatorio): versión exacta del modelo. Se etiqueta en los tres recursos (`ModelVersion`). Es la base de la trazabilidad de un análisis futuro (constitución IV).
- **`instance_type`** (texto, opcional, default `ml.t2.medium`): uno de `ml.t2.medium`, `ml.c5.large`, `ml.m5.large`. Cualquier otro valor falla la validación con un mensaje que lista los permitidos.
- **`enabled`** (booleano, opcional, default `false`): interruptor del punto de inferencia.

La cantidad de instancias no es configurable: vale 1.

## Qué crea el módulo por entrada

- Siempre: un modelo de SageMaker y una configuración de punto de inferencia, sin costo mientras no haya punto de inferencia.
- Solo si `enabled` es `true`: un punto de inferencia, que cobra por hora.
- El rol de ejecución y el bucket los recibe de los módulos `sagemaker-execution-role` y `model-artifacts`; el módulo no los crea ni los modifica.

## Comportamiento verificado por las pruebas

- Catálogo vacío: el plan propone 0 modelos, 0 configuraciones y 0 puntos de inferencia (SC-006).
- Una entrada con `enabled` omitido o `false`: 1 modelo, 1 configuración y 0 puntos de inferencia.
- La misma entrada con `enabled = true`: 1 punto de inferencia, y el modelo y la configuración no cambian.
- Dos entradas, una encendida y otra apagada: solo la encendida tiene punto de inferencia, y encender o apagar una no altera la otra (FR-012).
- Tipo de instancia no permitido: la validación falla antes de planificar.
- Clave de entrada inválida o `model_data_key` que empieza con `/`: la validación falla.
- Todos los recursos llevan las etiquetas obligatorias y `ModelVersion`.

## Encender y apagar

- **Encender:** cambiar `enabled` a `true` en la entrada, abrir la propuesta, revisar que el plan agregue **un** punto de inferencia y nada más, y que el responsable aplique.
- **Apagar:** volver `enabled` a `false`. El plan debe proponer destruir **solo** el punto de inferencia.
- **Apagado de emergencia:** si hay un punto de inferencia encendido y no se puede esperar la revisión, el responsable puede borrarlo con la CLI de AWS (`aws sagemaker delete-endpoint`) y después dejar `enabled = false` en el código; el estado se concilia en el siguiente plan. La guía lo documenta con su advertencia.
- **Qué hay encendido:** `aws sagemaker list-endpoints` en `sa-east-1`. Cualquier punto de inferencia listado cobra.

## Costo por hora de cada tipo permitido

Precios de Hosting para South America (São Paulo), lista oficial de AWS del 2026-11-09 (ver [../research.md](../research.md), R7). Se recomprueban antes del primer despliegue.

- `ml.t2.medium`: 0,089 USD por hora, 2,14 USD por día, 64,97 USD al mes (730 horas).
- `ml.c5.large`: 0,157 USD por hora, 3,77 USD por día, 114,61 USD al mes.
- `ml.m5.large`: 0,184 USD por hora, 4,42 USD por día, 134,32 USD al mes.

## Fuera de este contrato

- Desplegar un modelo real, probar la inferencia y consumirla desde la aplicación.
- GPU, autoescalado, varias instancias, inferencia asíncrona y por lotes, y el tipo sin servidor.
- La imagen del contenedor y su acceso desde el rol (R10).
