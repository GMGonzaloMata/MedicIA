import type { ClinicAccessRepository } from "@/modules/users/application/ports/out/clinic-access-repository";
import type { AvailableClinic, RelationshipKind } from "@/modules/users/domain/available-clinic";

// Cumple el puerto en memoria. Las pruebas cargan solo vínculos vigentes con `grant`.
export class InMemoryClinicAccessRepository implements ClinicAccessRepository {
  private readonly grants: { userId: string; clinic: AvailableClinic }[] = [];

  grant(userId: string, clinic: AvailableClinic): void {
    this.grants.push({ userId, clinic });
  }

  async listAvailableClinics(userId: string): Promise<AvailableClinic[]> {
    return this.grants.filter((grant) => grant.userId === userId).map((grant) => grant.clinic);
  }

  async findAvailableClinic(input: {
    userId: string;
    kind: RelationshipKind;
    relationshipId: string;
  }): Promise<AvailableClinic | null> {
    const found = this.grants.find(
      (grant) =>
        grant.userId === input.userId &&
        grant.clinic.kind === input.kind &&
        grant.clinic.relationshipId === input.relationshipId,
    );

    return found?.clinic ?? null;
  }
}
