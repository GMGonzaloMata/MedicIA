import type { RelationshipKind } from "../../../domain/available-clinic";
import type { ResolvedSession } from "../../../domain/active-relationship";

// Todas las fechas las pone la aplicación con su reloj, nunca la base, para evitar desfases
// entre ambos relojes.
export interface SessionRepository {
  create(input: {
    userId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<{ id: string }>;

  // Una sola consulta: la sesión, la cuenta y el vínculo activo con el estado de su clínica.
  findByTokenHash(tokenHash: string): Promise<ResolvedSession | null>;

  recordActivity(input: { sessionId: string; now: Date }): Promise<void>;

  // Completa el vínculo indicado y limpia el otro. La base rechaza un vínculo de otra cuenta.
  setActiveRelationship(input: {
    sessionId: string;
    userId: string;
    kind: RelationshipKind;
    relationshipId: string;
  }): Promise<void>;

  // No falla si la sesión no existe o ya estaba revocada.
  revokeByTokenHash(input: { tokenHash: string; now: Date }): Promise<void>;
}
