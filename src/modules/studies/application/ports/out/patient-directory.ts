import type {
  AssignedPatientSummary,
  PatientListCounts,
  PatientListFilter,
  PatientListSort,
  PatientSearch,
} from "../../../domain/patient-list";
import type { PatientSummary } from "../../../domain/study";

// Lectura de los pacientes a los que un médico tiene acceso. Solo cuentan las asignaciones vigentes con
// pacientes vinculados; una asignación terminada quita el acceso y una nueva lo devuelve.
export interface PatientDirectory {
  // Búsqueda, filtro y orden se aplican sobre todos los pacientes asignados antes de paginar. `recentSince`
  // marca el inicio de la ventana de estudios recientes. Con el orden «recent», los pacientes sin estudios van
  // al final, por nombre.
  listAssignedPatients(input: {
    tenantId: string;
    membershipId: string;
    page: number;
    pageSize: number;
    search?: PatientSearch | null;
    filter?: PatientListFilter;
    sort?: PatientListSort;
    recentSince: Date;
  }): Promise<{ items: AssignedPatientSummary[]; totalItems: number }>;

  // Indicadores sobre todos los pacientes asignados, sin búsqueda ni filtro.
  countAssignedPatients(input: { tenantId: string; membershipId: string; recentSince: Date }): Promise<PatientListCounts>;

  // El paciente asignado con vigencia, o null: mismos criterios que `hasActiveAssignment`.
  findAssignedPatient(input: {
    tenantId: string;
    membershipId: string;
    patientId: string;
  }): Promise<PatientSummary | null>;

  // Una sola consulta que incluye la clínica, el médico y el paciente: un paciente ajeno, de otra clínica,
  // sin asignación o con la asignación terminada devuelve false, sin distinguir los casos.
  hasActiveAssignment(input: {
    tenantId: string;
    membershipId: string;
    patientId: string;
  }): Promise<boolean>;
}
