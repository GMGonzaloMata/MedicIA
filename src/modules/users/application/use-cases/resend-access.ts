import type { InvitationActor } from "../../domain/invitation-access";
import type { ClinicMemberRepository, ResendTargetRef } from "../ports/out/clinic-member-repository";
import type { IdentityProvider } from "../ports/out/identity-provider";
import type { InvitationMailer } from "../ports/out/invitation-mailer";

export type ResendAccessResult =
  | { status: "SENT" | "MAIL_FAILED" | "NOT_ELIGIBLE" | "NOT_FOUND" | "FORBIDDEN" };

interface Dependencies {
  members: ClinicMemberRepository;
  identity: IdentityProvider;
  mailer: InvitationMailer;
  appBaseUrl: () => string;
  now: () => Date;
}

export function createResendAccess({ members, identity, mailer, appBaseUrl, now }: Dependencies) {
  return async function resendAccess(input: { actor: InvitationActor; target: ResendTargetRef }): Promise<ResendAccessResult> {
    const { actor, target } = input;
    if (!actor.isClinicAdmin && !(actor.isDoctor && target.kind === "PATIENT")) {
      return { status: "FORBIDDEN" };
    }
    const found = await members.findResendTarget({ tenantId: actor.tenantId, target });
    if (!found) return { status: "NOT_FOUND" };
    if (!actor.isClinicAdmin && !found.assignedMembershipIds.includes(actor.membershipId)) {
      return { status: "FORBIDDEN" };
    }
    if (found.hasSignedIn) return { status: "NOT_ELIGIBLE" };

    try {
      await identity.resendConfirmationCode({ email: found.email });
      await mailer.sendAccessNotice({
        to: found.email, clinicName: found.tenantName, kind: found.kind,
        setPasswordUrl: `${appBaseUrl()}/verify-email`,
      });
    } catch {
      return { status: "MAIL_FAILED" };
    }

    await members.recordEvent({
      tenantId: actor.tenantId, action: "ACCESS_RESENT", actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      ...(found.membershipId ? { targetMembershipId: found.membershipId } : {}),
      ...(found.patientId ? { targetPatientId: found.patientId } : {}),
      now: now(),
    });
    return { status: "SENT" };
  };
}

export function createCanResendPatientAccess({ members }: { members: ClinicMemberRepository }) {
  return async function canResendPatientAccess(input: { actor: InvitationActor; patientId: string }): Promise<boolean> {
    const { actor, patientId } = input;
    if (!actor.isDoctor) return false;
    const found = await members.findResendTarget({ tenantId: actor.tenantId, target: { kind: "PATIENT", patientId } });
    return found !== null && !found.hasSignedIn && found.assignedMembershipIds.includes(actor.membershipId);
  };
}
