import { assignsCreator, canInvite, type InvitationActor } from "../../domain/invitation-access";
import type { DocumentType } from "../../domain/invitation";
import { InvitationConflictError } from "../../domain/invitation-errors";
import { normalizeProof } from "../../domain/invitation-proof";
import type { ClinicMemberRepository } from "../ports/out/clinic-member-repository";
import type { IdentityProvider } from "../ports/out/identity-provider";
import type { InvitationMailer } from "../ports/out/invitation-mailer";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import type { UserRepository } from "../ports/out/user-repository";
import { enrollMemberSchema } from "../validation/clinic-user-form-schemas";
import { applyDoctorRelationship, applyPatientRelationship } from "./apply-relationship";

export type EnrollConflictReason =
  | "ALREADY_STAFF" | "ALREADY_PATIENT" | "MEMBERSHIP_DEACTIVATED"
  | "ROLE_CHANGE_NOT_SUPPORTED" | "DOCUMENT_IN_USE" | "LICENSE_IN_USE";

export type EnrollMemberResult =
  | { status: "ENROLLED"; kind: "DOCTOR" | "PATIENT"; relationshipId: string; assignedToDoctor: boolean; mail: "SENT" | "FAILED" }
  | { status: "ALREADY_MEMBER"; assignedToDoctor: boolean }
  | { status: "CONFLICT"; reason: EnrollConflictReason }
  | { status: "INVALID_INPUT"; fieldErrors: Record<string, string[]> }
  | { status: "FORBIDDEN" }
  | { status: "UNAVAILABLE" };

interface Input { actor: InvitationActor; kind: "DOCTOR" | "PATIENT"; email: string; fullName: string;
  documentType?: DocumentType;
  documentNumber?: string; licenseNumber?: string; specialty?: string }

interface Dependencies {
  members: ClinicMemberRepository;
  invitations: InvitationRepository;
  users: UserRepository;
  identity: IdentityProvider;
  mailer: InvitationMailer;
  appBaseUrl: () => string;
  now: () => Date;
}

function conflictReason(error: unknown, kind: Input["kind"]): EnrollConflictReason | null {
  if (!(error instanceof Error) || error.name !== "InvitationConflictError") return null;
  const reason = (error as InvitationConflictError).reason;
  if (reason === "OTHER_RELATIONSHIP") return kind === "DOCTOR" ? "ALREADY_PATIENT" : "ALREADY_STAFF";
  return reason;
}

export function createEnrollMember({ members, invitations, users, identity, mailer, appBaseUrl, now }: Dependencies) {
  return async function enrollMember(input: Input): Promise<EnrollMemberResult> {
    if (!canInvite(input.actor, input.kind)) return { status: "FORBIDDEN" };

    const candidate = Object.fromEntries(Object.entries({
      kind: input.kind, email: input.email, fullName: input.fullName,
      documentType: input.documentType, documentNumber: input.documentNumber,
      licenseNumber: input.licenseNumber, specialty: input.specialty,
    }).filter(([, value]) => value !== undefined));
    const parsed = enrollMemberSchema.safeParse(candidate);
    if (!parsed.success) return { status: "INVALID_INPUT", fieldErrors: parsed.error.flatten().fieldErrors };
    const data = parsed.data;
    const tenantId = input.actor.tenantId;

    // Todas las comprobaciones previas leen únicamente esta clínica. La transacción vuelve a aplicar las reglas.
    const facts = await invitations.findClinicFacts({ tenantId, email: data.email });
    if (data.kind === "DOCTOR") {
      if (facts.patient) return { status: "CONFLICT", reason: "ALREADY_PATIENT" };
      const owner = await invitations.findLicenseOwner({ tenantId, licenseNumber: normalizeProof(data.licenseNumber) });
      if (owner?.email && owner.email !== data.email) return { status: "CONFLICT", reason: "LICENSE_IN_USE" };
    } else {
      if (facts.staff) return { status: "CONFLICT", reason: "ALREADY_STAFF" };
      const owner = await invitations.findDocumentOwner({
        tenantId, documentType: data.documentType, documentNumber: normalizeProof(data.documentNumber),
      });
      if (owner?.email && owner.email !== data.email) return { status: "CONFLICT", reason: "DOCUMENT_IN_USE" };
    }

    const tenantName = await members.findTenantName({ tenantId });
    if (!tenantName) return { status: "FORBIDDEN" };
    const setPasswordUrl = `${appBaseUrl()}/verify-email`;
    const existing = await users.findByEmail(data.email);
    let account: { userId: string } | { subject: string; email: string; fullName: string };
    if (existing) {
      account = { userId: existing.id };
    } else {
      try {
        const provisioned = await identity.provisionAccount({ email: data.email, fullName: data.fullName });
        account = { subject: provisioned.subject, email: data.email, fullName: provisioned.fullName };
      } catch {
        return { status: "UNAVAILABLE" };
      }
    }

    const moment = now();
    let relationship;
    try {
      relationship = await members.runEnrollment({ tenantId, account, now: moment }, async (transaction, savedAccount) => {
        const result = data.kind === "DOCTOR"
          ? await applyDoctorRelationship(transaction, {
              tenantId, account: savedAccount, licenseNumber: data.licenseNumber, specialty: data.specialty,
            })
          : await applyPatientRelationship(transaction, {
              tenantId, account: savedAccount, documentType: data.documentType,
              documentNumber: data.documentNumber,
              assignTo: assignsCreator(input.actor, data.kind)
                ? { membershipId: input.actor.membershipId, createdByUserId: input.actor.userId } : null,
              now: moment,
            });
        const target = result.kind === "DOCTOR"
          ? { targetMembershipId: result.relationshipId }
          : { targetPatientId: result.relationshipId };
        const eventBase = {
          tenantId, actorUserId: input.actor.userId, actorMembershipId: input.actor.membershipId, now: moment,
        };
        if (result.status === "LINKED") {
          await transaction.recordEvent({
            ...eventBase, ...target, action: result.kind === "DOCTOR" ? "STAFF_ENROLLED" : "PATIENT_ENROLLED",
          });
        }
        if (result.assignmentCreated) {
          await transaction.recordEvent({
            ...eventBase, targetMembershipId: input.actor.membershipId,
            targetPatientId: result.relationshipId, action: "ASSIGNMENT_CREATED",
          });
        }
        return result;
      });
    } catch (error) {
      const reason = conflictReason(error, data.kind);
      if (reason) return { status: "CONFLICT", reason };
      if (error instanceof Error && error.name === "EnrollmentTenantInactiveError") return { status: "FORBIDDEN" };
      throw error;
    }

    if (relationship.status === "ALREADY_MEMBER") {
      return { status: "ALREADY_MEMBER", assignedToDoctor: relationship.assignmentCreated };
    }

    try {
      await mailer.sendAccessNotice({
        to: data.email, clinicName: tenantName, kind: data.kind,
        setPasswordUrl: existing ? null : setPasswordUrl,
      });
      return { status: "ENROLLED", kind: data.kind, relationshipId: relationship.relationshipId,
        assignedToDoctor: relationship.assignmentCreated, mail: "SENT" };
    } catch {
      return { status: "ENROLLED", kind: data.kind, relationshipId: relationship.relationshipId,
        assignedToDoctor: relationship.assignmentCreated, mail: "FAILED" };
    }
  };
}
