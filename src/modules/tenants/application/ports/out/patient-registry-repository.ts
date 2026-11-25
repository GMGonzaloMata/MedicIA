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

// Registro pendiente con un código activo y vigente que podría ser el de quien intenta vincularse.
export interface LinkCandidate {
  patientId: string;
  tenantId: string;
  codeId: string;
  codeHash: string;
}

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

  // Vinculación por la cuenta del paciente. Es una de las dos lecturas sin clínica previa de la funcionalidad: la
  // persona todavía no pertenece a ninguna, así que se busca por documento en todas y la clínica sale del registro
  // encontrado, nunca de un dato del cliente.
  //
  // Reserva un intento en cada código antes de evaluarlo: en una sola sentencia atómica suma 1 a `failed_attempts` de
  // cada código activo, vigente y con menos de `maxAttempts` intentos, y devuelve solo esos. Así una ráfaga de pedidos
  // simultáneos no puede evaluar más de `maxAttempts` veces el mismo código.
  reserveCodeAttempts(input: {
    documentType: DocumentType;
    documentNumber: NormalizedDocument;
    now: Date;
    maxAttempts: number;
  }): Promise<LinkCandidate[]>;

  // Asocia la cuenta al paciente, pasa el código a usado y borra los intentos fallidos de la cuenta, todo en una
  // transacción. Falla (`rejected`) si otra vinculación ganó, si el código ya no sirve o si la cuenta ya es paciente
  // de esa clínica.
  linkAccount(input: {
    candidate: LinkCandidate;
    user: { id: string; fullName: string };
    now: Date;
  }): Promise<{ kind: "linked" } | { kind: "rejected" }>;

  // Pasa a bloqueado cada código que llegó al máximo de intentos (el intento ya se reservó al evaluarlo).
  lockExhaustedCodes(input: { codeIds: string[]; maxAttempts: number; now: Date }): Promise<void>;

  // Devuelve el intento reservado a los códigos que no eran los de la persona cuando la vinculación salió bien:
  // un intento exitoso no debe gastar los intentos del código de otra clínica con el mismo documento.
  releaseCodeAttempts(input: { codeIds: string[] }): Promise<void>;
}
