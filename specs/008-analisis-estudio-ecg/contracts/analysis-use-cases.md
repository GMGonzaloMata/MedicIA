# Contrato: casos de uso del módulo `analyses`

Interfaz interna, expuesta por `getAnalysesModule()` y consumida por la acción de servidor y por la pantalla del estudio. No hay API HTTP nueva. Todos reciben un `AnalysisActor`, propio del módulo y con la misma forma que el `StudyActor` de la 006 (paciente con `patientId` o médico con `membershipId`, más `tenantId` y `userId`); la capa `app/` pasa el mismo valor que ya arma para `studies`. El administrador sin rol de médico no tiene actor y la pantalla ni llama.

## requestAnalysis

Entrada: `{ actor, studyId }`. Salida: `{ analysis: AnalysisSummary, run: (() => Promise<void>) | null }`.

Pasos, en este orden:
1. `studySource.authorize({ actor, studyId })`: si devuelve `NO_ACCESS` → `AnalysisNotFoundError` (indistinguible).
2. Vencer los análisis viejos de ese estudio (`failStale`, con la clínica del actor y el límite de 2 minutos).
3. `studySource.readModelInput({ actor, studyId })`. Si devuelve `FILE_UNAVAILABLE` (archivo ausente o dañado): insertar el análisis directamente como `FAILED` con `STUDY_FILE_UNAVAILABLE`, devolverlo con `run: null` y terminar.
4. Insertar el análisis en `PENDING`. Si la base responde con la violación del índice único parcial → `AnalysisInProgressError`. No se llama al modelo.
5. Devolver el análisis y `run`, una función que conserva la entrada en memoria.

`run` (se entrega a `after()`; nunca lanza):
1. Pasar a `PROCESSING` solo si sigue en `PENDING`; si la actualización no afectó filas (venció o se eliminó el estudio), terminar.
2. `modelInference.predict(...)` con el tope de 30 s.
3. Si responde: validar y pasar a `COMPLETED` solo si sigue en `PROCESSING`, guardando modelo, versión y probabilidades.
4. Si falla con un `ModelInferenceError`: pasar a `FAILED` con su código. Cualquier otra excepción → `INTERNAL`.
5. Registrar solo el identificador del análisis y el código de falla.

## listAnalyses

Entrada: `{ actor, studyId }`. Salida: `AnalysisSummary[]`, del más reciente al más antiguo.

1. Autorizar el estudio (mismo criterio que arriba).
2. Vencer los análisis viejos del estudio.
3. Listar por `tenant_id` y `study_id`, con quién lo pidió.

## getAnalysis

Entrada: `{ actor, studyId, analysisId }`. Salida: `AnalysisResult` si está completado, o el `AnalysisSummary` en cualquier otro estado.

1. Autorizar el estudio.
2. Buscar el análisis por `tenant_id`, `study_id` y `id`. Si no existe → `AnalysisNotFoundError`. Un análisis de otro estudio o de otra clínica no se encuentra.

## hasAnalysisInProgress

Entrada: `{ tenantId, studyId }`. Salida: booleano. Es lo que `studies` inyecta como `canDeleteStudy`. Considera «en curso» a `PENDING` y `PROCESSING` con `requested_at` dentro de los 2 minutos (un análisis vencido no bloquea la eliminación, aunque todavía no se haya marcado como fallido).

## Errores

- `AnalysisNotFoundError`: no hay acceso, no existe el estudio o el análisis. La pantalla muestra siempre «No tenés acceso a este estudio».
- `AnalysisInProgressError`: ya hay uno en curso. Mensaje: «Ya hay un análisis en curso para este estudio.»
- `StudyUnavailableError` (de la 006): falló la base al pedir o al listar.

Los mensajes de error nunca incluyen valores del estudio ni del resultado.

## Reglas

1. Toda consulta del repositorio lleva `tenantId`; no existe una por `id` solo.
2. El acceso a un análisis siempre pasa por el acceso a su estudio.
3. Un análisis nunca se crea sin pasar el acceso, y un acceso rechazado no llama al modelo ni lee el archivo del estudio.
4. Ninguna operación escribe probabilidades, valores del estudio ni datos de la persona en los registros.
5. La ejecución en segundo plano no reevalúa el acceso: se evaluó al pedir.

## Cambios en `studies`

Ambos casos de uso devuelven resultados en lugar de lanzar errores del dominio de `studies`, para que `analyses` no necesite importarlos (regla de límites entre módulos, [research.md](../research.md), R1).

- `authorizeStudy({ actor, studyId })`: `{ status: "ALLOWED", studyId, patientId }` o `{ status: "NO_ACCESS" }` (estudio ajeno, de otra clínica, sin asignación vigente o inexistente). Mismas reglas que `getStudyWaveform`.
- `readStudyModelInput({ actor, studyId })`: `{ status: "READY", waveform, tabular }`, `{ status: "FILE_UNAVAILABLE" }` o `{ status: "NO_ACCESS" }`. Una falla de infraestructura lanza `StudyUnavailableError`, que `analyses` trata como falla inesperada.
- `createDeleteStudy` recibe `canDeleteStudy` desde `composition.ts`, con un cierre perezoso que llama a `getAnalysesModule().hasAnalysisInProgress`; con un análisis en curso, eliminar lanza `StudyInUseError` («El estudio tiene un análisis en curso y no se puede eliminar todavía.», ya existente).

## Puerto `StudySource` (de `analyses`)

`authorize({ actor, studyId })` y `readModelInput({ actor, studyId })` devuelven los mismos resultados con tipos propios de `analyses`. Lo implementa `createStudySource`, que recibe las dos funciones de `studies` como argumentos; la composición las conecta.
