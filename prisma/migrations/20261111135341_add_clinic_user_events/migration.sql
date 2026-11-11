-- CreateEnum
CREATE TYPE "clinic_user_action" AS ENUM ('STAFF_ENROLLED', 'PATIENT_ENROLLED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED', 'PATIENT_REVOKED', 'PATIENT_REACTIVATED', 'ASSIGNMENT_CREATED', 'ASSIGNMENT_ENDED', 'ACCESS_RESENT');

-- CreateTable
CREATE TABLE "clinic_user_events" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "action" "clinic_user_action" NOT NULL,
    "actor_user_id" UUID NOT NULL,
    "actor_membership_id" UUID NOT NULL,
    "target_membership_id" UUID,
    "target_patient_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "clinic_user_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinic_user_events_tenant_id_created_at_idx" ON "clinic_user_events"("tenant_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "clinic_user_events_tenant_id_target_membership_id_created_a_idx" ON "clinic_user_events"("tenant_id", "target_membership_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "clinic_user_events_tenant_id_target_patient_id_created_at_idx" ON "clinic_user_events"("tenant_id", "target_patient_id", "created_at" DESC);

-- AddForeignKey
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_tenant_id_actor_membership_id_fkey" FOREIGN KEY ("tenant_id", "actor_membership_id") REFERENCES "staff_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_tenant_id_target_membership_id_fkey" FOREIGN KEY ("tenant_id", "target_membership_id") REFERENCES "staff_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_tenant_id_target_patient_id_fkey" FOREIGN KEY ("tenant_id", "target_patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- clinic_user_events: todo evento apunta al menos a una persona
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_has_target"
    CHECK (num_nonnulls("target_membership_id", "target_patient_id") >= 1);

-- clinic_user_events: los destinos son coherentes con la acción
ALTER TABLE "clinic_user_events" ADD CONSTRAINT "clinic_user_events_action_targets"
    CHECK (
        ("action" IN ('STAFF_ENROLLED', 'STAFF_DEACTIVATED', 'STAFF_REACTIVATED')
            AND "target_membership_id" IS NOT NULL AND "target_patient_id" IS NULL)
        OR ("action" IN ('PATIENT_ENROLLED', 'PATIENT_REVOKED', 'PATIENT_REACTIVATED')
            AND "target_patient_id" IS NOT NULL AND "target_membership_id" IS NULL)
        OR ("action" IN ('ASSIGNMENT_CREATED', 'ASSIGNMENT_ENDED')
            AND "target_membership_id" IS NOT NULL AND "target_patient_id" IS NOT NULL)
        OR ("action" = 'ACCESS_RESENT'
            AND num_nonnulls("target_membership_id", "target_patient_id") = 1)
    );
