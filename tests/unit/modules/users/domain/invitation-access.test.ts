import { describe, expect, it } from "vitest";

import {
  assignsCreator,
  canInvite,
  canRevoke,
  canSeeAllInvitations,
  resolveInvitationActor,
  type InvitationActor,
} from "@/modules/users/domain/invitation-access";

const base = { tenantId: "clinic-a", userId: "user-1" };

function staff(roles: { isClinicAdmin: boolean; isDoctor: boolean }) {
  return resolveInvitationActor({ ...base, relationship: { kind: "STAFF", membershipId: "membership-1", ...roles } });
}

function requireActor(actor: InvitationActor | null): InvitationActor {
  if (!actor) {
    throw new Error("Se esperaba un actor");
  }

  return actor;
}

describe("actor de invitaciones", () => {
  it("un paciente no invita", () => {
    expect(resolveInvitationActor({ ...base, relationship: { kind: "PATIENT" } })).toBeNull();
  });

  it("personal sin rol de administrador ni de médico no invita", () => {
    expect(staff({ isClinicAdmin: false, isDoctor: false })).toBeNull();
  });

  it("el administrador y el médico tienen actor, con la clínica y la membresía del contexto", () => {
    expect(staff({ isClinicAdmin: true, isDoctor: false })).toEqual({
      tenantId: "clinic-a",
      userId: "user-1",
      membershipId: "membership-1",
      isClinicAdmin: true,
      isDoctor: false,
    });
    expect(staff({ isClinicAdmin: false, isDoctor: true })).toMatchObject({ isClinicAdmin: false, isDoctor: true });
  });
});

describe("quién puede invitar", () => {
  it("el administrador invita médicos y pacientes", () => {
    const actor = requireActor(staff({ isClinicAdmin: true, isDoctor: false }));

    expect(canInvite(actor, "DOCTOR")).toBe(true);
    expect(canInvite(actor, "PATIENT")).toBe(true);
  });

  it("quien solo es médico invita solo pacientes", () => {
    const actor = requireActor(staff({ isClinicAdmin: false, isDoctor: true }));

    expect(canInvite(actor, "DOCTOR")).toBe(false);
    expect(canInvite(actor, "PATIENT")).toBe(true);
  });

  it("quien tiene los dos roles tiene los dos permisos", () => {
    const actor = requireActor(staff({ isClinicAdmin: true, isDoctor: true }));

    expect(canInvite(actor, "DOCTOR")).toBe(true);
    expect(canInvite(actor, "PATIENT")).toBe(true);
  });
});

describe("asignación del médico que invita", () => {
  it("solo un link de paciente generado por un médico asigna a quien lo generó", () => {
    const doctor = requireActor(staff({ isClinicAdmin: false, isDoctor: true }));
    const adminOnly = requireActor(staff({ isClinicAdmin: true, isDoctor: false }));
    const both = requireActor(staff({ isClinicAdmin: true, isDoctor: true }));

    expect(assignsCreator(doctor, "PATIENT")).toBe(true);
    expect(assignsCreator(both, "PATIENT")).toBe(true);
    expect(assignsCreator(adminOnly, "PATIENT")).toBe(false);
    expect(assignsCreator(both, "DOCTOR")).toBe(false);
  });
});

describe("revocar y ver las invitaciones", () => {
  it("revoca quien la generó o un administrador de la clínica", () => {
    const doctor = requireActor(staff({ isClinicAdmin: false, isDoctor: true }));
    const admin = requireActor(staff({ isClinicAdmin: true, isDoctor: false }));

    expect(canRevoke(doctor, { createdByMembershipId: "membership-1" })).toBe(true);
    expect(canRevoke(doctor, { createdByMembershipId: "membership-2" })).toBe(false);
    expect(canRevoke(admin, { createdByMembershipId: "membership-2" })).toBe(true);
  });

  it("solo el administrador ve las invitaciones de toda la clínica", () => {
    expect(canSeeAllInvitations(requireActor(staff({ isClinicAdmin: true, isDoctor: false })))).toBe(true);
    expect(canSeeAllInvitations(requireActor(staff({ isClinicAdmin: false, isDoctor: true })))).toBe(false);
  });
});
