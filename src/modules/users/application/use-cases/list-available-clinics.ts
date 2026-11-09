import type { AvailableClinic } from "../../domain/available-clinic";
import type { ClinicAccessRepository } from "../ports/out/clinic-access-repository";

interface ListAvailableClinicsDependencies {
  clinicAccess: ClinicAccessRepository;
}

// Las clínicas a las que la persona puede entrar ahora: solo vínculos vigentes en clínicas activas.
export function createListAvailableClinics({ clinicAccess }: ListAvailableClinicsDependencies) {
  return (userId: string): Promise<AvailableClinic[]> => clinicAccess.listAvailableClinics(userId);
}
