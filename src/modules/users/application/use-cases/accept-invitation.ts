import type { DocumentType, InvitationKind } from "../../domain/invitation";
import { InvitationConflictError, type InvitationConflictReason } from "../../domain/invitation-errors";
import { normalizeProof, proofMatches } from "../../domain/invitation-proof";
import { checkRelationshipCompatibility } from "../../domain/relationship-compatibility";
import type { InvitationRepository } from "../ports/out/invitation-repository";
import { acceptInvitationSchema } from "../validation/invitation-form-schemas";
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

// Next puede cargar el módulo de errores más de una vez, y entonces `instanceof` falla entre copias: se distingue por nombre.
function asConflict(error: unknown): InvitationConflictError | null {
  return error instanceof Error && error.name === "InvitationConflictError" ? (error as InvitationConflictError) : null;
}

export function createAcceptInvitation({ invitations, now }: Dependencies) {
  return async function acceptInvitation(input: AcceptInvitationInput): Promise<AcceptInvitationResult> {
    const { token, account } = input;

    // 1 a 3: la forma del token, su vigencia, la clínica, quien lo generó y el correo de la cuenta. Cualquier falla es
    // el mismo `INVALID`, y no gasta intentos: solo cuentan los de la persona a quien va dirigido el link.
    const context = await findUsableInvitation(invitations, token, account.email, now());

    // La rama de pacientes se agrega con su historia: hasta entonces solo se atienden los links de médico.
    if (!context?.invitation.licenseNumber || context.invitation.kind !== "DOCTOR") {
      return { status: "INVALID" };
    }

    const expectedLicense = context.invitation.licenseNumber;
    const { invitation, tenantName } = context;

    // 4: los campos del tipo.
    const proof = acceptInvitationSchema.safeParse(input.proof);

    if (!proof.success || !proof.data.licenseNumber || !proof.data.specialty) {
      return { status: "INVALID" };
    }

    const { licenseNumber: providedLicense, specialty } = proof.data;

    // 5: la matrícula que cargó quien invitó. Un fallo cuenta un intento; con el último, el link queda invalidado.
    if (!proofMatches(expectedLicense, providedLicense)) {
      const { attemptsLeft } = await invitations.registerFailedAttempt({ invitationId: invitation.id, now: now() });

      return { status: "PROOF_MISMATCH", attemptsLeft };
    }

    // 6: con la cuenta bloqueada, reclamar el link y aplicar el vínculo. Si una regla lo impide se revierte todo,
    // incluido el reclamo, y el link sigue sirviendo.
    try {
      return await invitations.runAcceptance(account.id, async (transaction): Promise<AcceptInvitationResult> => {
        const moment = now();
        const claimed = await transaction.claim({ invitationId: invitation.id, accountId: account.id, now: moment });

        if (!claimed) {
          return { status: "INVALID" };
        }

        const facts = await transaction.findRelationshipFacts({
          tenantId: invitation.tenantId,
          userId: account.id,
          documentType: null,
          documentNumber: null,
          licenseNumber: expectedLicense,
        });
        const compatibility = checkRelationshipCompatibility({
          kind: invitation.kind,
          staff: facts.staff,
          patient: facts.patient,
        });

        if (compatibility.result === "CONFLICT") {
          throw new InvitationConflictError(compatibility.reason);
        }

        if (compatibility.result === "ALREADY_MEMBER") {
          return { status: "ALREADY_MEMBER", tenantName };
        }

        if (facts.licenseOwnerUserId && facts.licenseOwnerUserId !== account.id) {
          throw new InvitationConflictError("LICENSE_IN_USE");
        }

        const { membershipId } = await transaction.createDoctorMembership({
          tenantId: invitation.tenantId,
          userId: account.id,
          // La matrícula que se guarda es la que cargó quien invitó, normalizada, no la que escribió la persona.
          licenseNumber: normalizeProof(expectedLicense),
          specialty,
        });

        return {
          status: "ACCEPTED",
          kind: invitation.kind,
          tenantName,
          relationshipKind: "STAFF",
          relationshipId: membershipId,
          assignedToDoctor: false,
        };
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
