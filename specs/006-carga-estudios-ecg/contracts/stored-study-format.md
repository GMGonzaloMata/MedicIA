# Contrato: formato guardado del estudio (`ecg1`)

Es lo que se guarda en S3 después de validar (ver `research.md`, R3). Lo leen el visor de la onda (007) y el adaptador del modelo (008). No es el `.npz` subido: no conserva nada de ese archivo salvo la onda y las 7 variables.

## Disposición

Todo en *little-endian*, sin relleno. Tamaño total fijo: **120.036 bytes**.

- Bytes 0 a 7: la firma ASCII `MEDECG01` (8 bytes). El `01` es la versión del formato.
- Bytes 8 a 35: las 7 variables tabulares como 7 `float32`, en el orden del contrato de la 005: sexo, edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS, QT corregido.
- Bytes 36 a 120.035: la onda como 30.000 `float32` (2500 muestras por 12 derivaciones), fila por fila: primero las 12 derivaciones del instante 0, luego las del instante 1, y así hasta el instante 2499. El valor de la muestra `t` de la derivación `d` está en la posición `36 + 4 * (t * 12 + d)`.

## Reglas

- Cualquier objeto que no mida exactamente 120.036 bytes o no empiece con `MEDECG01` está corrupto y no se interpreta.
- Todos los valores son finitos y cumplen las reglas de `upload-npz.md` (se validan al guardar y al leer).
- Los `float64` del archivo subido se convierten a `float32`, que es lo que usa el modelo.
- Para invocar a EchoNext-Mini, el adaptador de la 008 arma `waveform` como 2500 filas de 12 números y `tabular` como 7 números, tal cual los define la 005.
- Una versión futura del formato cambia la firma (`MEDECG02`); un lector rechaza versiones que no conoce.

## Clave en el bucket

`studies/<tenantId>/<studyId>.ecg1`, armada en el servidor con el `tenantId` del contexto autenticado y el `id` del estudio. El cliente nunca envía ni recibe una clave.

## Cifrado

Cada objeto se guarda con cifrado en reposo `AES256` (SSE-S3) indicado explícitamente en la solicitud; el bucket además lo exige por defecto.
