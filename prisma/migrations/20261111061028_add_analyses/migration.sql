-- CreateEnum
CREATE TYPE "analysis_status" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "analysis_failure_code" AS ENUM ('MODEL_UNAVAILABLE', 'INPUT_REJECTED', 'TIMEOUT', 'STUDY_FILE_UNAVAILABLE', 'INTERNAL');

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "study_id" UUID NOT NULL,
    "requested_by_user_id" UUID NOT NULL,
    "status" "analysis_status" NOT NULL DEFAULT 'PENDING',
    "failure_code" "analysis_failure_code",
    "model_name" TEXT,
    "model_version" TEXT,
    "probabilities" JSONB,
    "requested_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "analyses_tenant_id_study_id_requested_at_idx" ON "analyses"("tenant_id", "study_id", "requested_at" DESC);

-- CreateIndex
CREATE INDEX "analyses_requested_by_user_id_idx" ON "analyses"("requested_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "analyses_tenant_id_id_key" ON "analyses"("tenant_id", "id");

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_tenant_id_study_id_fkey" FOREIGN KEY ("tenant_id", "study_id") REFERENCES "studies"("tenant_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_requested_by_user_id_fkey" FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
