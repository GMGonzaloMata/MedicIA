-- CreateEnum
CREATE TYPE "study_type" AS ENUM ('ECG');

-- CreateEnum
CREATE TYPE "study_status" AS ENUM ('UPLOADED');

-- CreateTable
CREATE TABLE "studies" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "uploaded_by_user_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "type" "study_type" NOT NULL DEFAULT 'ECG',
    "status" "study_status" NOT NULL DEFAULT 'UPLOADED',
    "storage_key" TEXT NOT NULL,
    "uploaded_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "studies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "study_counters" (
    "patient_id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL,

    CONSTRAINT "study_counters_pkey" PRIMARY KEY ("patient_id")
);

-- CreateIndex
CREATE INDEX "studies_uploaded_by_user_id_idx" ON "studies"("uploaded_by_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "studies_tenant_id_patient_id_number_key" ON "studies"("tenant_id", "patient_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "studies_tenant_id_id_key" ON "studies"("tenant_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "studies_storage_key_key" ON "studies"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "study_counters_tenant_id_patient_id_key" ON "study_counters"("tenant_id", "patient_id");

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "studies" ADD CONSTRAINT "studies_uploaded_by_user_id_fkey" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "study_counters" ADD CONSTRAINT "study_counters_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Restricciones que Prisma no declara (specs/006-carga-estudios-ecg/data-model.md).

-- El número de estudio de un paciente empieza en 1.
ALTER TABLE "studies" ADD CONSTRAINT "studies_number_positive"
  CHECK ("number" > 0);

-- El contador de un paciente solo existe una vez entregado el primer número.
ALTER TABLE "study_counters" ADD CONSTRAINT "study_counters_last_number_positive"
  CHECK ("last_number" > 0);
