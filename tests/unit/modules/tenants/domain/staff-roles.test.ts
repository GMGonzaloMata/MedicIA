import { describe, expect, it } from "vitest";

import { addsNewRole, describeRoles, hasAnyRole, mergeRoles } from "@/modules/tenants/domain/staff-roles";

const DOCTOR = { isClinicAdmin: false, isDoctor: true };
const ADMIN = { isClinicAdmin: true, isDoctor: false };
const BOTH = { isClinicAdmin: true, isDoctor: true };
const NONE = { isClinicAdmin: false, isDoctor: false };

describe("roles del personal", () => {
  it("exige al menos un rol", () => {
    expect(hasAnyRole(NONE)).toBe(false);
    expect(hasAnyRole(DOCTOR)).toBe(true);
    expect(hasAnyRole(ADMIN)).toBe(true);
  });

  it("describe los roles con palabras", () => {
    expect(describeRoles(DOCTOR)).toBe("médico");
    expect(describeRoles(ADMIN)).toBe("administrador");
    expect(describeRoles(BOTH)).toBe("médico y administrador");
  });

  it("detecta si una invitación suma un rol que la persona no tiene", () => {
    expect(addsNewRole(DOCTOR, ADMIN)).toBe(true);
    expect(addsNewRole(DOCTOR, DOCTOR)).toBe(false);
    expect(addsNewRole(BOTH, DOCTOR)).toBe(false);
    expect(addsNewRole(DOCTOR, BOTH)).toBe(true);
  });

  it("une los roles sin quitar ninguno", () => {
    expect(mergeRoles(DOCTOR, ADMIN)).toEqual(BOTH);
    expect(mergeRoles(BOTH, DOCTOR)).toEqual(BOTH);
  });
});
