-- Restricciones e índices que Prisma no declara para la funcionalidad 012 (vinculación de clínica).
-- Viven en una migración aparte porque la primera (clinic_linking) ya estaba aplicada cuando se detectó que faltaban;
-- editarla habría roto su checksum. Detalle en specs/012-vinculacion-clinica/data-model.md.

-- staff_invitations: datos del médico. Se agregan acá y no en la primera migración, que ya estaba aplicada, para
-- no romper su checksum. Siguen la misma regla que `staff_memberships_doctor_fields`.
ALTER TABLE "staff_invitations" ADD COLUMN "specialty" TEXT,
ADD COLUMN "license_number" TEXT;

-- staff_memberships: las membresías ya desactivadas antes de esta migración reciben una fecha, para que la
-- restricción de abajo se pueda agregar sin romper filas existentes. El autor queda vacío: no se conocía.
UPDATE "staff_memberships"
    SET "deactivated_at" = "updated_at"
    WHERE "status" = 'DEACTIVATED' AND "deactivated_at" IS NULL;

-- staff_memberships: desactivada exactamente cuando tiene fecha de desactivación
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_deactivation_coherent"
    CHECK (("status" = 'DEACTIVATED') = ("deactivated_at" IS NOT NULL));

-- staff_invitations: al menos un rol, correo en minúsculas y campos coherentes con el estado
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_has_role"
    CHECK ("is_clinic_admin" OR "is_doctor");

-- staff_invitations: un médico lleva especialidad y matrícula; quien no lo es, ninguna de las dos
ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_doctor_fields"
    CHECK (
        ("is_doctor"
            AND "specialty" IS NOT NULL AND btrim("specialty") <> ''
            AND "license_number" IS NOT NULL AND btrim("license_number") <> '')
        OR (NOT "is_doctor" AND "specialty" IS NULL AND "license_number" IS NULL)
    );

ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_email_lowercase"
    CHECK ("email" = lower("email"));

ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_status_fields"
    CHECK (
        ("status" <> 'ACCEPTED' OR ("accepted_at" IS NOT NULL AND "accepted_by_user_id" IS NOT NULL))
        AND ("status" <> 'REVOKED' OR "revoked_at" IS NOT NULL)
    );

-- staff_invitations: una sola invitación pendiente por correo y clínica
CREATE UNIQUE INDEX "staff_invitations_one_pending_per_email"
    ON "staff_invitations"("tenant_id", "email")
    WHERE "status" = 'PENDING';

-- patient_link_codes: un solo código activo por paciente y de 0 a 5 intentos fallidos
CREATE UNIQUE INDEX "patient_link_codes_one_active_per_patient"
    ON "patient_link_codes"("patient_id")
    WHERE "status" = 'ACTIVE';

ALTER TABLE "patient_link_codes" ADD CONSTRAINT "patient_link_codes_failed_attempts_range"
    CHECK ("failed_attempts" BETWEEN 0 AND 5);
