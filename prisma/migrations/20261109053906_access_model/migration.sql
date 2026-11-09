-- CreateEnum
CREATE TYPE "tenant_status" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "membership_status" AS ENUM ('ACTIVE', 'DEACTIVATED');

-- CreateEnum
CREATE TYPE "patient_status" AS ENUM ('PENDING', 'LINKED', 'REVOKED');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('DNI', 'PASSPORT', 'OTHER');

-- CreateTable
CREATE TABLE "tenants" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "tenant_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "cognito_sub" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "is_platform_admin" BOOLEAN NOT NULL DEFAULT false,
    "sessions_valid_from" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_memberships" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "is_clinic_admin" BOOLEAN NOT NULL DEFAULT false,
    "is_doctor" BOOLEAN NOT NULL DEFAULT false,
    "specialty" TEXT,
    "license_number" TEXT,
    "status" "membership_status" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "staff_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "user_id" UUID,
    "document_type" "document_type" NOT NULL,
    "document_number" TEXT NOT NULL,
    "full_name" TEXT,
    "status" "patient_status" NOT NULL DEFAULT 'PENDING',
    "linked_at" TIMESTAMPTZ(3),
    "revoked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doctor_patient_assignments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "membership_id" UUID NOT NULL,
    "patient_id" UUID NOT NULL,
    "created_by_user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "ended_by_user_id" UUID,

    CONSTRAINT "doctor_patient_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_sub_key" ON "users"("cognito_sub");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "staff_memberships_user_id_idx" ON "staff_memberships"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_tenant_id_user_id_key" ON "staff_memberships"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_tenant_id_license_number_key" ON "staff_memberships"("tenant_id", "license_number");

-- CreateIndex
CREATE UNIQUE INDEX "staff_memberships_tenant_id_id_key" ON "staff_memberships"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "patients_user_id_idx" ON "patients"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenant_id_document_type_document_number_key" ON "patients"("tenant_id", "document_type", "document_number");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenant_id_user_id_key" ON "patients"("tenant_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "patients_tenant_id_id_key" ON "patients"("tenant_id", "id");

-- CreateIndex
CREATE INDEX "doctor_patient_assignments_tenant_id_membership_id_patient__idx" ON "doctor_patient_assignments"("tenant_id", "membership_id", "patient_id", "created_at");

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patients" ADD CONSTRAINT "patients_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_tenant_id_membership_id_fkey" FOREIGN KEY ("tenant_id", "membership_id") REFERENCES "staff_memberships"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_tenant_id_patient_id_fkey" FOREIGN KEY ("tenant_id", "patient_id") REFERENCES "patients"("tenant_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_ended_by_user_id_fkey" FOREIGN KEY ("ended_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================================
-- Restricciones que Prisma no puede declarar en el schema.
-- Diseño: specs/001-modelo-datos-acceso/data-model.md
-- ============================================================================

-- tenants y users: textos obligatorios no vacíos y correo en minúsculas
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_name_not_blank"
    CHECK (btrim("name") <> '');

ALTER TABLE "users" ADD CONSTRAINT "users_full_name_not_blank"
    CHECK (btrim("full_name") <> '');

ALTER TABLE "users" ADD CONSTRAINT "users_email_lowercase"
    CHECK ("email" = lower("email"));

-- staff_memberships: al menos un rol, y los datos de médico solo si es médico
ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_has_role"
    CHECK ("is_clinic_admin" OR "is_doctor");

ALTER TABLE "staff_memberships" ADD CONSTRAINT "staff_memberships_doctor_fields"
    CHECK (
        ("is_doctor"
            AND "specialty" IS NOT NULL AND btrim("specialty") <> ''
            AND "license_number" IS NOT NULL AND btrim("license_number") <> '')
        OR (NOT "is_doctor" AND "specialty" IS NULL AND "license_number" IS NULL)
    );

-- patients: los campos obligatorios dependen del estado del vínculo
ALTER TABLE "patients" ADD CONSTRAINT "patients_document_number_not_blank"
    CHECK (btrim("document_number") <> '');

ALTER TABLE "patients" ADD CONSTRAINT "patients_full_name_not_blank"
    CHECK ("full_name" IS NULL OR btrim("full_name") <> '');

ALTER TABLE "patients" ADD CONSTRAINT "patients_state_fields"
    CHECK (
        ("status" = 'PENDING'
            AND "user_id" IS NULL AND "full_name" IS NULL
            AND "linked_at" IS NULL AND "revoked_at" IS NULL)
        OR ("status" = 'LINKED'
            AND "user_id" IS NOT NULL AND "full_name" IS NOT NULL
            AND "linked_at" IS NOT NULL AND "revoked_at" IS NULL)
        OR ("status" = 'REVOKED'
            AND "user_id" IS NOT NULL AND "full_name" IS NOT NULL
            AND "linked_at" IS NOT NULL AND "revoked_at" IS NOT NULL)
    );

-- doctor_patient_assignments: fin del período coherente
ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_end_fields_together"
    CHECK (("ended_at" IS NULL) = ("ended_by_user_id" IS NULL));

ALTER TABLE "doctor_patient_assignments" ADD CONSTRAINT "doctor_patient_assignments_end_after_start"
    CHECK ("ended_at" IS NULL OR "ended_at" >= "created_at");

-- A lo sumo una asignación activa por pareja de médico y paciente
CREATE UNIQUE INDEX "doctor_patient_assignments_one_active_per_pair"
    ON "doctor_patient_assignments"("membership_id", "patient_id")
    WHERE "ended_at" IS NULL;

-- Consultas habituales sobre asignaciones activas
CREATE INDEX "doctor_patient_assignments_active_by_membership"
    ON "doctor_patient_assignments"("tenant_id", "membership_id")
    WHERE "ended_at" IS NULL;

CREATE INDEX "doctor_patient_assignments_active_by_patient"
    ON "doctor_patient_assignments"("tenant_id", "patient_id")
    WHERE "ended_at" IS NULL;
