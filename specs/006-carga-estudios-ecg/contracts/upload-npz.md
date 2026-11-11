# Contrato: archivo `.npz` que se sube

Es lo que acepta la carga. Parte del contrato de entrada de la 005 (`specs/005-echonext-mini-sagemaker/contracts/inference-api.md`) y del archivo que genera `make_sample.py` de `medicia-ml`.

## Contenedor

- Un archivo ZIP (formato `.npz` de NumPy) de hasta **2 MB** (2.097.152 bytes).
- La suma de los tamaños descomprimidos declarados no supera **20 MB** y cada entrada leída mide exactamente lo declarado.
- Sin ZIP64, sin cifrado, sin varios volúmenes. Métodos de compresión admitidos: almacenado (0) y deflate (8).
- Hasta 16 entradas. Las que no se llamen `waveform.npy` ni `tabular.npy` se ignoran **sin leerse** y no se conservan.

## Entradas obligatorias

- `waveform.npy`
  - Tipo `float32` o `float64`, little-endian (`<f4` o `<f8`), orden C (`fortran_order: False`).
  - Forma `(1, 2500, 12)` (la del conjunto de datos) o `(2500, 12)`. 2500 muestras (250 Hz, 10 segundos) por 12 derivaciones, una fila por instante.
  - Ya filtrada y normalizada, sin unidades de milivolts.
  - Todos los valores finitos y con valor absoluto de hasta 25 (ver `research.md`, R4: la partición de prueba llega a 10,72).
- `tabular.npy`
  - Tipo `float32` o `float64`, little-endian, orden C. Forma `(7,)`.
  - Orden: sexo, edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS, QT corregido.
  - Sexo exactamente `0` (mujer) o `1` (hombre). Las otras seis, estandarizadas: valores finitos con valor absoluto de hasta 25 (la partición de prueba llega a 10,03).

No se valida el orden de las derivaciones ni de las variables: el conjunto de datos lo fija.

## Rechazos

Cada rechazo tiene un código estable y un mensaje en español. Los mensajes nombran el campo y la regla y **nunca incluyen valores del estudio ni el nombre del archivo**.

- `FILE_MISSING`: «Elegí un archivo para subir.»
- `FILE_TOO_LARGE`: «El archivo supera el tamaño máximo de 2 MB.»
- `NOT_NPZ`: «El archivo no es un .npz válido.»
- `UNSUPPORTED_ZIP`: «El archivo usa una característica de ZIP no admitida.»
- `EXPANSION_LIMIT`: «El contenido del archivo supera el tamaño máximo permitido al descomprimirse.»
- `FIELD_MISSING`: «Falta el campo «waveform».» (o «tabular»)
- `FIELD_DUPLICATED`: «El campo «waveform» aparece más de una vez.»
- `FIELD_TYPE`: «El campo «waveform» debe ser de tipo float32 o float64.»
- `FIELD_SHAPE`: «El campo «waveform» debe tener 2500 muestras por 12 derivaciones.» / «El campo «tabular» debe tener 7 valores.»
- `FIELD_CORRUPT`: «El campo «waveform» está dañado.»
- `VALUE_NOT_FINITE`: «El campo «waveform» contiene valores no finitos.»
- `SEX_INVALID`: «El sexo (primera variable de «tabular») debe ser 0 o 1.»
- `VALUE_OUT_OF_RANGE`: «Una variable de «tabular» está fuera del rango esperado. Los valores deben venir estandarizados.»

Los mensajes de `VALUE_OUT_OF_RANGE` y `VALUE_NOT_FINITE` pueden nombrar la posición de la variable (por ejemplo, «la variable 2») pero no su valor.
