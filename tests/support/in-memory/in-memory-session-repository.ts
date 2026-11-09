import type { SessionRepository } from "@/modules/users/application/ports/out/session-repository";
import type { AccessUser } from "@/modules/users/domain/access-context";
import type { ResolvedSession, StoredRelationship } from "@/modules/users/domain/active-relationship";
import type { RelationshipKind } from "@/modules/users/domain/available-clinic";

export interface InMemorySessionRow {
  id: string;
  userId: string;
  tokenHash: string;
  createdAt: Date;
  lastActivityAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  active: { kind: RelationshipKind; relationshipId: string } | null;
}

// Cumple el puerto en memoria. Las pruebas cargan las cuentas y los vínculos con `addUser` y
// `addRelationship`, y revisan el estado con `rows`.
export class InMemorySessionRepository implements SessionRepository {
  readonly rows: InMemorySessionRow[] = [];
  private readonly users = new Map<string, { user: AccessUser; sessionsValidFrom: Date }>();
  private readonly relationships = new Map<string, StoredRelationship>();
  private nextId = 1;

  addUser(user: AccessUser, sessionsValidFrom: Date): void {
    this.users.set(user.id, { user, sessionsValidFrom });
  }

  addRelationship(relationship: StoredRelationship): void {
    const id = relationship.kind === "STAFF" ? relationship.membershipId : relationship.patientId;
    this.relationships.set(`${relationship.kind}:${id}`, relationship);
  }

  async create(input: {
    userId: string;
    tokenHash: string;
    now: Date;
    expiresAt: Date;
  }): Promise<{ id: string }> {
    const id = `session-${this.nextId++}`;
    this.rows.push({
      id,
      userId: input.userId,
      tokenHash: input.tokenHash,
      createdAt: input.now,
      lastActivityAt: input.now,
      expiresAt: input.expiresAt,
      revokedAt: null,
      active: null,
    });

    return { id };
  }

  async findByTokenHash(tokenHash: string): Promise<ResolvedSession | null> {
    const row = this.rows.find((candidate) => candidate.tokenHash === tokenHash);
    const owner = row ? this.users.get(row.userId) : undefined;

    if (!row || !owner) {
      return null;
    }

    return {
      session: {
        id: row.id,
        createdAt: row.createdAt,
        lastActivityAt: row.lastActivityAt,
        expiresAt: row.expiresAt,
        revokedAt: row.revokedAt,
      },
      user: owner.user,
      sessionsValidFrom: owner.sessionsValidFrom,
      activeRelationship: row.active
        ? (this.relationships.get(`${row.active.kind}:${row.active.relationshipId}`) ?? null)
        : null,
    };
  }

  async recordActivity(input: { sessionId: string; now: Date }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.id === input.sessionId);

    if (row && row.lastActivityAt < input.now) {
      row.lastActivityAt = input.now;
    }
  }

  async setActiveRelationship(input: {
    sessionId: string;
    userId: string;
    kind: RelationshipKind;
    relationshipId: string;
  }): Promise<void> {
    const row = this.rows.find(
      (candidate) => candidate.id === input.sessionId && candidate.userId === input.userId,
    );

    if (!row) {
      throw new Error("La sesión no pertenece a la cuenta.");
    }

    row.active = { kind: input.kind, relationshipId: input.relationshipId };
  }

  async revokeByTokenHash(input: { tokenHash: string; now: Date }): Promise<void> {
    const row = this.rows.find((candidate) => candidate.tokenHash === input.tokenHash);

    if (row && row.revokedAt === null) {
      row.revokedAt = input.now;
    }
  }
}
