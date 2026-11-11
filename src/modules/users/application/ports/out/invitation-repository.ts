import type {
  DocumentType,
  InvitationEntry,
  InvitationKind,
  InvitationRecord,
} from "../../../domain/invitation";
import type { PatientFact, StaffFact } from "../../../domain/relationship-compatibility";

// Lo que se guarda al generar una invitación. `tokenHash` ya viene calculado: el repositorio nunca ve el token.
export interface NewInvitation {
  tenantId: string;
  kind: InvitationKind;
  email: string;
  tokenHash: string;
  documentType: DocumentType | null;
  documentNumber: string | null;
  licenseNumber: string | null;
  createdByMembershipId: string;
  createdByUserId: string;
  assignToCreator: boolean;
  expiresAt: Date;
}

// Una invitación con lo necesario para decidir si todavía sirve: la clínica y quien la generó.
export interface InvitationContext {
  invitation: InvitationRecord;
  tenantName: string;
  isTenantActive: boolean;
  creator: { isMembershipActive: boolean; isDoctor: boolean };
}

// Lo que la persona con ese correo ya tiene en la clínica de quien invita. `null` si no tiene cuenta o vínculo.
export interface ClinicRelationshipFacts {
  staff: StaffFact | null;
  patient: PatientFact | null;
}

// Lo que se lee dentro de la transacción de aceptación, ya con la cuenta bloqueada.
export interface AcceptanceFacts {
  staff: (StaffFact & { membershipId: string }) | null;
  // El registro de paciente de esta cuenta en la clínica.
  patient: (PatientFact & { patientId: string; documentType: DocumentType; documentNumber: string }) | null;
  // El registro de paciente que ya usa ese documento en la clínica, sea de quien sea.
  patientByDocument: { patientId: string; userId: string | null; status: PatientFact["status"] } | null;
  // La cuenta que ya usa esa matrícula en la clínica.
  licenseOwnerUserId: string | null;
}

// Operaciones que el caso de uso de aceptar necesita dentro de la transacción. Todas filtran por la clínica de la
// invitación y se ejecutan con la fila de la cuenta bloqueada, así dos aceptaciones de la misma cuenta se ordenan.
export interface AcceptanceTransaction {
  // Actualización condicional: pasa a `ACCEPTED` solo si sigue pendiente, no venció y le quedan intentos.
  // Devuelve si lo logró; si no, el link no es válido y no se escribe nada más.
  claim(input: { invitationId: string; accountId: string; now: Date }): Promise<boolean>;

  findRelationshipFacts(input: {
    tenantId: string;
    userId: string;
    documentType: DocumentType | null;
    documentNumber: string | null;
    licenseNumber: string | null;
  }): Promise<AcceptanceFacts>;

  // Lanza `InvitationConflictError("LICENSE_IN_USE")` si la matrícula ya la usa otro integrante.
  createDoctorMembership(input: {
    tenantId: string;
    userId: string;
    licenseNumber: string;
    specialty: string;
  }): Promise<{ membershipId: string }>;

  // Crea el registro de paciente vinculado o reutiliza `reusePatientId` (revocado, o pendiente con ese documento).
  // Lanza `InvitationConflictError("DOCUMENT_IN_USE")` si el documento ya lo usa otro registro.
  linkPatient(input: {
    tenantId: string;
    userId: string;
    fullName: string;
    documentType: DocumentType;
    documentNumber: string;
    reusePatientId: string | null;
    now: Date;
  }): Promise<{ patientId: string }>;

  // Crea la asignación vigente de la pareja, salvo que ya haya una activa. No toca las de otros médicos.
  assignDoctorIfAbsent(input: {
    tenantId: string;
    membershipId: string;
    patientId: string;
    createdByUserId: string;
    now: Date;
  }): Promise<void>;

  isMembershipActiveDoctor(input: { tenantId: string; membershipId: string }): Promise<boolean>;
}

// Toda operación sobre una clínica recibe `tenantId`. La única búsqueda sin clínica es por el hash del token, que es
// único y secreto; quien la llama valida a continuación todo contra la clínica de la invitación.
export interface InvitationRepository {
  // Cierra los pendientes del mismo correo y clínica (los vencidos como `EXPIRED`, los vigentes como `REVOKED` con
  // motivo `REPLACED`) e inserta la nueva, en una transacción.
  createReplacing(input: NewInvitation, now: Date): Promise<InvitationRecord>;

  // Marca que el servicio de correo aceptó el mensaje. Devuelve si afectó una invitación pendiente sin marcar.
  markSent(input: { tenantId: string; invitationId: string; now: Date }): Promise<boolean>;

  // Pendientes no vencidos de una clínica activa cuyo emisor sigue vigente, del más nuevo al más viejo.
  listPending(input: {
    tenantId: string;
    createdByMembershipId?: string;
    now: Date;
    limit: number;
  }): Promise<InvitationEntry[]>;

  findById(input: { tenantId: string; invitationId: string }): Promise<InvitationRecord | null>;

  // Revoca una invitación pendiente y no vencida con motivo `BY_SENDER`. Devuelve si lo hizo.
  revoke(input: { tenantId: string; invitationId: string; now: Date }): Promise<boolean>;

  findByTokenHash(tokenHash: string): Promise<InvitationContext | null>;

  // Suma un intento incorrecto de forma atómica; al llegar al máximo revoca la invitación con `ATTEMPTS_EXCEEDED`.
  registerFailedAttempt(input: { invitationId: string; now: Date }): Promise<{ attemptsLeft: number }>;

  runAcceptance<T>(userId: string, work: (transaction: AcceptanceTransaction) => Promise<T>): Promise<T>;

  // Lo que la cuenta con ese correo ya tiene en la clínica, para avisar un conflicto al invitar.
  findClinicFacts(input: { tenantId: string; email: string }): Promise<ClinicRelationshipFacts>;

  // A quién pertenece un documento o una matrícula en la clínica: el correo de la cuenta (nulo si el paciente está
  // pendiente) o `null` si nadie lo usa.
  findDocumentOwner(input: {
    tenantId: string;
    documentType: DocumentType;
    documentNumber: string;
  }): Promise<{ email: string | null } | null>;

  findLicenseOwner(input: { tenantId: string; licenseNumber: string }): Promise<{ email: string } | null>;
}
