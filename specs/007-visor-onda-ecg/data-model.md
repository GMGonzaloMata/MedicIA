# Modelo de datos: Visor de la onda de un estudio de ECG

La 007 **no cambia el esquema de la base ni el formato guardado**. Solo lee lo que dejó la 006 ([data-model de la 006](../006-carga-estudios-ecg/data-model.md) y [formato `ecg1`](../006-carga-estudios-ecg/contracts/stored-study-format.md)). Lo que sigue son tipos nuevos de dominio y de presentación, sin persistencia.

## StudyDetail (dominio, `domain/study.ts`)

Un estudio con lo necesario para mostrar su encabezado. Es lo que devuelve `findDetailById`.

- `id`, `tenantId`, `patientId`, `number`, `type`, `status`, `uploadedAt`: los del `StudyRecord` de la 006.
- `storageKey`: clave opaca del objeto. Solo la usa el caso de uso; **no sale del servidor**.
- `uploadedByUserId`: para saber si el usuario es quien lo cargó.
- `uploadedByPatient`: verdadero si lo cargó el propio paciente.
- `uploaderName`: nombre completo del médico que lo cargó; vacío si lo cargó el paciente.

Regla: toda consulta lleva `tenantId`; no existe una búsqueda por `id` solo.

## EcgLeads (dominio, `domain/ecg-leads.ts`)

La onda separada por derivación.

- `ECG_LEAD_NAMES`: `I, II, III, aVR, aVL, aVF, V1, V2, V3, V4, V5, V6`, en el orden de las columnas del formato guardado.
- `ECG_SAMPLING_HZ = 250` y `ECG_DURATION_SECONDS = 10` (2.500 muestras).
- `splitLeads(waveform): Float32Array[]`: del arreglo guardado fila por fila (muestra por muestra, 12 valores por fila) devuelve 12 arreglos de 2.500 valores. Falla si el largo no es 30.000.

## StudyWaveformResult (aplicación, salida del caso de uso)

Uno de dos:

- `READY`: `study` (datos visibles) y `leads` (12 arreglos de 2.500 valores).
- `UNAVAILABLE`: solo `study`; el archivo no existe o no tiene el formato esperado.

`study` (datos visibles) lleva: `id`, `number`, `uploadedAt`, `uploadedBy` (`PATIENT` o `DOCTOR` con nombre), `patientId`, `patientName` (solo para el médico) y nada más. **No lleva** `storageKey`, `tenantId`, `uploadedByUserId` ni las siete variables.

## ViewerState (presentación, no persiste)

- `view`: `ALL` (12 derivaciones) o `SINGLE` (una ampliada).
- `lead`: índice 0 a 11 de la derivación ampliada.
- `window`: `start` y `span` en muestras. Invariantes: `250 ≤ span ≤ 2500`, `0 ≤ start` y `start + span ≤ 2500`.

Transiciones: elegir una derivación pasa a `SINGLE` con la ventana completa; volver pasa a `ALL`; zoom y desplazamiento solo cambian `window` respetando las invariantes.

## Sin cambios

Tabla `studies`, contador por paciente, formato `ecg1`, validación de la carga y permisos de AWS.
