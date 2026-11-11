import type { DocumentType } from "../../domain/invitation";
import { InvitationConflictError } from "../../domain/invitation-errors";
import { normalizeProof } from "../../domain/invitation-proof";
import { checkRelationshipCompatibility } from "../../domain/relationship-compatibility";
import type { RelationshipTransaction } from "../ports/out/invitation-repository";

// Aplica un vínculo con una clínica dentro de una transacción con la fila de la cuenta bloqueada. Lo comparten aceptar
// un link (009) y el alta directa (010), así que las dos hacen cumplir las mismas reglas: un solo tipo de vínculo por
// clínica, matrícula y documento únicos, y el registro de un paciente revocado o pendiente se reutiliza.
// Si una regla lo impide lanza `InvitationConflictError`, para que quien llama revierta toda la transacción.

export type RelationshipResult =
  // Se creó el vínculo (o se recuperó el del paciente revocado).
  | { status: "LINKED"; kind: "DOCTOR" | "PATIENT"; relationshipId: string; assignmentCreated: boolean }
  // Ya tenía ese vínculo: no se duplicó nada. Aun así puede haberse agregado la asignación que faltaba.
  | { status: "ALREADY_MEMBER"; kind: "DOCTOR" | "PATIENT"; relationshipId: string; assignmentCreated: boolean };

interface Account {
  id: string;
  fullName: string;
}

export interface ApplyDoctorInput {
  tenantId: string;
  account: Account;
  licenseNumber: string;
  specialty: string;
}

export interface ApplyPatientInput {
  tenantId: string;
  account: Account;
  documentType: DocumentType;
  documentNumber: string;
  // Un médico que da de alta, o genera el link, deja al paciente asignado a él.
  assignTo: { membershipId: string; createdByUserId: string } | null;
  now: Date;
}

export async function applyDoctorRelationship(
  transaction: RelationshipTransaction,
  { tenantId, account, licenseNumber: rawLicense, specialty }: ApplyDoctorInput,
): Promise<RelationshipResult> {
  const licenseNumber = normalizeProof(rawLicense);
  const facts = await transaction.findRelationshipFacts({
    tenantId,
    userId: account.id,
    documentType: null,
    documentNumber: null,
    licenseNumber,
  });
  const compatibility = checkRelationshipCompatibility({ kind: "DOCTOR", staff: facts.staff, patient: facts.patient });

  if (compatibility.result === "CONFLICT") {
    throw new InvitationConflictError(compatibility.reason);
  }

  if (compatibility.result === "ALREADY_MEMBER" && facts.staff) {
    return { status: "ALREADY_MEMBER", kind: "DOCTOR", relationshipId: facts.staff.membershipId, assignmentCreated: false };
  }

  if (facts.licenseOwnerUserId && facts.licenseOwnerUserId !== account.id) {
    throw new InvitationConflictError("LICENSE_IN_USE");
  }

  // La matrícula que se guarda es la que cargó quien invitó o dio de alta, normalizada.
  const { membershipId } = await transaction.createDoctorMembership({
    tenantId,
    userId: account.id,
    licenseNumber,
    specialty,
  });

  return { status: "LINKED", kind: "DOCTOR", relationshipId: membershipId, assignmentCreated: false };
}

export async function applyPatientRelationship(
  transaction: RelationshipTransaction,
  { tenantId, account, documentType, documentNumber: rawDocument, assignTo, now }: ApplyPatientInput,
): Promise<RelationshipResult> {
  const documentNumber = normalizeProof(rawDocument);
  const facts = await transaction.findRelationshipFacts({
    tenantId,
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
  let status: RelationshipResult["status"];

  if (compatibility.result === "ALREADY_MEMBER" && facts.patient) {
    patientId = facts.patient.patientId;
    status = "ALREADY_MEMBER";
  } else {
    // Se reutiliza el registro propio revocado, o el pendiente con ese documento: conserva su historial y su número.
    const reusePatientId = facts.patient?.patientId ?? facts.patientByDocument?.patientId ?? null;

    ({ patientId } = await transaction.linkPatient({
      tenantId,
      userId: account.id,
      fullName: account.fullName,
      documentType,
      documentNumber,
      reusePatientId,
      now,
    }));
    status = "LINKED";
  }

  let assignmentCreated = false;

  if (assignTo) {
    ({ created: assignmentCreated } = await transaction.assignDoctorIfAbsent({
      tenantId,
      membershipId: assignTo.membershipId,
      patientId,
      createdByUserId: assignTo.createdByUserId,
      now,
    }));
  }

  return { status, kind: "PATIENT", relationshipId: patientId, assignmentCreated };
}
