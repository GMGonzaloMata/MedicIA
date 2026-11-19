# Data model: compatibilidad aditiva y resultados independientes

T003 implementa el valor y la política puros; T014–T015 agregan schema/SQL manual e inserción/lectura. El corte de repositorio T020–T021 añade las transiciones CAS y el vencimiento descritos abajo, sin activar casos de uso, composiciones ni UI. El responsable generó el cliente Prisma 7.10.1 de este worktree; la migración no se ejecutó y no hay DB real verificada ni activación productiva. T021 completo (coordinación, consulta y DTOs) sigue pendiente. El estado de un pedido no convierte a sus ejecuciones disponibles en un modelo combinado; una capacidad omitida no es una ejecución.

## 1. Estudio y sobre privado

`Study`, `StudyCounter`, pertenencia y numeración no cambian. `storageKey` sigue identificando un único objeto. El nuevo camino usa el repositorio `insertWithNextNumber`; no calcula contadores ni SQL alternativos en el caso de uso PDF.

| Formato | Contenido | Compatibilidad |
|---------|-----------|----------------|
| `MEDECG01` / `.ecg1` | Onda preparada y siete variables, como 006. | Lector, bytes, clave y análisis legacy sin cambios. |
| `MEDPDF01` / `.pdfecg1` | Sobre JSON UTF-8 versionado; original base64, extracción y derivados necesarios. | Nuevo codec; máximo 16 MiB antes de parsear. Nunca interpretado por `decodeStoredStudy` legacy. |

Campos del sobre, validados al escribir y leer:

- `format`: literal `MEDPDF01`; versiones desconocidas se rechazan.
- `originalPdfBase64`: codificación base64 canónica de 1 a 2.097.152 bytes de PDF; no nombre de archivo.
- `extraction`: resultado `mortara-extraction.v1` definido en el contrato externo, con versión/procedencia, doce derivaciones por nombre, 5000 muestras por derivación, 500 Hz, microvoltios, máscara y medidas clínicas permitidas. Ningún identificador personal extraído.
- `derivatives`: objeto versionado que registra únicamente derivados necesarios para consulta/preparación y su procedencia; en v1 no se persisten tensores preparados por la aplicación ni se simula una normalización. La onda para visualizar se obtiene de `extraction` sin transformación científica; resultados de modelos viven en Analysis.

Clave nueva: `studies/<tenantId>/<studyId>.pdfecg1`, construida en el mismo helper de claves del módulo, con formato explícito y default legacy preservado. Actor y pertenencia salen del contexto autorizado. Cifrado y privacidad son los existentes, nunca se usa un bucket de modelos.

**Invariantes de ciclo de vida**: autorizar → extraer/validar → codificar → guardar un objeto → `insertWithNextNumber`. Si la inserción falla, compensar el único objeto como hoy; si falla la limpieza, clave opaca detectable por conciliación. Un rechazo de validación no guarda objetos ni consume número. Conciliación sigue reconociendo la clave completa en `Study.storageKey`, con antigüedad mínima y modo de informe por defecto.

Eliminación autorizada usa `createDeleteStudy` y borra fila/análisis y el único sobre completo, incluido PDF original y señal. Si falla el borrado del objeto se devuelve el aviso existente y queda clave opaca para limpieza. Sin duplicados de originales, versiones de bucket ni retención permanente añadidos.

## 2. Pedido y ejecuciones

Agregar a `Analysis`:

| Campo | Regla |
|-------|-------|
| `kind` | `LEGACY_ECHONEXT` por defecto; nueva variante `ECG_UNIFIED_V1`. |
| `integratedResult` | JSON nullable; nulo para legacy, documento `ecg-unified.v1` para integrado. Validado en dominio al escribir y leer. |
| `revision` | Entero no negativo, default 0; cada transición integrada exitosa incrementa uno mediante CAS. Un rechazo/conflicto no cambia revisión ni documento. Las APIs legacy no cambian este contador. |

Mantener `id`, `tenantId`, `studyId`, solicitante, fechas y `status` como pedido agrupador. Conservar FK compuesta por clínica/estudio, cascade al eliminar y el índice único parcial `analyses_one_in_progress`; dos componentes no crean dos filas activas.

Para legacy, `modelName`, `modelVersion`, `probabilities` y sus CHECK existentes mantienen exactamente el contrato 008. Para integrado, esos tres campos son nulos; no inventar un nombre o versión para el pedido. La migración reemplaza los CHECK de coherencia por variantes discriminadas que acepten las filas antiguas sin modificarlas y validen las nuevas; no elimina FK ni índice de concurrencia. Una única sentencia Prisma `analysis.create` inserta pedido y documento completo, con instantánea de capacidades y solo ejecuciones disponibles solicitadas en PENDING; no hay dos filas de componente, otra transacción de coordinación ni lock/contador nuevos. Etapa inicial: E022 AVAILABLE, EchoNext NOT_AVAILABLE hasta verificar preparación e inferencia PDF; recibir artefactos no habilita automáticamente el modelo. No crear un pedido vacío sin capacidades disponibles.

### Valor de dominio implementado en T003

API pública de `unified-report.ts`: `createUnifiedReport(unknown)`, `parseUnifiedReport(unknown)` y `publishUnifiedReport(unknown)`. Todas validan entradas; los errores de contrato son `InvalidUnifiedReportError` con mensaje fijo «El informe integrado no tiene la forma esperada.», sin copiar datos recibidos. Se reutilizan los códigos y el parser de probabilidades legacy, sin modificarlos.

`UnifiedReport` es un documento privado con `analysisId`, `studyId`, `requestedByUserId`, `requestedAt`, `schemaVersion`, `capabilities` y `components`. Identificadores no vacíos; fechas ISO UTC con Z. El solicitante y estudio se heredan del pedido. El repositorio comprueba esa vinculación con la fila al leer y con estudio/solicitante explícitos al insertar; la capa autorizada debe obtener el contexto antes de invocarlo. El parser puro y el repositorio no autorizan por sí solos al actor ni sustituyen las reglas de acceso del estudio. La creación recibe esos metadatos y capacidades, sin schemaVersion/components, y devuelve solo las ejecuciones disponibles PENDING. Parsear y crear devuelven copias profundamente inmutables; nunca congelan ni modifican la entrada.

Documento integrado `ecg-unified.v1`:

- `schemaVersion`: literal `ecg-unified.v1`.
- `capabilities`: exactamente echonext y e022; `{ status: AVAILABLE }` o `{ status: NOT_AVAILABLE, reason: texto no vacío }`, sin campos extra. El motivo es una omisión controlada por servidor, no el cuerpo de un error externo. NOT_AVAILABLE no tiene ejecución/modelo/versión/resultados inventados. Instantánea inmutable para ese pedido aunque la configuración cambie después.
- `components`: exactamente las claves AVAILABLE de la instantánea, sin extras y con al menos una ejecución. Inicialmente solo e022; después ambas. La omisión Mini se deriva de capabilities y no es fallo de ejecución.
- Cada componente contiene `analysisId` igual al pedido, `status`, `startedAt`, `finishedAt`, `failureCode`, `modelName`, `modelVersion`, `preprocessingReference` y `result`, sin extras. Se rechaza incluso una clave de capacidad omitida con valor undefined. Fechas de servidor ISO UTC en JSON: inicio no anterior al pedido y final no anterior al inicio, o al pedido si no hubo inicio; igualdad permitida.
- PENDING: inicio/final/error/resultado nulos. PROCESSING: inicio presente y final/error/resultado nulos. En ambos, nombre/versión ejecutados nulos; referencia de preparación configurada nullable, no vacía si existe.
- COMPLETED: inicio/final presentes, modelo/versión/referencia no vacíos, resultado válido y error nulo.
- FAILED: final presente, código genérico permitido y resultado nulo; inicio opcional si se rechazó antes de invocar. Los componentes intentados admiten los cinco códigos legacy. Una capacidad no configurada no tiene failureCode: se omite mediante NOT_AVAILABLE y texto informativo, sin error de ejecución Mini. El pedido sin éxitos resume fallas mixtas como INTERNAL o indisponibilidad homogénea como MODEL_UNAVAILABLE, manteniendo los motivos individuales. Conservar la referencia configurada si se conoce, sin inventar versión de modelo que no respondió. Nombre y versión son ambos nulos o ambos textos no vacíos.
- Resultado EchoNext: exactamente las doce claves y valores finitos entre 0 y 1 del contrato 005; el compuesto `shd` sigue siendo su salida propia.
- Resultado E022: `target` literal `lvef_lte_45`, `score` finito entre 0 y 1; no campo de FEVI numérica. Tipo/sentido del score se confirman con G3, no se lo declara calibrado.

No se guarda contenido clínico en errores. No se adjunta PDF, señal o variables al documento de análisis; pertenecen al sobre privado.

### Persistencia implementada en T014–T015 (sin ejecución de DB)

API aditiva en `application/ports/out/analysis-repository.ts`:

- `AnalysisRepository` conserva firmas y DTOs históricos; los fakes/consumidores actuales no requieren métodos nuevos. `IntegratedAnalysisRepository` es un contrato separado; el adaptador Prisma satisface ambos.
- `insertIntegratedPending({ tenantId, studyId, requestedByUserId, integratedResult: unknown })` valida el documento **entero** con `parseUnifiedReport`, su estudio/solicitante y que todas las ejecuciones sean PENDING antes de escribir. No reconstruye resultados ni aplica ciencia/fusión. Usa `analysisId`/`requestedAt` del documento privado creado en servidor, fija `kind: ECG_UNIFIED_V1`, revisión cero y deja nulos los campos legacy. El documento se conserva completo; el timestamp ISO se compara con el instante de la fila, sin exigir que su representación textual incluya milisegundos.
- `findIntegratedById({ tenantId, studyId, analysisId })` filtra los tres identificadores y la variante exacta. Devuelve null para inexistente/otra clínica/estudio/legacy. Valida otra vez el documento, vincula pedido/estudio/solicitante/instante, exige revisión entera no negativa y campos de resultado legacy nulos. La salida `IntegratedAnalysisEntry` añade `kind`, `integratedResult: UnifiedReport` y `revision`; no es DTO público de navegador.
- Contrato inválido/corrupción: `InvalidUnifiedReportError`, mensaje fijo «El informe integrado no tiene la forma esperada.». Validación rechazada no llama create/update; no consume pedido. Errores DB distintos de P2002 se propagan como antes; el repositorio no contiene logging clínico.
- `insertPendingRow` extrae y reutiliza el arbitraje previo `analysis.create`/P2002 → `AnalysisInProgressError` para ambas variantes. No existe mecanismo alternativo de concurrencia.
- `claim`, `complete`, `fail`, `failStale`, `findById` y `listByStudy` legacy ahora filtran `LEGACY_ECHONEXT`: no mutan ni interpretan JSON integrado. `toEntry` proyecta explícitamente el DTO anterior, sin filtrar columnas nuevas hacia consumidores históricos. `hasInProgress` deliberadamente observa **ambas** variantes con las mismas condiciones de fecha/tenant/estudio para conservar el bloqueo de eliminación/pedido compartido.
- T015 no expuso actualizaciones; el corte de repositorio T020–T021 de §3 las agrega ahora. Mantener deshabilitada la inserción productiva: faltan coordinación autorizada, invocación, consulta/DTOs y gates SQL. Las APIs legacy no se usan como sustituto.

SQL manual `20261116000000_pdf_unified_report/migration.sql`:

- Dentro de BEGIN/COMMIT crea enum `analysis_kind` y columnas aditivas `kind NOT NULL DEFAULT LEGACY_ECHONEXT`, `integrated_result JSONB NULL`, `revision INTEGER NOT NULL DEFAULT 0`. Sin UPDATE/DELETE/backfill de datos, DROP de tablas/columnas/índices ni conversión de estudios. Los defaults clasifican filas existentes como legacy; no se escribe un documento nuevo para ellas.
- `analyses_revision_check`: `revision >= 0` (INTEGER NOT NULL).
- `analyses_kind_document_check`: legacy exige **SQL NULL** en `integrated_result`; integrado exige model_name/model_version/probabilities SQL NULL y objeto con schemaVersion exacta, analysisId/studyId/requestedByUserId iguales a la fila y capabilities/components objetos. La subexpresión JSON termina con **IS TRUE**: SQL NULL, JSON null, claves faltantes o tipo distinto no pasan por UNKNOWN.
- Se reemplaza solo `analyses_status_fields_check` dentro de la misma transacción. La rama legacy conserva literalmente sus cuatro reglas previas, incluso FAILED con inicio/modelo opcionales. La rama integrada exige PENDING sin inicio/fin/error; PROCESSING con inicio, sin fin/error; COMPLETED con inicio/fin y sin error; FAILED con fin/código. Los modelos/puntuaciones legacy ya se prohíben por el CHECK discriminante.
- Los CHECK JSON son defensa estructural, **no una réplica** de zod: fechas JSON, membresía exacta, estados/resultados de componentes, rangos y procedencia se validan por el dominio al escribir/leer. SQL no prueba cobertura ni coordinación atómica del último resultado (T021).
- Permanecen sin cambio `analyses_probabilities_object_check`, `analyses_model_text_check`, la FK compuesta `analyses_tenant_id_study_id_fkey` con ON DELETE CASCADE y el índice único parcial `analyses_one_in_progress` por study_id en PENDING/PROCESSING. Este último arbitra legacy e integrado juntos.

Evidencia acotada: runner nuevo `node_modules/.cache/medicia-pdf-persistence/run-validation.mjs`, envDir:false, configuración y artefactos solo en esa cache, dependencias registradas del sibling en lectura. El singleton de DB y el runtime Prisma se sustituyen explícitamente para tests: ninguna conexión/solicitud externa. RED: 24 recolectados, 21 FAIL/3 PASS por APIs ausentes y fuga del DTO ante columnas aditivas. GREEN inicial: 24 PASS, preservación 177 PASS/7 archivos; final tras una corrección del helper de tipos y equivalencia temporal: 26 PASS, preservación 179 PASS/7 archivos, repositorio 100 % líneas/ramas/funciones/sentencias. No se afirma RED separado para el ajuste de representación temporal detectado por inspección. El chequeo strict real inicialmente detectó además un error de estrechamiento del helper del test, corregido; la repetición sigue exit2 por `generated/prisma/client` inexistente (TS2307 y TS18046 derivado). Strict/noEmit con dos fronteras DB/Prisma declaradas a mano pasa, **no demuestra compatibilidad con el cliente generado real**. No se creó un cliente generado falso ni se ejecutó generate.

Diferencial cache-only propio de este repositorio, no del formulario: primer intento exit1 antes de recolectar por include con separadores Windows y reporter sin diagnóstico; logs preservados, ninguna comparación aprobada en ese intento. Una corrección del helper normaliza el include y añade diagnóstico/guard de salida: 18 escenarios públicos legacy base HEAD/candidato pasan con stdout serializado, stderr y exit idénticos; incluye campos integrados extra pasados a insertPending que no cambian su identidad/contrato. Baseline representa columnas del esquema anterior, candidato representa las aditivas; compara DTOs, no bytes de consultas. Las diferencias pedidas que excluyen filas integradas de las APIs legacy se fijan por pruebas unitarias. Dos rondas pos-GREEN consumidas en total; no reiniciar presupuesto ni tocar el diferencial previo del formulario.

Validación SQL **estructural solamente**: defaults, cláusulas legacy exactas, IS TRUE, revisión, FK/índice intactos y balance léxico. No se usó parser/servidor PostgreSQL ni se aplicó DDL. `tests/integration/analyses/integrated-analysis.test.ts` está escrito, **no ejecutado ni typechecked con Prisma real**: usa esquema/repositorio reales y guardas existentes para FK tenant, arbitraje mixto, SQL/JSON null/claves ausentes, revisión negativa y default/DTO legacy. El reset de esa suite vacía tablas: requiere DB local desechable exclusiva para tests, con datos sintéticos, nunca DB compartida/desarrollo con datos útiles/producción.

Gates humanos antes de usar esta persistencia:

1. Revisión independiente de migración, tenant FK y repositorio compartido por el padre; ninguna aprobación implícita en este documento.
2. El responsable selecciona explícitamente PostgreSQL local aislado/deséchable de pruebas (sin datos reales), revisa todas las migraciones pendientes y configura su conexión por el mecanismo privado existente; no copiar ni registrar cadenas de conexión.
3. Solo el responsable ejecuta `npx prisma migrate deploy` y `npx prisma generate`. No se ejecutaron por el agente. El responsable ya generó Prisma 7.10.1 desde `prisma/schema.prisma` de este worktree hacia `generated/prisma`; esto no aplica ni comprueba el esquema SQL. La migración sigue pendiente y no se recomienda ejecutarla antes de la revisión/selección exclusiva de DB de los pasos 1–2.
4. Con cliente real y DB autorizados, verificar tipos reales, integración nueva/existente y los CHECK/FK/índice en PostgreSQL; después check completo según autorización del padre. `npm run check`/E2E no se ejecutaron aquí (config privada, DB y salidas fuera de la cache); no se declara feature completa ni migración aplicada.

Historia de higiene T014–T015: el padre corrigió posteriormente los cinco descartes no usados y el EOF en la continuación explícita ODD L52; observó lint0/whitespace0/26 tests PASS. No altera ni borra los fallos históricos de esa unidad. Las nuevas comprobaciones de esta unidad se registran al final de §3.

## 3. Transiciones y cobertura (fundación de repositorio T020–T021; integración pendiente)

| Evento | Operación atómica y efecto |
|--------|----------------------------|
| Pedido válido | Reutilizar el arbitraje único de inserción; crear PENDING con instantánea de capacidades y solo componentes disponibles solicitados PENDING. Un segundo pedido legacy o integrado no crea fila ni llama modelos. |
| Ejecución reclamada | PENDING → PROCESSING; cada componente comienza o falla por prevalidación sin invocación. |
| Respuesta válida | PROCESSING → COMPLETED del componente si pedido/componente no son terminales. Guardar resultado y procedencia juntos. |
| Fallo/rechazo/timeout | PENDING o PROCESSING → FAILED del componente, resultado nulo. |
| Un componente termina | Persistirlo sin publicar indicadores clínicos; pedido sigue PROCESSING mientras quede alguna ejecución solicitada no terminal; si era solo E022, finalizar en esa misma actualización. |
| Todas las ejecuciones solicitadas terminales | En la misma actualización del último componente, pedido COMPLETED si hay ≥1 contribución válida, FAILED si hay cero; finishedAt presente. Omitidos NOT_AVAILABLE no generan espera. |
| Vencimiento a 120 s | Marcar FAILED/TIMEOUT únicamente componentes no terminales y finalizar cobertura; conservar cualquier éxito anterior, sin respuesta tardía que lo sobrescriba. |

Cobertura derivada: WAITING si alguna ejecución disponible solicitada no es terminal; COMPLETE solo con las dos contribuciones válidas; PARTIAL con alguna válida y cobertura faltante por omisión o fallo, tras terminar todas las solicitadas; NONE sin resultados válidos al terminar todas. E022 COMPLETED + Mini NOT_AVAILABLE produce PARTIAL inmediatamente, sin ejecución Mini. Capacidad no disponible no equivale a ejecución fallida.

Actualizaciones integradas usan `tenantId`, `studyId`, `analysisId`, `kind: ECG_UNIFIED_V1`, estado leído y `expectedRevision` en compare-and-swap. Un único `analysis.updateMany` escribe documento completo validado, agregado, fechas, código y `revision: { increment: 1 }`: no hay segunda escritura de finalización ni transacción multisentencia que deje una ventana intermedia. Ante conflicto, el caller relee y reintenta solo mientras sea aplicable; si ya es terminal, no escribe. Las operaciones legacy conservan sus condiciones/filtros actuales y no interpretan el JSON integrado.

### API aditiva implementada (sin callers productivos)

- `IntegratedAnalysisMutation`: `{ tenantId, studyId, analysisId, expectedRevision }`. `IntegratedAnalysisComponent`: `echonext | e022`. El contexto es exclusivamente de servidor previamente autorizado; el repositorio no reemplaza los guards del estudio. Revisión inválida produce `InvalidUnifiedReportError`; inexistencia, tenant/estudio/variante ajenos, conflicto o transición no aplicable devuelven `false` sin escribir.
- `claimIntegrated({ ...mutation, startedAt })`: PENDING → PROCESSING del pedido, dejando las ejecuciones PENDING. Rechaza repetición, tiempo anterior al pedido y plazo global vencido.
- `startIntegratedComponent({ ...mutation, component, startedAt, preprocessingReference })`: únicamente componente PENDING de pedido PROCESSING, con inicio no anterior al claim y referencia configurada nullable; valida otra vez el documento completo. No agrega componentes NOT_AVAILABLE ni cambia la instantánea.
- `finishIntegratedComponent({ ...mutation, component, execution: unknown, now })`: sustituye **solo** la ejecución indicada y vuelve a pasar el documento entero por `parseUnifiedReport`. Exige outcome COMPLETED/FAILED, mismo pedido/inicio/referencia, final igual al instante `now` de servidor; COMPLETED requiere PROCESSING previo. FAILED admite PENDING tras claim por rechazo anterior a invocación, sin fabricar inicio/modelo/versión. No recibe un documento alternativo que pueda borrar la contribución hermana o modificar capacidades/metadatos. Payload inválido conserva el mensaje fijo del dominio y no escribe.
- Agregado derivado por `publishUnifiedReport`, no reglas clínicas duplicadas: WAITING mantiene PROCESSING sin publicar contribuciones; COMPLETE/PARTIAL finaliza COMPLETED; NONE finaliza FAILED. Fallas homogéneas conservan su código (incluidos TIMEOUT y MODEL_UNAVAILABLE), fallas mixtas resumen INTERNAL; el documento mantiene cada motivo. Éxitos y fallas previos nunca se sustituyen ni reviven.
- `expireIntegrated({ ...mutation, now })`: al alcanzar **30.000 ms** desde el inicio de un componente PROCESSING lo pasa a FAILED/TIMEOUT; a **120.000 ms** desde requestedAt vence todos los componentes todavía PENDING/PROCESSING. Igualdad vence; 29.999/119.999 ms no. Outcome al alcanzar cualquiera de sus plazos se rechaza sin escribir, incluso antes del barrido. Solo el barrido registra TIMEOUT. Se preservan literalmente los terminales anteriores, incluidos éxito/procedencia/resultados. Si queda otro PENDING, el pedido sigue PROCESSING/WAITING hasta su terminal o 120 s.
- `expireIntegratedStale({ tenantId, studyId, now })`: busca ambas situaciones de vencimiento en filas integradas activas de ese estudio/clínica; cada mutación lleva id/variante/estado/revisión. Relee un CAS perdido mientras la fila permanezca activa y su revisión avance; si ya es terminal o no cambió, termina sin sobrescribir. Las transiciones monotónicas son finitas por pedido. Devuelve cantidad de actualizaciones CAS exitosas, no cantidad de componentes. Este método **debe conectarse** a consulta/pedido en la siguiente unidad; el `failStale` legacy no se amplía ni reemplaza. Sin esos callers todavía no existe vencimiento perezoso productivo integrado.
- El reloj siempre se suministra con `Date` de servidor; no hay `Date.now`, reloj mock oculto, timers, runtime/modelos falsos ni motor de workflow. No se cambian SQL, schema, índice parcial, FK, DTOs o APIs legacy. Las nuevas revisiones usan la columna ya existente.

### Evidencia acotada y gates que NO se cierran

Runner nuevo `node_modules/.cache/medicia-pdf-transitions/run-validation.mjs`, envDir:false, dependencias instaladas del sibling en lectura, env allowlisted, timeout 25 s por subproceso/30 s de herramienta, sin instalación/enlaces/config privada/DB. Comandos con prefijo exacto `env -u NODE_OPTIONS node node_modules/.cache/medicia-pdf-transitions/run-validation.mjs`:

- `red`: exit1, 15 FAIL/26 PASS por APIs ausentes, aserciones públicas ejecutadas. `green`: exit0, 41 PASS. `preserve`: exit0, 194 PASS/7 archivos.
- `types-real`: exit2, TS18046 en guard Prisma por resolución incompleta del runtime instalado desde el runner. Primera corrección agrega solo el mapping `@prisma/client/*` hacia la dependencia real del sibling. `types-real-correction1`: exit0, strict/noEmit usando **cliente real generado en PDF** y runtime real, sin declaraciones manuales. `lint`: exit0 con las reglas reales de eslint.config.mjs; advertencia React autodetect por falta de paquete local, no errores.
- Segunda corrección: nuevo RED `red-correction2` exit1, 1 FAIL/44 PASS; un outcome ganaba CAS y el barrido no releía, devolviendo 0 y dejando el pedido ocupado. Se agregó relectura/reaplicación monotónica. `green-correction2`: exit0, 45 PASS; `preserve-correction2`: exit0, 198 PASS/7 archivos; `types-real-correction2`: exit0; `lint-correction2`: exit0 (misma advertencia React). Las tres pruebas adicionales de bordes/claim/corrupción pasaron antes de esa corrección, sin afirmar RED propio. Ambas rondas disponibles consumidas.
- Cobertura final de repositorio (frontera DB simulada): 100 % líneas (106/106), 100 % funciones (28/28), 97,34 % ramas (110/113), 98,34 % sentencias (119/121). Incluye ambos órdenes, CAS concurrente/reintento, parcial/sin éxitos, NOT_AVAILABLE, tenant/estudio/id/revisión, outcomes inválidos, 30/120 s, respuestas tardías y no-revivificación; preserva las APIs legacy.
- `differential`: exit0, 18 escenarios legacy HEAD/candidato con stdout público serializado, stderr y exit idénticos. Comparador previo de repositorio reutilizado solo en lectura y copiado a **esta** cache; baseline y logs solo en esta cache, no Git en pruebas comprometidas. Ningún runner anterior de formulario/runtime se ejecutó ni reparó.
- Cada modo conserva stdout/stderr/exit, comando y hashes de los cinco archivos autorizados en `<modo>.{stdout.log,stderr.log,exit.txt,command.json}`; no se sobrescriben fallos. Los doubles DB/Prisma de ejecución de Vitest son explícitos y **no prueban una transacción PostgreSQL**. Las declaraciones manuales preparadas de frontera no se usaron como compatibilidad generada real.
- `tests/integration/analyses/integrated-analysis.test.ts` amplía casos para SQL real (ambos órdenes, CAS concurrente, errores/aislamiento, disponibilidad, parcial/fallo y 30/120 s), pero **NO se ejecutó ni se incluyó en el typecheck focal**. `beforeEach(resetDatabase)` sigue truncando nueve tablas: requiere selección humana de DB local desechable exclusiva con datos sintéticos y revisión/aplicación humana de migraciones; localhost por sí solo no es prueba de exclusividad. No ejecutar esta suite automáticamente.

Este corte cubre únicamente la fundación de repositorio de T020–T021. No marca T021 completa ni activa PDF→E022→informe: request-integrated, list/get/DTOs, guards de aplicación, transporte real, UI, check completo/E2E y revisión independiente del padre siguen pendientes. El cliente generado ya no bloquea el typecheck focal, pero no demuestra DDL aplicado ni concurrencia/tenant sobre SQL real. Prerrequisitos humanos de migración y gates clínicos/modelos/lector permanecen intactos.

## 4. DTOs y seguridad

- Resumen de pedido: identificador, clase, fechas, solicitante visible, disponibilidad/omisiones y estados/cobertura; sin resultados de componentes mientras WAITING.
- Informe publicado: `UnifiedReportPublication` devuelve `analysisId`, `studyId`, `requestedAt`, `capabilities`, `components` de progreso (solo estado, fechas y código genérico) y `coverage`. WAITING/NONE no incluyen la propiedad `contributions`, ni resultados, puntuaciones o versiones. COMPLETE/PARTIAL agregan `contributions`: lista inmutable de `{ component, execution }` exitosa con resultado/procedencia originales. Ambos modelos tienen la misma estructura, sin prioridad ni puntuación agregada; no se ordenan por magnitud. No se publica `requestedByUserId`. La UI/advertencias y el solicitante visible siguen pendientes, no los implementa esta proyección.
- Viewer PDF: doce derivaciones crudas, máscara, frecuencia y unidades explícitas; no inventar normalización, escala clínica o señal en tramos ausentes. Legacy conserva su DTO exacto; el nuevo contrato se expone con versión propia.
- Original: bytes PDF mediante lectura autenticada, nunca una clave o URL pública; no se obtiene a través del DTO de análisis.
- Ninguna migración aplica automáticamente formato nuevo a estudios históricos ni habilita E022 sobre una onda `ecg1` ya normalizada.
