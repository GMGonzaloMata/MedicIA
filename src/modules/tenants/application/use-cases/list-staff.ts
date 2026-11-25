import type { ClinicAdminActor } from "../../domain/clinic-admin-actor";
import { deriveInvitationState, type InvitationState, type StaffInvitation } from "../../domain/staff-invitation";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import type { StaffMember, StaffRepository } from "../ports/out/staff-repository";

export interface ListStaffInput {
  actor: ClinicAdminActor;
}

export interface PendingInvitation extends StaffInvitation {
  // «pending» o «expired»: las invitaciones aceptadas o revocadas no figuran en esta lista.
  state: InvitationState;
}

export interface ListStaffResult {
  members: StaffMember[];
  invitations: PendingInvitation[];
}

interface ListStaffDependencies {
  staff: StaffRepository;
  invitations: InvitationRepository;
  now: () => Date;
}

// Personal de la clínica del actor e invitaciones que todavía no se usaron ni se anularon.
export function createListStaff({ staff, invitations, now }: ListStaffDependencies) {
  return async ({ actor }: ListStaffInput): Promise<ListStaffResult> => {
    const [members, pending] = await Promise.all([
      staff.listMembers(actor.tenantId),
      invitations.listPending(actor.tenantId),
    ]);
    const timestamp = now();

    return {
      members: [...members].sort((first, second) => first.fullName.localeCompare(second.fullName, "es")),
      invitations: pending.map((invitation) => ({ ...invitation, state: deriveInvitationState(invitation, timestamp) })),
    };
  };
}
