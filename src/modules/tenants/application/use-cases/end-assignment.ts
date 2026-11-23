import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import type { AssignmentRepository } from "../ports/out/assignment-repository";

export interface EndAssignmentInput {
  actor: ClinicAdminActor;
  assignmentId: string;
}

export type EndAssignmentResult = { ok: true } | { ok: false; code: "NOT_FOUND" | "ALREADY_ENDED" };

interface EndAssignmentDependencies {
  assignments: AssignmentRepository;
  now: () => Date;
}

// Termina una asignación vigente de la clínica del actor. El médico deja de ver al paciente y la fila queda como
// historial con la fecha y quien la terminó. Reasignar es terminar la vigente y asignar a otro médico.
export function createEndAssignment({ assignments, now }: EndAssignmentDependencies) {
  return async ({ actor, assignmentId }: EndAssignmentInput): Promise<EndAssignmentResult> => {
    const result = await assignments.end({
      tenantId: actor.tenantId,
      assignmentId,
      endedByUserId: actor.userId,
      now: now(),
    });

    switch (result.kind) {
      case "ended":
        return { ok: true };
      case "not-found":
        return { ok: false, code: "NOT_FOUND" };
      case "already-ended":
        return { ok: false, code: "ALREADY_ENDED" };
    }
  };
}
