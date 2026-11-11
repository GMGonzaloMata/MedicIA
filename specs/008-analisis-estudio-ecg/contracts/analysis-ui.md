# Contrato de interfaz: sección «Análisis» de la pantalla del estudio

Se agrega a `/studies/[studyId]` (ver el [contrato de la 007](../../007-visor-onda-ecg/contracts/viewer-ui.md)), debajo del visor y del resumen de la señal. No hay ruta nueva.

## Entrada

- `studyId` de la ruta (UUID, validado por la página).
- Parámetro de búsqueda opcional `analysisId` (UUID): el análisis a mostrar. Si falta o no es un UUID, se muestra el análisis completado más reciente. Un `analysisId` que no existe, es de otro estudio o de otra clínica se trata como si no existiera y se muestra el más reciente.

## Estados

- **Sin análisis:** el botón «Analizar estudio» y el texto «Todavía no hay análisis de este estudio.»
- **En curso:** el botón deshabilitado con «Hay un análisis en curso», el texto «Analizando el estudio…» dentro de una región `aria-live="polite"` y la actualización periódica cada 3 s.
- **Completado:** resultado (ver abajo) e historial.
- **Fallido:** en el historial, con el motivo genérico; si no hay ningún completado, además un aviso con el motivo del último y el botón disponible para reintentar.
- **Sin acceso:** la misma vista «No tenés acceso a este estudio.» que ya usa el visor; la sección no se muestra.
- **Pedido rechazado** (ya hay uno en curso, falla del servidor): mensaje bajo el botón, dentro de `role="alert"`.

## Botón

- «Analizar estudio» (formulario con la acción `requestAnalysisAction`). Mientras la acción responde, el texto cambia a «Pidiendo el análisis…» y el botón se deshabilita.
- La acción valida `studyId`, resuelve la sesión por su cuenta, llama a `requestAnalysis` y programa `run` con `after()`. Devuelve `{ ok: true }` o `{ ok: false, code, message }`, igual que las acciones de la 006. Tras un pedido correcto, `revalidatePath` de la pantalla del estudio.

## Resultado

- Título «Resultado del análisis» y, debajo, la advertencia permanente: «Son probabilidades estimadas por un modelo de investigación. Pueden no estar calibradas: leelas como un indicador relativo de riesgo. Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.»
- Datos: modelo, versión, fecha y hora del análisis y quién lo pidió.
- 12 filas en el orden del contrato (las claves en [model-inference.md](model-inference.md)), cada una con:
  - el nombre en español (`_lib/findings-labels.ts`);
  - el porcentaje escrito, con una decimal y coma decimal (por ejemplo «23,4 %»), en cifras tabulares;
  - una barra con `role="meter"`, `aria-valuemin="0"`, `aria-valuemax="100"`, `aria-valuenow` y `aria-label` con el nombre y el porcentaje. La barra usa los tokens de color y su ancho es el porcentaje.
- La última fila (el compuesto) se destaca con borde y fondo propios y la aclaración «al menos uno de los otros once».
- Sin umbrales, sin etiquetas de sí o no, sin colores que cambien según el valor.

## Historial

- Lista (`<ol>`) del más reciente al más antiguo. Cada ítem: fecha y hora, quién lo pidió, el estado en texto («En curso», «Completado», «Fallido») y, si falló, el motivo genérico.
- Los completados tienen un vínculo «Ver resultado» con nombre accesible «Ver el resultado del análisis del {fecha}» hacia `?analysisId={id}`. El ítem que se está mostrando lleva `aria-current="true"`.

## Motivos de falla (texto genérico, sin detalles internos)

- `MODEL_UNAVAILABLE`: «El análisis no está disponible en este momento. Probá de nuevo más tarde.»
- `INPUT_REJECTED`: «No pudimos analizar este estudio.»
- `TIMEOUT`: «El análisis tardó demasiado. Probá de nuevo.»
- `STUDY_FILE_UNAVAILABLE`: «La onda de este estudio no está disponible.»
- `INTERNAL`: «No pudimos completar el análisis. Probá de nuevo en unos minutos.»

## Accesibilidad y diseño

- Todo se opera con teclado; el botón y los vínculos tienen foco visible y área táctil de al menos 44 px.
- Estados con texto además de color; sin depender del color en barras ni en el compuesto.
- Una sola columna a cualquier ancho, que escala a 375, 768 y 1280 px sin desplazamiento horizontal; los nombres largos se parten.
- Textos con voseo y sin lenguaje de diagnóstico.

## Lo que no hace

Sin umbrales ni calibración, sin exportar ni imprimir, sin comparar análisis, sin eliminar análisis sueltos, sin encender el punto de inferencia y sin mostrar las siete variables.
