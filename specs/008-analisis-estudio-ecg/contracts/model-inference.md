# Contrato: puerto `ModelInference` y sus adaptadores

El contrato de red con el contenedor es el de la 005: [inference-api.md](../../005-echonext-mini-sagemaker/contracts/inference-api.md). Este documento fija el puerto de la aplicación y cómo cada adaptador lo cumple.

## Puerto

`predict({ waveform, tabular, signal }): Promise<ModelPrediction>`
- `waveform`: `Float32Array` de 30.000 valores, fila por fila (2.500 muestras por 12 derivaciones).
- `tabular`: `Float32Array` de 7 valores.
- `signal`: `AbortSignal` con el tope de 30 s.
- Devuelve `{ modelName, modelVersion, probabilities }`, con las 12 probabilidades en el orden del contrato.
- Si falla, lanza `ModelInferenceError` con un código: `MODEL_UNAVAILABLE`, `INPUT_REJECTED`, `TIMEOUT` o `INTERNAL`. El mensaje es fijo por código y nunca incluye el cuerpo del error original, valores del estudio ni la respuesta.

## Orden de los hallazgos

`lvef_lte_45`, `lvwt_gte_13`, `aortic_stenosis`, `aortic_regurgitation`, `mitral_regurgitation`, `tricuspid_regurgitation`, `pulmonary_regurgitation`, `rv_systolic_dysfunction`, `pericardial_effusion`, `pasp_gte_45`, `tr_max_gte_32`, `shd`.

## Adaptador real (`MODEL_INFERENCE=sagemaker`)

- Variables: `SAGEMAKER_ENDPOINT_NAME` (en desarrollo, `medicia-dev-echonext-mini`) y `AWS_REGION`. Si falta alguna, la composición falla al armarse y nombra la variable.
- Llamada: `InvokeEndpointCommand` con `ContentType` y `Accept` en `application/json`, cuerpo `{ "waveform": [[…12]…2500], "tabular": [7 números] }`, un solo intento y el `signal` recibido.
- Respuesta aceptada: JSON con `model` y `model_version` (texto no vacío) y `probabilities` con exactamente las 12 claves, cada una un número finito entre 0 y 1. Cualquier otra forma → `INTERNAL`.

Traducción de errores:
- `ModelError` (HTTP 424 de SageMaker) o 400 directo → `INPUT_REJECTED`.
- `ValidationError` (punto de inferencia inexistente, apagado o no listo), `ServiceUnavailable`, `ECONNREFUSED`, `ENOTFOUND` → `MODEL_UNAVAILABLE`.
- Aborto por el tope de tiempo → `TIMEOUT`.
- `AccessDenied`, `InternalFailure`, respuesta inválida, cualquier otro → `INTERNAL`.

Registro: solo el nombre del error y el código resultante.

## Adaptador simulado (`MODEL_INFERENCE=fake`)

- Determinista: la misma entrada da las mismas 12 probabilidades (entre 0 y 1); entradas distintas, resultados distintos. Modelo `echonext-mini-fake`, versión `0.0.0-fake`.
- Espera `FAKE_MODEL_DELAY_MS` (por defecto 1500 ms) antes de responder, para que el estado «en curso» se vea en desarrollo y en las pruebas E2E.
- Fallas por valores centinela en el cuarto lugar de `tabular` (frecuencia auricular estandarizada): `7.77` → `INPUT_REJECTED`, `7.78` → `MODEL_UNAVAILABLE`, `7.79` → `TIMEOUT` (respeta el `signal`: espera hasta que se aborte). Los valores caen dentro del rango que admite la carga de la 006 (|x| ≤ 25), así que una prueba arma su propio estudio con el centinela y no afecta a las demás.
- Solo se crea cuando `MODEL_INFERENCE=fake`.

## Selección

`create-model-inference.ts` elige el adaptador según `MODEL_INFERENCE`, sin valor por defecto: si falta o es desconocido, lanza `MODEL_INFERENCE debe ser "sagemaker" o "fake".` al armarse el módulo (de forma perezosa, para que `next build` no falle si faltan las variables).
