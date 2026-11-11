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
