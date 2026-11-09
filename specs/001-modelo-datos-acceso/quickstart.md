# Guía de validación: Modelo de datos de acceso multi-clínica

**Funcionalidad**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md) | **Modelo**: [data-model.md](data-model.md)

Esta guía explica cómo preparar el entorno y cómo comprobar que el modelo cumple la spec. No contiene código de implementación.

## Requisitos previos

- Node.js 24 y dependencias instaladas con `npm ci`.
- Docker, para levantar PostgreSQL.
- Las dependencias nuevas de Prisma aprobadas por el responsable (ver [research.md](research.md#aprobaciones-pendientes-del-responsable-del-proyecto)).

## Variables de entorno

Se definen en `.env.local` (ignorado por git) y se documentan en `.env.example`.

- `DATABASE_URL`: con el `docker-compose.yml` del proyecto es `postgresql://medicia:medicia@localhost:5433/medicia` (puerto 5433, porque el 5432 suele estar ocupado por un PostgreSQL instalado en la máquina). Es la conexión a la base de PostgreSQL local de Docker, que se usa para probar la aplicación y para las pruebas de integración. La base de producción (Amazon RDS) no se configura acá: la define el servidor.

**Importante:** las pruebas de integración vacían las tablas antes de cada prueba. Los datos que cargues a mano en la base de Docker se pierden cada vez que se ejecutan. Por eso las pruebas se niegan a correr si `DATABASE_URL` no apunta a un servidor local.

## Preparar la base de datos

Estos comandos los ejecuta únicamente el responsable del proyecto desde su terminal. Los agentes no los corren.

1. Levantar PostgreSQL con Docker Compose.
2. `npx prisma migrate dev --create-only` para generar la migración a partir del schema.
3. Agregar al SQL generado las restricciones `CHECK` y el índice único parcial listados en [data-model.md](data-model.md).
4. `npx prisma migrate dev` para aplicarla a la base de Docker.
5. `npx prisma generate` para generar el cliente.

Repetir los pasos 4 y 5 después de cada cambio de schema. Las pruebas no ejecutan comandos de Prisma: si la base de Docker no tiene las migraciones aplicadas, fallan con un mensaje que indica qué comando correr.

Aplicar las migraciones a la base de producción forma parte del despliegue y queda fuera de esta funcionalidad.

## Verificaciones automatizadas

- `npm run check`: tipos, lint, pruebas con cobertura (mínimo 80 % de líneas por archivo) y build. Las pruebas de integración necesitan `DATABASE_URL` apuntando a la base de Docker.
- Si la base de Docker no está disponible, la verificación falla y debe informarse; no se omiten las pruebas de integración.

## Escenarios de validación

Cada escenario corresponde a una historia de la spec y se automatiza como prueba de integración en `tests/integration/`. Se verifica el rechazo de cada violación y la aceptación de los casos válidos.

### Historia 1: información separada por clínica

1. Crear dos clínicas con un médico y un paciente en cada una.
2. Intentar una asignación entre el médico de A y el paciente de B.
3. **Esperado:** la base la rechaza.
4. Intentar crear una membresía, un paciente y una asignación sin clínica.
5. **Esperado:** la base los rechaza.

### Historia 2: una cuenta, varias clínicas

1. Vincular una misma cuenta como paciente a dos clínicas.
2. **Esperado:** quedan dos registros independientes.
3. Intentar un segundo paciente o una segunda membresía de la cuenta en la misma clínica.
4. **Esperado:** la base lo rechaza.
5. Crear una membresía con ambos roles y otra sin ningún rol.
6. **Esperado:** la primera se acepta y la segunda se rechaza.
7. Registrar dos cuentas con el mismo correo en distintas mayúsculas.
8. **Esperado:** la base lo rechaza.

### Historia 3: identificación dentro de una clínica

1. Repetir un documento, y luego una matrícula, dentro de una clínica.
2. **Esperado:** la base los rechaza.
3. Repetirlos en otra clínica, o usar el mismo número con distinto tipo de documento.
4. **Esperado:** la base los acepta.
5. Registrar dos administradores sin matrícula en la misma clínica.
6. **Esperado:** la base los acepta.
7. Registrar un médico sin especialidad o sin matrícula.
8. **Esperado:** la base lo rechaza.

### Historia 4: asignaciones

1. Crear una asignación y luego otra activa igual.
2. **Esperado:** la segunda se rechaza.
3. Terminar la primera y asignar de nuevo la misma pareja.
4. **Esperado:** se crea una fila nueva y la anterior se conserva.
5. Consultar los pacientes de un médico y el historial de una pareja.
6. **Esperado:** la primera consulta devuelve solo las activas, la segunda todos los períodos.
7. Terminar una asignación sin indicar quién la terminó, o con una fecha de fin anterior a la de inicio.
8. **Esperado:** la base lo rechaza.

### Historia 5: estados sin pérdida de información

1. Suspender una clínica, desactivar una membresía y revocar un paciente.
2. **Esperado:** todos los registros siguen disponibles.
3. Intentar eliminar una clínica, una membresía o un paciente con registros que dependen de ellos.
4. **Esperado:** la base lo rechaza.
5. Guardar un paciente vinculado sin cuenta o sin nombre.
6. **Esperado:** la base lo rechaza.
7. Revincular un paciente revocado.
8. **Esperado:** se reutiliza su registro y la fecha de revocación queda limpia.

### Rendimiento (SC-004)

1. Cargar 100 clínicas y 10.000 pacientes en la mayor.
2. Ejecutar las consultas habituales: clínicas de una persona, pacientes de un médico y médicos de un paciente.
3. **Esperado:** cada una responde en menos de 1 segundo.

## Qué no se puede verificar en este paso

- Las reglas de flujo (rol de médico en la asignación, paciente vinculado, último administrador, un solo tipo de vínculo por clínica) no las garantiza la base. Se prueban en las funcionalidades que las implementan.
- El comportamiento de Prisma ante restricciones escritas a mano en migraciones posteriores se comprueba en la primera tarea de implementación (ver [research.md](research.md#r2-donde-se-hace-cumplir-cada-regla)).
