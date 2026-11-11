import type { DocumentType, InvitationKind, InvitationRecord } from "../../domain/invitation";
import type { InvitationConflictError, InvitationConflictReason } from "../../domain/invitation-errors";
import { normalizeProof, proofMatches } from "../../domain/invitation-proof";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import { acceptInvitationSchema } from "../validation/invitation-form-schemas";
import { applyDoctorRelationship, applyPatientRelationship, type RelationshipResult } from "./apply-relationship";
import { findUsableInvitation } from "./preview-invitation";

export interface AcceptInvitationInput {
  token: string;
  account: { id: string; email: string; fullName: string };
  proof: {
    documentType?: DocumentType;
    documentNumber?: string;
    licenseNumber?: string;
    specialty?: string;
  };
}

export type AcceptInvitationResult =
  | {
      status: "ACCEPTED";
      kind: InvitationKind;
      tenantName: string;
      relationshipKind: "STAFF" | "PATIENT";
      relationshipId: string;
      assignedToDoctor: boolean;
    }
  // Ya pertenecía con ese tipo de vínculo: no se duplicó nada y el link se consumió.
  | { status: "ALREADY_MEMBER"; tenantName: string }
  | { status: "PROOF_MISMATCH"; attemptsLeft: number }
  | { status: "CONFLICT"; reason: InvitationConflictReason }
  | { status: "INVALID" };

interface Dependencies {
  invitations: InvitationRepository;
  now: () => Date;
}

// Lo que cada tipo de invitación necesita para compararse y aplicarse, ya validado.
type Verification =
  | { kind: "DOCTOR"; matches: boolean; specialty: string }
  | { kind: "PATIENT"; matches: boolean; documentType: DocumentType; documentNumber: string };

interface Applied {
  tenantName: string;
  account: AcceptInvitationInput["account"];
  invitation: InvitationRecord;
  now: Date;
}

// Next puede cargar el módulo de errores más de una vez, y entonces `instanceof` falla entre copias: se distingue por nombre.
function asConflict(error: unknown): InvitationConflictError | null {
  return error instanceof Error && error.name === "InvitationConflictError" ? (error as InvitationConflictError) : null;
}

// Compara lo que escribió la persona con lo que cargó quien invitó. Devuelve `null` si faltan campos del tipo.
function verify(invitation: InvitationRecord, proofInput: AcceptInvitationInput["proof"]): Verification | null {
  const parsed = acceptInvitationSchema.safeParse(proofInput);

  if (!parsed.success) {
    return null;
  }

  const proof = parsed.data;

  if (invitation.kind === "DOCTOR") {
    if (!invitation.licenseNumber || !proof.licenseNumber || !proof.specialty) {
      return null;
    }

    return {
      kind: "DOCTOR",
      matches: proofMatches(invitation.licenseNumber, proof.licenseNumber),
      specialty: proof.specialty,
    };
  }

  if (!invitation.documentType || !invitation.documentNumber || !proof.documentType || !proof.documentNumber) {
    return null;
  }

  return {
    kind: "PATIENT",
    // Un tipo de documento distinto también es un dato que no coincide.
    matches: proof.documentType === invitation.documentType && proofMatches(invitation.documentNumber, proof.documentNumber),
    documentType: proof.documentType,
    documentNumber: normalizeProof(invitation.documentNumber),
  };
}

// Traduce el resultado compartido del vínculo al de aceptar un link.
function toAcceptResult(
  result: RelationshipResult,
  { tenantName, invitation }: Pick<Applied, "tenantName" | "invitation">,
): AcceptInvitationResult {
  if (result.status === "ALREADY_MEMBER") {
    return { status: "ALREADY_MEMBER", tenantName };
  }

  return {
    status: "ACCEPTED",
    kind: result.kind,
    tenantName,
    relationshipKind: result.kind === "DOCTOR" ? "STAFF" : "PATIENT",
    relationshipId: result.relationshipId,
    // Un link de un médico asigna al paciente a ese médico.
    assignedToDoctor: result.kind === "PATIENT" && invitation.assignToCreator,
  };
}

export function createAcceptInvitation({ invitations, now }: Dependencies) {
  return async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const { token, account } = input;

    // 1 a 3: la forma del token, su vigencia, la clínica, quien lo generó y el correo de la cuenta. Cualquier falla es
    // el mismo `INVALID`, y no gasta intentos: solo cuentan los de la persona a quien va dirigido el link.
    const context = await findUsableInvitation(invitations, token, account.email, now());

    if (!context) {
      return { status: "INVALID" };
    }

    const { invitation, tenantName } = context;

    // 4: los campos del tipo.
    const verification = verify(invitation, input.proof);

    if (!verification) {
      return { status: "INVALID" };
    }

    // 5: el dato que cargó quien invitó. Un fallo cuenta un intento; con el último, el link queda invalidado.
    if (!verification.matches) {
      const { attemptsLeft } = await invitations.registerFailedAttempt({
        tenantId: invitation.tenantId,
        invitationId: invitation.id,
        now: now(),
      });

      return { status: "PROOF_MISMATCH", attemptsLeft };
    }

    // 6: con la cuenta bloqueada, reclamar el link y aplicar el vínculo. Si una regla lo impide se revierte todo,
    // incluido el reclamo, y el link sigue sirviendo.
    try {
      return await invitations.runAcceptance(account.id, async (transaction): Promise<AcceptInvitationResult> => {
        // Un link que asigna al médico solo sirve mientras quien lo generó siga siendo médico activo.
        if (
          invitation.assignToCreator &&
          !(await transaction.isMembershipActiveDoctor({
            tenantId: invitation.tenantId,
            membershipId: invitation.createdByMembershipId,
          }))
        ) {
          return { status: "INVALID" };
        }

        const moment = now();
        const claimed = await transaction.claim({
          tenantId: invitation.tenantId,
          invitationId: invitation.id,
          accountId: account.id,
          now: moment,
        });

        if (!claimed) {
          return { status: "INVALID" };
        }

        const applied: Applied = { tenantName, account, invitation, now: moment };

        const relationship =
          verification.kind === "DOCTOR"
            ? await applyDoctorRelationship(transaction, {
                tenantId: invitation.tenantId,
                account,
                licenseNumber: invitation.licenseNumber ?? "",
                specialty: verification.specialty,
              })
            : await applyPatientRelationship(transaction, {
                tenantId: invitation.tenantId,
                account,
                documentType: verification.documentType,
                documentNumber: verification.documentNumber,
                // Un link de un médico asigna al paciente a ese médico, también si el paciente ya pertenecía a la clínica.
                assignTo: invitation.assignToCreator
                  ? { membershipId: invitation.createdByMembershipId, createdByUserId: invitation.createdByUserId }
                  : null,
                now: moment,
              });

        return toAcceptResult(relationship, applied);
      });
    } catch (error) {
      const conflict = asConflict(error);

      if (conflict) {
        return { status: "CONFLICT", reason: conflict.reason };
      }

      throw error;
    }
  };
}
