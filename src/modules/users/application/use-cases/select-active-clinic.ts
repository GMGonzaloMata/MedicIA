import type { RelationshipKind } from "../../domain/available-clinic";
import { ClinicUnavailableError } from "../../domain/clinic-errors";
import type { ClinicAccessRepository } from "../ports/out/clinic-access-repository";
import type { SessionRepository } from "../ports/out/session-repository";
import type { createResolveCurrentSession } from "./resolve-current-session";

export interface SelectActiveClinicInput {
  // Identificador de la cookie: la sesión se resuelve en el servidor, no se recibe su id.
  token: string | null;
  kind: RelationshipKind;
  // Identificador del vínculo (membresía o paciente), nunca un `tenantId`.
  relationshipId: string;
}

interface SelectActiveClinicDependencies {
  resolveCurrentSession: ReturnType<typeof createResolveCurrentSession>;
  clinicAccess: ClinicAccessRepository;
  sessions: SessionRepository;
}

// Activa en la sesión un vínculo de la propia persona. La clínica se deduce del vínculo; cualquier
// vínculo que no sea de ella o ya no esté vigente falla con el mismo error.
export function createSelectActiveClinic({
  resolveCurrentSession,
  clinicAccess,
  sessions,
}: SelectActiveClinicDependencies) {
  return async ({ token, kind, relationshipId }: SelectActiveClinicInput): Promise<void> => {
    const resolved = await resolveCurrentSession(token);

    if (!resolved) {
      throw new ClinicUnavailableError();
    }

    const available = await clinicAccess.findAvailableClinic({
      userId: resolved.user.id,
      kind,
      relationshipId,
    });

    if (!available) {
      throw new ClinicUnavailableError();
    }

    await sessions.setActiveRelationship({
      sessionId: resolved.session.id,
      userId: resolved.user.id,
      kind,
      relationshipId,
    });
  };
}
