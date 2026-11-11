-- CreateEnum
CREATE TYPE "invitation_kind" AS ENUM ('DOCTOR', 'PATIENT');

-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "invitation_end_reason" AS ENUM ('BY_SENDER', 'REPLACED', 'ATTEMPTS_EXCEEDED');

-- CreateTable
CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "kind" "invitation_kind" NOT NULL,
    "email" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "document_type" "document_type",
    "document_number" TEXT,
    "license_number" TEXT,
    "created_by_membership_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "assign_to_creator" BOOLEAN NOT NULL DEFAULT false,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "end_reason" "invitation_end_reason",
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked_at" TIMESTAMPTZ(3),
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by_user_id" UUID,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_created_by_membership_id_status_idx" ON "invitations"("tenant_id", "created_by_membership_id", "status");

-- CreateIndex
CREATE INDEX "invitations_tenant_id_status_created_at_idx" ON "invitations"("tenant_id", "status", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenant_id_created_by_membership_id_fkey" FOREIGN KEY ("tenant_id", "created_by_membership_id") REFERENCES "staff_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- invitations: un solo link pendiente por correo y clínica (FR-009)
CREATE UNIQUE INDEX "invitations_one_pending_per_email"
    ON "invitations"("tenant_id", "email")
    WHERE "status" = 'PENDING';

-- invitations: el correo viene normalizado (minúsculas, sin espacios en los extremos) y no vacío
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_email_lowercase"
    CHECK ("email" = lower(btrim("email")) AND btrim("email") <> '');

-- invitations: los datos del tipo de vínculo (matrícula para médico, documento para paciente)
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_kind_fields"
    CHECK (
        ("kind" = 'DOCTOR'
            AND "license_number" IS NOT NULL AND btrim("license_number") <> ''
            AND "document_type" IS NULL AND "document_number" IS NULL)
        OR ("kind" = 'PATIENT'
            AND "document_type" IS NOT NULL
            AND "document_number" IS NOT NULL AND btrim("document_number") <> ''
            AND "license_number" IS NULL)
    );

-- invitations: solo un link de paciente puede asignar a quien lo generó
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_assign_only_patient"
    CHECK (NOT "assign_to_creator" OR "kind" = 'PATIENT');

-- invitations: los campos de aceptación y de revocación dependen del estado
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_status_fields"
    CHECK (
        ("status" = 'PENDING'
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
        OR ("status" = 'ACCEPTED'
            AND "accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
        OR ("status" = 'REVOKED'
            AND "revoked_at" IS NOT NULL AND "end_reason" IS NOT NULL
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL)
        OR ("status" = 'EXPIRED'
            AND "accepted_at" IS NULL AND "accepted_by_user_id" IS NULL
            AND "revoked_at" IS NULL AND "end_reason" IS NULL)
    );

-- invitations: intentos incorrectos de 0 a 5
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_attempts_range"
    CHECK ("failed_attempts" BETWEEN 0 AND 5);

-- invitations: el vencimiento es posterior a la creación
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_expiry_after_creation"
    CHECK ("expires_at" > "created_at");

-- invitations: el envío del correo es posterior a la creación
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_sent_after_creation"
    CHECK ("sent_at" IS NULL OR "sent_at" >= "created_at");
