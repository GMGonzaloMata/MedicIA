# Contrato de interfaz: pantalla del visor

Ruta: `/studies/[studyId]`, dentro del grupo `(dashboard)` (exige sesión y vínculo con la clínica). Sirve al paciente (sus estudios) y al médico (los de pacientes con asignación vigente).

## Entrada de la ruta

- `studyId`: UUID. Un valor mal formado se trata como «sin acceso».

## Estados

- **Cargando:** el `fallback` de `Suspense` («Cargando estudio…») mientras llegan la sesión y la onda.
- **Listo:** encabezado del estudio, aclaración de la onda, controles y la gráfica.
- **Onda no disponible:** encabezado del estudio y el mensaje «La onda de este estudio no está disponible. Probá de nuevo más tarde o cargalo otra vez.», sin detalles internos.
- **Sin acceso:** «No tenés acceso a este estudio.» para estudio ajeno, de otra clínica, sin asignación vigente, inexistente o con identificador inválido. Es el mismo texto en todos los casos.
- **Error:** `error.tsx` del segmento, «No pudimos mostrar el estudio.» con botón «Reintentar».

En todos los estados hay un vínculo de regreso: «Volver a mis estudios» (paciente) o «Volver a los estudios del paciente» (médico).

## Encabezado

- Título: «Estudio {número}».
- Datos: fecha y hora de carga, quién lo cargó («El propio paciente» o el nombre del médico) y, solo para el médico, el nombre del paciente (o «Paciente sin nombre»).
- Aclaración permanente: «Señal normalizada, sin unidades de milivolts. Cada derivación tiene su propia escala. Es una visualización de la señal, no una interpretación.»

## Gráfica

- **Vista de las 12 derivaciones (por defecto):** 12 tiras apiladas, cada una con su nombre (I, II, III, aVR, aVL, aVF, V1 a V6), cuadrícula (líneas cada 0,2 s y marcadas cada 1 s) y el eje de tiempo de 0 a 10 s al pie. Elegir una tira (clic, toque o Enter) abre la vista ampliada.
- **Vista ampliada:** una derivación grande con el mismo estilo, ventana de tiempo visible entre 1 y 10 s, eje de tiempo con la ventana actual.
- Una sola escala vertical por derivación, fija mientras se hace zoom o se desplaza. Sin amplitudes ni unidades.
- Un solo color de trazo; las derivaciones se identifican por el nombre escrito.

## Controles

- Alternar vista: «Ver las 12 derivaciones» / «Ampliar derivación» con selector de derivación (lista con los 12 nombres).
- Zoom: «Acercar», «Alejar» y «Ver completo».
- Desplazamiento: «Anterior» y «Siguiente» (y arrastre).
- Todos son botones con texto visible y foco visible.

## Teclado (en la gráfica, que es un único elemento enfocable)

- Izquierda y derecha: desplazar. Inicio y Fin: extremos.
- Más y menos: acercar y alejar. Cero: ver completo.
- Arriba y abajo (vista ampliada): derivación anterior y siguiente.
- Escape: volver a las 12 derivaciones.
- El foco no queda atrapado: Tab sale de la gráfica. Las teclas se muestran en una línea de ayuda visible.

## Gestos táctiles (vista ampliada)

- Un dedo arrastra en horizontal: desplaza.
- Dos dedos separándose o juntándose: acerca o aleja.
- El desplazamiento vertical de la página sigue disponible (`touch-action: pan-y`).

## Accesibilidad

- Resumen textual visible: derivaciones (los 12 nombres), duración (10 segundos) y frecuencia de muestreo (250 Hz).
- Cada tira es `role="img"` con etiqueta («Derivación II, 10 segundos»). Un `aria-live="polite"` anuncia el rango visible tras cada cambio.
- Contraste con los tokens `--foreground`, `--muted` y `--border` en claro y oscuro. Ninguna información depende solo del color.
- Sin desplazamiento horizontal de la página a 375, 768 y 1280 px.

## Vínculo desde las listas

Cada estudio de `StudiesList` (tabla y tarjetas) tiene «Ver onda» (nombre accesible: «Ver onda del estudio {número}») hacia `/studies/{id}`.

## Lo que no hace

Sin mediciones, anotaciones, exportación, impresión, comparación de estudios, edición ni filtrado de la señal, y sin mostrar las siete variables.
