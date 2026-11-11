import { describe, expect, it } from "vitest";

import { toClinicUserActor } from "@/app/_lib/clinic-user-actor";
import type { ReadyAccessContext } from "@/app/_lib/access";

const user: ReadyAccessContext["user"] = {
  id: "user-1",
  email: "persona@example.com",
  fullName: "Persona Uno",
  isPlatformAdmin: false,
};

describe("actor de gestión de usuarios", () => {
  it("toma la clínica y los roles del contexto de acceso", () => {
    const context: ReadyAccessContext = {
      status: "ready",
      user,
      clinic: {
        tenantId: "tenant-1",
        tenantName: "Clínica Uno",
        relationship: { kind: "STAFF", membershipId: "member-1", isClinicAdmin: true, isDoctor: false },
      },
    };

    expect(toClinicUserActor(context)).toEqual({
      tenantId: "tenant-1",
      userId: user.id,
      membershipId: "member-1",
      isClinicAdmin: true,
      isDoctor: false,
    });
  });

  it("devuelve null para pacientes y personal sin roles de gestión", () => {
    const base: ReadyAccessContext = {
      status: "ready",
      user,
      clinic: {
        tenantId: "tenant-1",
        tenantName: "Clínica Uno",
        relationship: { kind: "PATIENT", patientId: "patient-1" },
      },
    };

    expect(toClinicUserActor(base)).toBeNull();
    expect(toClinicUserActor({
      ...base,
      clinic: {
        ...base.clinic,
        relationship: { kind: "STAFF", membershipId: "member-2", isClinicAdmin: false, isDoctor: false },
      },
    })).toBeNull();
  });
});
