# Investigación: Visor de la onda de un estudio de ECG

Decisiones técnicas de la 007. Cada una con su motivo y las alternativas descartadas. No quedaron puntos sin resolver.

## R1. Caso de uso `getStudyWaveform` y cambios de puertos

**Decisión:** un caso de uso nuevo, `get-study-waveform`, recibe `{ actor, studyId }` y:

1. Busca el detalle del estudio con `studies.findDetailById({ tenantId, studyId })`. Si no existe → `StudyNotFoundError`.
2. Resuelve el acceso: paciente, solo si `study.patientId === actor.patientId`; médico, solo con asignación vigente (`directory.findAssignedPatient`, que también devuelve el nombre del paciente). Si no tiene acceso → `StudyForbiddenError`.
3. Lee el objeto con `storage.get(study.storageKey)`. Si no existe, o si `decodeStoredStudy` lanza `StoredStudyCorruptError`, devuelve `{ status: "UNAVAILABLE", study }`.
4. Si se leyó, separa la onda en 12 derivaciones y devuelve `{ status: "READY", study, leads }`. Descarta las siete variables y la clave.

Un fallo de infraestructura al leer (red, permisos) no es «onda no disponible»: se lanza `StudyUnavailableError` y la pantalla muestra el error con la posibilidad de reintentar. Se registra solo el nombre del error y la clave opaca, nunca contenido.

**Puertos:** el almacenamiento necesita `get(key): Promise<Uint8Array | null>` (devuelve `null` si el objeto no existe). El repositorio necesita `findDetailById`, que devuelve el estudio con quién lo cargó (nombre del médico o marca de paciente) en una sola consulta; `findById` no alcanza porque no trae esos datos y pedirlos aparte sería una segunda consulta por estudio. No se amplía `PatientDirectory`: `findAssignedPatient` ya existe.

**Motivo:** reutiliza las reglas de la 006 sin duplicarlas y mantiene la regla «toda consulta lleva `tenantId`». Estudio ajeno, de otra clínica o inexistente terminan en la misma pantalla (la pantalla mapea `StudyForbiddenError` y `StudyNotFoundError` al mismo mensaje).

**Alternativas descartadas:** reutilizar `listStudies` y filtrar (trae 20 filas para mostrar una); poner la lectura en una acción de servidor llamada desde el cliente (más viajes y una superficie nueva sin necesidad, ya que la pantalla puede leer en el servidor); devolver la onda cruda sin separar (cada componente repetiría el recorrido intercalado de 12 columnas).

**Permisos de AWS:** el usuario de la aplicación ya tiene `s3:GetObject` sobre `studies/*` (módulo `identity` y `medicia-dev-boundary`). No hay cambios de Terraform.

## R2. Ruta, carga y viaje de la onda al navegador

**Decisión:** una ruta, `src/app/(dashboard)/studies/[studyId]/page.tsx`, para paciente y médico. La página exporta un cascarón estático con el título y un `<Suspense>`; dentro, un componente asíncrono lee la sesión, valida `studyId` con `z.uuid()`, llama al caso de uso y renderiza. Es el mismo patrón de las pantallas de la 006 (leer la sesión ocurre por solicitud, así que va dentro de `Suspense`, y el contenido llega por streaming después del cascarón). El estado de carga es el `fallback` del `Suspense`.

Errores:
- Sin acceso, estudio ajeno o inexistente, o `studyId` mal formado: la misma vista «Sin acceso» con vínculo de regreso (como en `patients/[patientId]`).
- «Onda no disponible»: vista propia, con el encabezado del estudio y el vínculo de regreso.
- Error inesperado o de infraestructura: `error.tsx` del segmento, con un botón para reintentar (`reset`).

**Viaje de la onda:** el componente servidor pasa a un componente cliente (`StudyViewer`) los datos del estudio (número, fecha, quién lo cargó, nombre del paciente si corresponde) y 12 `Float32Array` de 2.500 valores. React serializa los arreglos tipados de forma compacta (unos 120 KB en total, igual que el objeto guardado) y no hay una segunda llamada HTTP, así que el acceso queda resuelto en la misma solicitud. Ni la clave del objeto ni las siete variables salen del servidor: el caso de uso no las devuelve. Si en la implementación la serialización de `Float32Array` no se comportara como se espera, el plan de respaldo es enviar una cadena base64 de los bytes y decodificarla en el cliente; es un cambio local de `study-viewer.tsx` y no altera los contratos.

**Alternativas descartadas:** una ruta `/api` que devuelve JSON (superficie nueva que hay que autorizar y probar, más latencia, sin beneficio); enviar `number[]` (3 a 4 veces más pesado); una ruta distinta para el médico (duplica pantalla y pruebas, porque el acceso sale del estudio y no de la ruta).

**Regreso:** el vínculo «Volver a la lista» apunta a `/studies` para el paciente y a `/patients/{patientId}` para el médico. Para el médico, el `patientId` sale del estudio (el caso de uso lo devuelve a quien ya pasó el control de acceso).

## R3. Dibujo: SVG propio

**Decisión:** SVG con un `<svg>` por derivación, un `<polyline>` para el trazo y líneas para la cuadrícula. Sin librería de gráficos.

**Motivos:**
- 12 series de 2.500 puntos son 30.000 puntos: a SVG le sobra. En el zoom solo se dibuja la ventana visible (a lo sumo 2.500 puntos por trazo), así que el costo por fotograma es acotado.
- El tamaño del paquete no crece. Una librería de gráficos agrega decenas de KB para un uso que es una polilínea y una cuadrícula.
- El SVG es DOM: hereda los tokens de color por `currentColor` y variables CSS, funciona en claro y oscuro sin código extra, escala sin pérdida, y cada derivación puede llevar `role="img"` con una etiqueta accesible. En un `<canvas>` habría que reimplementar todo eso.
- Cuadrícula y eje de tiempo sin simular papel calibrado: líneas cada 0,2 s (finas) y cada 1 s (marcadas y rotuladas), y líneas horizontales a intervalos relativos sin unidades.

**Escala vertical:** cada derivación usa su propia escala, calculada una vez con el mínimo y el máximo de la derivación completa más un margen del 10 %, y no cambia al hacer zoom ni al desplazarse (si cambiara, la onda «respiraría» al moverse). Una derivación constante usa un rango fijo de ±1 para no dividir por cero. Se avisa en pantalla que cada derivación tiene su propia escala, coherente con no mostrar mV.

**Alternativas descartadas:** `<canvas>` (más rápido con millones de puntos que acá no hay, pero sin accesibilidad ni temas nativos); una librería (Recharts, uPlot, Chart.js): peso y estilos propios a pelear con los tokens, para una gráfica simple.

## R4. Interacción: vistas, zoom y desplazamiento

**Decisión:** el estado del cliente es `{ view: "ALL" | "SINGLE", lead, window: { start, span } }`, con `start` y `span` en muestras. La lógica vive en funciones puras (`viewport.ts`):
- Zoom: el `span` va de las 2.500 muestras (10 s) a 250 (1 s), por pasos multiplicativos de 2 con los botones y las teclas, y continuo con el pellizco. Se hace alrededor del centro de la ventana (con el teclado) o del punto del gesto (con el pellizco).
- Desplazamiento: se acota para que la ventana nunca salga de 0 a 2.500; el paso es la quinta parte del `span`.
- En la vista de las 12 derivaciones no hay zoom: se ve el estudio completo; elegir una derivación abre la vista ampliada.

**Teclado** (documentado en pantalla junto a los controles, `aria-keyshortcuts`):
- Flecha izquierda y derecha: desplazar. Inicio y Fin: ir al principio y al final.
- Más y menos: acercar y alejar. Cero: volver al estudio completo.
- Flecha arriba y abajo en la vista ampliada: derivación anterior y siguiente. Escape: volver a las 12 derivaciones.
- Todos los controles también existen como botones con texto visible, alcanzables con Tab. El área de la gráfica es un único elemento enfocable (`tabIndex=0`) que recibe las teclas, sin atrapar el foco: Tab sale de ella como de cualquier control.
- Un `aria-live="polite"` anuncia el cambio de rango («Mostrando de 2,0 a 4,0 s»).

**Gestos táctiles:** eventos de puntero sobre el área de la gráfica. Un dedo arrastra (desplaza); dos dedos hacen pellizco (zoom). `touch-action: pan-y` deja pasar el desplazamiento vertical de la página y reserva el horizontal y el pellizco para la gráfica. Los límites son los mismos que con el teclado.

**Motivo:** separar la lógica de los eventos permite probar con unidad todos los límites (el riesgo real: ventanas fuera de rango) sin DOM.

**Alternativas descartadas:** una librería de gestos (dependencia para dos gestos); `wheel` para el zoom (choca con el desplazamiento de la página; no es requisito).

## R5. Accesibilidad y diseño responsivo

**Decisión:**
- Estructura: `<figure>` con `<figcaption>` y, dentro, una lista de derivaciones cada una con su `<svg role="img" aria-label="Derivación II, 10 segundos">`. El resumen textual (`waveform-summary.tsx`) es una lista de definiciones visible, no solo para lectores de pantalla: derivaciones (los 12 nombres), duración (10 s) y frecuencia de muestreo (250 Hz), más la aclaración de la normalización.
- Contraste: trazo `--foreground`, nombres y ejes `--muted` (ya cumplen 4,5:1 en ambos temas, ver `globals.css`), cuadrícula con `--border` y una línea marcada cada segundo con más opacidad. Los tokens existentes alcanzan; no se agregan.
- Sin depender del color: todas las derivaciones usan el mismo color y se identifican por su nombre escrito en cada tira.
- Responsivo: las 12 tiras se apilan en una columna a cualquier ancho; cada SVG usa `width: 100%` y `viewBox` fijo con `preserveAspectRatio="none"` solo en el eje horizontal, y una altura mínima legible. En 375 px, 2.500 muestras ocupan unos 340 px: el trazo es chico pero legible, y la vista ampliada (más alta y con zoom) es la alternativa para el detalle. La barra de controles envuelve en varias filas. Ningún elemento fuerza desplazamiento horizontal de la página; la gráfica no lo necesita porque escala al ancho.
- Aclaración permanente sobre la onda: «Señal normalizada, sin unidades de milivolts. Cada derivación tiene su propia escala.»

**Alternativas descartadas:** la disposición clínica 3 × 4 en escritorio (no aporta valor sin calibración y duplica el diseño); mostrar tira rítmica.

## R6. Vínculos desde las listas

**Decisión:** `StudiesList` agrega, en la columna de acciones de la tabla y en cada tarjeta, un vínculo «Ver onda» a `/studies/{id}` (con el número en el nombre accesible: «Ver onda del estudio 3»). Esa lista ya la usan `/studies` (paciente) y `/patients/[patientId]` (médico), así que un solo cambio cubre las dos pantallas. En la pantalla del estudio, un vínculo «Volver a la lista» (R2).

**Motivo:** el cambio es mínimo, y la tabla y las tarjetas se actualizan juntas. Se mantiene el botón de eliminar al lado, así que la columna de acciones pasa a tener dos acciones.

## R7. Estrategia de pruebas

Con el ritmo rápido que pidió el responsable: pocas pruebas, puestas donde está el riesgo.

- **Unidad del caso de uso** (`get-study-waveform.test.ts`, con repositorio y almacenamiento en memoria): paciente dueño; paciente ajeno; médico con asignación vigente; médico sin asignación; asignación terminada; administrador sin rol de médico (resuelto antes, por `toStudyActor`, que ya tiene prueba); estudio inexistente; otra clínica; archivo ausente → `UNAVAILABLE`; archivo corrupto → `UNAVAILABLE`; falla del almacenamiento → `StudyUnavailableError`; el resultado no contiene la clave ni las variables.
- **Unidad de lógica pura:** separación de derivaciones (`ecg-leads`), ventana de zoom y desplazamiento con todos sus límites (`viewport`), trazo y escala (`waveform-path`), mapa de teclas (`viewer-keys`). Estas dan casi toda la cobertura de la interacción.
- **Unidad de adaptadores:** `get` de S3 con cliente simulado (existente, objeto inexistente → `null`, error propagado) y `get` en memoria.
- **Integración sobre la base local** (`study-waveform-access.test.ts`): `findDetailById` con `tenantId` correcto e incorrecto, y la matriz de acceso real (paciente dueño, paciente ajeno, médico con asignación, sin asignación, asignación terminada y reiniciada, otra clínica), reutilizando los datos de `seed-demo-clinic` y los accesorios de `access-matrix`.
- **Componentes (jsdom):** una prueba de `StudyViewer` con la onda sintética para comprobar las 12 tiras con nombre, el cambio de vista y que Escape vuelve; sin probar gestos táctiles (jsdom no los simula bien; la lógica del pellizco se prueba como función pura).
- **E2E (almacenamiento falso):** paciente abre su estudio y ve las 12 derivaciones, y el recorrido de teclado (elegir derivación, acercar, desplazar, volver); médico abre un estudio de su paciente asignado y vuelve a la lista del paciente; acceso rechazado (otro paciente) con el mismo resultado que un identificador inexistente; los tres anchos y modo oscuro sin desplazamiento horizontal. **El estado «onda no disponible» no tiene prueba E2E:** el almacenamiento falso vive en la memoria del servidor y la prueba no puede borrar el objeto sin borrar también la fila; queda cubierto por la prueba de unidad del caso de uso y la del componente de estados.

Los archivos sintéticos salen del generador de la 006 que ya usan las pruebas E2E; ninguna prueba abre datos de EchoNext.

## R8. Fuera de este plan

Sin migraciones de Prisma, sin Terraform, sin variables de entorno nuevas, sin cambios de `next.config.ts`. No se agregan límites de frecuencia ni auditoría de consultas: siguen en la lista «antes de datos reales» de la 006 (R14).
