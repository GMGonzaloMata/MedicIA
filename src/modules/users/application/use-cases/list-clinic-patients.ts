import type { ClinicMemberRepository, PatientListItem } from "../ports/out/clinic-member-repository";
import { canManageClinicUsers, CLINIC_USERS_PAGE_SIZE, normalizeClinicUsersPage } from "../../domain/clinic-user-rules";
import type { InvitationActor } from "../../domain/invitation-access";

interface Input {
  actor: InvitationActor;
  page: number;
}

export type ClinicPatientSummary = Omit<PatientListItem, "hasAccount" | "hasSignedIn"> & { canResendAccess: boolean };

export type ListClinicPatientsResult =
  | { status: "OK"; items: ClinicPatientSummary[]; total: number; page: number; pageSize: number }
  | { status: "FORBIDDEN" };

export function createListClinicPatients({ members }: { members: ClinicMemberRepository }): (input: Input) => Promise<ListClinicPatientsResult> {
  return async ({ actor, page }): Promise<ListClinicPatientsResult> => {
    if (!canManageClinicUsers(actor)) {
      return { status: "FORBIDDEN" };
    }

    const normalizedPage = normalizeClinicUsersPage(page);
    const { items, total } = await members.listPatients({
      tenantId: actor.tenantId,
      page: normalizedPage,
      pageSize: CLINIC_USERS_PAGE_SIZE,
    });

    return {
      status: "OK",
      items: items.map(({ hasAccount, hasSignedIn, ...item }) => ({
        ...item,
        canResendAccess: hasAccount && !hasSignedIn,
      })),
      total,
      page: normalizedPage,
      pageSize: CLINIC_USERS_PAGE_SIZE,
    };
  };
}
