import { describe, expect, it } from "vitest";

import {
  canAssignTo,
  canManageClinicUsers,
  checkStaffDeactivation,
} from "@/modules/users/domain/clinic-user-rules";
import type { InvitationActor } from "@/modules/users/domain/invitation-access";

function actor(roles: { isClinicAdmin: boolean; isDoctor: boolean }): InvitationActor {
  return { tenantId: "clinic-a", userId: "user-1", membershipId: "membership-1", ...roles };
}

describe("canManageClinicUsers", () => {
  it("solo lo permite al administrador, solo o con rol de médico", () => {
    expect(canManageClinicUsers(actor({ isClinicAdmin: true, isDoctor: false }))).toBe(true);
    expect(canManageClinicUsers(actor({ isClinicAdmin: true, isDoctor: true }))).toBe(true);
    expect(canManageClinicUsers(actor({ isClinicAdmin: false, isDoctor: true }))).toBe(false);
  });
});

describe("checkStaffDeactivation", () => {
  const base = { actorMembershipId: "m-1", targetMembershipId: "m-2", targetIsClinicAdmin: false, otherActiveAdmins: 1 };

  it("permite desactivar a un médico que no es administrador", () => {
    expect(checkStaffDeactivation(base)).toBe("OK");
    expect(checkStaffDeactivation({ ...base, otherActiveAdmins: 0 })).toBe("OK");
  });

  it("rechaza la auto-baja, aunque haya otros administradores", () => {
    expect(checkStaffDeactivation({ ...base, targetMembershipId: "m-1", targetIsClinicAdmin: true })).toBe(
      "CANNOT_DEACTIVATE_SELF",
    );
  });

  it("evalúa la auto-baja antes que el último administrador", () => {
    expect(
      checkStaffDeactivation({ ...base, targetMembershipId: "m-1", targetIsClinicAdmin: true, otherActiveAdmins: 0 }),
    ).toBe("CANNOT_DEACTIVATE_SELF");
  });

  it("rechaza desactivar al último administrador activo", () => {
    expect(checkStaffDeactivation({ ...base, targetIsClinicAdmin: true, otherActiveAdmins: 0 })).toBe("LAST_ADMIN");
  });

  it("permite desactivar a un administrador si queda otro activo", () => {
    expect(checkStaffDeactivation({ ...base, targetIsClinicAdmin: true, otherActiveAdmins: 1 })).toBe("OK");
  });
});

describe("canAssignTo", () => {
  const ok = { patientStatus: "LINKED" as const, membershipStatus: "ACTIVE" as const, isDoctor: true };

  it("permite asignar un médico activo a un paciente vinculado", () => {
    expect(canAssignTo(ok)).toBe(true);
  });

  it("rechaza pacientes pendientes o revocados", () => {
    expect(canAssignTo({ ...ok, patientStatus: "PENDING" })).toBe(false);
    expect(canAssignTo({ ...ok, patientStatus: "REVOKED" })).toBe(false);
  });

  it("rechaza personal desactivado o sin rol de médico", () => {
    expect(canAssignTo({ ...ok, membershipStatus: "DEACTIVATED" })).toBe(false);
    expect(canAssignTo({ ...ok, isDoctor: false })).toBe(false);
  });
});
