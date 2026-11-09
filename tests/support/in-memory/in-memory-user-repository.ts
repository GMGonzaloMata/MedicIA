import type { UserRepository } from "@/modules/users/application/ports/out/user-repository";
import type { AccessUser } from "@/modules/users/domain/access-context";
import { AccountConflictError } from "@/modules/users/domain/identity-errors";

interface StoredUser {
  user: AccessUser;
  subject: string;
  sessionsValidFrom: Date;
}

// Cumple el puerto en memoria para las pruebas unitarias de los casos de uso.
export class InMemoryUserRepository implements UserRepository {
  readonly users: StoredUser[] = [];
  private nextId = 1;

  async upsertFromIdentity(input: {
    subject: string;
    email: string;
    fullName: string;
    now: Date;
  }): Promise<AccessUser> {
    const existing = this.users.find((stored) => stored.subject === input.subject);

    if (existing) {
      return existing.user;
    }

    if (this.users.some((stored) => stored.user.email === input.email.toLowerCase())) {
      throw new AccountConflictError();
    }

    const user: AccessUser = {
      id: `user-${this.nextId++}`,
      email: input.email.toLowerCase(),
      fullName: input.fullName,
      isPlatformAdmin: false,
    };
    this.users.push({ user, subject: input.subject, sessionsValidFrom: input.now });

    return user;
  }

  async invalidateSessionsByEmail(input: { email: string; now: Date }): Promise<void> {
    for (const stored of this.users) {
      if (stored.user.email === input.email.toLowerCase() && stored.sessionsValidFrom < input.now) {
        stored.sessionsValidFrom = input.now;
      }
    }
  }

  sessionsValidFromOf(email: string): Date | undefined {
    return this.users.find((stored) => stored.user.email === email.toLowerCase())?.sessionsValidFrom;
  }
}
