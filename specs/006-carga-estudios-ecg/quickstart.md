# Guía de verificación: carga y almacenamiento de estudios de ECG

Sirve para comprobar de punta a punta que la funcionalidad cumple el spec. Los pasos con AWS los ejecuta el responsable con sus credenciales. No se usan datos del conjunto EchoNext ni de pacientes: solo archivos sintéticos.

## Requisitos

- La infraestructura aplicada, en este orden (ver `contracts/storage-and-permissions.md`): rotación de administración de `infra/bootstrap`, luego `infra/environments/dev`.
- La migración de Prisma de esta funcionalidad aplicada a la base local y a la de desarrollo (la crea y la ejecuta el responsable).
- PostgreSQL local levantado con `docker compose up -d`.
- `.env.local` con `STUDY_STORAGE=fake` para probar sin AWS, o con `STUDY_STORAGE=s3`, `STUDIES_BUCKET=medicia-studies-dev-896618135592` y `AWS_REGION=sa-east-1` para probar contra S3.
- Datos de prueba creados con `npm run seed:demo` (lo ejecuta el responsable): una clínica A con un administrador, dos médicos (M1 y M2) y tres pacientes vinculados (P1 y P2 asignados a M1; P3 asignado a M2), y una clínica B con un médico y un paciente. Cada uno con una cuenta para ingresar.

## 1. Archivos de prueba

Desde `medicia-ml`, con el entorno activado (no lee datos de pacientes):

```powershell
python scripts/make_synthetic.py --out-dir C:\datos\echonext\sinteticos
```

Genera `valido.npz` y un conjunto de archivos defectuosos: `sin-tabular.npz`, `forma-incorrecta.npz`, `con-nan.npz`, `sexo-2.npz`, `sin-estandarizar.npz`, `con-objetos.npz` (un campo de objetos), `con-extras.npz` y `grande.npz` (más de 2 MB). Las salidas van fuera de los repositorios.

## 2. Pruebas automáticas

```powershell
npm run check
npm run test:e2e
terraform -chdir=infra/modules/study-storage init -backend=false
terraform -chdir=infra/modules/study-storage test
terraform -chdir=infra/bootstrap test
```

Resultado esperado: todo en verde y cobertura de al menos 80 % por archivo en `src/modules/studies/` y en el adaptador de S3. `npm run test:e2e` incluye las pruebas de pantalla en claro y oscuro y en tres anchos (`tests/e2e/studies-responsive.spec.ts`).

## 3. El paciente sube y ve su estudio (historia 1)

1. Ingresá como P1 y abrí «Mis estudios».
2. Subí `valido.npz`.
3. Esperado: mensaje «Estudio 1 guardado» en menos de 10 segundos y una fila en la lista con número 1, tipo «Electrocardiograma», fecha y hora, «Cargado» y «Vos» como quien lo cargó. El nombre del archivo no aparece en ninguna parte.
4. Subí el mismo archivo otra vez. Esperado: aparece el estudio 2 (no se detectan duplicados).
5. Ingresá como P2 y abrí «Mis estudios». Esperado: lista vacía; no ve los estudios de P1.
6. Con `STUDY_STORAGE=s3`, comprobá en la consola de S3 que existen dos objetos `studies/<tenantId>/<id>.ecg1` de 120.036 bytes, con cifrado `AES256`.

## 3b. El médico trabaja con sus pacientes (historia 2)

1. Ingresá como M1 y abrí «Mis pacientes». Esperado: aparecen P1 y P2, no P3 ni los de la clínica B.
2. Abrí a P1. Esperado: ve los dos estudios que cargó P1 (con «Paciente» como quien los cargó).
3. Subí `valido.npz` a P1. Esperado: aparece el estudio 3, con tu nombre como quien lo cargó. Ingresá como P1: ve los tres.
4. Probá abrir `/patients/<id de P3>` como M1. Esperado: pantalla de «sin acceso», sin datos.
5. Con el script o la base, terminá la asignación de M1 con P1. Esperado: M1 deja de ver a P1 y sus estudios; P1 sigue viéndolos. Reasigná: M1 vuelve a verlos.

## 4. Rechazos (historia 3)

Subí cada archivo defectuoso y comprobá, en cada caso: mensaje claro con el código del contrato `upload-npz.md`, sin valores del estudio ni nombre del archivo; la lista queda igual; no aparece ningún objeto nuevo en el bucket; el siguiente estudio válido recibe el número que correspondía (los rechazos no consumen números).

`con-objetos.npz` debe rechazarse con `FIELD_TYPE` sin ejecutar nada. `con-extras.npz` debe aceptarse y los campos extra no deben figurar en el objeto guardado (el objeto sigue midiendo 120.036 bytes).

## 5. Aislamiento entre clínicas, pacientes y roles (historia 4)

1. Como P2, enviá la eliminación o la consulta con el `id` exacto de un estudio de P1 (herramienta de desarrollo del navegador o prueba de integración). Esperado: rechazo y el estudio de P1 intacto.
2. Como M2, abrí a P1 (no asignado). Esperado: sin acceso.
3. Como el médico de la clínica B, probá el `id` de un paciente o un estudio de la clínica A. Esperado: rechazo.
4. Ingresá como el administrador de la clínica A que no es médico y abrí «Estudios». Esperado: el aviso «Tu vínculo con la clínica no incluye estudios.» y ningún dato.
5. Cerrá sesión y repetí la subida. Esperado: te lleva a ingresar.
6. Como M1, agregá a un formulario de carga un `patientId` de P3 (no asignado). Esperado: rechazo y no se guarda nada. Como P1, agregá un `patientId` de P2. Esperado: se ignora y el estudio queda a nombre de P1.

## 6. Numeración y concurrencia

La prueba de integración sube 20 estudios en paralelo al mismo paciente: los números son únicos y consecutivos. Después de eliminar el último estudio de un paciente, el siguiente no reutiliza su número. Los números de otro paciente no se ven afectados. La misma prueba crea 500 estudios para un paciente y comprueba que una página de la lista se resuelve en menos de 200 ms.

## 7. Eliminar (historia 5)

1. Como P1, eliminá el estudio 2 (cargado por P1) y confirmá en el diálogo. Esperado: desaparece de su lista y de la de M1.
2. Como P1, comprobá que el estudio 3 (cargado por M1) no tiene botón «Eliminar»; si forzás la acción con su `id`, se rechaza. Como M1, el estudio 1 (cargado por P1) tampoco se puede eliminar.
3. Con `STUDY_STORAGE=s3`, el objeto del estudio 2 ya no existe y, como el bucket no tiene versionado, no queda ninguna versión recuperable (`aws s3api list-object-versions` no lista nada de ese estudio).
4. Cancelá el diálogo con Escape: no se borra nada.
5. Subí otro estudio como P1: recibe el número 4, no el 2.

## 8. Huérfanos

1. Con `STUDY_STORAGE=s3`, subí a mano un objeto de prueba a `studies/<tenantId>/<uuid>.ecg1` con la consola de S3 (sin fila en la base).
2. Esperá más de 1 hora o usá `--min-age 0` y ejecutá `npm run studies:reconcile`. Esperado: informa el objeto huérfano y no borra nada.
3. Ejecutá `npm run studies:reconcile -- --apply --min-age 0`. Esperado: lo borra y no toca los objetos con fila.

## 9. Pantallas y accesibilidad

1. Abrí «Mis estudios», «Mis pacientes» y la pantalla de un paciente en el celular (o con la herramienta de desarrollo en 375 px), en una tablet (768 px) y en escritorio.
2. Repetí en modo claro y en modo oscuro. Esperado: sin desplazamiento horizontal, la lista pasa de tarjetas a tabla, los textos se leen con buen contraste y los estados («Cargado», los errores) se entienden sin depender del color.
3. Recorré la carga y la eliminación solo con el teclado. Esperado: se llega a todos los controles con Tab, el foco se ve, Escape cierra el diálogo de eliminación y el foco vuelve al botón que lo abrió.

## 10. Registros

Revisá la salida del servidor tras las cargas válidas e inválidas: solo identificadores opacos y códigos de resultado, ni la onda, ni las variables, ni el nombre del archivo (SC-006).

## 11. Infraestructura

- `aws s3api get-public-access-block --bucket medicia-studies-dev-896618135592` devuelve los cuatro bloqueos en `true`.
- `aws s3api get-bucket-versioning` no devuelve estado (sin versionado).
- Con las credenciales del operador, `aws s3 cp s3://medicia-studies-dev-896618135592/studies/... -` devuelve `AccessDenied`.
- `terraform plan` en el entorno de desarrollo termina con `No changes`.

## Resultados

(Se completa al ejecutar la guía.)
