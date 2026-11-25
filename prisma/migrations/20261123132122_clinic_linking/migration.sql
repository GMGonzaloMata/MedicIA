-- CreateEnum
CREATE TYPE "invitation_status" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "patient_code_status" AS ENUM ('ACTIVE', 'USED', 'REPLACED', 'LOCKED');

-- AlterTable
ALTER TABLE "staff_memberships" ADD COLUMN     "deactivated_at" TIMESTAMPTZ(3),
ADD COLUMN     "deactivated_by_user_id" UUID;

-- CreateTable
CREATE TABLE "staff_invitations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "is_clinic_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_doctor" BOOLEAN NOT NULL DEFAULT false,
    "token_hash" TEXT NOT NULL,
    "status" "invitation_status" NOT NULL DEFAULT 'PENDING',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted_at" TIMESTAMPTZ(3),
    "accepted_by_user_id" UUID,
    "revoked_at" TIMESTAMPTZ(3),
    "revoked_by_user_id" UUID,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_link_codes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "status" "patient_code_status" NOT NULL DEFAULT 'ACTIVE',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "patient_link_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_link_attempts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "attempted_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patient_link_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "staff_invitations_token_hash_key" ON "staff_invitations"("token_hash");

-- CreateIndex
CREATE INDEX "staff_invitations_tenant_id_status_created_at_idx" ON "staff_invitations"("tenant_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "patient_link_codes_code_hash_idx" ON "patient_link_codes"("code_hash");

-- CreateIndex
CREATE INDEX "patient_link_codes_patient_id_idx" ON "patient_link_codes"("patient_id");

-- CreateIndex
CREATE INDEX "patient_link_attempts_user_id_attempted_at_idx" ON "patient_link_attempts"("user_id", "attempted_at");

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_deactivated_by_user_id_fkey" FOREIGN KEY ("deactivated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_accepted_by_user_id_fkey" FOREIGN KEY ("accepted_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_revoked_by_user_id_fkey" FOREIGN KEY ("revoked_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patient_link_attempts" ADD CONSTRAINT "patient_link_attempts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
