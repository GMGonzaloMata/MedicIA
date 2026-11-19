# Presentación y conexión del primer flujo PDF / E022

## Alcance y precedencia

Este corte T4/T8 implementa S4/S6/S7/S8/S11/S14/S15: carga real configurada → estudio → pedido explícito → consulta autorizada → informe único. Sustituye **solo** las salvaguardas transitorias de «acción concreta no disponible» y «panel PDF no habilitado» de `study-and-report-ui.md` cuando las fábricas reales estén implementadas y configuradas. No declara completados los gates de runtime, privacidad, DB, validación clínica o historia integrada. No modifica NPZ ni sus acciones/resultados históricos.

## Límites de servidor

- `createConfiguredPdfExtraction(): PdfExtraction | null` y `createRawEcgInference(): RawEcgInference | null` son fábricas síncronas de infraestructura, resueltas exclusivamente en las raíces de composición. No hay fallback fake ni endpoint/actor enviado por cliente. Su ausencia/configuración inválida es indisponibilidad, no un éxito simulado. El contrato de configuración y los límites del runtime local se documentan en `processing-boundary.md`.
- La acción PDF reutiliza `createPdfUploadAction`: contexto autenticado, forma y paciente derivados del servidor; el caso de uso conserva la comprobación de paciente/asignación antes de leer bytes, extraer o guardar. Solo tras éxito real se revalidan las listas y se redirige a `/studies/<studyId>`. El sobre privado con original y extracción conserva su camino de persistencia previo. No se inicia inferencia al subir ni al abrir el estudio.
- Las acciones importan únicamente los entrypoints de composición `uploadConfiguredPdfStudy` y `requestConfiguredIntegratedAnalysis`. Cada uno importa/evalúa su factory de configuración dentro de la llamada, después de autenticar/validar la acción; no agrega inicialización al singleton legacy. El primero conserva la autorización del caso de uso antes de leer bytes; el segundo conserva autorización, snapshot y arbitraje del caso de uso integrado. No hay excepción ni supresión de lint para importar infraestructura desde presentación. Se conservan las APIs de inyección `createUploadPdfStudy`, `createIntegratedAnalysesModule`, la fuente explícita y la consulta independiente de disponibilidad.
- `requestIntegratedAnalysisAction(studyId: unknown)` valida UUID y contexto propio, usa la fábrica explícita existente con `RawEcgInference`, solicita únicamente `ECG_UNIFIED_V1`, entrega `run` a `after()` y devuelve `{ ok: true, report }`. El resultado inicial y las consultas usan `UnifiedReportPublication`, nunca el documento privado completo. El trabajo no comienza ante un rechazo de acceso. Se conserva el arbitraje del caso de uso.
- `createIntegratedReportQuery()` construye `createGetIntegratedAnalysis({ analyses, studySource, now })`. La función devuelta recibe `{ actor, studyId, analysisId }` y devuelve `Promise<UnifiedReportPublication>`. Autoriza estudio antes del reloj, vencimiento y lectura; `expireIntegratedStale` antecede a `findIntegratedById`. Todas las operaciones ligan clínica/estudio y la lectura agrega id; fila/documento ajenos se rechazan. No consulta disponibilidad actual de modelos ni relee el PDF.
- `getIntegratedAnalysisAction(studyId: unknown, analysisId: unknown)` obtiene nuevamente identidad y clínica del servidor, valida ambos UUID y llama a esa consulta. No inicia trabajo ni construye modelos. Acción y consulta fallidas exponen mensajes fijos, sin logs arbitrarios, PDF, claves, variables de inferencia o diagnóstico del servicio.

## Interacción visible

- PDF y NPZ mantienen el selector de formato y ECG explícito, límite de 2 MiB, validación y accesibilidad del dropzone. La carga PDF válida navega al estudio guardado. La inferencia exige «Analizar estudio»; durante el POST aparece «Pidiendo el análisis…» y no permite duplicar el pedido.
- El panel PDF es distinto de `AnalysisSection` legacy tanto para PDF_READY como PDF_UNAVAILABLE. Solo recibe `studyId` y un `analysisId` opcional ya validado, no identidad ni onda.
- Un pedido exitoso conserva su id en `?analysisId=...`; una recarga puede consultar ese pedido conocido. Este corte no agrega búsqueda del último integrado ni API/historial nuevo. La ausencia de id no dispara inferencia ni una búsqueda implícita.
- La lectura inmediata y luego cada 3 s, con una sola consulta en vuelo, continúa solo en WAITING. Al llegar a terminal se detiene y refresca la ruta. Error de lectura detiene el ciclo y ofrece «Actualizar informe», sin crear otro pedido. Desmontar o cambiar estudio/pedido limpia el temporizador e ignora respuestas tardías; no promete cancelar un trabajo ya aceptado por el servidor.

## Informe y lenguaje clínico

- WAITING: «Analizando el estudio…», estado de cada componente y omisiones; sin indicadores clínicos ni procedencia de contribuciones aún no publicables.
- PARTIAL: «Informe parcial», solo contribuciones válidas tras alcanzar terminal todos los componentes solicitados. Mini no configurado se presenta secundariamente como «EchoNext-Mini no disponible (NOT_AVAILABLE). No se ejecutó. Esto no equivale a un hallazgo negativo.». Un intento fallido se identifica como «falló» y no se confunde con NOT_AVAILABLE.
- NONE: «No se obtuvo un resultado válido.», estados/fallas fijos y posibilidad de otro pedido; ninguna sección clínica ni puntuación.
- COMPLETE: «Informe completo». Los dos indicadores FEVI comparten la sección «Función ventricular» y jerarquía. Se conservan los otros once indicadores Mini y su compuesto sin recalcularlos. La capacidad PDF de Mini no se habilita en este corte.
- E022: «Puntuación de investigación para posible FEVI ≤45 %», score decimal [0,1] con coma, sin conversión a porcentaje o FEVI numérica. Procedencia identifica componente, nombre/versión del modelo, preparación y fecha. «Es una puntuación de investigación, no un valor de FEVI ni una probabilidad clínicamente calibrada.» No hay umbrales visuales nuevos, promedio, máximo, fusión o conclusión clínica conjunta.
- Se mantiene la advertencia exacta existente: «Son probabilidades estimadas por un modelo de investigación. Pueden no estar calibradas: leelas como un indicador relativo de riesgo. Son posibles hallazgos de apoyo clínico, no un diagnóstico, y requieren la evaluación de un profesional.»

## Rebranding y evidencia

Se reutilizan únicamente tokens, marco/sidebar y navegación del worktree autorizado `Trabajo-lucho-dark-rebrand`. No se copia el formulario ni se propone una dirección visual nueva. Panel, estados y resultado usan tokens semánticos, foco visible, etiquetas textuales, reflujo y columnas adaptativas. El original rebrand permanece de solo lectura.

Las pruebas de componentes y acciones son evidencia de lógica/DOM con límites externos simulados, **no** prueba de multipart/Server Actions/RSC/after en Next ni inferencia real. La activación depende de las fábricas del escritor de servicios y la comprobación del padre en entorno sintético autorizado. `npm run check`, E2E, navegador real (375/768/1280, claro/oscuro), DB/tenant y recorrido PDF→E022 siguen gates de ensamblado. No hay capturas ni validación clínica implícitas.
