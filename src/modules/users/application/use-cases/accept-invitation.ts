import type { DocumentType, InvitationKind, InvitationRecord } from "../../domain/invitation";
import { InvitationConflictError, type InvitationConflictReason } from "../../domain/invitation-errors";
import { normalizeProof, proofMatches } from "../../domain/invitation-proof";
import { checkRelationshipCompatibility } from "../../domain/relationship-compatibility";
import type { AcceptanceTransaction, InvitationRepository } from "../ports/out/invitation-repository";
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

async function applyDoctor(
  transaction: AcceptanceTransaction,
  { tenantName, account, invitation }: Applied,
  specialty: string,
): Promise<AcceptInvitationResult> {
  const licenseNumber = normalizeProof(invitation.licenseNumber ?? "");
  const facts = await transaction.findRelationshipFacts({
    tenantId: invitation.tenantId,
    userId: account.id,
    documentType: null,
    documentNumber: null,
    licenseNumber,
  });
  const compatibility = checkRelationshipCompatibility({ kind: "DOCTOR", staff: facts.staff, patient: facts.patient });

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
    licenseNumber,
    specialty,
  });

  return {
    status: "ACCEPTED",
    kind: "DOCTOR",
    tenantName,
    relationshipKind: "STAFF",
    relationshipId: membershipId,
    assignedToDoctor: false,
  };
}

async function applyPatient(
  transaction: AcceptanceTransaction,
  { tenantName, account, invitation, now }: Applied,
  documentType: DocumentType,
  documentNumber: string,
): Promise<AcceptInvitationResult> {
  const facts = await transaction.findRelationshipFacts({
    tenantId: invitation.tenantId,
    userId: account.id,
    documentType,
    documentNumber,
    licenseNumber: null,
  });
  const compatibility = checkRelationshipCompatibility({ kind: "PATIENT", staff: facts.staff, patient: facts.patient });

  if (compatibility.result === "CONFLICT") {
    throw new InvitationConflictError(compatibility.reason);
  }

  // Una cuenta con un registro de paciente con otro documento no puede vincular este.
  if (
    facts.patient &&
    (facts.patient.documentType !== documentType || normalizeProof(facts.patient.documentNumber) !== documentNumber)
  ) {
    throw new InvitationConflictError("DOCUMENT_IN_USE");
  }

  // El documento ya es de otra cuenta.
  if (facts.patientByDocument?.userId && facts.patientByDocument.userId !== account.id) {
    throw new InvitationConflictError("DOCUMENT_IN_USE");
  }

  let patientId: string;
  let outcome: "ACCEPTED" | "ALREADY_MEMBER";

  if (compatibility.result === "ALREADY_MEMBER" && facts.patient) {
    patientId = facts.patient.patientId;
    outcome = "ALREADY_MEMBER";
  } else {
    // Se reutiliza el registro propio revocado, o el pendiente con ese documento: conserva su historial y su número.
    const reusePatientId = facts.patient?.patientId ?? facts.patientByDocument?.patientId ?? null;

    ({ patientId } = await transaction.linkPatient({
      tenantId: invitation.tenantId,
      userId: account.id,
      fullName: account.fullName,
      documentType,
      documentNumber,
      reusePatientId,
      now,
    }));
    outcome = "ACCEPTED";
  }

  // Un link de un médico asigna al paciente a ese médico, también si el paciente ya pertenecía a la clínica.
  if (invitation.assignToCreator) {
    await transaction.assignDoctorIfAbsent({
      tenantId: invitation.tenantId,
      membershipId: invitation.createdByMembershipId,
      patientId,
      createdByUserId: invitation.createdByUserId,
      now,
    });
  }

  if (outcome === "ALREADY_MEMBER") {
    return { status: "ALREADY_MEMBER", tenantName };
  }

  return {
    status: "ACCEPTED",
    kind: "PATIENT",
    tenantName,
    relationshipKind: "PATIENT",
    relationshipId: patientId,
    assignedToDoctor: invitation.assignToCreator,
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

        return verification.kind === "DOCTOR"
          ? applyDoctor(transaction, applied, verification.specialty)
          : applyPatient(transaction, applied, verification.documentType, verification.documentNumber);
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
