import "server-only";

import { resolveInvitationActor, type InvitationActor } from "@/modules/users/domain/invitation-access";

import type { ReadyAccessContext } from "./access";

// Traduce el contexto de acceso al actor de las invitaciones. Solo invitan el administrador de la clínica y el
// médico: un paciente, o personal sin ninguno de esos roles, devuelve null.
export function toInvitationActor({ user, clinic }: ReadyAccessContext): InvitationActor | null {
  return resolveInvitationActor({
    tenantId: clinic.tenantId,
    userId: user.id,
    relationship:
      clinic.relationship.kind === "PATIENT"
        ? { kind: "PATIENT" }
        : {
            kind: "STAFF",
            membershipId: clinic.relationship.membershipId,
            isClinicAdmin: clinic.relationship.isClinicAdmin,
            isDoctor: clinic.relationship.isDoctor,
          },
  });
}
