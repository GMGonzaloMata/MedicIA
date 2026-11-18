-- Migración aditiva: sin UPDATE/DELETE de filas históricas ni cambios de FK/índices.
-- Aplicación humana, primero sobre una DB de prueba aislada. No habilita el flujo PDF.
BEGIN;

CREATE TYPE "analysis_kind" AS ENUM ('LEGACY_ECHONEXT', 'ECG_UNIFIED_V1');

ALTER TABLE "analyses"
  ADD COLUMN "kind" "analysis_kind" NOT NULL DEFAULT 'LEGACY_ECHONEXT',
  ADD COLUMN "integrated_result" JSONB,
  ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "analyses" ADD CONSTRAINT "analyses_revision_check" CHECK ("revision" >= 0);

-- IS TRUE cierra el caso SQL UNKNOWN por claves ausentes/JSON null. La validación
-- completa de componentes/procedencia/puntuaciones sigue siendo parseUnifiedReport.
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_kind_document_check" CHECK (
  ("kind" = 'LEGACY_ECHONEXT' AND "integrated_result" IS NULL)
  OR (
    "kind" = 'ECG_UNIFIED_V1'
    AND "model_name" IS NULL AND "model_version" IS NULL AND "probabilities" IS NULL
    AND (
      jsonb_typeof("integrated_result") = 'object'
      AND "integrated_result" ->> 'schemaVersion' = 'ecg-unified.v1'
      AND "integrated_result" ->> 'analysisId' = "id"::text
      AND "integrated_result" ->> 'studyId' = "study_id"::text
      AND "integrated_result" ->> 'requestedByUserId' = "requested_by_user_id"::text
      AND jsonb_typeof("integrated_result" -> 'capabilities') = 'object'
      AND jsonb_typeof("integrated_result" -> 'components') = 'object'
    ) IS TRUE
  )
);

-- Reemplazo atómico del CHECK anterior: la rama legacy conserva literalmente
-- sus reglas, incluidas las filas FAILED anteriores. No se toca su contenido.
ALTER TABLE "analyses" DROP CONSTRAINT "analyses_status_fields_check";
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_status_fields_check" CHECK (
  ("kind" = 'LEGACY_ECHONEXT' AND (
    ("status" = 'PENDING' AND "failure_code" IS NULL AND "model_name" IS NULL AND "model_version" IS NULL AND "probabilities" IS NULL AND "started_at" IS NULL AND "finished_at" IS NULL)
    OR ("status" = 'PROCESSING' AND "failure_code" IS NULL AND "model_name" IS NULL AND "model_version" IS NULL AND "probabilities" IS NULL AND "started_at" IS NOT NULL AND "finished_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "failure_code" IS NULL AND "model_name" IS NOT NULL AND "model_version" IS NOT NULL AND "probabilities" IS NOT NULL AND "started_at" IS NOT NULL AND "finished_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "failure_code" IS NOT NULL AND "probabilities" IS NULL AND "finished_at" IS NOT NULL)
  ))
  OR ("kind" = 'ECG_UNIFIED_V1' AND (
    ("status" = 'PENDING' AND "failure_code" IS NULL AND "started_at" IS NULL AND "finished_at" IS NULL)
    OR ("status" = 'PROCESSING' AND "failure_code" IS NULL AND "started_at" IS NOT NULL AND "finished_at" IS NULL)
    OR ("status" = 'COMPLETED' AND "failure_code" IS NULL AND "started_at" IS NOT NULL AND "finished_at" IS NOT NULL)
    OR ("status" = 'FAILED' AND "failure_code" IS NOT NULL AND "finished_at" IS NOT NULL)
  ))
);

-- analyses_probabilities_object_check y analyses_model_text_check permanecen.
-- analyses_tenant_id_study_id_fkey (CASCADE) y analyses_one_in_progress permanecen.
COMMIT;
