import {
  STUDY_PAGE_SIZE,
  clampPage,
  normalizePage,
  totalPagesFor,
  type Page,
  type StudyListItem,
  type StudySummary,
} from "../../domain/study";
import { canActOnPatient, canDeleteStudy, type StudyActor } from "../../domain/study-access";
import { StudyForbiddenError } from "../../domain/study-errors";
import type { PatientDirectory } from "../ports/out/patient-directory";
import type { StudyRepository } from "../ports/out/study-repository";

interface ListStudiesDependencies {
  studies: StudyRepository;
  directory: PatientDirectory;
}

export interface ListStudiesInput {
  actor: StudyActor;
  patientId: string;
  page?: unknown;
}

function toSummary(actor: StudyActor, item: StudyListItem): StudySummary {
  return {
    id: item.id,
    number: item.number,
    type: item.type,
    status: item.status,
    uploadedAt: item.uploadedAt,
    uploadedBy: item.uploadedByPatient ? { kind: "PATIENT" } : { kind: "DOCTOR", fullName: item.uploaderName },
    canDelete: canDeleteStudy(actor, { uploadedByUserId: item.uploadedByUserId, hasAccessToPatient: true }),
  };
}

// Estudios de un paciente, del más reciente al más antiguo. Un `page` inválido se trata como 1 y uno fuera
// de rango devuelve la última página.
export function createListStudies({ studies, directory }: ListStudiesDependencies) {
  return async ({ actor, patientId, page }: ListStudiesInput): Promise<Page<StudySummary>> => {
    const hasActiveAssignment =
      actor.kind === "DOCTOR"
        ? await directory.hasActiveAssignment({
            tenantId: actor.tenantId,
            membershipId: actor.membershipId,
            patientId,
          })
        : false;

    if (!canActOnPatient(actor, { patientId, hasActiveAssignment })) {
      throw new StudyForbiddenError();
    }

    const requested = normalizePage(page);
    const query = { tenantId: actor.tenantId, patientId, pageSize: STUDY_PAGE_SIZE };
    let result = await studies.listByPatient({ ...query, page: requested });
    const effective = clampPage(requested, result.totalItems);

    if (effective !== requested) {
      result = await studies.listByPatient({ ...query, page: effective });
    }

    return {
      items: result.items.map((item) => toSummary(actor, item)),
      page: effective,
      pageSize: STUDY_PAGE_SIZE,
      totalItems: result.totalItems,
      totalPages: totalPagesFor(result.totalItems),
    };
  };
}
