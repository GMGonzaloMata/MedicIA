# Modelo de datos: Análisis de un estudio de ECG con EchoNext-Mini

La 008 agrega una tabla, `analyses`, y dos enums. No cambia `studies` ni el formato guardado. La migración la genera y aplica el responsable; el SQL que Prisma no modela se escribe a mano en esa migración (ver al final).

## Analysis (tabla `analyses`)

Una ejecución del modelo sobre un estudio.

- `id`: UUID v7, clave primaria.
- `tenant_id`: UUID, la clínica. Siempre igual a la del estudio (lo garantiza la clave foránea compuesta).
- `study_id`: UUID, el estudio analizado.
- `requested_by_user_id`: UUID de la cuenta que lo pidió (siempre tomada de la sesión), con clave foránea a `users` (`Restrict`).
- `status`: enum `analysis_status`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`.
- `failure_code`: enum `analysis_failure_code`, nulo salvo en `FAILED`: `MODEL_UNAVAILABLE`, `INPUT_REJECTED`, `TIMEOUT`, `STUDY_FILE_UNAVAILABLE`, `INTERNAL`.
- `model_name` y `model_version`: texto, nulos hasta completarse. Son los que informó el modelo en su respuesta.
- `probabilities`: `jsonb`, nulo hasta completarse. Objeto con las 12 claves del contrato, cada una un número entre 0 y 1.
- `requested_at`: `timestamptz(3)`, `default now()`.
- `started_at`: `timestamptz(3)`, nulo hasta que pasa a `PROCESSING`.
- `finished_at`: `timestamptz(3)`, nulo mientras está en curso.

Relaciones:
- `(tenant_id, study_id)` → `studies (tenant_id, id)` con `ON DELETE CASCADE` (eliminar el estudio elimina sus análisis).
- `requested_by_user_id` → `users (id)` con `ON DELETE RESTRICT`.
- `tenant_id` → `tenants (id)` con `ON DELETE RESTRICT`.

Índices y restricciones:
- `UNIQUE (tenant_id, id)`: destino de futuras relaciones.
- Índice de la lista: `(tenant_id, study_id, requested_at DESC)`.
- **Un solo análisis en curso por estudio**: `CREATE UNIQUE INDEX analyses_one_in_progress ON analyses (study_id) WHERE status IN ('PENDING', 'PROCESSING')`.
- `CHECK` de coherencia entre estado y campos:
  - `PENDING`: `failure_code`, `model_name`, `model_version`, `probabilities`, `started_at` y `finished_at` nulos.
  - `PROCESSING`: igual que `PENDING` pero con `started_at` no nulo.
  - `COMPLETED`: `probabilities`, `model_name`, `model_version`, `started_at` y `finished_at` no nulos; `failure_code` nulo.
  - `FAILED`: `failure_code` y `finished_at` no nulos; `probabilities` nulo (`model_name` y `model_version` pueden estar si el modelo llegó a responder).
  - `probabilities IS NULL OR jsonb_typeof(probabilities) = 'object'`.
  - `model_name` y `model_version` no vacíos cuando existen.

## Transiciones de estado

- Se inserta en `PENDING` (o directamente en `FAILED` con `STUDY_FILE_UNAVAILABLE` si el archivo del estudio no existe o está dañado; en ese caso `started_at` y `finished_at` quedan en el momento del pedido).
- `PENDING` → `PROCESSING`: lo hace la ejecución en segundo plano al empezar, con la condición `status = 'PENDING'`.
- `PROCESSING` → `COMPLETED`: con la condición `status = 'PROCESSING'`; guarda modelo, versión, probabilidades y `finished_at`.
- `PENDING` o `PROCESSING` → `FAILED`: por una falla del modelo (con su código) o porque venció (código `TIMEOUT` cuando `requested_at` supera los 2 minutos).
- `COMPLETED` y `FAILED` son finales. Cada actualización lleva `tenant_id` e `id` y la condición de estado: una ejecución tardía de un análisis ya vencido no pisa el resultado.

## Vistas de dominio

- **AnalysisSummary** (lista e historial): `id`, `status`, `failureCode`, `requestedAt`, `finishedAt`, `requestedBy` (el propio paciente o el nombre del médico) y, si está completado, `modelName` y `modelVersion`.
- **AnalysisResult** (un análisis completado): lo anterior más las 12 probabilidades como una lista ordenada `{ key, value }`.
- Ninguna vista lleva `tenant_id`, `requested_by_user_id`, la clave del archivo ni las siete variables.

## Cambios en el esquema de Prisma

- `enum AnalysisStatus` mapeado a `analysis_status` y `enum AnalysisFailureCode` mapeado a `analysis_failure_code`.
- `model Analysis` mapeado a `analyses`, con los campos de arriba, `probabilities Json?`, y las relaciones a `Study` (compuesta), `User` y `Tenant`.
- `Study` suma `analyses Analysis[]`; `User` y `Tenant` suman sus lados de la relación.
- Los nombres de campos van en inglés y los de columnas en `snake_case` con `@map`, como las demás tablas.

## SQL a mano en la migración (nota para el responsable)

Después de `prisma migrate dev --create-only --name add_analyses`, editar el archivo generado y agregar al final:

```sql
-- Un solo análisis en curso por estudio.
CREATE UNIQUE INDEX "analyses_one_in_progress" ON "analyses" ("study_id") WHERE "status" IN ('PENDING', 'PROCESSING');

-- Coherencia entre estado y campos.
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_status_fields_check" CHECK (
  ("status" = 'PENDING' AND "failure_code" IS NULL AND "model_name" IS NULL AND "model_version" IS NULL AND "probabilities" IS NULL AND "started_at" IS NULL AND "finished_at" IS NULL)
  OR ("status" = 'PROCESSING' AND "failure_code" IS NULL AND "model_name" IS NULL AND "model_version" IS NULL AND "probabilities" IS NULL AND "started_at" IS NOT NULL AND "finished_at" IS NULL)
  OR ("status" = 'COMPLETED' AND "failure_code" IS NULL AND "model_name" IS NOT NULL AND "model_version" IS NOT NULL AND "probabilities" IS NOT NULL AND "started_at" IS NOT NULL AND "finished_at" IS NOT NULL)
  OR ("status" = 'FAILED' AND "failure_code" IS NOT NULL AND "probabilities" IS NULL AND "finished_at" IS NOT NULL)
);
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_probabilities_object_check" CHECK ("probabilities" IS NULL OR jsonb_typeof("probabilities") = 'object');
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_model_text_check" CHECK (("model_name" IS NULL OR length("model_name") > 0) AND ("model_version" IS NULL OR length("model_version") > 0));
```

Después aplicar la migración y regenerar el cliente (`prisma migrate dev` y `prisma generate`). El orden exacto de comandos queda en [quickstart.md](quickstart.md) y en las tareas.
