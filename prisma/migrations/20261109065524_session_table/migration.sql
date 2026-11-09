/*
  Warnings:

  - A unique constraint covering the columns `[user_id,id]` on the table `patients` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[user_id,id]` on the table `staff_memberships` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL,
    "last_activity_at" TIMESTAMPTZ(3) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "active_staff_membership_id" UUID,
    "active_patient_id" UUID,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_user_id_id_key" ON "patients"("user_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_user_id_id_key" ON "staff_memberships"("user_id", "id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_active_staff_membership_id_fkey" FOREIGN KEY ("user_id", "active_staff_membership_id") REFERENCES "staff_memberships"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_active_patient_id_fkey" FOREIGN KEY ("user_id", "active_patient_id") REFERENCES "patients"("user_id", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Restricciones manuales (Prisma no las declara): ver specs/002-ingreso-sesion/data-model.md.

-- El hash SHA-256 en hexadecimal tiene siempre 64 caracteres.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_token_hash_length"
  CHECK (char_length("token_hash") = 64);

-- El vencimiento absoluto es posterior al inicio de la sesión.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_expires_after_created"
  CHECK ("expires_at" > "created_at");

-- La última actividad no es anterior al inicio.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_activity_after_created"
  CHECK ("last_activity_at" >= "created_at");

-- Una sesión no se revoca antes de crearse.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_revoked_after_created"
  CHECK ("revoked_at" IS NULL OR "revoked_at" >= "created_at");

-- La sesión trabaja con a lo sumo un vínculo a la vez: como personal o como paciente.
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_single_active_context"
  CHECK (num_nonnulls("active_staff_membership_id", "active_patient_id") <= 1);
