# Contrato: API de inferencia de EchoNext-Mini

Es el contrato que consumirá el adaptador de la funcionalidad 006. Se invoca con `InvokeEndpoint` de SageMaker (o, en la prueba local, por HTTP directo al contenedor).

## Rutas del contenedor

- `GET /ping`: responde `200` con cuerpo vacío cuando el modelo está cargado. Si el modelo no cargó, no responde `200` (SageMaker marca el arranque como fallido).
- `POST /invocations`: ejecuta una predicción.

## Solicitud

- `Content-Type: application/json`. Cualquier otro tipo: `415`.
- Cuerpo de hasta 2 MB (la solicitud típica pesa cerca de 0,6 MB). Más: `413`.

```json
{
  "waveform": [[0.01, -0.02, "... 12 números"], "... 2500 filas"],
  "tabular": [1, 0.35, -0.12, 0.0, 0.4, -0.2, 0.1]
}
```

- `waveform`: 2500 filas por 12 columnas, números. Una fila es un instante de tiempo y una columna es una derivación, en el orden del conjunto de datos. Son los valores del arreglo `(1, 2500, 12)` sin la dimensión de canal.
- `tabular`: 7 números, en este orden: sexo (0 mujer, 1 hombre), edad, frecuencia ventricular, frecuencia auricular, intervalo PR, duración del QRS, QT corregido. Las seis últimas estandarizadas.

## Respuesta exitosa (`200`)

```json
{
  "model": "echonext-mini",
  "model_version": "0.1.0",
  "probabilities": {
    "lvef_lte_45": 0.0,
    "lvwt_gte_13": 0.0,
    "aortic_stenosis": 0.0,
    "aortic_regurgitation": 0.0,
    "mitral_regurgitation": 0.0,
    "tricuspid_regurgitation": 0.0,
    "pulmonary_regurgitation": 0.0,
    "rv_systolic_dysfunction": 0.0,
    "pericardial_effusion": 0.0,
    "pasp_gte_45": 0.0,
    "tr_max_gte_32": 0.0,
    "shd": 0.0
  }
}
```

- Las 12 claves siempre están, en este orden. Cada valor está entre 0 y 1.
- `shd` es el hallazgo compuesto: al menos uno de los otros once, estimado como una salida propia del modelo.
- No hay umbrales ni etiquetas de sí o no. Cada valor es la probabilidad estimada de un **posible hallazgo** de apoyo clínico, nunca un diagnóstico, y puede no estar calibrada: debe tratarse como un indicador relativo de riesgo.
- Misma entrada, misma respuesta (FR-004).

## Errores

- `400`: entrada inválida. Cuerpo `{"error": "<mensaje claro>"}`. No devuelve probabilidades. Casos:
  - el cuerpo no es JSON o faltan `waveform` o `tabular`;
  - `waveform` no mide exactamente 2500 por 12;
  - `tabular` no tiene exactamente 7 valores;
  - algún valor no es numérico o no es finito (NaN o infinito);
  - `sex` no es 0 ni 1.
- `413`: cuerpo demasiado grande.
- `415`: tipo de contenido no admitido.
- `500`: error interno. Cuerpo `{"error": "error interno"}`, sin detalles ni datos del estudio.

El mensaje de error nunca repite valores del estudio recibido.

## Lo que el contrato NO hace

- No preprocesa señal cruda ni lee XML (FR-006): la entrada ya viene normalizada.
- No valida el orden de las derivaciones ni de las variables; el conjunto de datos fija el orden y la guía lo documenta.
- No filtra estudios fuera del alcance del modelo (menores de 18 años, marcapasos ventricular, calidad pobre).
- No procesa más de un estudio por solicitud.
