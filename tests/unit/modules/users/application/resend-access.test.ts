import { beforeEach, describe, expect, it, vi } from "vitest";

import { createCanResendPatientAccess, createResendAccess } from "@/modules/users/application/use-cases/resend-access";
import { createInMemoryIdentityProvider } from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";

import { InMemoryClinicMemberRepository } from "../../../../support/in-memory/in-memory-clinic-member-repository";
import { APP_BASE_URL, OTHER_TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

function setup() {
  const scenario = createInvitationScenario();
  const members = new InMemoryClinicMemberRepository(scenario.repo);
  const identity = createInMemoryIdentityProvider({});
  const resendCode = vi.spyOn(identity, "resendConfirmationCode");
  const doctor = scenario.addDoctor();
  const patient = scenario.addAccount("patient", "patient@example.com", "Paciente");
  scenario.repo.patients.push({ patientId: "patient-1", tenantId: scenario.adminActor.tenantId,
    userId: patient.id, status: "LINKED", documentType: "DNI", documentNumber: "123", fullName: patient.fullName });
  scenario.repo.assignments.push({ tenantId: scenario.adminActor.tenantId, patientId: "patient-1",
    membershipId: doctor.membershipId, createdByUserId: scenario.admin.id, endedAt: null });
  const resend = createResendAccess({ members, identity, mailer: scenario.mailer,
    appBaseUrl: () => APP_BASE_URL, now: scenario.now });
  const canResend = createCanResendPatientAccess({ members });
  return { ...scenario, members, identity, resendCode, doctor, resend, canResend };
}

let test: ReturnType<typeof setup>;
beforeEach(() => { test = setup(); });

describe("reenviar acceso", () => {
  it("el administrador y el médico asignado reenvían código y aviso", async () => {
    const target = { kind: "PATIENT", patientId: "patient-1" } as const;
    expect(await test.resend({ actor: test.adminActor, target })).toEqual({ status: "SENT" });
    expect(await test.resend({ actor: test.doctor.actor, target })).toEqual({ status: "SENT" });
    expect(test.resendCode).toHaveBeenCalledTimes(2);
    expect(test.mailer.notices).toEqual([
      expect.objectContaining({ setPasswordUrl: `${APP_BASE_URL}/verify-email` }),
      expect.objectContaining({ setPasswordUrl: `${APP_BASE_URL}/verify-email` }),
    ]);
    expect(test.members.events.map((event) => event.action)).toEqual(["ACCESS_RESENT", "ACCESS_RESENT"]);
    expect(await test.canResend({ actor: test.doctor.actor, patientId: "patient-1" })).toBe(true);
  });

  it("rechaza una cuenta que ya ingresó", async () => {
    test.members.signedInUserIds.add("patient");
    expect(await test.resend({ actor: test.adminActor, target: { kind: "PATIENT", patientId: "patient-1" } })).toEqual({ status: "NOT_ELIGIBLE" });
    expect(test.resendCode).not.toHaveBeenCalled();
  });

  it("el administrador puede reenviar el acceso de un médico que nunca ingresó", async () => {
    expect(await test.resend({ actor: test.adminActor,
      target: { kind: "STAFF", membershipId: test.doctor.membershipId } })).toEqual({ status: "SENT" });
    expect(test.mailer.notices[0]).toMatchObject({ kind: "DOCTOR", setPasswordUrl: `${APP_BASE_URL}/verify-email` });
  });

  it("no revela objetivos ajenos ni permite a médicos sin asignación", async () => {
    const target = { kind: "PATIENT", patientId: "patient-1" } as const;
    const otherDoctor = test.addDoctor("other-doctor", "other-doctor@example.com");
    expect(await test.resend({ actor: otherDoctor.actor, target })).toEqual({ status: "FORBIDDEN" });
    expect(await test.canResend({ actor: otherDoctor.actor, patientId: "patient-1" })).toBe(false);
    expect(await test.resend({ actor: { ...test.adminActor, tenantId: OTHER_TENANT_ID }, target })).toEqual({ status: "NOT_FOUND" });
    expect(await test.resend({ actor: test.adminActor, target: { kind: "PATIENT", patientId: "missing" } })).toEqual({ status: "NOT_FOUND" });
    expect(test.resendCode).not.toHaveBeenCalled();
  });

  it("impide al médico reenviar a otro médico y al personal sin rol usar la función", async () => {
    expect(await test.resend({ actor: test.doctor.actor,
      target: { kind: "STAFF", membershipId: test.doctor.membershipId } })).toEqual({ status: "FORBIDDEN" });
    expect(await test.resend({ actor: { ...test.adminActor, isClinicAdmin: false, isDoctor: false },
      target: { kind: "PATIENT", patientId: "patient-1" } })).toEqual({ status: "FORBIDDEN" });
  });

  it("una falla de correo no registra un reenvío exitoso", async () => {
    test.mailer.failWith = new MailDeliveryError("UNAVAILABLE");
    expect(await test.resend({ actor: test.adminActor,
      target: { kind: "PATIENT", patientId: "patient-1" } })).toEqual({ status: "MAIL_FAILED" });
    expect(test.members.events).toHaveLength(0);
  });
});
