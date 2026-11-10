import type { PatientSummary } from "../../../domain/study";

// Lectura de los pacientes a los que un médico tiene acceso. Solo cuentan las asignaciones vigentes con
// pacientes vinculados; una asignación terminada quita el acceso y una nueva lo devuelve.
export interface PatientDirectory {
  listAssignedPatients(input: {
    tenantId: string;
    membershipId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: PatientSummary[]; totalItems: number }>;

  // Una sola consulta que incluye la clínica, el médico y el paciente: un paciente ajeno, de otra clínica,
  // sin asignación o con la asignación terminada devuelve false, sin distinguir los casos.
  hasActiveAssignment(input: {
    tenantId: string;
    membershipId: string;
    patientId: string;
  }): Promise<boolean>;
}
