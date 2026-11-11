import {
  STUDY_PAGE_SIZE,
  clampPage,
  normalizePage,
  totalPagesFor,
  type Page,
  type PatientSummary,
} from "../../domain/study";
import { canListDoctorPatients, type StudyActor } from "../../domain/study-access";
import { StudyForbiddenError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";

interface ListDoctorPatientsDependencies {
  directory: PatientDirectory;
}

export interface ListDoctorPatientsInput {
  actor: StudyActor;
  page?: unknown;
}

// Pacientes con asignación vigente del médico, ordenados por nombre. Un paciente o un administrador sin rol
// de médico no tienen esta lista.
export function createListDoctorPatients({ directory }: ListDoctorPatientsDependencies) {
  return async ({ actor, page }: ListDoctorPatientsInput): Promise<Page<PatientSummary>> => {
    // `actor.kind` estrecha el tipo para leer `membershipId`; la regla de acceso la decide el dominio.
    if (actor.kind !== "DOCTOR" || !canListDoctorPatients(actor)) {
      throw new StudyForbiddenError();
    }

    const requested = normalizePage(page);
    const query = { tenantId: actor.tenantId, membershipId: actor.membershipId, pageSize: STUDY_PAGE_SIZE };
    let result = await directory.listAssignedPatients({ ...query, page: requested });
    const effective = clampPage(requested, result.totalItems);

    if (effective !== requested) {
      result = await directory.listAssignedPatients({ ...query, page: effective });
    }

    return {
      items: result.items,
      page: effective,
      pageSize: STUDY_PAGE_SIZE,
      totalItems: result.totalItems,
      totalPages: totalPagesFor(result.totalItems),
    };
  };
}
