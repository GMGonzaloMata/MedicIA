# Investigación: Carga y almacenamiento de estudios de ECG

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. Las rutas y nombres son los reales del repositorio a 2026-11-10.

## R1. Modelo de datos: `Study`, `StudyCounter` y relación con pacientes y análisis

**Decisión:** dos tablas nuevas.

- `studies`: un estudio de un paciente de una clínica. Clave `id` (UUID v7, como el resto), `tenant_id`, `patient_id`, `uploaded_by_user_id` (la cuenta que lo cargó: el propio paciente o su médico), `number` (correlativo **por paciente**), `type` (enum `StudyType`, hoy solo `ECG`), `status` (enum `StudyStatus`, hoy solo `UPLOADED`), `storage_key` y `uploaded_at`. Sin nombre de archivo.
- `study_counters`: una fila por paciente con el último número asignado (`patient_id` clave primaria y `tenant_id`).

Relaciones: `(tenant_id, patient_id)` apunta a `patients (tenant_id, id)` con `onDelete: Restrict`, tal como anticipó la 001 ("los estudios referenciarán `patients(tenantId, id)`"), así que un estudio nunca queda en una clínica distinta de la de su paciente. `uploaded_by_user_id` apunta a `users` con `Restrict`.

Restricciones: `UNIQUE (tenant_id, patient_id, number)`, `UNIQUE (tenant_id, id)` (destino de la clave foránea compuesta de los análisis), `UNIQUE (storage_key)`, `CHECK (number > 0)`. Índice de la lista: el de la unicidad `(tenant_id, patient_id, number)` sirve a `ORDER BY number DESC`.

**Número correlativo atómico y sin reutilización:** se asigna con una sola sentencia SQL dentro de la transacción que inserta el estudio:

```sql
INSERT INTO study_counters (tenant_id, patient_id, last_number) VALUES ($1, $2, 1)
ON CONFLICT (patient_id) DO UPDATE SET last_number = study_counters.last_number + 1
RETURNING last_number
```

La sentencia bloquea la fila del contador hasta que termina la transacción, así que dos cargas simultáneas al mismo paciente se serializan y reciben números distintos. El contador nunca baja, así que eliminar un estudio no libera su número (FR-011a). Se usa SQL directo (`$queryRaw`) y no `upsert` de Prisma porque la atomicidad de `upsert` depende de condiciones internas de Prisma; una prueba de integración con cargas concurrentes la verifica.

**Por qué el número es por paciente y no por clínica:** el paciente ve su propia lista. Con un número de clínica vería saltos (el 3, el 41, el 90) que revelan cuántos estudios cargó el resto de la clínica. Con uno por paciente ve 1, 2, 3.

**Relación con los análisis (principio IV, 008):** el estudio no guarda nada de análisis. La 008 agregará `analyses` con `(tenant_id, study_id)` como clave foránea compuesta hacia `studies (tenant_id, id)` con `onDelete: Cascade` (eliminar el estudio elimina sus análisis, FR-015). Un estudio puede tener muchos análisis y el estado del proceso (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`) vive en el análisis. La regla "no eliminar con un análisis en curso" la aplica el caso de uso de eliminación en la 008; esta funcionalidad deja el punto de extensión (ver R6).

**Alternativas descartadas:**
- Número correlativo por clínica: ver arriba.
- `MAX(number) + 1` dentro de una transacción: con aislamiento por defecto dos cargas pueden leer el mismo máximo, y además reutiliza el número del último estudio eliminado.
- Una secuencia de PostgreSQL por paciente: hay que crearla al dar de alta cada paciente y no se puede crear desde Prisma.
- Agregar estados `PROCESSING` o `ANALYZED` al estudio: duplican el estado del análisis y contradicen el principio IV.
- Guardar quién cargó el estudio en un texto libre: se guarda la clave foránea al usuario, que es la que permite aplicar "solo quien lo cargó puede eliminarlo" (FR-015).

**Migración:** el esquema se escribe en `prisma/schema.prisma`; la migración la genera el responsable con `prisma migrate dev --create-only` y los `CHECK` se agregan a mano en el SQL, como en la 001 y la 002. No se usa seguridad por filas (RLS): la 001 no la implementó y la constitución la deja como defensa adicional opcional.

## R2. Lectura segura del `.npz`: lector propio mínimo

**Decisión:** un lector propio de unas 150 líneas, sin dependencias nuevas, en `src/modules/studies/infrastructure/adapters/npz-reader.ts`, detrás de un puerto de salida. Un `.npz` es un archivo ZIP con un `.npy` por arreglo.

Reglas del lector (todas con prueba):
- Tamaño del archivo subido: máximo 2 MB (2.097.152 bytes), comprobado antes de leer nada.
- Se lee el directorio central del ZIP desde el final (registro `EOCD`). Se rechaza ZIP64, archivos multivolumen, cifrado, comentarios que no cuadren con el tamaño y más de 16 entradas.
- La suma de los tamaños descomprimidos **declarados** en el directorio central no puede superar 20 MB. Como el valor declarado puede mentir, además cada entrada necesaria se descomprime con `zlib.inflateRawSync(..., { maxOutputLength })` acotado al tamaño exacto esperado, y el resultado debe medir exactamente lo declarado. Nunca se expande una entrada no necesaria.
- Solo se aceptan los métodos de compresión 0 (almacenado) y 8 (deflate).
- Los nombres deben ser exactamente `waveform.npy` y `tabular.npy`. Cualquier otro nombre se ignora sin leerlo; un nombre repetido, con `..`, barras, barras invertidas, rutas absolutas o caracteres de control se rechaza. No se escribe nada en disco, así que no hay recorrido de rutas posible.
- El nombre del local header debe coincidir con el del directorio central, y se verifica el CRC-32 (`zlib.crc32`, disponible en Node 24).
- `.npy`: se exige la firma `\x93NUMPY`, versión 1, 2 o 3, y el encabezado se analiza con una expresión regular estricta (`descr`, `fortran_order` y `shape`), **sin `eval` ni deserialización**. Solo se aceptan `descr` `<f4` y `<f8`, `fortran_order: False` y la forma exacta. Un `descr` de objetos (`|O`, que en NumPy implica `pickle`) se rechaza antes de leer datos.
- Formas aceptadas: `waveform` `(1, 2500, 12)` (la del conjunto de datos) o `(2500, 12)`; `tabular` `(7,)`.

**Por qué propio y no una librería:** el lector solo necesita tres cosas (leer el directorio central, inflar dos entradas acotadas, leer un encabezado de `.npy`), y cada librería de ZIP (`adm-zip`, `jszip`, `yauzl`, `fflate`) suma superficie de cadena de suministro y tuvo, en distintos momentos, problemas de rutas o de expansión sin tope. Que el lector sea propio permite fijar los topes exactamente donde el spec los pide. Hay una librería de `.npy` en npm, pero es poco mantenida y no controla los topes. El costo es mantener ~150 líneas, cubiertas con pruebas de archivos mal formados.

**Alternativa descartada:** convertir en un servicio Python (`medicia-ml`): sumaría un servicio y una red de ida y vuelta para validar 120 KB.

## R3. Qué se guarda: formato canónico propio, no el `.npz` subido

**Decisión:** tras validar, el servidor **no guarda el `.npz` original** sino un archivo binario canónico de tamaño fijo, `ecg1`, y descarta el resto. Formato (detalle en `contracts/stored-study-format.md`): 8 bytes de firma `MEDECG01`, las 7 variables como `float32` little-endian y las 30.000 muestras de la onda como `float32` little-endian, fila por fila (instante, derivación). Total: 120.036 bytes.

**Por qué:**
- El spec pide que los campos adicionales del `.npz` "se ignoren y no se conserven" (borde). Guardar el original conservaría entradas extra, metadatos del ZIP y la fecha de modificación de quien lo generó.
- Lo que conserva el archivo queda exactamente definido: onda y variables, nada más. No arrastra metadatos del ZIP, nombres de archivo ni la fecha de modificación de quien lo generó (FR-008).
- El visor (007) y el adaptador del modelo (008) leen un formato trivial y de tamaño fijo, sin volver a parsear ZIP. Cualquier objeto de otro tamaño se detecta como corrupto.
- Los `float64` se convierten a `float32`, que es lo que usa el modelo.

**Efecto sobre el spec:** la entidad "Archivo del estudio" dice que es "el `.npz` validado". Se actualiza a "el contenido validado en un formato propio, sin nada más del archivo subido".

**Alternativas descartadas:** guardar el `.npz` tal cual (conserva extras, exige un lector ZIP en 007 y 008); JSON (cerca de 1 MB por estudio); volver a empaquetar como `.npz` (necesita un escritor de ZIP y no aporta nada sobre un binario fijo).

## R4. Validación y rangos

**Decisión:** la validación tiene dos capas.

1. Estructural (en el lector, R2): formato, tamaño, nombres, tipo y forma.
2. De contenido (en el dominio, `src/modules/studies/domain/ecg-study.ts`): todos los valores finitos; sexo exactamente 0 o 1; cada una de las seis variables estandarizadas con valor absoluto de hasta 20; cada muestra de la onda con valor absoluto de hasta 100.

La salida del caso de uso es un `zod` `safeParse` más una lista de códigos de error propios; los mensajes en español salen de una tabla de mensajes y **nunca** incluyen valores del estudio, solo el campo, la regla y el valor esperado (FR-005).

**Origen de los rangos:** el contrato de la 005 dice que las seis variables están estandarizadas y que la onda ya viene normalizada y recortada (por derivación, entre un mínimo y un máximo, con media restada y desvío dividido). Valores crudos (una edad de 65, una frecuencia de 70 latidos) quedan fuera de ±25, que es justamente el error de uso más probable: subir datos sin estandarizar. **Cerrado el 2026-11-10** con la salida agregada de `report_ranges.py` sobre la partición de prueba (el responsable la ejecutó; los datos no pasaron por este flujo ni por el asistente): extremo de la onda 10,72 (percentiles 0,1 y 99,9: −7,77 y 7,86) y de las variables estandarizadas 10,03 (frecuencia auricular; el resto llega a 7,80 en valor absoluto). Se fijó **±25 para ambas**, más del doble del extremo observado. Las particiones de entrenamiento y validación no estaban disponibles: si se revisan y tienen extremos mayores, se recalculan. Así se había planteado la confirmación:

- Tarea: un script nuevo en `medicia-ml` (`scripts/report_ranges.py`) que el responsable ejecuta en su máquina y que imprime solo agregados: mínimo, máximo y percentiles 0,1 y 99,9 de cada variable y de la onda en las particiones de prueba y entrenamiento. Ningún dato de paciente sale de su máquina.
- Los límites finales deben dejar un margen de al menos el doble sobre el valor extremo observado, de modo que cualquier estudio del conjunto se acepte (supuesto del spec).

**Orden de las derivaciones y de las variables:** no se valida (igual que la 005): el contrato lo fija y la guía lo documenta.

## R5. Cómo llega el archivo: Server Action, pasando por el servidor

**Decisión:** el formulario de carga envía el archivo a una Server Action (`uploadStudyAction`), que lo lee completo en memoria, lo valida, lo guarda y recién después responde. No hay URL firmada de S3.

**Por qué:**
- El archivo pesa unos 120 KB y el tope es 2 MB. Pasar por el servidor deja **validar antes de guardar** (US2): con una URL firmada el archivo llegaría a S3 antes de validarse y habría que borrar los rechazados.
- Las Server Actions verifican el origen de la solicitud (CSRF) y el proyecto ya las usa así para el ingreso y la selección de clínica. Un Route Handler obligaría a reimplementar esa comprobación.
- Para que el tope de 2 MB funcione, hay que subir el tope del cuerpo de las Server Actions: por defecto es 1 MB (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`). Se configura `experimental.serverActions.bodySizeLimit: "3mb"` (2 MB más el sobrecosto de la codificación multipart). Es un tope **global** de las acciones, y se acepta porque el resto de las acciones envía formularios pequeños; cada acción de datos chicos sigue validando su propia entrada.
- Si el cuerpo supera el tope, Next responde con su propio error antes de ejecutar la acción; la interfaz lo muestra como "el archivo supera el tamaño máximo" gracias a una comprobación previa en el navegador (`File.size`), que es una comodidad y no la barrera.

**Alternativas descartadas:** URL firmada de S3 (la validación llegaría tarde, sale más caro en permisos y en limpieza); Route Handler `POST /api/v1/studies` (más cerca de una API REST, pero sin la comprobación de origen incluida; queda disponible si en el futuro se necesita una API pública).

## R6. Orden de las operaciones, fallas a mitad de camino y huérfanos

**Carga:**
1. Validar (R2 a R4). Si falla, se responde y no se tocó nada.
2. Generar `studyId` (UUID v7) y `storage_key = studies/<tenantId>/<studyId>.ecg1`.
3. Guardar el objeto en S3 con cifrado `AES256` explícito.
4. En una transacción, asignar el número e insertar el estudio.
5. Si el paso 4 falla, borrar el objeto (mejor esfuerzo) y responder con un error genérico.

Se guarda primero el objeto y después la fila: la fila es lo que vuelve visible al estudio, así que nunca hay una fila sin archivo (FR-014). El único residuo posible es un objeto sin fila, si falla el paso 5 también.

**Eliminación:**
1. Verificar que quien elimina cargó el estudio y conserva el acceso al paciente (R7). Si no, `FORBIDDEN` o `NOT_FOUND`.
2. En una transacción, borrar la fila (y, desde la 008, sus análisis, tras comprobar que ninguno está en curso). El punto de extensión es una función inyectada `canDeleteStudy` que hoy siempre permite; la 008 la reemplaza. No es un puerto ni una jerarquía: es un solo `if` en el caso de uso.
3. Borrar el objeto de S3. Si falla, se avisa al usuario ("el estudio se eliminó, pero el archivo quedó pendiente de limpieza") y se registra la clave opaca.

Se borra primero la fila porque el usuario ya no debe ver un estudio que pidió eliminar; el residuo posible es un objeto sin fila.

**Detección de huérfanos:** un caso de uso `reconcileStudyFiles` lista los objetos bajo `studies/`, los compara con `studies.storage_key` y borra los que no tengan fila **y** tengan más de 1 hora de antigüedad (el margen cubre cargas en curso). Lo ejecuta el responsable a mano con `npm run studies:reconcile` (un script chico en `scripts/`), con la clave de la aplicación; por defecto solo informa (`--apply` para borrar) y la antigüedad mínima se puede cambiar con `--min-age <minutos>` (por defecto 60; 0 para las pruebas). Requiere `s3:ListBucket` para la identidad de la aplicación sobre el prefijo `studies/`. No hay tarea programada: el volumen no lo justifica en esta etapa.

**Alternativas descartadas:** una tabla de borrados pendientes (otro mecanismo y otro estado para un problema raro); marcar el estudio como "subiendo" antes de guardar (agrega un estado que el spec no pide, FR-009); borrar el objeto antes que la fila (si falla la base queda un estudio visible sin archivo, justo lo que FR-014 prohíbe).

## R7. Autorización y aislamiento

**Quién es quién** (a partir del contexto de acceso de la 002, `src/modules/users/domain/access-context.ts`):

- **Paciente:** vínculo `PATIENT` con `patientId`. Ve y carga solo estudios de su `patientId`. La sesión ya se revalida en cada solicitud (paciente `LINKED`, clínica `ACTIVE`).
- **Médico:** vínculo `STAFF` con `isDoctor = true` (membresía `ACTIVE`). Accede a un paciente solo si existe una asignación **vigente** (`ended_at IS NULL`) entre su `membershipId` y ese `patientId` en la misma clínica, y el paciente está `LINKED`.
- **Administrador sin rol de médico** (`STAFF` con `isDoctor = false`) y cualquier otro vínculo: ningún acceso a estudios. Una persona que es administradora y médica actúa como médica.
- Sin sesión o sin clínica activa: sin acceso.

**Reglas** (un solo módulo de dominio, `study-access.ts`, que traduce el contexto en un «actor»: `{ kind: "PATIENT", userId, patientId }`, `{ kind: "DOCTOR", userId, membershipId }` o ninguno):

- Ver, listar y cargar estudios de un paciente: el propio paciente o un médico con asignación vigente con él.
- Eliminar un estudio: solo quien lo cargó (`uploaded_by_user_id`), y mientras conserve el acceso al paciente. Si una asignación termina, el médico ya no puede ver ni eliminar nada de ese paciente.
- Ver la lista de pacientes: solo un médico, y solo los de sus asignaciones vigentes con pacientes `LINKED`.

**Cómo se impone:**

- `tenantId`, el actor y su `patientId` o `membershipId` salen **siempre** de `requireClinicContextForAction()` (ver `src/app/_lib/access.ts`). El único identificador que acepta del cliente un médico es el `patientId` del paciente al que le carga o consulta, y se comprueba contra sus asignaciones en la misma consulta. Un paciente no envía ningún identificador de paciente: se ignora cualquiera que traiga.
- Los repositorios exponen solo consultas que reciben `tenantId` y las condiciones de acceso (`patientId` propio, o `membershipId` para la asignación vigente). No existe una consulta de estudios o pacientes por `id` sin ellas.
- Las respuestas distinguen «sin permiso» de «no existe» (`FORBIDDEN` y `NOT_FOUND`): decidido por el responsable, un identificador inexistente no es información sensible.
- La clave de S3 contiene el `tenantId` y el `studyId`, pero **no es la barrera**: la aplicación nunca recibe una clave del cliente. La clave se arma en el servidor y se vuelve a leer de la base (nunca del formulario) al eliminar.
- Pruebas de integración obligatorias (constitución y SC-004, SC-008): con dos clínicas, pacientes, médicos y un administrador, cada combinación no permitida de listar, consultar, cargar y eliminar se rechaza y deja los datos intactos; la asignación terminada quita el acceso y una asignación nueva lo devuelve.

## R8. Infraestructura: bucket `medicia-studies-dev-<cuenta>` y permisos

**Módulo nuevo `infra/modules/study-storage/`**, calcado de `model-artifacts` (R2 de la 004) con las diferencias que impone el contenido:

- Bucket privado con bloqueo de acceso público completo, propiedad `BucketOwnerEnforced`, cifrado SSE-S3 (`AES256`), política con un único `Deny` para tráfico sin TLS, `force_destroy = false` y `prevent_destroy = true`.
- **Sin versionado:** eliminar un estudio debe borrarlo de verdad (FR-013, SC-005). Con versionado quedarían versiones recuperables. Un `DeleteObject` sin versionado es definitivo.
- Ciclo de vida: abortar subidas multiparte incompletas a 1 día. No hay vencimiento de objetos: la conservación se define antes de operar con datos reales (principio VI de la constitución).
- Sin registro de accesos de S3 (suma costo y un segundo bucket); queda anotado como pendiente antes de usar datos reales.

**Quién accede:**
- La aplicación: hoy corre con el usuario IAM `medicia-dev-app` (módulo `identity`). Se le suma un segundo statement acotado a `s3:PutObject`, `s3:GetObject` y `s3:DeleteObject` sobre `arn:aws:s3:::medicia-studies-dev-<cuenta>/studies/*`, y `s3:ListBucket` sobre el bucket con condición `s3:prefix` igual a `studies/*`. El módulo `identity` recibe `studies_bucket_arn` como variable opcional (vacía por defecto, sin cambios en los entornos que no la usan).
- El techo de permisos `medicia-dev-boundary` hoy solo permite lecturas del plan y `AdminSetUserPassword`. Hay que sumarle esos mismos permisos de S3, o la política del usuario no tendría efecto. **Esto va por la vía de administración** (el operador no puede editar el límite).
- El operador `terraform-dev` necesita crear y configurar el bucket de estudios (hoy lo hace solo para el de modelos) y **no debe poder leer los estudios**: aunque pueda escribir la política del bucket, un `Deny` explícito sobre `s3:GetObject` y `s3:GetObjectVersion` para `…/studies-…/*` en su propia política le impide dárselo (mismo patrón que `NoBorrarArtefactosDeModelos`). Se amplían dos statements existentes con el ARN del bucket de estudios para no pasar el tope de 6.144 caracteres de la política administrada; se verifica el tamaño en la prueba.
- El plan de CI (rol de solo lectura): ya tiene las lecturas de configuración de S3; se amplía su lista de buckets al de estudios y no se le da lectura de objetos.

**Orden de aplicación** (documentado en `infra/README.md`, sección nueva "Bucket de estudios"):
1. Rotación de administración (consola como administrador): se aplica `infra/bootstrap` con los cambios del límite, de la política del operador y del rol de plan.
2. `terraform -chdir=infra/environments/dev apply` con el módulo `study-storage` y la política extra del usuario de la aplicación.
3. El responsable crea la migración de Prisma (R1) y define las variables de entorno nuevas en `.env.local`.

**Costo:** S3 estándar cuesta centavos por GB al mes y los estudios pesan 120 KB: 500 estudios son unos 60 MB. Sin costo fijo.

## R9. Interfaz

Tres pantallas dentro del grupo `(dashboard)`, que comparten componentes, y un vínculo en el encabezado de la clínica y en Inicio según el rol. Se apoya en lo existente (`FormField`, `SubmitButton`, `FormMessage`, `button-styles`, tokens de `globals.css`) y en `memory/design.md`.

- **Paciente — `/studies` («Mis estudios»):** formulario de carga arriba y lista de sus estudios debajo.
- **Médico — `/patients` («Mis pacientes»):** lista paginada (20 por página) de los pacientes con asignación vigente, con nombre y documento, y un vínculo a cada uno. Estados vacío («Todavía no tenés pacientes asignados»), de carga y de error.
- **Médico — `/patients/[patientId]` («Estudios de …»):** formulario de carga a nombre de ese paciente y la lista de sus estudios. Un `patientId` que no es de sus asignaciones vigentes responde con la pantalla de «sin acceso» ya existente (`/no-access`), sin mostrar datos.
- **Administrador sin rol de médico:** ve el aviso «Tu vínculo con la clínica no incluye estudios.» y ningún dato.

Elementos comunes:
- **Carga:** campo de archivo con `accept=".npz"`, texto de ayuda con el contenido esperado, botón «Subir estudio», estado de carga («Validando y guardando…»), mensaje de éxito («Estudio 3 guardado») y de error en una región `aria-live`. Los errores nombran el campo y la regla sin repetir valores.
- **Lista de estudios:** número, tipo («Electrocardiograma»), fecha y hora de carga, quién lo cargó («Vos», «Tu médico» o «Dr./Dra. …» según quién mira) y estado («Cargado»). Del más reciente al más antiguo, 20 por página, con «Anterior», «Siguiente» y «Página X de Y». Estados vacío, de carga y de error.
- **Eliminar:** el botón «Eliminar» aparece solo en los estudios que cargó quien mira; abre un diálogo de confirmación (`<dialog>` nativo, con foco atrapado y cierre con Escape): «Se borrará el estudio N y su archivo. No se puede deshacer.»
- **Responsiva:** tabla en pantallas anchas y tarjetas apiladas en móvil, sin desplazamiento horizontal. Modo claro y oscuro con tokens, foco visible, estados con texto además de color, controles táctiles de al menos 44 px.
- **Lenguaje:** sin «diagnóstico» ni resultados. En esta funcionalidad todavía no se muestra ningún hallazgo.

Antes de escribir código de Next.js se leen las guías de `node_modules/next/dist/docs/` correspondientes (formularios, Server Actions, rutas dinámicas, `revalidatePath`, `cacheComponents`), como exige la constitución.

## R10. Pruebas

- **Unitarias** (`tests/unit/modules/studies/`): lector de `.npz` con archivos sintéticos armados en la prueba (un escritor de ZIP/NPY mínimo en `tests/support/npz-builder.ts`); casos: válido (`float32` y `float64`, forma `(1,2500,12)` y `(2500,12)`), no es ZIP, ZIP64, más de 2 MB, bomba de descompresión (declara poco, expande mucho), tamaño declarado distinto del real, CRC erróneo, nombre repetido, nombres con `..` y con barras, entrada `|O`, `fortran_order` verdadero, forma incorrecta, campos extra ignorados. Reglas del dominio: no finitos, sexo 0/1, rangos. Formato canónico: ida y vuelta exacta. Reglas de acceso del dominio (`study-access.ts`) para cada combinación de actor y paciente. Casos de uso con repositorio y almacenamiento en memoria: éxito, rechazo sin efectos, falla del almacenamiento, falla de la base con compensación, falla de la compensación.
- **Integración** (`tests/integration/study-storage/`, contra el PostgreSQL local de Docker): acceso por rol (paciente propio, médico con asignación vigente, médico sin asignación, asignación terminada y reiniciada, administrador sin rol de médico, otra clínica) para listar pacientes, listar y consultar estudios, cargar y eliminar; solo elimina quien cargó; numeración por paciente con cargas concurrentes (por ejemplo 20 en paralelo: números únicos y consecutivos), no reutilización tras eliminar, paginación y orden.
- **Terraform** (`infra/modules/study-storage/tests/study-storage.tftest.hcl`): privado, cifrado, sin versionado, TLS obligatorio, `prevent_destroy`, ciclo de vida; pruebas de `bootstrap` para el límite, el operador (incluido el `Deny` de lectura y el tamaño de la política) y el rol de plan.
- **E2E** (`tests/e2e/studies.spec.ts`, con almacenamiento simulado): un paciente sube, ve y elimina su estudio; un médico ve a sus pacientes, sube a uno y no puede abrir a uno sin asignación; el rechazo de un archivo inválido.
- **Cobertura:** al menos 80 % de líneas en el código nuevo, con `npm run check`. El umbral es por archivo (`vitest.config.mts`) y solo mide `src/modules`, `src/infrastructure` y `src/shared`: `src/app/` no se mide, así que las acciones y los componentes no llevan lógica de negocio.
- **Datos:** ninguna prueba usa datos del conjunto EchoNext. Los archivos son sintéticos, generados en la prueba.

## R11. Cómo obtener `.npz` para probar a mano

**Decisión:** un script nuevo en `medicia-ml`, `scripts/make_synthetic.py`, que genera un `.npz` sintético con la misma forma que el conjunto de datos (`waveform` `(1, 2500, 12)` y `tabular` `(7,)`): una señal parecida a un ECG hecha con latidos gaussianos repetidos y un poco de ruido, y variables estandarizadas plausibles. No lee ningún dato de pacientes, así que lo puede ejecutar cualquiera. El `make_sample.py` existente toma un estudio real del conjunto de pruebas, así que solo lo ejecuta el responsable, para el cierre de la 008, y su salida nunca va a un repositorio.

**Por qué en `medicia-ml` y no en este repositorio:** ya tiene NumPy y los scripts de apoyo, y la constitución dejó el código de Python fuera de este repositorio. Las pruebas automáticas de esta funcionalidad no dependen de él: arman sus archivos en TypeScript (R10).

## R11b. Datos de prueba de pacientes y asignaciones

No existe ninguna pantalla para registrar pacientes ni asignar médicos (queda fuera de alcance). Para probar a mano y para los E2E se agrega `scripts/seed-demo-clinic.ts` (`npm run seed:demo`), que el responsable ejecuta contra su base local o de desarrollo y que crea de forma repetible: una clínica de prueba, un administrador, dos médicos, tres pacientes vinculados (uno sin asignación) y las asignaciones vigentes. Reutiliza los helpers de `tests/support/` cuando corresponda y se niega a correr contra una base que no sea local o de desarrollo (mismo resguardo que `assertLocalDatabaseUrl`). Las cuentas de Cognito se crean aparte con el registro normal; el script vincula las cuentas existentes indicadas por correo. Es un script de datos, no una migración, y no usa los comandos reservados de Prisma (`migrate`, `db`, `generate`).

## R12. Variables de entorno y modo simulado

Se agrega `STUDY_STORAGE` con valores `s3` o `fake`, sin valor por defecto, como `IDENTITY_PROVIDER`: si falta o es desconocido, la aplicación no arranca para que un entorno mal configurado no use el simulado por error. Con `s3` se exigen `STUDIES_BUCKET` y `AWS_REGION` y las credenciales estándar del SDK. Con `fake` el almacenamiento vive en memoria del proceso (se guarda en `globalThis`, como el proveedor de identidad simulado) y sirve para el desarrollo sin AWS y para E2E. El adaptador usa `@aws-sdk/client-s3` fijado en `3.1164.0`, la misma versión que `client-cognito-identity-provider`.

## R13. Registros y datos del estudio

Los registros solo incluyen identificadores opacos (`studyId`, `tenantId`) y códigos de resultado, nunca la onda, las variables ni el nombre del archivo subido. El nombre del archivo ni siquiera se lee (se usa solo `file.size` y los bytes). Los errores de S3 y de la base se registran como el tipo de error y el `studyId`, sin el mensaje original cuando pueda incluir datos. Una prueba de unidad recorre los registros de una tanda de cargas válidas e inválidas y verifica que ninguna línea contiene valores del estudio (SC-006).

## R14. Fuera de esta funcionalidad (anotado para no olvidarlo)

- Limitación de frecuencia de cargas por usuario o clínica: no hay en el resto de la plataforma; antes de exponerla a usuarios reales conviene sumarla.
- Registro de accesos de S3 y alarmas: antes de datos reales.
- Plazos de conservación y eliminación: principio VI, antes de datos reales.
- Producción: reemplazar el usuario IAM de la aplicación por un rol del servidor (ya anotado en la 002 y en el módulo `identity`).
- Registrar pacientes, asignar médicos, invitar y vincular cuentas de pacientes: funcionalidad aparte, necesaria antes de usar la plataforma sin el script de datos de prueba.
- Registro de auditoría de quién consultó qué estudio: ahora que los estudios pertenecen a un paciente, conviene antes de datos reales.

## Resultados de la implementación

**Implementado (2026-11-10):** las cinco historias (carga y lista del paciente, estudios del médico, rechazos con motivo, aislamiento por rol y clínica, eliminación y conciliación), el bucket `medicia-studies-dev-896618135592` aplicado y verificado, el formato guardado `ecg1`, el lector propio de `.npz`, `seed:demo`, `studies:reconcile`, `make_synthetic.py` y `report_ranges.py` en `medicia-ml`. `npm run check` y la suite E2E pasan, con cobertura por archivo sobre el 80 % en `src/modules` y `src/infrastructure`.

**Verificado a mano contra S3 real:** carga, eliminación real sin versiones, numeración que no se reutiliza, detección y borrado de un huérfano (ver `quickstart.md`, «Resultados»).

**Revisión (`review-changes`: arquitectura, seguridad, interfaz e infraestructura):** sin hallazgos bloqueantes. Corregido: rama muerta en la acción de carga, pruebas de aislamiento más estrictas, aviso al conciliar con una antigüedad mínima baja y comentario de la excepción de `findExistingStorageKeys`. Documentado con honestidad: el `Deny` del operador es una defensa adicional (ver `infra/README.md`).

**Pendiente de esta funcionalidad:**
- `report_ranges.py` con los datos reales (T091) y fijar los límites definitivos de validación (T092): cerrado: ±25 para la onda y las variables estandarizadas, con la partición de prueba (ver R4).
- Probar a mano los rechazos con los archivos de `make_synthetic.py` (T073) y el aislamiento con cuentas reales (T080); ejecutar el recorrido completo del `quickstart.md` y confirmar `terraform plan` sin cambios (T099).

**Pendiente de la revisión (para el cierre o antes de datos reales):**
- Interfaz: la advertencia de «archivo pendiente de limpieza» casi nunca se ve porque el diálogo se desmonta con la fila; mostrarla a nivel de página. Estado de error de las listas (`listUnavailable` sin usar). Variante de peligro para el botón destructivo. Limpiar el estado del diálogo al cerrar y reiniciar el formulario tras una carga correcta. `tabular-nums` en las tablas, `aria-current` en la paginación, un componente de título compartido.
- Arquitectura: el caso de uso de carga está atado a ECG (`validateEcgContent`, extensión `.ecg1`); un segundo tipo de estudio pide un registro por tipo (`StudyTypeHandler`). `canDeleteStudy` inyectable se agrega a la composición en la 008.
- Infraestructura y seguridad: sacar la clave de la aplicación del estado; un límite propio de la aplicación; política y bloqueo del bucket de estudios por administración; sumar `PutObject` y `PutBucketVersioning` al `Deny` del operador; guardas de CI que cubran recursos fuera del módulo; ajustar `.trivyignore`, las salidas en orden alfabético y la sección «Liberar los recursos» del README; aserciones más estrictas en las pruebas de Terraform.
- Seguridad menor: `import "server-only"` en `npz-reader.ts` y `in-memory-study-file-storage.ts`; exigir un mínimo de antigüedad al borrar en la conciliación.

**Antes de datos reales de pacientes (R14):** registro de accesos de S3 y alarmas, plazos de conservación y eliminación, auditoría de consultas, limitación de frecuencia de cargas, rol del servidor en lugar del usuario de IAM de la aplicación, y registrar pacientes y asignar médicos desde la interfaz.
