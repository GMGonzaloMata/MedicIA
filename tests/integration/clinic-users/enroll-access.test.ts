import { beforeEach, describe, expect, it, vi } from "vitest";

import { resolveInvitationActor } from "@/modules/users/domain/invitation-access";

import { createEnrollmentScenario, NEW_DOCTOR, NEW_PATIENT } from "../../support/enrollment-scenario";
import { createDoctorMembership, createLinkedPatient,
  createTenant, createUser, prismaClient, resetDatabase } from "../../support/database";

beforeEach(resetDatabase);

describe("alta y reenvío: acceso por clínica", () => {
  it("un actor de otra clínica no modifica vínculos existentes ni puede reenviar su acceso", async () => {
    const test = await createEnrollmentScenario();
    const other = await createTenant();
    const user = await createUser({ email: NEW_PATIENT.email });
    const inB = await createLinkedPatient({ tenantId: other.id, userId: user.id,
      documentNumber: "777", fullName: "Nombre B" });
    expect((await test.enroll({ actor: test.actor, ...NEW_PATIENT })).status).toBe("ENROLLED");
    expect(await prismaClient.patient.findUnique({ where: { id: inB.id } })).toMatchObject({
      tenantId: other.id, documentNumber: "777", fullName: "Nombre B", status: "LINKED",
    });
    expect(await test.resend({ actor: test.actor, target: { kind: "PATIENT", patientId: inB.id } })).toEqual({ status: "NOT_FOUND" });
    expect(test.mailer.notices).toHaveLength(1);
  });

  it("el médico solo da de alta pacientes; otros roles no escriben", async () => {
    const test = await createEnrollmentScenario();
    const doctorUser = await createUser();
    const doctor = await createDoctorMembership({ tenantId: test.tenant.id, userId: doctorUser.id });
    const actor = { tenantId: test.tenant.id, userId: doctorUser.id, membershipId: doctor.id,
      isClinicAdmin: false, isDoctor: true };
    expect(await test.enroll({ actor, ...NEW_DOCTOR })).toEqual({ status: "FORBIDDEN" });
    expect((await test.enroll({ actor, ...NEW_PATIENT })).status).toBe("ENROLLED");
    expect(await prismaClient.doctorPatientAssignment.count({ where: { membershipId: doctor.id } })).toBe(1);
    const noRole = { ...actor, isDoctor: false };
    expect(await test.enroll({ actor: noRole, ...NEW_PATIENT, email: "otro@example.com" })).toEqual({ status: "FORBIDDEN" });
    expect(await prismaClient.patient.count()).toBe(1);
  });

  it("una clínica suspendida, incluso durante el alta, no recibe cuenta ni vínculo", async () => {
    const test = await createEnrollmentScenario();
    await prismaClient.tenant.update({ where: { id: test.tenant.id }, data: { status: "SUSPENDED" } });
    expect(await test.enroll({ actor: test.actor, ...NEW_PATIENT })).toEqual({ status: "FORBIDDEN" });
    expect(await prismaClient.user.count()).toBe(1);
    expect(await prismaClient.patient.count()).toBe(0);
    expect(await prismaClient.clinicUserEvent.count()).toBe(0);
  });

  it("si la clínica se suspende entre la comprobación y la transacción no queda cuenta propia", async () => {
    const test = await createEnrollmentScenario();
    const original = test.identity.provisionAccount.bind(test.identity);
    vi.spyOn(test.identity, "provisionAccount").mockImplementation(async (input) => {
      const provisioned = await original(input);
      await prismaClient.tenant.update({ where: { id: test.tenant.id }, data: { status: "SUSPENDED" } });
      return provisioned;
    });
    expect(await test.enroll({ actor: test.actor, ...NEW_PATIENT })).toEqual({ status: "FORBIDDEN" });
    expect(await prismaClient.user.count()).toBe(1);
    expect(await prismaClient.patient.count()).toBe(0);
  });

  it("un médico sin asignación vigente no reenvía el acceso a un paciente", async () => {
    const test = await createEnrollmentScenario();
    const patient = await test.enroll({ actor: test.actor, ...NEW_PATIENT });
    if (patient.status !== "ENROLLED") throw new Error("No se creó el paciente de prueba.");
    const doctorUser = await createUser();
    const doctor = await createDoctorMembership({ tenantId: test.tenant.id, userId: doctorUser.id });
    const actor = { tenantId: test.tenant.id, userId: doctorUser.id, membershipId: doctor.id,
      isClinicAdmin: false, isDoctor: true };
    test.mailer.notices.splice(0);
    expect(await test.resend({ actor, target: { kind: "PATIENT", patientId: patient.relationshipId } }))
      .toEqual({ status: "FORBIDDEN" });
    expect(test.mailer.notices).toHaveLength(0);
  });

  it("una cuenta con otro correo no obtiene el vínculo; plataforma sin membresía no tiene actor", async () => {
    const test = await createEnrollmentScenario();
    const other = await createUser({ email: "otra@example.com", isPlatformAdmin: true });
    expect((await test.enroll({ actor: test.actor, ...NEW_PATIENT })).status).toBe("ENROLLED");
    expect(await prismaClient.patient.count({ where: { tenantId: test.tenant.id, userId: other.id } })).toBe(0);
    expect(resolveInvitationActor({ tenantId: test.tenant.id, userId: other.id,
      relationship: { kind: "PATIENT" } })).toBeNull();
  });
});
