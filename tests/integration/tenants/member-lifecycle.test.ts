import { beforeEach, describe, expect, it } from "vitest";

import { createAssignPatient } from "@/modules/tenants/application/use-cases/assign-patient";
import { createDeactivateMember } from "@/modules/tenants/application/use-cases/deactivate-member";
import { createEndAssignment } from "@/modules/tenants/application/use-cases/end-assignment";
import { createGetAttendingDoctorAvailability } from "@/modules/tenants/application/use-cases/get-attending-doctor-availability";
import { createReactivateMember } from "@/modules/tenants/application/use-cases/reactivate-member";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { prismaAssignmentRepository } from "@/modules/tenants/infrastructure/repositories/prisma-assignment-repository";
import { prismaStaffRepository } from "@/modules/tenants/infrastructure/repositories/prisma-staff-repository";

import {
  createDoctorMembership,
  createLinkedPatient,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

const now = () => new Date();
const deactivateMember = createDeactivateMember({ staff: prismaStaffRepository, now });
const reactivateMember = createReactivateMember({ staff: prismaStaffRepository });
const assignPatient = createAssignPatient({ assignments: prismaAssignmentRepository });
const endAssignment = createEndAssignment({ assignments: prismaAssignmentRepository, now });
const availability = createGetAttendingDoctorAvailability({ assignments: prismaAssignmentRepository });

async function createClinic() {
  const tenant = await createTenant();
  const adminUser = await createUser();
  const admin = await createStaffMembership({ tenantId: tenant.id, userId: adminUser.id });
  const doctorUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const actor: ClinicAdminActor = { tenantId: tenant.id, userId: adminUser.id, membershipId: admin.id };

  return { tenant, adminUser, admin, doctor, actor };
}

async function createAssignedPatient(clinic: Awaited<ReturnType<typeof createClinic>>) {
  const patientUser = await createUser();
  const patient = await createLinkedPatient({ tenantId: clinic.tenant.id, userId: patientUser.id });
  const result = await assignPatient({ actor: clinic.actor, patientId: patient.id, membershipId: clinic.doctor.id });

  if (!result.ok) {
    throw new Error(`No se pudo asignar: ${result.code}`);
  }

  return { patient, assignmentId: result.assignmentId };
}

describe("desactivar sin dejar la clínica sin administrador", () => {
  it("guarda quién y cuándo, y la reactivación lo limpia", async () => {
    const clinic = await createClinic();

    expect(await deactivateMember({ actor: clinic.actor, membershipId: clinic.doctor.id })).toEqual({ ok: true });
    expect(await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: clinic.doctor.id } })).toMatchObject({
      status: "DEACTIVATED",
      deactivatedByUserId: clinic.adminUser.id,
    });
    expect((await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: clinic.doctor.id } })).deactivatedAt).not.toBeNull();

    expect(await reactivateMember({ actor: clinic.actor, membershipId: clinic.doctor.id })).toEqual({ ok: true });
    expect(await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: clinic.doctor.id } })).toMatchObject({
      status: "ACTIVE",
      deactivatedAt: null,
      deactivatedByUserId: null,
    });
  });

  it("rechaza desactivar al único administrador activo", async () => {
    const clinic = await createClinic();

    expect(await deactivateMember({ actor: clinic.actor, membershipId: clinic.admin.id })).toEqual({ ok: false, code: "LAST_ADMIN" });
    expect((await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: clinic.admin.id } })).status).toBe("ACTIVE");
  });

  it("dos administradores que se desactivan a la vez dejan siempre uno activo", async () => {
    // Varias vueltas: sin el bloqueo de la fila de la clínica, alguna dejaría a los dos desactivados.
    for (let round = 0; round < 8; round += 1) {
      const clinic = await createClinic();
      const secondUser = await createUser();
      const second = await createStaffMembership({ tenantId: clinic.tenant.id, userId: secondUser.id });
      const secondActor: ClinicAdminActor = { tenantId: clinic.tenant.id, userId: secondUser.id, membershipId: second.id };

      const results = await Promise.all([
        deactivateMember({ actor: clinic.actor, membershipId: second.id }),
        deactivateMember({ actor: secondActor, membershipId: clinic.admin.id }),
      ]);

      expect(results.filter((result) => result.ok)).toHaveLength(1);
      expect(
        await prismaClient.staffMembership.count({
          where: { tenantId: clinic.tenant.id, isClinicAdmin: true, status: "ACTIVE" },
        }),
      ).toBe(1);
    }
  });

  it("la base no admite un estado desactivado sin fecha ni al revés", async () => {
    const clinic = await createClinic();

    await expectRejectedBy(
      prismaClient.staffMembership.update({ where: { id: clinic.doctor.id }, data: { status: "DEACTIVATED" } }),
      "staff_memberships_deactivation_coherent",
    );
    await expectRejectedBy(
      prismaClient.staffMembership.update({ where: { id: clinic.doctor.id }, data: { deactivatedAt: new Date() } }),
      "staff_memberships_deactivation_coherent",
    );
  });
});

describe("asignaciones e historial", () => {
  it("desactivar al médico no toca la asignación y el paciente queda no disponible; reactivar lo devuelve", async () => {
    const clinic = await createClinic();
    const { patient, assignmentId } = await createAssignedPatient(clinic);

    await deactivateMember({ actor: clinic.actor, membershipId: clinic.doctor.id });

    expect((await prismaClient.doctorPatientAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).endedAt).toBeNull();
    expect(await availability({ tenantId: clinic.tenant.id, patientId: patient.id })).toBe("UNAVAILABLE");

    await reactivateMember({ actor: clinic.actor, membershipId: clinic.doctor.id });

    expect(await availability({ tenantId: clinic.tenant.id, patientId: patient.id })).toBe("AVAILABLE");
  });

  it("terminar una asignación conserva la fila con fecha y autor, y reasignar crea otra", async () => {
    const clinic = await createClinic();
    const { patient, assignmentId } = await createAssignedPatient(clinic);
    const otherUser = await createUser();
    const otherDoctor = await createDoctorMembership({ tenantId: clinic.tenant.id, userId: otherUser.id });

    expect(await endAssignment({ actor: clinic.actor, assignmentId })).toEqual({ ok: true });
    expect(await endAssignment({ actor: clinic.actor, assignmentId })).toEqual({ ok: false, code: "ALREADY_ENDED" });
    expect(await assignPatient({ actor: clinic.actor, patientId: patient.id, membershipId: otherDoctor.id })).toMatchObject({ ok: true });

    const rows = await prismaClient.doctorPatientAssignment.findMany({
      where: { patientId: patient.id },
      orderBy: { createdAt: "asc" },
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ id: assignmentId, endedByUserId: clinic.adminUser.id });
    expect(rows[0]?.endedAt).not.toBeNull();
    expect(rows[1]?.endedAt).toBeNull();
  });
});

// Requisito de la constitución: cada operación rechaza un identificador de otra clínica.
describe("aislamiento entre clínicas", () => {
  it("un administrador de otra clínica no desactiva, reactiva ni termina nada ajeno", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const { assignmentId } = await createAssignedPatient(a);

    expect(await deactivateMember({ actor: b.actor, membershipId: a.doctor.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deactivateMember({ actor: b.actor, membershipId: a.admin.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    await deactivateMember({ actor: a.actor, membershipId: a.doctor.id });
    expect(await reactivateMember({ actor: b.actor, membershipId: a.doctor.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await endAssignment({ actor: b.actor, assignmentId })).toEqual({ ok: false, code: "NOT_FOUND" });

    expect((await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: a.doctor.id } })).status).toBe("DEACTIVATED");
    expect((await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: a.admin.id } })).status).toBe("ACTIVE");
    expect((await prismaClient.doctorPatientAssignment.findUniqueOrThrow({ where: { id: assignmentId } })).endedAt).toBeNull();
  });

  it("la disponibilidad con otra clínica no revela ni cambia el resultado", async () => {
    const a = await createClinic();
    const b = await createClinic();
    const { patient } = await createAssignedPatient(a);

    expect(await availability({ tenantId: b.tenant.id, patientId: patient.id })).toBe("NO_ASSIGNMENT");
    expect(await availability({ tenantId: a.tenant.id, patientId: patient.id })).toBe("AVAILABLE");
  });
});
