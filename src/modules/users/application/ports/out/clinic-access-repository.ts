import type { AvailableClinic, RelationshipKind } from "../../../domain/available-clinic";

// Solo devuelve vínculos vigentes: membresías activas y pacientes vinculados, en clínicas activas.
export interface ClinicAccessRepository {
  listAvailableClinics(userId: string): Promise<AvailableClinic[]>;

  // Devuelve null si el vínculo no existe, no es de esa persona o ya no está vigente,
  // sin distinguir los casos.
  findAvailableClinic(input: {
    userId: string;
    kind: RelationshipKind;
    relationshipId: string;
  }): Promise<AvailableClinic | null>;
}
