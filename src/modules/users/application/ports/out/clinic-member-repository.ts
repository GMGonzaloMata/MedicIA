import type { NewClinicUserEvent } from "../../../domain/clinic-user-events";
import type { AccessUser } from "../../../domain/access-context";
import type { StaffDeactivationCheck } from "../../../domain/clinic-user-rules";
import type { DocumentType } from "../../../domain/invitation";
import type { RelationshipTransaction } from "./invitation-repository";

// Contrato de la gestión de usuarios de una clínica (specs/010-gestion-usuarios-clinica/contracts/clinic-user-use-cases.md).
// Toda operación recibe el `tenantId` del actor autenticado. Los identificadores que llegan del cliente (membresía,
// paciente, asignación) se buscan siempre con esa clínica: uno ajeno da el mismo resultado que uno inexistente.
// Las fechas las pone la aplicación con su reloj. Cada cambio escribe su evento de gestión en la misma transacción.

export interface Page<T> {
  items: T[];
  total: number;
}

export interface StaffListItem {
  membershipId: string;
  fullName: string;
  email: string;
  isClinicAdmin: boolean;
  isDoctor: boolean;
  specialty: string | null;
  licenseNumber: string | null;
  status: "ACTIVE" | "DEACTIVATED";
  // Verdadero si la cuenta ya inició sesión alguna vez. Mientras no lo haga se le puede reenviar el acceso.
  hasSignedIn: boolean;
}

export interface AssignedDoctor {
  assignmentId: string;
  membershipId: string;
  fullName: string;
  // Verdadero si el médico está activo: una asignación de un médico desactivado se conserva pero no tiene efecto.
  isActive: boolean;
}

export interface PatientListItem {
  patientId: string;
  fullName: string | null;
  documentType: DocumentType;
  documentNumber: string;
  status: "PENDING" | "LINKED" | "REVOKED";
  // Solo las asignaciones vigentes.
  doctors: AssignedDoctor[];
  // Falso si todavía no hay cuenta vinculada (paciente pendiente) o si la cuenta nunca inició sesión.
  hasSignedIn: boolean;
  hasAccount: boolean;
}

export interface ActiveDoctor {
  membershipId: string;
  fullName: string;
  specialty: string | null;
}

export type ResendTargetRef = { kind: "STAFF"; membershipId: string } | { kind: "PATIENT"; patientId: string };

// Lo que hace falta para decidir y hacer un reenvío del acceso.
export interface ResendTarget {
  tenantName: string;
  userId: string;
  email: string;
  // El rol con el que se la vinculó, para el texto del aviso.
  kind: "DOCTOR" | "PATIENT";
  hasSignedIn: boolean;
  // Los médicos con una asignación vigente al paciente (vacío si el objetivo es personal).
  assignedMembershipIds: string[];
  membershipId: string | null;
  patientId: string | null;
}

export interface ManagementActor {
  userId: string;
  membershipId: string;
}

export type StatusChangeResult = { status: "CHANGED" } | { status: "ALREADY_IN_STATE" } | { status: "NOT_FOUND" };

export type DeactivateStaffResult =
  | StatusChangeResult
  | { status: "REJECTED"; reason: Exclude<StaffDeactivationCheck, "OK"> };

export type AssignDoctorResult =
  | { status: "ASSIGNED" }
  | { status: "ALREADY_ASSIGNED" }
  | { status: "PATIENT_NOT_LINKED" }
  | { status: "NOT_AN_ACTIVE_DOCTOR" }
  | { status: "NOT_FOUND" };

export type EndAssignmentResult = { status: "UNASSIGNED" } | { status: "NOT_FOUND" };

// Lo que el alta hace dentro de la transacción: aplicar el vínculo (igual que aceptar un link) y registrar los eventos.
export interface EnrollmentTransaction extends RelationshipTransaction {
  recordEvent(event: NewClinicUserEvent): Promise<void>;
}

export interface ClinicMemberRepository {
  // Orden por nombre y luego por identificador. `page` empieza en 1.
  listStaff(input: { tenantId: string; page: number; pageSize: number }): Promise<Page<StaffListItem>>;

  // Orden por nombre (los pacientes sin nombre al final) y luego por identificador.
  listPatients(input: { tenantId: string; page: number; pageSize: number }): Promise<Page<PatientListItem>>;

  // Médicos activos de la clínica, para elegir a quién asignar. Sin paginar.
  listActiveDoctors(input: { tenantId: string }): Promise<ActiveDoctor[]>;

  findTenantName(input: { tenantId: string }): Promise<string | null>;

  // `null` si el objetivo no es de la clínica, no existe o no tiene cuenta, sin distinguir los casos.
  findResendTarget(input: { tenantId: string; target: ResendTargetRef }): Promise<ResendTarget | null>;

  // Ejecuta el alta con la fila de la cuenta bloqueada: dos altas de la misma persona se ordenan, así la regla del
  // vínculo único por clínica no se puede burlar. Si el trabajo falla se revierte todo.
  runEnrollment<T>(
    input: { tenantId: string; account: { userId: string } | { subject: string; email: string; fullName: string }; now: Date },
    work: (transaction: EnrollmentTransaction, account: AccessUser) => Promise<T>,
  ): Promise<T>;

  // Escribe un evento suelto (por ejemplo, un reenvío del acceso).
  recordEvent(event: NewClinicUserEvent): Promise<void>;

  // Desactiva al integrante en una transacción que bloquea la clínica, así dos bajas simultáneas no dejan a la clínica
  // sin administradores. `check` decide con los datos leídos dentro de la transacción.
  deactivateStaff(input: {
    tenantId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
    check: (facts: { targetIsClinicAdmin: boolean; otherActiveAdmins: number }) => StaffDeactivationCheck;
  }): Promise<DeactivateStaffResult>;

  reactivateStaff(input: {
    tenantId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult>;

  // `LINKED` pasa a `REVOKED`. Un paciente pendiente o ya revocado es `ALREADY_IN_STATE` o `NOT_FOUND` según el caso.
  revokePatient(input: {
    tenantId: string;
    patientId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult>;

  // `REVOKED` pasa a `LINKED`; conserva el mismo registro.
  reactivatePatient(input: {
    tenantId: string;
    patientId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult>;

  assignDoctor(input: {
    tenantId: string;
    patientId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<AssignDoctorResult>;

  // Termina la asignación vigente con quién y cuándo. Una ya terminada o de otra clínica es `NOT_FOUND`.
  endAssignment(input: {
    tenantId: string;
    assignmentId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<EndAssignmentResult>;
}
