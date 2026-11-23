import type { AssignmentRepository } from "@/modules/tenants/application/ports/out/assignment-repository";

import type { createInMemoryClinicStore } from "./in-memory-clinic-store";
import type { InMemoryPatientRegistry } from "./in-memory-patient-registry-repository";

// Asignaciones en memoria sobre el mismo estado que el padrón de pacientes y el personal. Como la base, no deja
// dos asignaciones vigentes para el mismo médico y paciente y busca todo dentro de la clínica del actor.
export function createInMemoryAssignmentRepository(
  clinic: ReturnType<typeof createInMemoryClinicStore>,
  registry: InMemoryPatientRegistry,
): AssignmentRepository {
  let sequence = 0;

  return {
    async findTarget({ tenantId, patientId, membershipId }) {
      const patient = registry.patients.find((row) => row.id === patientId && row.tenantId === tenantId);
      const membership = clinic.memberships.find((row) => row.id === membershipId && row.tenantId === tenantId);

      return {
        patientExists: patient !== undefined,
        doctor: membership ? { isDoctor: membership.roles.isDoctor, status: membership.status } : null,
      };
    },

    async create({ tenantId, patientId, membershipId, createdByUserId }) {
      const active = registry.assignments.some(
        (row) => row.membershipId === membershipId && row.patientId === patientId && row.endedAt === null,
      );

      if (active) {
        return { kind: "already-assigned" };
      }

      sequence += 1;
      const id = `assignment-${sequence}`;
      registry.assignments.push({ id, tenantId, patientId, membershipId, createdByUserId, endedAt: null });

      return { kind: "created", assignmentId: id };
    },
  };
}
