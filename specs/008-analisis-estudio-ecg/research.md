# Investigación: Análisis de un estudio de ECG con EchoNext-Mini

Decisiones técnicas de la 008. Cada una con su motivo y las alternativas descartadas. No quedaron puntos sin resolver.

## R1. Módulo `analyses` y sus límites con `studies`

**Decisión:** un módulo nuevo, `src/modules/analyses`, con `domain`, `application` e `infrastructure` y su propio `composition.ts`.

**La regla del proyecto:** `eslint.config.mjs` prohíbe que un módulo importe el dominio, la aplicación o la infraestructura de otro; solo permite que un `composition.ts` importe el `composition.ts` de otro módulo, que es donde se conectan los casos de uso. Por eso el diseño no comparte tipos ni clases entre módulos y toda la conexión vive en las dos composiciones:

- **Tipos propios.** `analyses` define su propio actor (`AnalysisActor`, con la misma forma que el `StudyActor` de la 006: paciente con `patientId` o médico con `membershipId`, más `tenantId` y `userId`). La capa `app/` ya arma el actor de estudios; como la forma coincide, se pasa el mismo valor a ambos módulos sin importar tipos del otro. Mismo criterio que ya usa `studies` con `users`.
- **Casos de uso nuevos de `studies`, con control de acceso, que devuelven resultados en lugar de lanzar errores del dominio** (para que `analyses` no necesite importar `StudyForbiddenError` ni `StudyNotFoundError`):
  - `authorizeStudy({ actor, studyId })` devuelve `{ status: "ALLOWED", studyId, patientId }` o `{ status: "NO_ACCESS" }` (estudio ajeno, de otra clínica, sin asignación vigente o inexistente: indistinguibles). Es el mismo código de acceso que usa `getStudyWaveform`.
  - `readStudyModelInput({ actor, studyId })` devuelve `{ status: "READY", waveform, tabular }`, `{ status: "FILE_UNAVAILABLE" }` (archivo ausente o dañado) o `{ status: "NO_ACCESS" }`. Una falla del almacenamiento o de la base se propaga como excepción. Es el único camino por el que las siete variables salen de `studies`, y no llega a ninguna pantalla.
- **Puerto de `analyses`, `StudySource`**, con las mismas dos operaciones y tipos propios. Su implementación, `createStudySource`, vive en `analyses/infrastructure/adapters/study-source.ts` y recibe como argumentos las dos funciones de `studies` (no importa nada de ese módulo), lo que la deja cubierta por las pruebas de unidad.
- **`analyses/composition.ts`** conecta ambos extremos importando `getStudiesModule` de `studies/composition.ts` (lo permite la regla) y pasando sus funciones a `createStudySource` dentro de cierres perezosos.
- **Control de eliminación:** `studies/composition.ts` inyecta `canDeleteStudy` en `createDeleteStudy` con un cierre perezoso que llama a `getAnalysesModule().hasAnalysisInProgress(...)`. Las dos composiciones se importan entre sí, pero solo usan al otro **dentro de funciones que se ejecutan después de armar el módulo**, no al evaluarlo, así que no hay recursión ni orden de inicialización que importe.

**Motivo:** la constitución lista a los análisis como módulo de negocio propio, y a futuro habrá otros modelos y otros tipos de estudio. Un módulo propio evita que `studies` crezca con adaptadores de inferencia, y los casos de uso con control de acceso en `studies` evitan duplicar las reglas de la 006 en otro lugar. Cumple la regla de límites del repositorio sin excepciones.

**Carrera conocida y aceptada:** entre `canDeleteStudy` y el borrado puede entrar un pedido nuevo; el borrado en cascada elimina el análisis recién creado y, cuando la ejecución termina, su `UPDATE` no encuentra la fila y no hace nada. No queda ningún dato huérfano.

**Alternativas descartadas:**
- *Análisis dentro de `studies`*: mezcla dos agregados y llena `studies` de código de inferencia.
- *Importar el actor o los errores de `studies` desde `analyses`*: lo impide la regla de límites entre módulos.
- *Que `analyses` consulte directamente las tablas de estudios y asignaciones*: duplica las reglas de acceso, justo la parte que no debe divergir.
- *Evento o cola entre módulos para el control de eliminación*: complejidad sin beneficio para una sola consulta.

## R2. Modelo de datos

**Decisión:** tabla `analyses` ([data-model.md](data-model.md)):
- Clave foránea compuesta `(tenant_id, study_id)` → `studies (tenant_id, id)` con `ON DELETE CASCADE` (la 006 dejó `@@unique([tenantId, id])` para esto). Un análisis no puede estar en otra clínica que su estudio.
- Estado como enum `analysis_status` (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) y código de falla como enum `analysis_failure_code` (`MODEL_UNAVAILABLE`, `INPUT_REJECTED`, `TIMEOUT`, `STUDY_FILE_UNAVAILABLE`, `INTERNAL`).
- `model_name` y `model_version`: lo que el contenedor informó en su respuesta (la trazabilidad refleja lo que realmente produjo el resultado, no lo que se esperaba).
- `probabilities` como `jsonb`.
- Fechas: `requested_at` (default `now()`), `started_at` y `finished_at`.
- **Un solo análisis en curso por estudio**, garantizado por la base: `CREATE UNIQUE INDEX analyses_one_in_progress ON analyses (study_id) WHERE status IN ('PENDING', 'PROCESSING')`, escrito a mano en la migración porque Prisma no modela índices parciales. El pedido atrapa la violación (`23505`) y la traduce a «ya hay un análisis en curso». Funciona igual con pedidos simultáneos, que es el caso que una comprobación previa en la aplicación no cubre.
- `CHECK` de coherencia entre estado y campos (a mano en la migración): `COMPLETED` exige resultado, modelo, versión y `finished_at` y prohíbe `failure_code`; `FAILED` exige `failure_code` y `finished_at` y prohíbe resultado; `PENDING` y `PROCESSING` no tienen resultado, código ni `finished_at`; `jsonb_typeof(probabilities) = 'object'`.

**`jsonb` frente a 12 columnas:** `jsonb`. El resultado siempre se lee y se escribe como una unidad, nunca se filtra ni se ordena por un valor, y otro modelo futuro tendrá otras salidas; 12 columnas atarían el esquema a EchoNext-Mini (principio V). La validación que las columnas darían gratis la hace zod al escribir y al leer (12 claves exactas, en el orden del contrato, números finitos entre 0 y 1), y el `CHECK` de tipo evita basura obvia.

**Migración:** la genera y aplica el responsable (`prisma migrate`), con el SQL a mano de arriba. Los agentes no ejecutan comandos de Prisma. La tarea de esquema es una **compuerta**: el agente escribe `schema.prisma` y se detiene hasta que el responsable genere la migración y el cliente, porque sin el cliente regenerado el repositorio no compila.

**Alternativas descartadas:** guardar el resultado en el estudio (viola el principio IV); una tabla de hallazgos con una fila por probabilidad (12 filas por análisis y una consulta con unión para algo que nunca se consulta por hallazgo); comprobar «uno en curso» solo en la aplicación (carrera).

## R3. Ejecución: segundo plano con `after()`

**Decisión:** el pedido (`requestAnalysis`) hace en la acción de servidor lo rápido —acceso, vencer análisis viejos, leer la entrada, insertar el análisis en `PENDING` — y devuelve enseguida. La inferencia se programa con `after()` de `next/server` y corre cuando la respuesta ya salió: pasa a `PROCESSING` (la actualización solo aplica si sigue en `PENDING`), invoca al modelo con un tope de **30 s**, valida la respuesta y deja `COMPLETED` o `FAILED`. Todo error se captura dentro de la ejecución: nunca sale una excepción de `after()`.

**Motivo:** cumple lo pedido sin trabajador aparte:
- Cerrar la pestaña no cancela el análisis: `after()` se ejecuta aunque la respuesta no se complete, y el servidor de Node es un proceso de larga vida.
- El pedido no depende de la duración de la inferencia ni de su tiempo de arranque en frío.
- El estado intermedio es real y verificable (y lo exige el modelo de datos).

**El servidor puede reiniciarse a mitad de un análisis** y dejarlo en `PENDING` o `PROCESSING` para siempre. Se resuelve sin trabajador: un análisis cuyo `requested_at` supera los **2 minutos** (cuatro veces el tope de la inferencia) se considera vencido y pasa a `FAILED` con código `TIMEOUT`. Esto ocurre de forma perezosa: al pedir un análisis nuevo (antes de insertar, para no bloquear al usuario con uno muerto) y al listar o abrir los análisis de un estudio (antes de leer). Es una sola actualización acotada por clínica y estudio, con la condición de estado y fecha, así que es idempotente y segura frente a pedidos simultáneos.

**La entrada viaja en memoria:** `requestAnalysis` lee la onda y las variables una vez, antes de insertar, y devuelve una función de ejecución que las conserva en su cierre; la acción la entrega a `after()`. No se vuelve a leer el archivo ni se reevalúa el acceso en el segundo plano (el acceso se evaluó al pedir, que es el momento relevante). Si el archivo no existe o está dañado, no se llama al modelo: el análisis se inserta directamente como `FAILED` con `STUDY_FILE_UNAVAILABLE` (queda en el historial y se puede reintentar).

**Alternativas descartadas:**
- *Esperar la respuesta dentro de la acción*: la acción quedaría de 1 a 30 s con la pestaña pegada a la conexión, y no habría estado «en curso» que mostrar.
- *Una cola (SQS) o una función aparte*: infraestructura nueva y más permisos para una funcionalidad con un usuario por vez.
- *Un proceso periódico para vencer análisis*: otro componente que operar; la regla perezosa alcanza.
- *Inferencia asíncrona de SageMaker*: fuera de alcance de la 004 y la 005 (punto de inferencia en tiempo real).

## R4. Actualización de la pantalla y ubicación del resultado

**Decisión:** el resultado y el historial viven dentro de `/studies/[studyId]` (sin ruta nueva): una sección «Análisis» debajo del visor, con el botón, el resultado seleccionado y la lista. El análisis a mostrar se elige con el parámetro de búsqueda `analysisId` (UUID); si falta, se muestra el más reciente completado. La sección es un componente de servidor propio dentro de su `Suspense`, así que la onda y los análisis llegan por separado.

**Mientras hay un análisis en curso**, un componente cliente (`analysis-progress`) llama a `router.refresh()` cada **3 s** y se desmonta solo cuando la lista ya no tiene uno en curso, con un texto `aria-live="polite"` («Analizando el estudio…»). Se detiene si la pestaña está oculta y reanuda al volver. El corte natural es el vencimiento de 2 minutos: al refrescar, el servidor ya lo marca como fallido y el componente desaparece.

**Motivo:** `router.refresh()` vuelve a ejecutar los componentes de servidor sin perder el estado del cliente (el visor, la derivación abierta y el zoom siguen donde estaban) y no agrega una API. Es suficiente para un análisis de pocos segundos.

**Alternativas descartadas:** recarga manual (mala experiencia con un estado «en curso»); WebSockets o eventos del servidor (infraestructura nueva); una ruta por análisis (más pantallas y más pruebas de acceso sin necesidad: el acceso a un análisis ya se resuelve por su estudio).

## R5. Puerto `ModelInference` y sus adaptadores

**Decisión:** un puerto `ModelInference.predict({ waveform, tabular, signal })` devuelve `{ modelName, modelVersion, probabilities }` o lanza un error de dominio con el código de falla (`ModelInferenceError`, que lleva solo el código, nunca el cuerpo del error original). Dos adaptadores elegidos por `MODEL_INFERENCE` sin valor por defecto, como `STUDY_STORAGE`: si falta o es desconocido, la composición falla al armarse y nombra la variable.

**Adaptador real** (`sagemaker-model-inference.ts`):
- Usa `@aws-sdk/client-sagemaker-runtime` (nueva dependencia, versión 3.1164.0 igual a la de S3) con `InvokeEndpointCommand`, el nombre de `SAGEMAKER_ENDPOINT_NAME` (`medicia-dev-echonext-mini`) y `AWS_REGION`. El cliente se crea con un solo intento (`maxAttempts: 1`) para que el tope de 30 s sea real, y la llamada recibe `AbortSignal.timeout(30_000)`.
- Arma la solicitud del [contrato de la 005](../005-echonext-mini-sagemaker/contracts/inference-api.md): `waveform` como 2.500 filas de 12 números y `tabular` con 7. Los `Float32Array` se convierten sin redondear, para que el modelo reciba exactamente lo guardado (el JSON pesa unos 0,6 a 0,9 MB, por debajo del tope de 2 MB del contenedor).
- Valida la respuesta con zod en modo estricto: `model` y `model_version` no vacíos, 12 claves exactas de `probabilities`, cada una un número finito entre 0 y 1. Cualquier otra forma es una falla interna.
- Traducción de errores, sin copiar el cuerpo del error ni valores: `ModelError` (estado 424) y el 400 directo → `INPUT_REJECTED`; `ValidationError` (punto de inferencia inexistente o no listo, que es el caso del punto apagado), `ServiceUnavailable` y errores de red (`ECONNREFUSED`, `ENOTFOUND`) → `MODEL_UNAVAILABLE`; el aborto por tiempo → `TIMEOUT`; `AccessDenied`, `InternalFailure`, respuesta inválida y cualquier otro → `INTERNAL`. El registro dice solo el nombre del error y el código resultante.

**Adaptador simulado** (`fake-model-inference.ts`): determinista a partir de la entrada (las 12 probabilidades salen de un resumen de la onda y las variables, entre 0 y 1, así que la misma entrada da lo mismo y entradas distintas dan resultados distintos), con modelo `echonext-mini-fake` y versión `0.0.0-fake`. Espera `FAKE_MODEL_DELAY_MS` (por defecto 1500 ms; las pruebas de unidad lo ponen en 0) para que el estado «en curso» se vea. **Cómo se ejercen las fallas en E2E sin afectar a las demás pruebas:** el simulado reconoce valores centinela en el cuarto lugar de `tabular` (frecuencia auricular estandarizada), que la validación de la 006 admite (|x| ≤ 25) y que ningún estudio sintético normal usa: `7.77` → `INPUT_REJECTED`, `7.78` → `MODEL_UNAVAILABLE`, `7.79` → `TIMEOUT`. Cada prueba arma su estudio sintético con el centinela que necesita y el resto de las pruebas no se entera; no hace falta otra configuración del servidor ni otra variable. El simulado solo existe cuando `MODEL_INFERENCE=fake`, igual que el almacenamiento simulado.

**Alternativas descartadas:** invocar al contenedor por HTTP directo (el contrato lo permite, pero obliga a exponer el contenedor y no ejercita el permiso de IAM); un simulado con fallas configurables por variable (afecta a todas las pruebas del servidor); un interruptor de fallas por cabecera o cookie (superficie de ataque en el código de producción).

## R6. Permisos de AWS

**Decisión:** el usuario de la aplicación recibe `sagemaker:InvokeEndpoint` sobre un único recurso: `arn:aws:sagemaker:sa-east-1:896618135592:endpoint/medicia-dev-echonext-mini`. El ARN se arma por nombre y es válido aunque el punto de inferencia esté apagado. Sin escritura, sin listado y sin acceso a ningún otro punto de inferencia.

**Dónde cambia:**
1. `infra/modules/identity`: variable opcional `model_endpoint_arn` (vacía por defecto, validada con un patrón de ARN de SageMaker), una política de usuario nueva `model-endpoint-invoke` con `count`, y una salida que dice si se concedió, igual que `studies_bucket_arn`. Con la variable vacía el módulo no cambia nada.
2. `infra/bootstrap/permissions-boundary.tf`: sentencia nueva `InvocarModelo` en `medicia-dev-boundary` con la misma acción y el mismo recurso. Sin ella la política del módulo no tiene efecto (el límite es el techo). **Este archivo solo cambia por la vía de administración**, porque el operador no puede editar su propio límite.
3. `infra/environments/dev/main.tf`: pasa el ARN al módulo `identity`, armado con el nombre del punto de inferencia, la región y la cuenta.

**Orden y quién lo ejecuta:** (a) el agente edita los archivos y corre `terraform fmt`, `validate` y `test`; (b) **[Administrador]** el responsable aplica `infra/bootstrap` por la vía de administración documentada en `infra/README.md` («Cambiar los permisos del operador»); (c) **[Responsable]** el responsable aplica `infra/environments/dev` con el operador, y el plan debe mostrar una política nueva y ningún otro cambio. Como la política de la aplicación es una política de usuario y la clave de acceso no cambia, **no hace falta rotar la clave**. Las pruebas de Terraform verifican que el techo incluye la sentencia, que la política del módulo se crea solo con la variable y que el recurso es exactamente el ARN del punto de inferencia.

**Alternativas descartadas:** `sagemaker:InvokeEndpoint` con comodín de recurso (el techo debe acotar al único punto de inferencia); un rol de ejecución nuevo para la aplicación (la migración a rol del servidor ya está en la lista «antes de datos reales» de la 006); permiso de lectura de SageMaker para ver si el punto está encendido (no hace falta: un `ValidationError` ya lo dice).

## R7. Interfaz

**Decisión:** sección «Análisis» en la pantalla del estudio ([contracts/analysis-ui.md](contracts/analysis-ui.md)):
- Botón «Analizar estudio» (formulario con `useActionState` que llama a la acción de servidor), deshabilitado con el texto «Hay un análisis en curso» mientras exista uno.
- Resultado: la advertencia permanente, el modelo, la versión y la fecha, y 12 filas en el orden del contrato. Cada fila tiene el nombre en español, el porcentaje escrito (cifras tabulares, una decimal, coma decimal) y una barra con `role="meter"` y `aria-valuenow`, `aria-valuemin`, `aria-valuemax` y `aria-label`; la barra usa `bg-primary` sobre `bg-elevated`, sin significado de color. El compuesto (la última fila) se destaca con borde y fondo propios, y su nombre lleva la aclaración «al menos uno de los otros once».
- Historial: lista del más reciente al más antiguo con fecha, quién lo pidió, el estado en texto («En curso», «Completado», «Fallido») y, si falló, el motivo genérico; los completados enlazan a `?analysisId=`.
- Textos de las 12 etiquetas y de las fallas en `_lib` (`findings-labels.ts` y `analysis-messages.ts`), en español rioplatense, sin diagnóstico. Las etiquetas salen de los nombres del contrato y de la descripción de EchoNext-Mini: fracción de eyección reducida (45 % o menos), hipertrofia del ventrículo izquierdo (pared de 13 mm o más), estenosis aórtica, insuficiencia aórtica, mitral, tricuspídea y pulmonar, disfunción sistólica del ventrículo derecho, derrame pericárdico, presión sistólica pulmonar elevada (45 mmHg o más), velocidad máxima de regurgitación tricuspídea elevada (3,2 m/s o más) y el compuesto. **Los umbrales de las etiquetas conviene confirmarlos contra la descripción original del conjunto de datos antes de dar la funcionalidad por cerrada** (la 005 solo fija las claves).
- Mensajes de falla genéricos por código: modelo no disponible («El análisis no está disponible en este momento»), entrada rechazada («No pudimos analizar este estudio»), demora («El análisis tardó demasiado»), archivo no disponible («La onda de este estudio no está disponible»), interna («No pudimos completar el análisis»).

## R8. Privacidad y registros

**Decisión:** ningún registro incluye probabilidades, valores del estudio ni datos de la persona. Los registros de error llevan el nombre del error, el código de falla y el identificador opaco del análisis (un UUID sin significado). El mensaje de `ModelInferenceError` es fijo por código. Las siete variables viven solo en la memoria del servidor durante el análisis y nunca llegan al navegador (el DTO del análisis no las tiene). Las probabilidades llegan al navegador únicamente dentro del resultado de un análisis al que el actor tiene acceso. Una prueba (como `no-study-data-in-logs.test.ts` de la 006) recorre los flujos con valores identificables y comprueba que no aparecen en `console.error` ni `console.warn`.

## R9. Estrategia de pruebas

Con el ritmo rápido pedido: pocas pruebas, puestas donde está el riesgo.
- **Unidad de los casos de uso** (repositorio y modelo en memoria): pedir con acceso (paciente dueño y médico con asignación), pedir sin acceso (paciente ajeno, médico sin asignación o con asignación terminada, estudio inexistente: no se crea nada ni se llama al modelo), uno en curso (rechaza al segundo), archivo no disponible (queda `FAILED` sin llamar al modelo), cada falla del modelo (cada código), respuesta completada (estado, modelo, versión, fechas), vencimiento (un análisis de más de 2 minutos pasa a `FAILED` al pedir uno nuevo y al listar), y que ninguna excepción sale de la ejecución.
- **Unidad del adaptador real** con un cliente simulado: respuesta válida, `ModelError` 424, `ValidationError` (punto apagado), `ServiceUnavailable`, error de red, aborto por tiempo, respuesta con claves de más o de menos, valores fuera de rango, `model_version` vacío. Y que el cuerpo enviado respeta el contrato.
- **Unidad del simulado:** determinismo, orden de las claves y los tres centinelas.
- **Integración sobre la base local:** el índice único parcial con pedidos concurrentes (solo uno gana), la cascada al eliminar el estudio, eliminar bloqueado con un análisis en curso, las restricciones `CHECK`, el aislamiento por clínica (el repositorio con otro `tenantId` no encuentra nada) y la matriz de acceso real a nivel de caso de uso.
- **Pruebas de `repository-tenant-scope`:** se agrega `prisma-analysis-repository.ts`.
- **Componentes (jsdom):** `analysis-result` (12 filas en orden, porcentaje escrito, `role="meter"`, compuesto destacado, advertencia, modelo y fecha), la sección con los estados y el historial.
- **E2E (modelo simulado), pocas:** el paciente pide y ve el resultado; el médico ve el resultado de su paciente; acceso rechazado (otro paciente y el mismo mensaje para un identificador inexistente); falla con centinela y reintento exitoso; tres anchos y modo oscuro sin desplazamiento horizontal. Los archivos sintéticos salen de `buildNpz` con la variable centinela cuando hace falta; ninguna prueba abre datos de EchoNext.
- **Terraform:** pruebas del módulo `identity` y de `bootstrap` para el nuevo permiso.

## R10. Verificación real y fases

**Verificación real** ([quickstart.md](quickstart.md)): el responsable enciende el punto de inferencia (`enabled = true` en `infra/environments/dev`, 0,089 USD por hora, ver la 004 y la 005), pone `MODEL_INFERENCE=sagemaker` y `SAGEMAKER_ENDPOINT_NAME` en su `.env.local` (con `AWS_PROFILE` sin definir, para que la aplicación use la clave de la aplicación y no la del operador), pide un análisis con un archivo sintético y lo apaga volviendo `enabled` a `false`. La guía incluye qué hacer si queda encendido (`aws sagemaker delete-endpoint` y `aws sagemaker list-endpoints` para confirmarlo).

**Fases**, cada una cerrada con un punto de commit:
1. **Datos, dominio y casos de uso:** esquema (compuerta: el responsable genera y aplica la migración y el cliente), dominio, puertos, repositorio, simulado, los dos casos de uso de `studies`, los casos de uso de `analyses`, el control de eliminación y sus pruebas.
2. **Adaptador real e infraestructura de permisos:** dependencia, configuración, adaptador y sus pruebas; cambios de Terraform con sus pruebas; documentación de `infra/README.md`. **[Administrador]** y **[Responsable]** aplican en ese orden.
3. **Interfaz:** acción de servidor, sección de análisis, resultado, historial, progreso y sus pruebas.
4. **E2E y cierre:** pruebas de extremo a extremo, guía de verificación, actualización de `memory/` y revisión final con `review-changes`.

**Variables de entorno nuevas:** `MODEL_INFERENCE` (`sagemaker` o `fake`, obligatoria), `SAGEMAKER_ENDPOINT_NAME` (solo con `sagemaker`) y `FAKE_MODEL_DELAY_MS` (opcional, solo con `fake`). `playwright.config.ts` y el flujo de CI fijan `MODEL_INFERENCE=fake`. `.env.example` lo actualiza el responsable (el agente no puede editarlo).
