import { beforeEach, describe, expect, it } from "vitest";

import { createEnrollmentScenario, NEW_DOCTOR, NEW_PATIENT } from "../../support/enrollment-scenario";
import { createDoctorMembership, createPatient, createUser, prismaClient, resetDatabase } from "../../support/database";

beforeEach(resetDatabase);

describe("vínculos y eventos del alta", () => {
  it("reutiliza un paciente revocado y conserva su historial", async () => {
    const test = await createEnrollmentScenario();
    const user = await createUser({ email: NEW_PATIENT.email });
    const patient = await createPatient({ tenantId: test.tenant.id, userId: user.id,
      status: "REVOKED", documentNumber: NEW_PATIENT.documentNumber,
      fullName: "Nombre anterior", linkedAt: new Date("2026-01-01"), revokedAt: new Date("2026-02-01") });
    const result = await test.enroll({ actor: test.actor, ...NEW_PATIENT });
    expect(result).toMatchObject({ status: "ENROLLED", relationshipId: patient.id });
    expect(await prismaClient.patient.count()).toBe(1);
    expect(await prismaClient.patient.findUnique({ where: { id: patient.id } })).toMatchObject({ status: "LINKED" });
  });

  it("vincula un pendiente y registra el alta y la asignación en la misma transacción", async () => {
    const test = await createEnrollmentScenario();
    const pending = await createPatient({ tenantId: test.tenant.id, documentNumber: NEW_PATIENT.documentNumber });
    const doctorUser = await createUser();
    const doctor = await createDoctorMembership({ tenantId: test.tenant.id, userId: doctorUser.id });
    const actor = { tenantId: test.tenant.id, userId: doctorUser.id, membershipId: doctor.id,
      isDoctor: true, isClinicAdmin: false };
    const result = await test.enroll({ actor, ...NEW_PATIENT });
    expect(result).toMatchObject({ status: "ENROLLED", relationshipId: pending.id, assignedToDoctor: true });
    expect(await prismaClient.doctorPatientAssignment.count()).toBe(1);
    expect((await prismaClient.clinicUserEvent.findMany({ orderBy: { createdAt: "asc" } }))
      .map((event) => [event.action, event.actorUserId, event.targetPatientId]))
      .toEqual([["PATIENT_ENROLLED", doctorUser.id, pending.id], ["ASSIGNMENT_CREATED", doctorUser.id, pending.id]]);
    expect(await test.enroll({ actor, ...NEW_PATIENT })).toEqual({ status: "ALREADY_MEMBER", assignedToDoctor: false });
    expect(await prismaClient.clinicUserEvent.count()).toBe(2);
  });

  it("un administrador sin rol médico no recibe ese rol al dar de alta a otro médico", async () => {
    const test = await createEnrollmentScenario();
    expect((await test.enroll({ actor: test.actor, ...NEW_DOCTOR })).status).toBe("ENROLLED");
    expect(await prismaClient.staffMembership.findUnique({ where: { id: test.membership.id } }))
      .toMatchObject({ isClinicAdmin: true, isDoctor: false });
    expect(await prismaClient.clinicUserEvent.count({ where: { action: "STAFF_ENROLLED" } })).toBe(1);
  });
});
