import type { DocumentType, NormalizedDocument } from "../../../domain/normalized-values";
import type { StoredLinkCodeStatus } from "../../../domain/patient-link-code";

export type PatientStatus = "PENDING" | "LINKED" | "REVOKED";

export interface ClinicPatientAssignment {
  assignmentId: string;
  membershipId: string;
  doctorName: string;
  // Un médico desactivado conserva la asignación vigente: la lista lo muestra para poder reasignar.
  doctorStatus: "ACTIVE" | "DEACTIVATED";
}

export interface ClinicPatient {
  id: string;
  fullName: string | null;
  documentType: DocumentType;
  documentNumber: string;
  status: PatientStatus;
  // Último código generado, para mostrar si hace falta uno nuevo. Nunca el código ni su hash.
  latestCode: { status: StoredLinkCodeStatus; expiresAt: Date } | null;
  assignments: ClinicPatientAssignment[];
}

export interface NewLinkCode {
  codeHash: string;
  expiresAt: Date;
  createdByUserId: string;
  now: Date;
}

export type RegisterPatientResult = { kind: "created"; patientId: string } | { kind: "duplicate" };

export type ReplaceLinkCodeResult = { kind: "replaced" } | { kind: "not-found" } | { kind: "already-linked" };

// Padrón de pacientes de una clínica. Toda consulta recibe el `tenantId` del actor: un paciente de otra clínica se
// trata como inexistente. No devuelve estudios ni ningún dato clínico.
export interface PatientRegistryRepository {
  // Crea el paciente (pendiente, sin nombre ni cuenta) y su primer código en una sola transacción.
  register(
    input: {
      tenantId: string;
      documentType: DocumentType;
      documentNumber: NormalizedDocument;
    } & NewLinkCode,
  ): Promise<RegisterPatientResult>;

  list(tenantId: string): Promise<ClinicPatient[]>;

  // Marca como reemplazado el código activo y crea uno nuevo, en una sola transacción. Solo para pacientes que
  // todavía no vincularon su cuenta.
  replaceLinkCode(input: { tenantId: string; patientId: string } & NewLinkCode): Promise<ReplaceLinkCodeResult>;
}
