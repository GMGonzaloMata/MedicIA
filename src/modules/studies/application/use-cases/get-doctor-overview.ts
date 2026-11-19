import type { DoctorOverviewSummary } from "../../domain/doctor-overview";
import type { StudyActor } from "../../domain/study-access";
import { StudyForbiddenError } from "../../domain/study-errors";
import type { DoctorOverviewReader } from "../ports/out/doctor-overview";

const RECENT_STUDY_LIMIT = 5;

export function createGetDoctorOverview({ overview }: { overview: DoctorOverviewReader }) {
  return async ({ actor }: { actor: StudyActor | null }): Promise<DoctorOverviewSummary> => {
    if (actor?.kind !== "DOCTOR") {
      throw new StudyForbiddenError();
    }

    return overview.read({
      tenantId: actor.tenantId,
      membershipId: actor.membershipId,
      recentLimit: RECENT_STUDY_LIMIT,
    });
  };
}
