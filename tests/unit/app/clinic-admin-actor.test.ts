import { describe, expect, it } from "vitest";

import { toClinicAdminActor } from "@/app/_lib/clinic-admin-actor";
import type { ReadyAccessContext } from "@/app/_lib/access";

function context(relationship: ReadyAccessContext["clinic"]["relationship"]): ReadyAccessContext {
  return {
    status: "ready",
    user: { id: "user-1", email: "persona@example.com", fullName: "Persona", isPlatformAdmin: false },
    clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship },
  };
}

describe("actor administrador de la clínica", () => {
  it("un administrador que no es médico administra, con la clínica del contexto", () => {
    expect(
      toClinicAdminActor(context({ kind: "STAFF", membershipId: "membership-1", isClinicAdmin: true, isDoctor: false })),
    ).toEqual({ tenantId: "tenant-1", userId: "user-1", membershipId: "membership-1" });
  });

  it("un administrador que además es médico también administra", () => {
    expect(
      toClinicAdminActor(context({ kind: "STAFF", membershipId: "membership-1", isClinicAdmin: true, isDoctor: true })),
    ).not.toBeNull();
  });

  it("un médico sin el rol de administrador no administra", () => {
    expect(
      toClinicAdminActor(context({ kind: "STAFF", membershipId: "membership-1", isClinicAdmin: false, isDoctor: true })),
    ).toBeNull();
  });

  it("un paciente no administra", () => {
    expect(toClinicAdminActor(context({ kind: "PATIENT", patientId: "patient-1" }))).toBeNull();
  });
});
