import { describe, expect, it } from "vitest";

import type { ReadyAccessContext } from "@/app/_lib/access";
import { toInvitationActor } from "@/app/_lib/invitation-actor";

function contextWith(relationship: ReadyAccessContext["clinic"]["relationship"]): ReadyAccessContext {
  return {
    status: "ready",
    user: { id: "user-1", email: "persona@example.com", fullName: "Persona", isPlatformAdmin: false },
    clinic: { tenantId: "tenant-1", tenantName: "Clínica", relationship },
  };
}

describe("actor de las invitaciones", () => {
  it("el administrador y el médico invitan, con la clínica y el vínculo de la sesión", () => {
    expect(
      toInvitationActor(contextWith({ kind: "STAFF", membershipId: "m-1", isClinicAdmin: true, isDoctor: false })),
    ).toEqual({ tenantId: "tenant-1", userId: "user-1", membershipId: "m-1", isClinicAdmin: true, isDoctor: false });
    expect(
      toInvitationActor(contextWith({ kind: "STAFF", membershipId: "m-2", isClinicAdmin: false, isDoctor: true })),
    ).toMatchObject({ membershipId: "m-2", isDoctor: true });
  });

  it("un paciente, o personal sin rol de administrador ni de médico, no invita", () => {
    expect(toInvitationActor(contextWith({ kind: "PATIENT", patientId: "p-1" }))).toBeNull();
    expect(
      toInvitationActor(contextWith({ kind: "STAFF", membershipId: "m-3", isClinicAdmin: false, isDoctor: false })),
    ).toBeNull();
  });
});
