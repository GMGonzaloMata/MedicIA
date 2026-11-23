import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import { deriveLinkCodeState, type LinkCodeState } from "../../domain/patient-link-code";
import type { ClinicPatient, PatientRegistryRepository } from "../ports/out/patient-registry-repository";

export interface ListClinicPatientsInput {
  actor: ClinicAdminActor;
}

export interface ClinicPatientSummary extends Omit<ClinicPatient, "latestCode"> {
  // Estado del último código generado; null si nunca se generó uno.
  linkCodeState: LinkCodeState | null;
}

interface ListClinicPatientsDependencies {
  patients: PatientRegistryRepository;
  now: () => Date;
}

// Pacientes de la clínica del actor con su estado y su médico asignado. No devuelve estudios ni nada clínico.
export function createListClinicPatients({ patients, now }: ListClinicPatientsDependencies) {
  return async ({ actor }: ListClinicPatientsInput): Promise<ClinicPatientSummary[]> => {
    const timestamp = now();
    const rows = await patients.list(actor.tenantId);

    return rows.map(({ latestCode, ...patient }) => ({
      ...patient,
      linkCodeState: latestCode ? deriveLinkCodeState(latestCode, timestamp) : null,
    }));
  };
}
