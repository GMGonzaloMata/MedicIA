import {
  normalizePatientFilter,
  normalizePatientSearch,
  normalizePatientSort,
  recentStudiesSince,
  type AssignedPatientSummary,
  type PatientListCounts,
  type PatientListFilter,
  type PatientListSort,
} from "../../domain/patient-list";
import { STUDY_PAGE_SIZE, clampPage, normalizePage, totalPagesFor, type Page } from "../../domain/study";
import { canListDoctorPatients, type StudyActor } from "../../domain/study-access";
import { StudyForbiddenError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";

interface ListDoctorPatientsDependencies {
  directory: PatientDirectory;
  now?: () => Date;
}

export interface ListDoctorPatientsInput {
  actor: StudyActor;
  page?: unknown;
  search?: unknown;
  sort?: unknown;
  filter?: unknown;
}

export interface DoctorPatientsPage extends Page<AssignedPatientSummary> {
  counts: PatientListCounts;
  // Los valores normalizados que se aplicaron, para que la pantalla los refleje tal cual.
  search: string | null;
  sort: PatientListSort;
  filter: PatientListFilter;
}

// Pacientes con asignación vigente del médico, con búsqueda, filtro y orden. Un paciente o un administrador
// sin rol de médico no tienen esta lista.
export function createListDoctorPatients({ directory, now = () => new Date() }: ListDoctorPatientsDependencies) {
  return async ({ actor, page, search, sort, filter }: ListDoctorPatientsInput): Promise<DoctorPatientsPage> => {
    // `actor.kind` estrecha el tipo para leer `membershipId`; la regla de acceso la decide el dominio.
    if (actor.kind !== "DOCTOR" || !canListDoctorPatients(actor)) {
      throw new StudyForbiddenError();
    }

    const scope = { tenantId: actor.tenantId, membershipId: actor.membershipId, recentSince: recentStudiesSince(now()) };
    const criteria = {
      search: normalizePatientSearch(search),
      sort: normalizePatientSort(sort),
      filter: normalizePatientFilter(filter),
    };
    const query = { ...scope, ...criteria, pageSize: STUDY_PAGE_SIZE };
    const requested = normalizePage(page);
    const [firstResult, counts] = await Promise.all([
      directory.listAssignedPatients({ ...query, page: requested }),
      directory.countAssignedPatients(scope),
    ]);
    let result = firstResult;
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
      counts,
      search: criteria.search?.name ?? null,
      sort: criteria.sort,
      filter: criteria.filter,
    };
  };
}
