import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { StaffRepository } from "../ports/out/staff-repository";

export interface ReactivateMemberInput {
  actor: ClinicAdminActor;
  membershipId: string;
}

export type ReactivateMemberResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "ALREADY_ACTIVE" };

interface ReactivateMemberDependencies {
  staff: StaffRepository;
}

// Reactiva a un miembro desactivado de la clínica del actor. Recupera el acceso y a los pacientes cuyas asignaciones
// siguen vigentes, porque la desactivación no las tocó.
export function createReactivateMember({ staff }: ReactivateMemberDependencies) {
  return async ({ actor, membershipId }: ReactivateMemberInput): Promise<ReactivateMemberResult> => {
    const result = await staff.reactivate({ tenantId: actor.tenantId, membershipId });

    switch (result.kind) {
      case "reactivated":
        return { ok: true };
      case "not-found":
        return { ok: false, code: "NOT_FOUND" };
      case "already-active":
        return { ok: false, code: "ALREADY_ACTIVE" };
    }
  };
}
