import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { StaffRepository } from "../ports/out/staff-repository";

export interface DeactivateMemberInput {
  actor: ClinicAdminActor;
  membershipId: string;
}

export type DeactivateMemberResult =
  | { ok: true }
  // Un miembro de otra clínica o inexistente devuelve lo mismo: no se revela si existe.
  | { ok: false; code: "NOT_FOUND" | "LAST_ADMIN" | "ALREADY_DEACTIVATED" };

interface DeactivateMemberDependencies {
  staff: StaffRepository;
  now: () => Date;
}

// Desactiva a un miembro de la clínica del actor sin borrar su historial. Es inmediato: la sesión revalida el vínculo
// en cada solicitud. No toca las asignaciones y nunca deja la clínica sin un administrador activo.
export function createDeactivateMember({ staff, now }: DeactivateMemberDependencies) {
  return async ({ actor, membershipId }: DeactivateMemberInput): Promise<DeactivateMemberResult> => {
    const result = await staff.deactivate({
      tenantId: actor.tenantId,
      membershipId,
      deactivatedByUserId: actor.userId,
      now: now(),
    });

    switch (result.kind) {
      case "deactivated":
        return { ok: true };
      case "not-found":
        return { ok: false, code: "NOT_FOUND" };
      case "already-deactivated":
        return { ok: false, code: "ALREADY_DEACTIVATED" };
      case "last-admin":
        return { ok: false, code: "LAST_ADMIN" };
    }
  };
}
