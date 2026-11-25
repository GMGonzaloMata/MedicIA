import type { PatientDirectory } from "@/modules/studies/application/ports/out/patient-directory";
import type {
  AssignedPatientSummary,
  LastStudy,
  PatientListCounts,
  PatientListFilter,
  PatientListSort,
  PatientSearch,
} from "@/modules/studies/domain/patient-list";
import type { PatientSummary } from "@/modules/studies/domain/study";

type StoredPatient = PatientSummary & { lastStudy?: LastStudy | null };

interface Assignment {
  tenantId: string;
  membershipId: string;
  patient: StoredPatient;
  isActive: boolean;
}

// Cumple el puerto en memoria. Las pruebas cargan asignaciones con `assign` y las terminan con `end`.
export class InMemoryPatientDirectory implements PatientDirectory {
  private readonly assignments: Assignment[] = [];

  assign(input: { tenantId: string; membershipId: string; patient: StoredPatient }): void {
    this.assignments.push({ ...input, isActive: true });
  }

  end(input: { tenantId: string; membershipId: string; patientId: string }): void {
    for (const assignment of this.assignments) {
      if (
        assignment.tenantId === input.tenantId &&
        assignment.membershipId === input.membershipId &&
        assignment.patient.id === input.patientId
      ) {
        assignment.isActive = false;
      }
    }
  }

  private active(tenantId: string, membershipId: string): AssignedPatientSummary[] {
    return this.assignments
      .filter(
        (assignment) => assignment.isActive && assignment.tenantId === tenantId && assignment.membershipId === membershipId,
      )
      .map((assignment) => ({ ...assignment.patient, lastStudy: assignment.patient.lastStudy ?? null }))
      .sort((first, second) => (first.fullName ?? "").localeCompare(second.fullName ?? ""));
  }

  async listAssignedPatients(input: {
    tenantId: string;
    membershipId: string;
    page: number;
    pageSize: number;
    search?: PatientSearch | null;
    filter?: PatientListFilter;
    sort?: PatientListSort;
    recentSince: Date;
  }): Promise<{ items: AssignedPatientSummary[]; totalItems: number }> {
    const isRecent = (patient: AssignedPatientSummary) =>
      patient.lastStudy !== null && patient.lastStudy.uploadedAt >= input.recentSince;
    const search = input.search;
    let all = this.active(input.tenantId, input.membershipId).filter((patient) => {
      const matchesSearch =
        !search ||
        (patient.fullName ?? "").toLowerCase().includes(search.name.toLowerCase()) ||
        (search.document.length > 0 && patient.documentNumber.toLowerCase().includes(search.document.toLowerCase()));
      const matchesFilter =
        input.filter === "recent" ? isRecent(patient) : input.filter === "without-studies" ? patient.studyCount === 0 : true;
      return matchesSearch && matchesFilter;
    });
    if (input.sort !== "name") {
      const time = (patient: AssignedPatientSummary) => patient.lastStudy?.uploadedAt.getTime() ?? -Infinity;
      all = all.sort((first, second) => time(second) - time(first));
    }
    const start = (input.page - 1) * input.pageSize;

    return { items: all.slice(start, start + input.pageSize), totalItems: all.length };
  }

  async countAssignedPatients(input: { tenantId: string; membershipId: string; recentSince: Date }): Promise<PatientListCounts> {
    const all = this.active(input.tenantId, input.membershipId);

    return {
      total: all.length,
      recent: all.filter((patient) => patient.lastStudy !== null && patient.lastStudy.uploadedAt >= input.recentSince).length,
      withoutStudies: all.filter((patient) => patient.studyCount === 0).length,
    };
  }

  async findAssignedPatient(input: {
    tenantId: string;
    membershipId: string;
    patientId: string;
  }): Promise<PatientSummary | null> {
    const found = this.assignments.find(
      (assignment) =>
        assignment.isActive &&
        assignment.tenantId === input.tenantId &&
        assignment.membershipId === input.membershipId &&
        assignment.patient.id === input.patientId,
    );

    return found?.patient ?? null;
  }

  async hasActiveAssignment(input: { tenantId: string; membershipId: string; patientId: string }): Promise<boolean> {
    return this.assignments.some(
      (assignment) =>
        assignment.isActive &&
        assignment.tenantId === input.tenantId &&
        assignment.membershipId === input.membershipId &&
        assignment.patient.id === input.patientId,
    );
  }
}
