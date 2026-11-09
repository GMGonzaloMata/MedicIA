# Investigación técnica: Modelo de datos de acceso multi-clínica

**Funcionalidad**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Fecha**: 2026-11-09

Cada decisión indica qué se eligió, por qué y qué alternativas se descartaron. No quedan marcadores `NEEDS CLARIFICATION`.

## R1. Versión y configuración de Prisma

- **Decisión:** fijar Prisma `7.10.1`, la última versión estable según el registro de npm al 2026-11-09 (la etiqueta `latest` apunta a `8.0.0-rc.33`, una candidata). En esa línea:
  - La conexión a la base se configura en `prisma.config.ts`, no en `schema.prisma`.
  - PostgreSQL requiere el adaptador `@prisma/adapter-pg` junto con el driver `pg`.
  - El generador es `prisma-client` con una carpeta de salida explícita; el cliente ya no se genera dentro de `node_modules`.
- **Carpeta de salida del cliente:** `generated/prisma/` en la raíz del repositorio, ignorada por git y por ESLint. Se ubica fuera de `src/` para que el código generado no entre en la medición de cobertura por archivo de `vitest.config.mts`, que exige 80 % en `src/infrastructure/`.
- **Razón:** es la configuración que usa la versión actual y evita depender de comportamientos retirados.
- **Por qué no la 8:** Prisma 8 está en candidatas (`8.0.0-rc.33`), con cambios incompatibles en la configuración y en la forma de consultar. El modelo que sostiene el aislamiento entre clínicas no es un buen lugar para estrenar una candidata. La 7 sigue recibiendo correcciones y parches de seguridad durante 18 meses desde que la 8 sea estable. Se revisa la migración a la 8 cuando salga como versión final.
- **Ventaja que se cede:** Prisma 8 declara índices parciales en el propio schema, lo que eliminaría el riesgo de R2. Con la 7 ese riesgo se mantiene y está cubierto por pruebas y por una alternativa.
- **Confirmado contra la documentación (T005):**
  - Prisma 7 no carga las variables de entorno por sí solo: `prisma.config.ts` usa `dotenv` con la ruta explícita de `.env.local`.
  - La URL de la base va en `prisma.config.ts` (`datasource.url`), no en el schema, que solo declara el `provider`.
  - `prisma generate` falla si `DATABASE_URL` no está definida, aunque no se conecte. El CI la define (T007).
  - El adaptador se crea con `new PrismaPg({ connectionString })` y se pasa al cliente.
  - La versión instalada es `7.10.1`, con el compilador de consultas habilitado. La sintaxis `uuid(7)` del schema es válida (`prisma validate`).
- **Verificado tras T018:** el cliente generado compila con el `target` ES2017 de `tsconfig.json`; `npm run typecheck` pasa sin cambios en la configuración de TypeScript.
- **Puerto de la base local:** el contenedor se publica en el puerto 5433 porque un PostgreSQL instalado en Windows ocupaba el 5432 y las conexiones llegaban al servidor equivocado (error `P1000` de autenticación).
- **Fuentes:** [referencia del archivo de configuración](https://www.prisma.io/docs/orm/v7/reference/prisma-config-reference), [guía de PostgreSQL](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql) y [guía de actualización a Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7).
- **Alternativa descartada:** el generador anterior `prisma-client-js`. Está en retirada y generaba el cliente dentro de `node_modules`.
- **Fuentes consultadas:** [guía oficial de PostgreSQL](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql) y [agregar Prisma a un proyecto existente](https://www.prisma.io/docs/v7/prisma-orm/add-to-existing-project/postgresql).

## R2. Dónde se hace cumplir cada regla

La spec exige que el propio modelo rechace las violaciones (FR-005, FR-027). Se combinan tres mecanismos:

- **En el schema de Prisma:** tablas, columnas, enumeraciones, claves foráneas (incluidas las compuestas), unicidades simples y compuestas, e índices comunes.
- **En el SQL de la migración, a mano:** restricciones `CHECK` e índices únicos parciales, que Prisma no puede declarar.
- **En la aplicación (fuera de este paso):** las reglas que cruzan entidades o dependen de un flujo, listadas en los supuestos de la spec.

**Resultado de la verificación (T019, Prisma 7.10.1):** una segunda migración generada con `--create-only` salió vacía. Prisma no propone eliminar los `CHECK` ni los índices parciales escritos a mano, así que la alternativa de la columna marcadora no hace falta por ahora. Las pruebas de integración siguen siendo la red de seguridad si una versión futura cambia ese comportamiento.

**Riesgo conocido y mitigación:** Prisma puede tratar los índices parciales escritos a mano como diferencias respecto del schema y proponer eliminarlos en la próxima migración. Las restricciones `CHECK` no suelen verse afectadas. Por eso:
- La primera tarea de implementación comprueba cómo se comporta la versión instalada con una segunda migración vacía.
- Cada restricción manual tiene su prueba de integración (SC-006), de modo que una eliminación accidental hace fallar la verificación.
- Si el índice parcial no es viable, la alternativa es una columna marcadora que valga una constante mientras la asignación esté activa y sea nula al terminar. Una unicidad común sobre la pareja y esa columna logra lo mismo, porque los nulos no chocan entre sí.

## R3. Aislamiento entre clínicas dentro de la base

- **Decisión:** `tenantId` obligatorio en membresías, pacientes y asignaciones. Membresías y pacientes declaran una unicidad compuesta `(tenantId, id)` que sirve de destino a las claves foráneas compuestas de las asignaciones: `(tenantId, membershipId)` y `(tenantId, patientId)`. Así la base rechaza una asignación entre clínicas distintas aunque la aplicación se equivoque (FR-005).
- **Razón:** una clave foránea simple a `id` no impide el cruce, porque ambos `id` existen. La clave compuesta sí.
- **Alternativas descartadas:**
  - Un disparador (trigger) que compare clínicas: es más código a mantener y más difícil de probar que una clave foránea.
  - Seguridad por fila (RLS): la spec la deja fuera de este paso. La constitución la permite como defensa adicional.
- **Límite que se acepta:** la base no puede verificar que la membresía de una asignación tenga el rol de médico ni que el paciente esté vinculado. Esas reglas están en los supuestos de la spec como reglas de flujo.

## R4. Correo único sin distinguir mayúsculas

- **Decisión:** `email` único y con una restricción `CHECK (email = lower(email))`. La aplicación lo normaliza a minúsculas antes de guardar, y la base rechaza cualquier valor que no lo esté.
- **Razón:** se expresa con herramientas estándar, mantiene `findUnique` en Prisma y no requiere extensiones.
- **Efecto sobre la spec:** el escenario "dos cuentas con el mismo correo escrito con distintas mayúsculas, la segunda se rechaza" se cumple. Además, la base rechaza guardar un correo con mayúsculas aunque sea el primero, lo cual es una garantía más estricta y coherente con "el modelo considera iguales ambos valores".
- **Alternativas descartadas:**
  - Extensión `citext`: agrega una dependencia de base y cambia el tipo de columna.
  - Índice único sobre `lower(email)`: permite guardar el original con mayúsculas, pero obliga a consultas que no usan el índice normal y no es expresable en el schema.

## R5. Roles de la membresía

- **Decisión:** dos indicadores booleanos, `isClinicAdmin` e `isDoctor`, con `CHECK` de que al menos uno sea verdadero. Si `isDoctor` es verdadero, `specialty` y `licenseNumber` son obligatorias. Si es falso, deben ser nulas.
- **Razón:** una sola membresía representa a quien administra y atiende (clarificación 1). Los booleanos son simples de consultar e indexar.
- **Alternativas descartadas:**
  - Arreglo de roles (`StaffRole[]`): válido en PostgreSQL, pero complica las restricciones y las consultas por rol.
  - Dos filas por persona, una por rol: duplica el estado de activación y obliga a una unicidad por rol.

## R6. Matrícula, documento y nulos

- **Decisión:** `(tenantId, licenseNumber)` único. En PostgreSQL los valores nulos no chocan entre sí, de modo que los administradores sin matrícula conviven sin problema, tal como pide la spec (FR-013). Lo mismo aplica a `(tenantId, userId)` en pacientes: varios pacientes pendientes sin cuenta no chocan.
- **Documento:** `(tenantId, documentType, documentNumber)` único, con `DocumentType` como enumeración (`DNI`, `PASSPORT`, `OTHER`).

## R7. Estados del paciente

- **Decisión:** el estado determina qué campos deben estar presentes, y la base lo verifica con `CHECK`:
  - `PENDING`: sin cuenta, sin nombre, sin fechas de vinculación ni de revocación.
  - `LINKED`: con cuenta, nombre y fecha de vinculación, sin fecha de revocación.
  - `REVOKED`: con cuenta, nombre, fecha de vinculación y fecha de revocación.
- **Transiciones previstas:** `PENDING → LINKED → REVOKED → LINKED`. Revincular reutiliza el mismo registro (FR-019) y limpia la fecha de revocación.
- **Limitación aceptada:** al revincular se pierde la fecha de la revocación anterior. Es el mismo tipo de historial que se resolvió en las asignaciones; queda para el registro de auditoría posterior. Se informó al responsable en la clarificación.

## R8. Asignaciones con historial

- **Decisión:** una fila por período (clarificación 2). Unicidad parcial sobre `(membershipId, patientId)` donde `endedAt` es nulo, para impedir dos asignaciones activas de la misma pareja. `CHECK` de que `endedAt` y `endedByUserId` estén ambos presentes o ambos ausentes, y de que `endedAt` no sea anterior a `createdAt`.
- **Reloj coherente (hallazgo de las pruebas):** `createdAt` toma por defecto la hora de la base (`CURRENT_TIMESTAMP`). Si la aplicación termina una asignación con su propio reloj, un desfase de milisegundos entre ambos puede violar `ended_at >= created_at`. Los casos de uso que creen y terminen asignaciones deben fijar `createdAt` y `endedAt` con el mismo reloj (el de la aplicación) en lugar de depender del valor por defecto de la base.
- **Sin `updatedAt`:** la fila solo cambia al terminar, y ese momento ya queda en `endedAt`. Un campo adicional no aportaría información (FR-026 lo pide solo si la entidad puede modificarse de otra forma).

## R9. Borrado y estados

- **Decisión:** todas las claves foráneas usan `onDelete: Restrict`. No hay borrado en cascada en ningún lugar (FR-003, FR-025). Los cambios de estado reemplazan al borrado.

## R10. Identificadores y fechas

- **Decisión:** identificadores UUID generados por la aplicación, preferentemente ordenables por tiempo (`uuid(7)`) si la versión instalada lo admite; si no, `uuid(4)`. Fechas `timestamptz` con `createdAt` y, donde corresponde, `updatedAt`.
- **Razón:** los UUID no son adivinables ni secuenciales, y los ordenables por tiempo mejoran la localidad de los índices.

## R11. Pruebas de las reglas

- **Decisión:** pruebas de integración en `tests/integration/` contra un PostgreSQL real, usando el proyecto `integration` que ya existe en `vitest.config.mts`. Cada regla se verifica intentando violarla y comprobando el error. Se cubren también los casos válidos que deben aceptarse (mismo documento en dos clínicas, administradores sin matrícula).
- **Una sola base local:** hay dos entornos, producción (Amazon RDS) y una base de PostgreSQL en Docker que sirve para probar la aplicación y para las pruebas. No existe una base de desarrollo separada de la de pruebas.
- **Protección contra vaciar producción:** como las pruebas vacían las tablas, la preparación global y `resetDatabase()` se niegan a ejecutarse si `DATABASE_URL` no apunta a un servidor local (`localhost` o `127.0.0.1`). Es un resguardo contra apuntar por error a producción.
- **Base de pruebas:** PostgreSQL con Docker Compose en local y como servicio en CI. Hoy el job `check` de `.github/workflows/ci.yml` no tiene base de datos.
- **Comandos reservados:** la preparación de las pruebas **no ejecuta ningún comando de Prisma**. Espera que el responsable haya aplicado las migraciones a la base de Docker, y si no, falla con un mensaje claro que indica el comando a correr. Así `npm run check` no puede disparar de forma indirecta un comando que el proyecto reserva.
- **Cliente generado:** como `postinstall` ejecutaría `prisma generate` cuando un agente haga `npm install`, no se agrega ese script. El responsable genera el cliente después de cada cambio de schema, y CI lo hace de forma explícita.
- **Alternativas descartadas:**
  - SQLite o una base en memoria: no replican las restricciones parciales ni los `CHECK` de PostgreSQL.
  - Pruebas con una base simulada: no verifican nada del modelo.

## R12. Código de la aplicación en este paso

- **Decisión:** solo se agrega un archivo de aplicación, el cliente compartido de Prisma en `src/infrastructure/database/`, con una instancia por proceso, como exige la constitución. No hay dominio, casos de uso, repositorios ni rutas en este paso.
- **Razón:** el alcance de la spec es el modelo. Los repositorios se escriben junto con las funcionalidades que los usan.

## Aprobaciones pendientes del responsable del proyecto

1. **Dependencias nuevas:** `prisma`, `@prisma/client`, `@prisma/adapter-pg` y `pg`.
2. **Entorno:** `docker-compose.yml` para PostgreSQL, servicio de PostgreSQL en el job `check` de CI, `.env.example`, y ajustes en `.gitignore` y `eslint.config.mjs` por la carpeta del cliente generado.
3. **Configuración de pruebas:** un archivo de preparación para el proyecto `integration` de `vitest.config.mts`.
