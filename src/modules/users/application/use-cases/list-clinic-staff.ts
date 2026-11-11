import type { ClinicMemberRepository, StaffListItem } from "../ports/out/clinic-member-repository";
import { canManageClinicUsers, CLINIC_USERS_PAGE_SIZE, normalizeClinicUsersPage } from "../../domain/clinic-user-rules";
import type { InvitationActor } from "../../domain/invitation-access";

interface Input {
  actor: InvitationActor;
  page: number;
}

export type ClinicStaffSummary = Omit<StaffListItem, "hasSignedIn"> & { canResendAccess: boolean };

export type ListClinicStaffResult =
  | { status: "OK"; items: ClinicStaffSummary[]; total: number; page: number; pageSize: number }
  | { status: "FORBIDDEN" };

export function createListClinicStaff({ members }: { members: ClinicMemberRepository }): (input: Input) => Promise<ListClinicStaffResult> {
  return async ({ actor, page }): Promise<ListClinicStaffResult> => {
    if (!canManageClinicUsers(actor)) {
      return { status: "FORBIDDEN" };
    }

    const normalizedPage = normalizeClinicUsersPage(page);
    const { items, total } = await members.listStaff({
      tenantId: actor.tenantId,
      page: normalizedPage,
      pageSize: CLINIC_USERS_PAGE_SIZE,
    });

    return {
      status: "OK",
      items: items.map(({ hasSignedIn, ...item }) => ({
        ...item,
        canResendAccess: item.isDoctor && !hasSignedIn,
      })),
      total,
      page: normalizedPage,
      pageSize: CLINIC_USERS_PAGE_SIZE,
    };
  };
}
