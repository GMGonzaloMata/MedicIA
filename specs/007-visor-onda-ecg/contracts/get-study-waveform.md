# Contrato: caso de uso `getStudyWaveform`

Interfaz interna del módulo `studies`, expuesta por `getStudiesModule().getStudyWaveform` y consumida por la pantalla `/studies/[studyId]`. No hay API HTTP nueva.

## Entrada

- `actor`: el `StudyActor` de la 006 (paciente con su `patientId`, o médico con su `membershipId`). Un administrador que no es médico no tiene actor (`toStudyActor` devuelve `null`) y la pantalla ni llega a llamar.
- `studyId`: identificador del estudio. La pantalla lo valida como UUID antes de llamar.

## Salida

Éxito, uno de dos:

- `{ status: "READY", study, leads }`: `leads` son 12 `Float32Array` de 2.500 valores, en el orden I, II, III, aVR, aVL, aVF, V1 a V6.
- `{ status: "UNAVAILABLE", study }`: el archivo no existe o tiene un formato inválido.

`study`: `id`, `number`, `uploadedAt`, `uploadedBy` (`{ kind: "PATIENT" }` o `{ kind: "DOCTOR", fullName }`), `patientId` y `patientName` (solo si el actor es médico; `null` si es paciente).

Nunca incluye: `storageKey`, `tenantId`, `uploadedByUserId`, las siete variables tabulares ni ningún dato del archivo original.

## Errores

- `StudyNotFoundError`: no hay un estudio con ese `id` en la clínica del actor.
- `StudyForbiddenError`: el estudio existe pero el actor no tiene acceso (paciente ajeno, médico sin asignación vigente o con asignación terminada).
- `StudyUnavailableError`: falló la base o el almacenamiento al leer (no es «onda no disponible»).

La pantalla muestra la **misma** vista «Sin acceso» para `StudyNotFoundError` y `StudyForbiddenError`, de modo que un estudio ajeno no se distingue de uno inexistente. Los mensajes de los errores no incluyen valores del estudio.

## Reglas

1. Toda consulta lleva `tenantId` del actor; el estudio de otra clínica se comporta como inexistente.
2. Acceso del paciente: `study.patientId === actor.patientId`. Acceso del médico: asignación vigente en este momento (`PatientDirectory.findAssignedPatient`).
3. El control de acceso va antes de leer el almacenamiento: un actor sin acceso nunca provoca una lectura del objeto.
4. Una clave de almacenamiento solo se usa dentro del caso de uso.
5. Un objeto ausente o dañado es un resultado (`UNAVAILABLE`), no una excepción. Un error de infraestructura es una excepción.
6. Los registros de error incluyen el nombre del error y la clave opaca, nunca contenido del estudio.

## Cambios en los puertos

- `StudyFileStorage.get(key): Promise<Uint8Array | null>`: devuelve los bytes del objeto o `null` si no existe. Los errores de acceso se propagan.
- `StudyRepository.findDetailById({ tenantId, studyId }): Promise<StudyDetail | null>`: siempre con `tenantId`; devuelve el estudio con quién lo cargó.
- `PatientDirectory`: sin cambios (se usa `findAssignedPatient`).
