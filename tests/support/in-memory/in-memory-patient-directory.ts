import type { PatientDirectory } from "@/modules/studies/application/ports/out/patient-directory";
import type { PatientSummary } from "@/modules/studies/domain/study";

interface Assignment {
  tenantId: string;
  membershipId: string;
  patient: PatientSummary;
  isActive: boolean;
}

// Cumple el puerto en memoria. Las pruebas cargan asignaciones con `assign` y las terminan con `end`.
export class InMemoryPatientDirectory implements PatientDirectory {
  private readonly assignments: Assignment[] = [];

  assign(input: { tenantId: string; membershipId: string; patient: PatientSummary }): void {
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

  async listAssignedPatients(input: {
    tenantId: string;
    membershipId: string;
    page: number;
    pageSize: number;
  }): Promise<{ items: PatientSummary[]; totalItems: number }> {
    const all = this.assignments
      .filter(
        (assignment) =>
          assignment.isActive && assignment.tenantId === input.tenantId && assignment.membershipId === input.membershipId,
      )
      .map((assignment) => assignment.patient)
      .sort((first, second) => (first.fullName ?? "").localeCompare(second.fullName ?? ""));
    const start = (input.page - 1) * input.pageSize;

    return { items: all.slice(start, start + input.pageSize), totalItems: all.length };
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
