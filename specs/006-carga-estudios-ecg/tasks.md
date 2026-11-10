---

description: "Lista de tareas de la carga y almacenamiento de estudios de ECG"
---

# Tasks: Carga y almacenamiento de estudios de ECG

**Input**: Documentos de diseño en `/specs/006-carga-estudios-ecg/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [quickstart.md](quickstart.md) y los contratos en [contracts/](contracts/).

**Tests**: Incluidos y escritos antes que el código que prueban. La constitución los exige por el riesgo (autorización, persistencia e integraciones externas son tareas complejas) con al menos 80 % de cobertura de líneas en lo nuevo, y la regla de aislamiento exige una prueba de integración de rechazo desde otra clínica. Unitarias en `tests/unit/` (replicando `src/`), de integración en `tests/integration/study-storage/` contra el PostgreSQL local de Docker, E2E en `tests/e2e/`, y `terraform test` dentro de cada módulo.

**Organization**: Setup → Fundacional (esquema, dominio, lector, puertos, adaptadores en memoria, datos de prueba) → Infraestructura (bucket y permisos; avanza en paralelo con el código) → US1 → US2 → US3 → US4 → US5 → Pulido. Hasta cerrar la fase de infraestructura y aplicarla, todo el código se prueba con el almacenamiento simulado (`STUDY_STORAGE=fake`); solo la verificación contra S3 real la necesita.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: se puede ejecutar en paralelo (archivos distintos, sin dependencias pendientes).
- **[Story]**: historia de la spec a la que pertenece (US1 a US5). Las fases de Setup, Fundacional, Infraestructura y Pulido no llevan etiqueta.
- **[Responsable]**: lo ejecuta únicamente el responsable del proyecto desde su terminal o en la consola de AWS. El agente no corre `git commit`, `prisma migrate`, `prisma db`, `prisma generate`, `terraform apply`, `terraform destroy`, `terraform import` ni `terraform state`: se detiene en esa tarea e indica el comando exacto. Sí puede correr `terraform init -backend=false`, `fmt`, `validate`, `test` y `providers lock`. `terraform plan`, los comandos de AWS y los scripts que tocan la base o el bucket los corre el responsable, porque necesitan sus credenciales.
- **[Administrador]**: lo hace el responsable con el perfil de administración (usuario raíz con MFA), por la vía "Cambiar los permisos del operador" de `infra/README.md`.
- **[ML]**: la tarea se hace en el repositorio `medicia-ml` (`C:\Users\gonza\OneDrive\Desktop\Facultad\MedicIA-ml`). El responsable hace el `git commit` en ese repositorio.

## Path Conventions

- Aplicación: `src/modules/studies/`, `src/infrastructure/aws/s3/`, `src/app/(dashboard)/`, `prisma/schema.prisma`, `scripts/`, `next.config.ts`, según [plan.md](plan.md).
- Pruebas: todas en `tests/` (unitarias replicando `src/`), salvo las de Terraform, que viven en la carpeta `tests/` de su módulo o raíz dentro de `infra/`.
- Infraestructura: `infra/modules/study-storage/`, `infra/modules/identity/`, `infra/environments/dev/` y `infra/bootstrap/`. Los comandos de Terraform se ejecutan desde la raíz con `-chdir=<carpeta>` y el perfil `medicia-dev` (`$env:AWS_PROFILE = "medicia-dev"` en PowerShell).
- Código de ML: solo en `medicia-ml`. Ningún `.py` entra en este repositorio.
- Textos de la interfaz y documentos en español rioplatense (vos). Sin tablas en los documentos del proyecto.
- **Datos del conjunto EchoNext:** ninguna tarea los abre ni los usa. Todas las pruebas y los archivos de demostración son sintéticos. El único dato que se toma del conjunto son los agregados que imprime `report_ranges.py` cuando lo corre el responsable.
- **Puntos de commit:** al cerrar cada fase el agente se detiene y avisa que es un buen momento para que el responsable haga `git commit`, indicando en qué repositorio. Solo da el mensaje, no el comando.
- **Antes de cerrar cualquier fase:** `npm run check` sin errores (cuando la fase toca la aplicación) o `terraform test` y `validate` (cuando toca Terraform).

---

## Phase 1: Setup

**Purpose**: leer lo que hay que respetar, dejar el punto de partida limpio y sumar la única dependencia nueva.

- [X] T001 Leer `.specify/memory/constitution.md` y `memory/{platform-context,architecture,project-structure,design-patterns,design,coding-standards}.md`, y el módulo `src/modules/users/` como patrón a repetir (puertos en `application/ports/out/`, casos de uso con dependencias inyectadas, `composition.ts` perezoso en `globalThis`, selección de adaptador por variable de entorno sin valor por defecto en `infrastructure/adapters/create-identity-provider.ts`, adaptadores en memoria en `tests/support/in-memory/`).
- [X] T002 Leer las guías de Next.js de `node_modules/next/dist/docs/` antes de escribir código de Next (constitución): formularios y Server Actions (`01-app/02-guides/forms.md`, `server-actions.md`), la opción `serverActions.bodySizeLimit` (`01-app/03-api-reference/05-config/01-next-config-js/serverActions.md`), rutas dinámicas, `revalidatePath` y el comportamiento de `cacheComponents` con datos de la sesión. Anotar en comentarios de código solo lo que no sea obvio. Si una guía contradice lo asumido en `research.md` (R5, R9), detenerse y avisar.
- [X] T003 [P] Leer, antes de escribir HCL: las skills `terraform-style-guide`, `terraform-skill` y `terraform-test`; `.agents/reviewers/infrastructure.md`; y los archivos que se extienden: `infra/modules/model-artifacts/` (calco del bucket), `infra/modules/identity/`, `infra/environments/dev/main.tf`, `infra/bootstrap/{permissions-boundary,operator-policy,operator-policy-ml,github-oidc,locals}.tf` y `.github/workflows/infra.yml`.
- [X] T004 [P] Comprobar el punto de partida limpio: `npm run check` termina sin errores; `terraform -chdir=infra/bootstrap test`, `terraform -chdir=infra/environments/dev test` y los de cada módulo pasan sin cambios. Si algo falla antes de empezar, informarlo y no seguir.
- [X] T005 Sumar la dependencia `@aws-sdk/client-s3` con la versión exacta `3.1164.0` (la misma que `@aws-sdk/client-cognito-identity-provider`): `npm install --save-exact @aws-sdk/client-s3@3.1164.0`, y confirmar que `package.json` y el archivo de bloqueo cambian solo por esa dependencia. No se suma ninguna librería de ZIP ni de `.npy` (R2).

**Checkpoint**: punto de partida verde y la dependencia instalada. Punto de commit sugerido (repositorio `medicia`): `chore: dependencia del cliente de S3 para estudios`.

---

## Phase 2: Foundational (bloquea a todas las historias)

**Purpose**: esquema de datos, reglas del dominio, lector del `.npz`, formato guardado, puertos, adaptadores en memoria y datos de prueba. Todo se prueba sin AWS.

**⚠️ CRITICAL**: ninguna historia puede empezar hasta cerrar esta fase.

### Esquema de datos (punto 1 del encargo)

- [X] T006 Agregar a `prisma/schema.prisma` las enumeraciones `StudyType` (`study_type`: `ECG`) y `StudyStatus` (`study_status`: `UPLOADED`) y los modelos `Study` (`studies`) y `StudyCounter` (`study_counters`) exactamente como los define [data-model.md](data-model.md): `id` UUID v7; `tenantId`; `patientId`; `uploadedByUserId`; `number` entero positivo; `type` (por defecto `ECG`); `status` (por defecto `UPLOADED`); `storageKey`; `uploadedAt` `timestamptz(3)` por defecto `now()`. Clave foránea compuesta `(tenantId, patientId)` a `Patient(tenantId, id)` con `onDelete: Restrict`; claves a `Tenant` y `User` con `Restrict`; `@@unique([tenantId, patientId, number])`, `@@unique([tenantId, id])`, `@@unique([storageKey])`, `@@index([uploadedByUserId])`. `StudyCounter`: `patientId` clave primaria, `tenantId`, `lastNumber`, clave foránea compuesta `(tenantId, patientId)` a `Patient` con `Restrict`. Agregar las relaciones inversas que Prisma exige en `Tenant`, `User` y `Patient`. Columnas en `snake_case` con `@map`, y comentarios en español como el resto del archivo. No ejecutar ningún comando de Prisma.
- [X] T007 [Responsable] Generar la migración sin aplicarla: `npx prisma migrate dev --create-only --name studies`. Avisar al agente cuando exista la carpeta nueva en `prisma/migrations/`.
- [X] T008 Editar a mano el SQL de la migración generada en `prisma/migrations/<fecha>_studies/migration.sql` para agregar `CHECK (number > 0)` en `studies` y `CHECK (last_number > 0)` en `study_counters`, siguiendo el estilo de las migraciones `20261109053906_access_model` y `20261109065524_session_table`. Comprobar que el SQL no toca ninguna tabla existente (salvo las claves foráneas nuevas).
- [X] T009 [Responsable] Aplicar la migración a la base local y a la de desarrollo (`npx prisma migrate dev` en local) y regenerar el cliente (`npx prisma generate`). Luego el agente corre `npm run typecheck` para confirmar que el cliente generado trae los modelos nuevos.

### Dominio (pruebas primero)

- [X] T010 [P] Escribir `tests/unit/modules/studies/domain/ecg-study.test.ts` (debe fallar antes de implementar): acepta un estudio válido; rechaza valores no finitos (`NaN`, `Infinity`) en la onda y en las variables; rechaza sexo distinto de exactamente `0` o `1`; rechaza una variable estandarizada con valor absoluto mayor que 20 y una muestra de la onda con valor absoluto mayor que 100 (límites provisionales, ver R4); acepta justo en el límite; los mensajes de error nombran el campo y la regla (y, a lo sumo, la posición de la variable) y **nunca el valor**.
- [X] T011 [P] Escribir `tests/unit/modules/studies/domain/stored-study-format.test.ts` (debe fallar): ida y vuelta exacta de una onda de 2500×12 y 7 variables; el resultado mide exactamente 120.036 bytes y empieza con `MEDECG01`; la muestra `t` de la derivación `d` está en la posición `36 + 4 * (t * 12 + d)`; rechaza un objeto de otro tamaño, con otra firma, o con valores no finitos.
- [X] T012 [P] Escribir `tests/unit/modules/studies/domain/study-access.test.ts` (debe fallar), una prueba por combinación de [research.md](research.md) R7: paciente (propio paciente permitido; otro paciente denegado); médico con asignación vigente a un paciente `LINKED` (permitido), sin asignación (denegado), con asignación terminada (denegado); administrador sin rol de médico (denegado); persona que es administradora y médica (actúa como médica); sin clínica o sin sesión (denegado); eliminar permitido solo a quien cargó el estudio y que conserva el acceso; vínculo `PATIENT` o `STAFF` sin `isDoctor` no ve la lista de pacientes.
- [X] T013 Crear `src/modules/studies/domain/study.ts` (tipos `Study`, `StudySummary`, `PatientSummary`, `Page<T>`, `StudyType`, `StudyStatus`, `STUDY_PAGE_SIZE = 20`) y `src/modules/studies/domain/study-errors.ts` con los códigos de rechazo y sus mensajes en español de [contracts/upload-npz.md](contracts/upload-npz.md) (`FILE_MISSING`, `FILE_TOO_LARGE`, `NOT_NPZ`, `UNSUPPORTED_ZIP`, `EXPANSION_LIMIT`, `FIELD_MISSING`, `FIELD_DUPLICATED`, `FIELD_TYPE`, `FIELD_SHAPE`, `FIELD_CORRUPT`, `VALUE_NOT_FINITE`, `SEX_INVALID`, `VALUE_OUT_OF_RANGE`) más los de acceso (`FORBIDDEN`, `NOT_FOUND`, `UNAVAILABLE`, `IN_USE`). Sin importar Next.js, Prisma ni el SDK de AWS.
- [X] T014 Implementar `src/modules/studies/domain/ecg-study.ts`: tipo de la onda (2500×12) y las variables (7 `float32`), constantes de las dimensiones y los límites provisionales (±100 para la onda y ±20 para las seis variables estandarizadas, con un comentario que remita a R4 y a la tarea de cierre de rangos), y las reglas de contenido de T010. Hace pasar T010.
- [X] T015 Implementar `src/modules/studies/domain/stored-study-format.ts` (codificar y leer el formato canónico `ecg1` de [contracts/stored-study-format.md](contracts/stored-study-format.md)): firma `MEDECG01`, 7 `float32` little-endian, 30.000 `float32` little-endian, 120.036 bytes, conversión de `float64` a `float32`, y la verificación de tamaño, firma y finitud al leer. Hace pasar T011.
- [X] T016 Implementar `src/modules/studies/domain/study-access.ts`: función pura que, a partir de un tipo de entrada propio del módulo (clínica, usuario, vínculo `PATIENT` con `patientId` o `STAFF` con `membershipId` e `isDoctor`; sin importar tipos del módulo `users`), devuelve el actor (`{ kind: "PATIENT", … }`, `{ kind: "DOCTOR", … }` o ninguno), y las reglas de ver, cargar y eliminar de R7. El mapeo desde `AccessContext` al actor lo hace `src/app/_lib/study-actor.ts` (capa `app/`, tarea T052), sin importar tipos del módulo `users` dentro del dominio. Hace pasar T012.

### Puertos y lector del `.npz` (punto 3 del encargo)

- [X] T017 [P] Crear los puertos de salida en `src/modules/studies/application/ports/out/`: `study-repository.ts` (insertar con número asignado en la misma transacción, buscar por `tenantId` e `id`, listar por paciente y página, borrar), `patient-directory.ts` (listar los pacientes del médico con asignación vigente y `LINKED`; comprobar el acceso del médico a un paciente; solo lectura), `study-file-storage.ts` (guardar, borrar y listar objetos con su antigüedad) y `study-file-reader.ts` (bytes de un `.npz` a onda y variables). Todas las consultas reciben `tenantId` y las condiciones de acceso; ninguna busca por `id` solo.
- [X] T018 [P] Crear `tests/support/npz-builder.ts`: constructor de archivos `.npz` sintéticos para las pruebas, con opciones para generar los casos válidos y defectuosos (escritor mínimo de ZIP almacenado o deflate con CRC-32 y de `.npy` versión 1, 2 y 3; permite forzar tamaños declarados falsos, CRC erróneo, nombres repetidos o peligrosos, `descr` de objetos, `fortran_order` verdadero, formas incorrectas, ZIP64, entradas extra). Ningún dato real.
- [X] T019 Escribir `tests/unit/modules/studies/infrastructure/npz-reader.test.ts` (debe fallar) con los casos de [research.md](research.md) R10: válido en `float32` y `float64`, forma `(1,2500,12)` y `(2500,12)`; no es ZIP; ZIP64; más de 2 MB; bomba de descompresión (declara poco y expande mucho); suma declarada mayor que 20 MB; tamaño declarado distinto del real; CRC erróneo; nombre repetido; nombres con `..`, barras, barras invertidas, rutas absolutas y caracteres de control; entrada `|O` rechazada antes de leer datos; `fortran_order` verdadero; forma incorrecta de cada campo; campos extra ignorados sin leerse; método de compresión no admitido; más de 16 entradas.
- [X] T020 Implementar `src/modules/studies/infrastructure/adapters/npz-reader.ts` con las reglas de R2, usando solo `node:zlib` (incluido `zlib.crc32` y `inflateRawSync` con `maxOutputLength`), sin `eval`, sin escribir en disco y sin dependencias nuevas. Encabezado `.npy` analizado con expresión regular estricta. Mensajes de error con los códigos de T013 y sin valores del estudio ni nombres de entradas del ZIP. Hace pasar T019.

### Adaptadores en memoria y datos de prueba (punto 2 del encargo)

- [X] T021 [P] Crear los dobles en memoria, con el mismo contrato que los puertos de T017: `tests/support/in-memory/in-memory-study-repository.ts` y `tests/support/in-memory/in-memory-patient-directory.ts` (con asignaciones vigentes y terminadas configurables).
- [X] T022 [P] Extender `tests/support/e2e-database.ts` y `tests/support/e2e-accounts.ts` para las pruebas E2E de los roles. Hoy solo existen `linkAsClinicAdmin` (membresía con `is_doctor` falso) y `linkAsLinkedPatient`. Agregar: `linkAsDoctor({ userId, tenantId })` (membresía con `is_doctor` verdadero), `assignDoctor({ tenantId, membershipId, patientId, createdByUserId })` y `endAssignment(...)` sobre `doctor_patient_assignments`, `seedStudy({ tenantId, patientId, uploadedByUserId })` que inserta la fila del estudio y avanza el contador de su paciente (con `STUDY_STORAGE=fake`, también un objeto de ejemplo) y un ayudante que deja a una persona lista para ingresar como paciente, médico o administrador. Sin datos reales. Lo usan las pruebas E2E de US1 a US5.
- [X] T023 [P] Crear `src/modules/studies/infrastructure/adapters/in-memory-study-file-storage.ts` (almacenamiento simulado que guarda en memoria del proceso, en `globalThis`, para desarrollo sin AWS y para E2E) y su prueba `tests/unit/modules/studies/infrastructure/in-memory-study-file-storage.test.ts`: guardar, leer, borrar, listar con antigüedad, y que dos instancias comparten el estado.
- [X] T024 Crear `scripts/seed-demo-clinic.ts` (`npm run seed:demo`): crea de forma repetible (sin duplicar al repetirse) una clínica A con un administrador sin rol de médico, dos médicos (M1, M2) y tres pacientes vinculados (P1 y P2 asignados a M1; P3 asignado a M2), y una clínica B con un médico y un paciente. Vincula **cuentas ya existentes** indicadas por correo en variables de entorno (las cuentas de Cognito o del proveedor simulado se crean con el registro normal). Se niega a correr si `DATABASE_URL` no apunta a una base local o de desarrollo (reutilizar la lógica de `assertLocalDatabaseUrl` de `tests/support/local-database.ts`). Usa importaciones relativas con extensión `.ts` y se ejecuta con `node --env-file=.env.local scripts/seed-demo-clinic.ts`; si Node no resuelve el cliente generado de Prisma de esa forma, detenerse y proponer `tsx` como dependencia de desarrollo en lugar de improvisar. Agregar `"seed:demo"` a `package.json`. No usa ningún comando reservado de Prisma. Documentar en el encabezado del script qué crea y qué variables lee.
- [ ] T025 [Responsable] Ejecutar `npm run seed:demo` contra la base local y confirmar que crea los datos y que una segunda ejecución no los duplica.

**Checkpoint**: `npm run check` en verde; dominio, lector, formato y reglas de acceso cubiertos por pruebas; migración aplicada. Punto de commit sugerido (repositorio `medicia`): `feat(studies): esquema, dominio, lector de .npz y datos de prueba de estudios de ECG`.

---

## Phase 3: Infraestructura del bucket de estudios y permisos (punto 8 del encargo)

**Purpose**: bucket privado, cifrado y sin versionado, permisos mínimos para la aplicación y garantía de que el operador no puede leer estudios. Avanza en paralelo con las fases de código; solo bloquea la verificación contra S3 real. Detalle en [contracts/storage-and-permissions.md](contracts/storage-and-permissions.md).

### Tests (escribirlos primero y verificar que fallan)

- [X] T026 [P] Escribir `infra/modules/study-storage/tests/study-storage.tftest.hcl` (modo `plan` con `mock_provider "aws" {}`, como `model-artifacts`): nombre `medicia-studies-dev-<cuenta>`; bloqueo de acceso público con los cuatro valores en `true`; propiedad `BucketOwnerEnforced`; cifrado `AES256`; **sin** recurso de versionado; política con un único `Deny` por `aws:SecureTransport = false` y ninguna `Allow`; `prevent_destroy` y `force_destroy = false`; ciclo de vida que aborta subidas multiparte incompletas a 1 día y no vence objetos; rechaza un entorno distinto de `dev` y una cuenta que no tenga 12 dígitos.
- [X] T027 [P] Agregar a `infra/modules/identity/tests/` las pruebas de la variable opcional `studies_bucket_arn`: vacía no agrega ninguna sentencia (los entornos que no la usan no cambian); con valor agrega una sentencia con `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject` sobre `<arn>/studies/*` y `s3:ListBucket` sobre `<arn>` con la condición `s3:prefix = studies/*`; sin comodines ni `s3:*`; rechaza un valor que no sea un ARN de bucket de S3.
- [X] T028 [P] Agregar a `infra/bootstrap/tests/access.tftest.hcl` las pruebas del límite `medicia-dev-boundary` y del rol de plan: el límite contiene exactamente los mismos permisos de S3 sobre estudios que la política del usuario de la aplicación (misma lista), sin comodines y sin tocar el bucket de modelos; el rol de plan puede leer la configuración del bucket de estudios pero **no** leer objetos (`s3:GetObject`) de él.
- [X] T029 [P] Agregar a `infra/bootstrap/tests/operator-ml.tftest.hcl` o `access.tftest.hcl` las pruebas del operador: tiene un `Deny` explícito sobre `s3:GetObject`, `s3:GetObjectVersion`, `s3:DeleteObject` y `s3:DeleteObjectVersion` en `arn:aws:s3:::medicia-studies-dev-<cuenta>/*`; puede crear y configurar el bucket de estudios; la política administrada sigue por debajo de los 6.144 caracteres; la sentencia `ProtegerLasPoliticasDeAcceso` sigue cubriendo todas las políticas.

### Implementación

- [X] T030 Crear `infra/modules/study-storage/{main,variables,outputs,terraform}.tf` calcados de `infra/modules/model-artifacts/` con las diferencias de R8: sin versionado, ciclo de vida que solo aborta multipart a 1 día, nombre `medicia-studies-${var.environment}-${var.account_id}` armado con cadenas conocidas (no con atributos del recurso), salidas `bucket_name` y `bucket_arn`. Comentarios en español que expliquen por qué no hay versionado (FR-013 y SC-005). Generar `.terraform.lock.hcl` con `terraform providers lock -platform=linux_amd64 -platform=windows_amd64` e incluirlo en el commit. Hace pasar T026.
- [X] T031 Agregar a `infra/modules/identity/` la variable opcional `studies_bucket_arn` (por defecto vacía, con validación de ARN de bucket) y la sentencia de S3 de la política `aws_iam_user_policy.app` cuando tiene valor. Hace pasar T027.
- [X] T032 Cablear en `infra/environments/dev/main.tf` el módulo `study_storage` (`environment = "dev"`, `account_id = "896618135592"`) y pasar `studies_bucket_arn = module.study_storage.bucket_arn` a `module.identity`. Agregar una prueba en `infra/environments/dev/tests/` que verifique que el bucket de estudios existe y que ninguna entrada del catálogo de modelos lo referencia. No agregar `depends_on` entre módulos (ver el comentario de `model_endpoints` sobre `create_before_destroy`).
- [X] T033 En `infra/bootstrap/locals.tf` agregar `studies_bucket_name` y `studies_bucket_arn` (armados con cadenas conocidas, con un comentario que advierta que el nombre debe coincidir con el del módulo), y usarlos en: `permissions-boundary.tf` (nueva sentencia con los permisos de S3 de la aplicación, por la misma lista que la política del usuario); `operator-policy.tf` (sumar el ARN del bucket a los statements que hoy cubren el bucket de modelos —lectura/configuración y crear/borrar/política— renombrando los `Sid` si dejan de describir lo que hacen; y un nuevo `Deny` `NoLeerNiBorrarEstudios` para las cuatro acciones de objetos); `github-oidc.tf` (sumar el ARN del bucket de estudios a las lecturas de configuración de `plan_read_statements`, sin lectura de objetos). Hace pasar T028 y T029. Si `medicia-dev-terraform-operator` supera los 6.144 caracteres, mover el `Deny` `NoLeerNiBorrarEstudios` y el ARN nuevo a `operator-policy-ml.tf` (la segunda política) en lugar de recortar permisos, y comprobar que el `Deny` de protección de las políticas sigue cubriendo ambas.
- [X] T034 [P] Actualizar `.github/workflows/infra.yml` (y `ci.yml` si corresponde): sumar `infra/modules/study-storage` a todas las listas de módulos que recorren los pasos de formato, validación y pruebas (recordar el prefijo `infra/` completo: la 005 tuvo un error por omitirlo); agregar una guarda que falle si el módulo `study-storage` declara `aws_s3_bucket_versioning`, si alguien agrega una `Allow` a su política o si el bucket pierde `prevent_destroy`; mantener las guardas de la 005 (costo, `latest`, comodines, archivos de datos); sumar `*.ecg1` a la guarda de archivos de datos de `ci.yml` e `infra.yml` y al `.gitignore` (los estudios guardados nunca van al repositorio).
- [X] T035 [P] Documentar en `infra/README.md` la sección "Bucket de estudios": qué crea, por qué no tiene versionado, quién accede y quién no (incluido el `Deny` al operador), variables de entorno de la aplicación (`STUDY_STORAGE`, `STUDIES_BUCKET`, `AWS_REGION`), el orden de aplicación (rotación de administración → `apply` del entorno → migración y variables), cómo comprobar que el bucket no permite acceso público y que el operador recibe `AccessDenied`, y los pendientes antes de datos reales (registro de accesos de S3, conservación, rol del servidor en lugar del usuario de la aplicación).
- [X] T036 Ejecutar y dejar en verde: `terraform fmt -check -recursive infra`, `terraform -chdir=infra/modules/study-storage init -backend=false` y `validate`, y `terraform test` en `study-storage`, `identity`, `bootstrap` y `environments/dev`. Regenerar los archivos de bloqueo si cambiaron.
- [X] T037 [Administrador] Rotación de administración (según `infra/README.md`, "Cambiar los permisos del operador"): quitar las dos políticas del operador, adjuntar `AdministratorAccess`, `terraform -chdir=infra/bootstrap apply`, volver a adjuntar `medicia-dev-terraform-operator` y `medicia-dev-terraform-operator-ml`, quitar `AdministratorAccess` y verificar que `aws iam list-users` devuelve `AccessDenied`. Si la 005 dejó pendientes de rotación (`ecr:DescribeImageScanFindings`, evaluar quitar `ecr:PutImageTagMutability`, probar el `Deny` de aislamiento de red), aprovechar esta misma rotación; el agente prepara esos cambios solo si el responsable lo pide.
- [X] T038 [Responsable] `terraform -chdir=infra/environments/dev plan` y revisar el resultado (debe crear el bucket y sus subrecursos, la política de la aplicación y nada destructivo); luego `terraform -chdir=infra/environments/dev apply`. Confirmar que un segundo `plan` da `No changes`.
- [X] T039 [Responsable] Verificar con los comandos de [quickstart.md](quickstart.md) §11: `aws s3api get-public-access-block`, `get-bucket-versioning` (sin estado), y que con las credenciales del operador `aws s3 cp` de un objeto del bucket devuelve `AccessDenied`.

**Checkpoint**: Terraform en verde y aplicado. Punto de commit sugerido (repositorio `medicia`): `feat(infra): bucket de estudios con permisos mínimos y sin lectura para el operador`.

---

## Phase 4: User Story 1 - El paciente sube un estudio y lo ve en su lista (Priority: P1) 🎯 MVP

**Goal**: un paciente vinculado sube un `.npz` válido a su nombre y lo ve en «Mis estudios», con su número, fecha y hora y estado.

**Independent Test**: con `STUDY_STORAGE=fake` y el paciente P1 del script de datos de prueba, subir `valido.npz` y ver el estudio 1 en la lista; subir otro y ver el 2; P2 no los ve; el objeto guardado mide 120.036 bytes y no contiene el nombre del archivo.

### Tests (escribirlos primero y verificar que fallan)

- [X] T040 [P] [US1] Escribir `tests/unit/modules/studies/application/upload-study.test.ts` (con los dobles de T021 y T023): éxito (guarda el objeto con la clave `studies/<tenantId>/<studyId>.ecg1`, inserta el estudio con el número siguiente y devuelve el número); el paciente sube solo a su propio paciente; rechazo del archivo sin efectos (ni objeto ni fila ni número consumido); falla del almacenamiento (no hay fila); falla de la base tras guardar el objeto (se borra el objeto como compensación); falla de la base **y** de la compensación (se registra la clave opaca y se responde `UNAVAILABLE`); el tipo no admitido se rechaza; el nombre del archivo nunca llega al caso de uso.
- [X] T041 [P] [US1] Escribir `tests/unit/modules/studies/application/list-studies.test.ts`: orden descendente por número, 20 por página, página fuera de rango devuelve la última, `page` inválido se trata como 1, devuelve `uploadedBy` según quien lo cargó.
- [X] T042 [P] [US1] Escribir `tests/integration/study-storage/study-repository.test.ts` contra el PostgreSQL local, con `tests/support/integration-setup.ts`: inserta un estudio con su número; los números de un mismo paciente son 1, 2, 3 y los de otro paciente empiezan en 1; **20 cargas concurrentes** al mismo paciente producen números únicos y consecutivos; un rollback no consume número; lista ordenada y paginada, también con 500 estudios de un paciente, donde una página se resuelve con el índice `(tenant_id, patient_id, number)` en menos de 200 ms (SC-007); la clave foránea compuesta impide un estudio cuyo paciente es de otra clínica; `number > 0` y `last_number > 0` se hacen cumplir.
- [X] T043 [P] [US1] Escribir `tests/unit/infrastructure/aws/s3/s3-study-file-storage.test.ts` con un cliente de S3 simulado: `PutObject` con `ServerSideEncryption: "AES256"`, `DeleteObject`, `ListObjectsV2` con el prefijo `studies/` y la antigüedad; ningún error de S3 se propaga con datos del estudio. `tests/unit/infrastructure/aws/s3/s3-client.test.ts`: construye el cliente con la región configurada y sin credenciales en el código. Y `tests/unit/infrastructure/aws/s3/config.test.ts`: `STUDIES_BUCKET` y `AWS_REGION` obligatorios con `s3`, mensajes que nombran la variable y nunca su valor. La cobertura se exige por archivo (80 %, `vitest.config.mts`): cada archivo nuevo de `src/modules` y de `src/infrastructure` necesita su prueba.
- [X] T044 [P] [US1] Escribir `tests/unit/app/studies/upload-study-action.test.ts` y `tests/unit/app/studies/studies-list.test.tsx`: la acción llama a `requireClinicContextForAction()`, ignora cualquier `tenantId` o `patientId` del formulario cuando el actor es paciente, responde `{ ok: true, number }`, y la lista muestra número, tipo, fecha y hora, estado y quién lo cargó, con estados vacío y de error, sin mostrar el nombre del archivo.

### Implementation

- [X] T045 [US1] Crear `src/modules/studies/application/use-cases/upload-study.ts`: recibe el actor ya resuelto, el paciente destino, el tipo y los bytes; lee y valida con los puertos de T017; genera el `studyId` (UUID v7) y la clave `studies/<tenantId>/<studyId>.ecg1`; guarda el objeto en formato `ecg1`; inserta el estudio en una transacción con el número; compensa si falla la base. Registra solo identificadores opacos y códigos (R13). Hace pasar T040.
- [X] T046 [US1] Crear `src/modules/studies/application/use-cases/list-studies.ts` (estudios de un paciente, paginados). Hace pasar T041.
- [X] T047 [US1] Crear `src/modules/studies/infrastructure/repositories/prisma-study-repository.ts`: inserción con el número asignado por `$queryRaw` con `INSERT … ON CONFLICT (patient_id) DO UPDATE SET last_number = study_counters.last_number + 1 RETURNING last_number` en la misma transacción que el estudio (R1); búsqueda por `tenantId` e `id`; listado por paciente con `ORDER BY number DESC`, `skip` y `take`; ninguna consulta sin `tenantId`. Reutiliza `src/infrastructure/database/prisma-client.ts`. Hace pasar T042.
- [X] T048 [P] [US1] Crear `src/infrastructure/aws/s3/config.ts` (validación con `zod` de `STUDIES_BUCKET` y `AWS_REGION`, errores que nombran la variable y no su valor, como `src/infrastructure/aws/cognito/config.ts`) y `src/infrastructure/aws/s3/s3-client.ts` (cliente de `@aws-sdk/client-s3`), ambos con `import "server-only"`. Quitar `src/infrastructure/aws/s3/.gitkeep`.
- [X] T049 [US1] Crear `src/modules/studies/infrastructure/adapters/s3-study-file-storage.ts` (guardar con `ServerSideEncryption: "AES256"`, borrar, listar con antigüedad) y `create-study-file-storage.ts` (elige `s3` o `fake` según `STUDY_STORAGE`, **sin valor por defecto**: si falta o es desconocido la aplicación no arranca, como `create-identity-provider.ts`). Hace pasar T043. Escribir también `tests/unit/modules/studies/infrastructure/create-study-file-storage.test.ts`: `s3` y `fake` eligen el adaptador correcto y un valor ausente o desconocido lanza un error que nombra la variable.
- [X] T050 [US1] Crear `src/modules/studies/composition.ts` con el patrón de `src/modules/users/composition.ts` (módulo armado la primera vez que se usa, guardado en `globalThis`). Quitar `src/modules/studies/.gitkeep`.
- [X] T051 [US1] Sumar `experimental.serverActions.bodySizeLimit: "3mb"` en `next.config.ts`, con un comentario que explique el cálculo (2 MB de archivo más el sobrecosto multipart) y que es un tope global de las acciones (R5). Comprobar con el servidor de desarrollo que un archivo de más de 1 MB llega a la acción.
- [X] T052 [US1] Crear la acción `src/app/(dashboard)/_studies/_actions/upload-study.ts`: llama a `requireClinicContextForAction()`, traduce `AccessContext` al actor de T016 (solo vínculo `PATIENT` en esta historia), lee `file.size` y los bytes (sin leer nunca `file.name`), llama al caso de uso y devuelve el estado del formulario de [contracts/studies-actions.md](contracts/studies-actions.md); `revalidatePath` tras el éxito. Sin lógica de negocio. El mapeo de `AccessContext` al actor vive en `src/app/_lib/study-actor.ts` (archivo nuevo, solo capa `app/`; el módulo `users` no se toca) y lo reutilizan las pantallas y las acciones. Hace pasar la parte de acción de T044.
- [X] T053 [P] [US1] Crear los componentes compartidos en `src/app/(dashboard)/_studies/_components/`: `upload-form.tsx` (campo `accept=".npz"`, ayuda con el contenido esperado, botón «Subir estudio», estado «Validando y guardando…», mensaje de éxito «Estudio N guardado» y de error en región `aria-live`, comprobación previa de `File.size`), `studies-list.tsx` (tabla en pantallas anchas y tarjetas apiladas en móvil; número, tipo «Electrocardiograma», fecha y hora, «Cargado» y quién lo cargó) y `pagination.tsx` («Anterior», «Siguiente» y «Página X de Y»). Reutilizan `FormField`, `SubmitButton`, `FormMessage` y `button-styles`; colores solo con los tokens semánticos de `globals.css`; claro y oscuro; foco visible; controles táctiles de al menos 44 px; sin lenguaje de diagnóstico (FR-019). Hace pasar la parte de lista de T044.
- [X] T054 [US1] Crear `src/app/(dashboard)/studies/page.tsx` («Mis estudios»): lee la sesión dentro de `<Suspense>` con `requireClinicContext()`, resuelve que el actor sea un paciente y muestra el formulario y la lista con `?page=N`. Agregar el vínculo «Mis estudios» en `src/app/(dashboard)/_components/clinic-header.tsx` y en el inicio (`page.tsx`) solo para vínculo de paciente. Textos de la pantalla en `src/app/(dashboard)/_studies/_lib/study-messages.ts`. Si quien entra es un médico, redirige a `/patients`; si es un administrador sin rol de médico, muestra el aviso de T078.
- [ ] T055 [US1] Escribir `tests/e2e/studies-patient.spec.ts` (Playwright, con `STUDY_STORAGE=fake`, usando los helpers de T022 sobre `tests/support/e2e-database.ts` y `e2e-accounts.ts`): el paciente sube un archivo válido armado con el constructor de T018, ve el estudio 1, sube otro y ve el 2, otro paciente no los ve. Si el flujo cambió una vista, correr `npm run test:e2e`.
- [X] T056 [US1] `npm run check` sin errores; cobertura de línea de al menos 80 % en lo nuevo de esta fase.

**Checkpoint**: US1 funciona de punta a punta con el almacenamiento simulado. Punto de commit sugerido (repositorio `medicia`): `feat(studies): el paciente sube y ve sus estudios de ECG`. Si la infraestructura ya está aplicada, el responsable puede probarla contra S3 real con `STUDY_STORAGE=s3` (quickstart §3).

---

## Phase 5: User Story 2 - El médico sube y consulta estudios de sus pacientes (Priority: P1)

**Goal**: un médico ve a sus pacientes asignados, abre uno, ve sus estudios y le sube uno nuevo.

**Independent Test**: M1 ve a P1 y P2 (no a P3 ni a los de la clínica B), sube un estudio a P1 y P1 lo ve; `/patients/<id de P3>` muestra «sin acceso» sin datos; al terminar la asignación M1 deja de ver a P1.

### Tests (escribirlos primero y verificar que fallan)

- [X] T057 [P] [US2] Escribir `tests/unit/modules/studies/application/list-doctor-patients.test.ts`: solo asignaciones vigentes con pacientes `LINKED`, ordenados por nombre, paginados de a 20, con `studyCount`; un administrador sin rol de médico y un paciente reciben `FORBIDDEN`.
- [X] T058 [P] [US2] Escribir `tests/integration/study-storage/patient-directory.test.ts` contra el PostgreSQL local: el médico ve exactamente sus pacientes con asignación vigente (SC-008); no ve los de otro médico, los `PENDING`, los `REVOKED` ni los de otra clínica; una asignación terminada quita el acceso y una nueva lo devuelve; la comprobación de acceso a un `patientId` ajeno devuelve falso; con 500 pacientes asignados, una página de la lista se resuelve en menos de 200 ms (SC-007).
- [X] T059 [P] [US2] Ampliar `tests/unit/modules/studies/application/upload-study.test.ts` y `tests/unit/app/studies/upload-study-action.test.ts`: el médico sube a un paciente asignado y el estudio queda a nombre del paciente con `uploadedBy` del médico; un `patientId` sin asignación vigente, inexistente o de otra clínica se rechaza (`FORBIDDEN` o `NOT_FOUND`) sin guardar nada; un paciente que envía un `patientId` ajeno lo ve ignorado y el estudio queda a su nombre.

### Implementation

- [X] T060 [US2] Crear `src/modules/studies/infrastructure/repositories/prisma-patient-directory.ts`: listado de pacientes del médico a partir de `DoctorPatientAssignment` (`endedAt` nulo, mismo `tenantId` y `membershipId`) con `Patient.status = LINKED`, y la comprobación de acceso a un paciente en una sola consulta que incluye `tenantId`, `membershipId` y `patientId`. Hace pasar T058.
- [X] T061 [US2] Crear `src/modules/studies/application/use-cases/list-doctor-patients.ts`. Hace pasar T057.
- [X] T062 [US2] Ampliar la acción de carga (`src/app/(dashboard)/_studies/_actions/upload-study.ts`) y `upload-study.ts` del caso de uso para el actor médico: lee `patientId` del formulario solo si el actor es médico, lo valida como UUID y lo comprueba contra la asignación vigente antes de leer el archivo. Hace pasar T059. Actualizar `composition.ts`.
- [X] T063 [P] [US2] Crear `src/app/(dashboard)/_studies/_components/patients-list.tsx` (nombre y documento del paciente, cantidad de estudios, vínculo a su pantalla; tabla/tarjetas responsivas; estados vacío —«Todavía no tenés pacientes asignados»—, de carga y de error) y reutilizar `pagination.tsx`.
- [X] T064 [US2] Crear `src/app/(dashboard)/patients/page.tsx` («Mis pacientes») y `src/app/(dashboard)/patients/[patientId]/page.tsx` («Estudios de …»: formulario de carga a nombre de ese paciente y la lista de sus estudios). Un `patientId` sin acceso redirige a `/no-access` sin mostrar datos. Agregar el vínculo «Mis pacientes» al encabezado y al inicio solo para médicos. Leer la guía de Next.js sobre rutas dinámicas y `params` asíncronos antes (T002). Si quien entra es un paciente, redirige a `/studies`.
- [ ] T065 [US2] Escribir `tests/e2e/studies-doctor.spec.ts`: M1 ve a P1 y P2 y no a P3; sube un estudio a P1; P1 lo ve; M1 abre a P3 y llega a «sin acceso». `npm run check` y `npm run test:e2e` sin errores.

**Checkpoint**: US1 y US2 funcionan juntas. Punto de commit sugerido (repositorio `medicia`): `feat(studies): el médico ve a sus pacientes y carga estudios a su nombre`.

---

## Phase 6: User Story 3 - Rechazar archivos inválidos con un motivo claro (Priority: P1)

**Goal**: cada archivo defectuoso se rechaza con un mensaje claro que nombra el requisito sin repetir valores, y no deja rastro.

**Independent Test**: subir cada archivo defectuoso de `make_synthetic.py` y comprobar el código, el mensaje, la lista sin cambios, el bucket sin objetos nuevos, el número que no se consume y los registros sin datos del estudio.

### Tests (escribirlos primero y verificar que fallan)

- [ ] T066 [P] [US3] Escribir `tests/unit/app/studies/study-messages.test.ts`: cada código de [contracts/upload-npz.md](contracts/upload-npz.md) tiene un mensaje en español rioplatense que nombra el campo y la regla; ningún mensaje admite una interpolación de valores del estudio ni del nombre del archivo.
- [ ] T067 [P] [US3] Escribir `tests/unit/modules/studies/application/upload-rejections.test.ts` (o ampliar `upload-study.test.ts`): para cada defecto, el resultado trae el código correcto y no queda ningún objeto, fila ni número consumido; el siguiente estudio válido recibe el número que correspondía.
- [ ] T068 [P] [US3] Escribir `tests/unit/modules/studies/application/no-study-data-in-logs.test.ts` (SC-006): con un registrador capturado, una tanda de cargas válidas e inválidas, fallas de almacenamiento y de base, y compensaciones fallidas; ninguna línea contiene valores de la onda ni de las variables, ni el nombre del archivo, ni el mensaje original de un error externo.

### Implementation

- [ ] T069 [US3] Completar `src/app/(dashboard)/_studies/_lib/study-messages.ts` con el texto de cada código (incluidos `FILE_TOO_LARGE` del navegador y el rechazo de Next por el tope del cuerpo) y mostrarlos en `upload-form.tsx` en la región `aria-live`, con el campo y la regla, sin color como único indicador (ícono o prefijo de texto). Hace pasar T066.
- [ ] T070 [US3] Revisar `upload-study.ts`, `npz-reader.ts` y las acciones: toda ruta de error devuelve un código estable, nunca reenvía el mensaje de una excepción de `zlib`, `zod` o del SDK de AWS, y registra solo `studyId`, `tenantId` y el código. Hace pasar T067 y T068.
- [ ] T071 [P] [US3] [ML] En `medicia-ml`, crear `scripts/make_synthetic.py`: genera sin leer ningún dato de pacientes un `valido.npz` (`waveform` `(1, 2500, 12)` `float32` con latidos gaussianos repetidos y ruido, `tabular` `(7,)` con sexo 0/1 y seis variables estandarizadas plausibles) y los defectuosos de [quickstart.md](quickstart.md) §1: `sin-tabular.npz`, `forma-incorrecta.npz`, `con-nan.npz`, `sexo-2.npz`, `sin-estandarizar.npz`, `con-objetos.npz` (un campo de objetos, que NumPy guarda con `pickle`), `con-extras.npz` y `grande.npz` (más de 2 MB). Salidas fuera de los repositorios (`ensure_outside_git`, como `make_sample.py`). Prueba en `medicia-ml/tests/` que valida el contenido de cada archivo con NumPy. La guarda de CI y el gancho de `medicia-ml` ya bloquean `*.npz`.
- [ ] T072 [US3] Escribir `tests/e2e/studies-rejections.spec.ts`: con archivos armados por el constructor de T018 (no con los de `medicia-ml`), cada defecto muestra su mensaje, la lista queda igual y el siguiente estudio válido recibe el número esperado; `con-objetos` se rechaza sin ejecutar nada. `npm run check` y `npm run test:e2e` sin errores.
- [ ] T073 [US3] [Responsable] Ejecutar `make_synthetic.py` en `medicia-ml` y repetir con los archivos reales de §4 de [quickstart.md](quickstart.md) la subida de cada defecto contra la aplicación, anotando el resultado en la sección «Resultados» de la guía.

**Checkpoint**: validación cubierta de punta a punta. Punto de commit sugerido (repositorio `medicia`): `feat(studies): rechazo de archivos inválidos con mensajes sin datos del estudio`; y en `medicia-ml`: `feat: generador de archivos sintéticos para probar la carga de estudios`.

---

## Phase 7: User Story 4 - Aislamiento entre clínicas y entre pacientes (Priority: P1)

**Goal**: cada persona ve solo lo que le corresponde; nada es accesible desde otra clínica ni adivinando identificadores.

**Independent Test**: con las clínicas A y B del script de datos, ejecutar la matriz completa de intentos no permitidos y comprobar rechazo y datos intactos (quickstart §5).

### Tests (escribirlos primero y verificar que fallan)

- [ ] T074 [P] [US4] Escribir `tests/integration/study-storage/access-matrix.test.ts` contra el PostgreSQL local (obligatoria por la constitución): con dos clínicas, pacientes, médicos y un administrador, para **cada** combinación de actor y operación (listar pacientes, listar estudios de un paciente, cargar, consultar, eliminar) se comprueba el resultado permitido o el rechazo y, en los rechazos, que no cambió ninguna fila ni objeto: paciente propio contra ajeno; médico con asignación vigente, sin asignación, con asignación terminada y con asignación reiniciada; administrador sin rol de médico; administrador que también es médico; otra clínica con el `id` exacto; paciente `PENDING` y `REVOKED`; membresía `DEACTIVATED`; clínica `SUSPENDED`; un `tenantId` forzado en la entrada es ignorado.
- [ ] T075 [P] [US4] Escribir `tests/unit/app/studies/access-guards.test.ts`: cada acción y cada pantalla llaman a `requireClinicContextForAction()` o `requireClinicContext()` por su cuenta; sin sesión, sin clínica activa y vínculo no habilitado devuelven `FORBIDDEN` (acciones) o redirigen (pantallas); la pantalla de un administrador que no es médico muestra «Tu vínculo con la clínica no incluye estudios.» y ningún dato.
- [ ] T076 [P] [US4] Escribir una prueba estructural en `tests/unit/modules/studies/repository-tenant-scope.test.ts` que lea el código de `prisma-study-repository.ts` y `prisma-patient-directory.ts` y falle si alguna consulta de `studies`, `study_counters` o `patients` no incluye `tenantId` (por ejemplo, buscando `findUnique({ where: { id` sin `tenantId`).

### Implementation

- [ ] T077 [US4] Cerrar los huecos que muestren T074 a T076 en `study-access.ts`, los repositorios, los casos de uso y las acciones, sin duplicar la regla: una sola función de dominio decide y los demás la usan. Hace pasar T074 a T076.
- [ ] T078 [US4] Implementar el aviso de «sin acceso» para el administrador que no es médico en `src/app/(dashboard)/studies/page.tsx` y `patients/page.tsx` (mensaje «Tu vínculo con la clínica no incluye estudios.»), y ocultar los vínculos «Mis estudios» y «Mis pacientes» a quien no los puede usar.
- [ ] T079 [US4] Escribir las pruebas E2E de aislamiento en `tests/e2e/studies-isolation.spec.ts`: un paciente no ve estudios de otro; un médico no abre a un paciente sin asignación; el administrador ve el aviso; tras cerrar sesión se redirige a ingresar. `npm run check` y `npm run test:e2e` sin errores.
- [ ] T080 [US4] [Responsable] Repetir con cuentas reales los pasos de [quickstart.md](quickstart.md) §5 (incluida la manipulación de `patientId` y `tenantId` del formulario) y anotar el resultado.

**Checkpoint**: aislamiento comprobado por pruebas de integración. Punto de commit sugerido (repositorio `medicia`): `feat(studies): reglas de acceso por rol y pruebas de aislamiento`.

---

## Phase 8: User Story 5 - Eliminar un estudio (Priority: P2)

**Goal**: quien cargó un estudio lo elimina de verdad (registro y archivo), y se pueden detectar los archivos sin registro.

**Independent Test**: eliminar un estudio propio y comprobar que desaparece de las listas y del bucket sin versiones; que otro usuario no puede eliminarlo; que el número no se reutiliza; que `studies:reconcile` encuentra y borra un objeto sin fila.

### Tests (escribirlos primero y verificar que fallan)

- [ ] T081 [P] [US5] Escribir `tests/unit/modules/studies/application/delete-study.test.ts`: el que cargó (y conserva el acceso) elimina; otro paciente, otro médico y quien perdió la asignación reciben `FORBIDDEN`; un estudio inexistente o de otra clínica, `NOT_FOUND`; si falla el borrado del objeto se responde éxito con la advertencia de archivo pendiente y se registra la clave opaca; el punto de extensión de «análisis en curso» (función inyectada que por defecto siempre permite) puede devolver `IN_USE` y entonces no se borra nada.
- [ ] T082 [P] [US5] Escribir `tests/unit/modules/studies/application/reconcile-study-files.test.ts`: lista los objetos de `studies/`, descarta los que tienen fila y los más nuevos que `--min-age`, informa los demás y solo borra con `apply`; nunca toca un objeto con fila.
- [ ] T083 [P] [US5] Escribir `tests/integration/study-storage/delete-study.test.ts` contra el PostgreSQL local: eliminar borra la fila y no modifica el contador; el siguiente estudio del paciente no reutiliza el número; solo elimina quien cargó el estudio, también cuando la asignación terminó y cuando se reinició; los estudios de otros pacientes y clínicas no cambian.
- [ ] T084 [P] [US5] Escribir `tests/unit/app/studies/delete-study-action.test.ts` y `delete-study-dialog.test.tsx`: la acción valida el UUID, recupera la clave del estudio de la base y nunca del formulario; el botón «Eliminar» aparece solo en los estudios que cargó quien mira; el diálogo (`<dialog>` nativo) atrapa el foco, se cierra con Escape sin borrar nada y dice «Se borrará el estudio N y su archivo. No se puede deshacer.»

### Implementation

- [ ] T085 [US5] Crear `src/modules/studies/application/use-cases/delete-study.ts` con la regla de R6 (verificar, borrar la fila en una transacción, borrar el objeto, advertir si falla) y una función inyectada `canDeleteStudy` (por defecto siempre permite) que la 008 reemplazará; no es un puerto ni una jerarquía. Ampliar `prisma-study-repository.ts` con el borrado por `tenantId` e `id`. Hace pasar T081 y T083.
- [ ] T086 [US5] Crear `src/modules/studies/application/use-cases/reconcile-study-files.ts` y `scripts/reconcile-study-files.ts`: informa por defecto, `--apply` borra, `--min-age <minutos>` (por defecto 60). Se ejecuta con `node --env-file=.env.local scripts/reconcile-study-files.ts` (misma convención que T024) y se agrega `"studies:reconcile"` a `package.json`. Hace pasar T082. Usa la clave de la aplicación; no se ejecuta contra S3 sin `STUDY_STORAGE=s3` explícito.
- [ ] T087 [US5] Crear la acción `src/app/(dashboard)/_studies/_actions/delete-study.ts` y el componente `delete-study-dialog.tsx`; integrarlo en `studies-list.tsx` para mostrar «Eliminar» solo donde `uploadedBy` es quien mira. `revalidatePath` tras el éxito. Hace pasar T084.
- [ ] T088 [US5] Escribir `tests/e2e/studies-delete.spec.ts`: el paciente elimina un estudio propio con confirmación y desaparece; cancelar con Escape no borra; el estudio que cargó el médico no tiene botón; el siguiente estudio no reutiliza el número. `npm run check` y `npm run test:e2e` sin errores.
- [ ] T089 [US5] [Responsable] Con `STUDY_STORAGE=s3` (infraestructura aplicada), ejecutar [quickstart.md](quickstart.md) §7 y §8: eliminar un estudio y comprobar con `aws s3api list-object-versions` que no queda ninguna versión; subir un objeto huérfano a mano, correr `npm run studies:reconcile` (informa) y `-- --apply --min-age 0` (borra). Anotar el resultado.

**Checkpoint**: las cinco historias funcionan. Punto de commit sugerido (repositorio `medicia`): `feat(studies): eliminación de estudios y conciliación de archivos huérfanos`.

---

## Phase 9: Polish y cierre

**Purpose**: cerrar los rangos con datos reales agregados, actualizar la documentación del proyecto, revisar y verificar de punta a punta.

- [ ] T090 [P] [ML] En `medicia-ml`, crear `scripts/report_ranges.py`: imprime **solo agregados** (mínimo, máximo y percentiles 0,1 y 99,9) de cada una de las siete variables tabulares y de la onda, para las particiones de entrenamiento, validación y prueba, sin escribir ningún dato de pacientes a disco ni imprimir filas. Reutiliza `common.py` y `ensure_outside_git`. Prueba con datos sintéticos en `medicia-ml/tests/`. El agente nunca abre los archivos del conjunto.
- [ ] T091 [Responsable] Ejecutar `report_ranges.py` en su máquina con `--data-dir` y pegar al agente la salida agregada.
- [ ] T092 Con esa salida, fijar los límites finales en `src/modules/studies/domain/ecg-study.ts`, dejando un margen de al menos el doble sobre el valor extremo observado (de modo que cualquier estudio del conjunto se acepte, supuesto del spec); actualizar el contrato [contracts/upload-npz.md](contracts/upload-npz.md), [research.md](research.md) R4 y las pruebas de T010. Hasta que esta tarea se cierre, los límites ±100 y ±20 son provisionales y la validación no se da por terminada.
- [ ] T093 [P] Actualizar `memory/architecture.md` (estudios con paciente, almacenamiento en S3 en formato `ecg1`, módulo `studies`, reglas de acceso por rol) y `memory/project-structure.md` (`infra/modules/study-storage/`, `src/modules/studies/`, rutas `/studies` y `/patients`, `scripts/`), sin contradecir la constitución. Marcar en `memory/platform-context.md` solo lo que cambie el alcance del producto.
- [ ] T094 [P] Documentar las variables de entorno nuevas (`STUDY_STORAGE`, `STUDIES_BUCKET`, `AWS_REGION`) en `.env.example`. Si la herramienta no permite editarlo, dejar escrito en el informe el bloque exacto que el responsable debe agregar.
- [ ] T095 [P] Revisar que el resto del repositorio no quedó inconsistente: `README.md` raíz (si lista funcionalidades), `AGENTS.md` (si menciona estructura) y `specs/005-echonext-mini-sagemaker/contracts/inference-api.md` (referencia al adaptador de la 006, que ahora será de la 008): ajustar las referencias a "006" que en realidad son de la 008.
- [ ] T096 [P] Escribir `tests/e2e/studies-responsive.spec.ts` (Playwright): las tres pantallas (`/studies`, `/patients`, `/patients/[patientId]`) en esquema de color claro y oscuro (`colorScheme`) y en anchos de 375, 768 y 1280 px. Comprobar: sin desplazamiento horizontal de la página; la lista pasa de tarjetas a tabla; la carga y la eliminación se completan solo con teclado (tabulación hasta el campo de archivo, el botón de subir y «Eliminar»; Escape cierra el diálogo y devuelve el foco); el foco es visible; los estados («Cargado», los errores) tienen texto además de color. Cubre FR-018 y el principio VII de la constitución. Correr `npm run test:e2e`.
- [ ] T097 Ejecutar la revisión con la skill `review-changes` (arquitectura, seguridad, interfaz e infraestructura, que corresponden por los archivos tocados); corregir los hallazgos bloqueantes dentro del alcance, volver a correr `npm run check` y repetir una sola vez el revisor afectado. Informar lo que quede pendiente.
- [ ] T098 `npm run check` y `npm run test:e2e` sin errores; `terraform test` en todos los módulos y raíces; cobertura de al menos 80 % **por archivo** en `src/modules/studies/` y `src/infrastructure/aws/s3/` (`src/app/` no se mide: por eso las acciones y los componentes no llevan lógica de negocio).
- [ ] T099 [Responsable] Ejecutar la guía [quickstart.md](quickstart.md) completa contra el entorno real (S3 y base de desarrollo) y completar la sección «Resultados» con fechas y observaciones. Confirmar que `terraform plan` del entorno da `No changes`.
- [ ] T100 Dejar anotado en `specs/006-carga-estudios-ecg/research.md` (sección nueva «Resultados de la implementación», como R13 de la 005) lo implementado, los resultados de la revisión y los pendientes antes de datos reales: registro de accesos de S3, conservación y eliminación, auditoría de consultas, limitación de frecuencia de cargas, rol del servidor en lugar del usuario de la aplicación, registrar pacientes y asignar médicos desde la interfaz.

**Checkpoint final**: punto de commit sugerido (repositorios `medicia` y `medicia-ml`): `docs(studies): cierre de la carga de estudios de ECG y guía de verificación`.

---

## Dependencies & Execution Order

### Orden de fases

- **Setup (Fase 1)**: sin dependencias.
- **Fundacional (Fase 2)**: depende de Setup y **bloquea** todas las historias. T007 y T009 son del responsable; las pruebas de dominio y del lector avanzan sin esperar a la migración, pero el repositorio de Prisma y el script de datos de prueba necesitan T009.
- **Infraestructura (Fase 3)**: depende de leer las guías (T003) y de nada del código; avanza en paralelo con las Fases 2 y 4 a 8. Solo bloquea las verificaciones contra S3 real (T039, T089, T099). T037 y T038 son del responsable.
- **US1 (Fase 4)**: depende de la Fase 2. Es el MVP.
- **US2 (Fase 5)**: depende de US1 (reutiliza la acción, la lista y la composición).
- **US3 (Fase 6)**: depende de US1 para la interfaz de errores; las pruebas del dominio y del lector ya existen desde la Fase 2.
- **US4 (Fase 7)**: depende de US1 y US2 (necesita ambos actores); T074 puede escribirse antes y fallar hasta que el resto exista.
- **US5 (Fase 8)**: depende de US1 y US4 (reglas de acceso cerradas).
- **Pulido (Fase 9)**: depende de las fases anteriores. T090 puede hacerse en cualquier momento después de T071.

### Dependencias entre tareas relevantes

- T010–T012 (pruebas) antes de T014–T016. T018 antes de T019, y T019 antes de T020.
- T006 → T007 → T008 → T009 → T042, T047, T058, T060, T074, T083.
- T030 → T031 → T032; T033 → T036 → T037 (administrador) → T038 (apply) → T039.
- T045–T050 antes de T052; T051 antes de la verificación de archivos de más de 1 MB.
- T092 depende de T091, que depende de T090.
- T022 antes de T055, T065, T079 y T088 (las pruebas E2E necesitan sus helpers).
- T096 después de US5: necesita las tres pantallas y el diálogo de eliminación.
- T097 (revisión) va después de que todo el código esté escrito.

### Oportunidades de paralelismo

- Fase 1: T003 y T004 en paralelo.
- Fase 2: T010, T011, T012 (pruebas), T017, T018, T021 y T023 en paralelo (archivos distintos).
- Fase 3: T026 a T029 (pruebas) y T034 y T035 (CI y documentación) en paralelo.
- Cada historia: sus tareas de pruebas marcadas [P] en paralelo, antes de la implementación.
- US2 y la infraestructura pueden avanzar a la vez si hay más de una persona.

### Ejemplo de paralelismo en US1

```text
Tests en paralelo (T040, T041, T042, T043, T044)
Luego: T045, T046 → T047 → T048 en paralelo con T049 → T050 → T051 → T052 → T053 (en paralelo con T052) → T054 → T055
```

---

## Implementation Strategy

### MVP primero (solo US1)

1. Setup y Fundacional (sin esperar a la infraestructura).
2. US1 con `STUDY_STORAGE=fake`: un paciente sube y ve sus estudios.
3. **Parar y validar**: quickstart §3 con datos sintéticos. Es demostrable sin AWS.
4. Aplicar la infraestructura (Fase 3) y repetir la validación contra S3 real.

### Entrega incremental

1. Fundacional + Infraestructura → base lista.
2. US1 → el paciente carga y ve (MVP).
3. US2 → el médico trabaja con sus pacientes.
4. US3 → rechazos con mensajes claros.
5. US4 → aislamiento comprobado por pruebas.
6. US5 → eliminación y conciliación.
7. Pulido → rangos finales, documentación y revisión.

Cada fase termina en un commit que deja el proyecto compilando y con sus pruebas en verde.

### Notas

- Si cambia el modelo de datos durante la implementación, actualizar [data-model.md](data-model.md) y los contratos en la misma fase.
- No se ejecuta ningún comando reservado: el agente se detiene en cada tarea [Responsable] o [Administrador] y da el comando exacto.
- Los límites de validación (±100 y ±20) son provisionales hasta cerrar T092.
- La 008 (análisis) y la 007 (visor) reutilizan las reglas de acceso de `study-access.ts`: no duplicarlas.
