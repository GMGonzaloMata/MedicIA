import type {
  ClinicPatient,
  PatientRegistryRepository,
  PatientStatus,
} from "@/modules/tenants/application/ports/out/patient-registry-repository";
import type { DocumentType } from "@/modules/tenants/domain/normalized-values";
import type { StoredLinkCodeStatus } from "@/modules/tenants/domain/patient-link-code";

import type { createInMemoryClinicStore } from "./in-memory-clinic-store";

export interface PatientRow {
  id: string;
  tenantId: string;
  documentType: DocumentType;
  documentNumber: string;
  fullName: string | null;
  status: PatientStatus;
}

export interface LinkCodeRow {
  patientId: string;
  tenantId: string;
  codeHash: string;
  status: StoredLinkCodeStatus;
  expiresAt: Date;
  createdAt: Date;
}

export interface AssignmentRow {
  id: string;
  tenantId: string;
  patientId: string;
  membershipId: string;
  createdByUserId: string;
  endedAt: Date | null;
}

type ClinicStore = ReturnType<typeof createInMemoryClinicStore>;

// Padrón de pacientes en memoria. Comparte las asignaciones con `createInMemoryAssignmentRepository`, porque la
// lista de pacientes muestra al médico asignado. Aplica las mismas reglas que el repositorio real: unicidad del
// documento por clínica, un solo código activo por paciente y nada de otra clínica.
export function createInMemoryPatientRegistry(clinic: ClinicStore) {
  const patients: PatientRow[] = [];
  const codes: LinkCodeRow[] = [];
  const assignments: AssignmentRow[] = [];
  let sequence = 0;

  const repository: PatientRegistryRepository = {
    async register(input) {
      const duplicate = patients.some(
        (row) =>
          row.tenantId === input.tenantId &&
          row.documentType === input.documentType &&
          row.documentNumber === input.documentNumber,
      );

      if (duplicate) {
        return { kind: "duplicate" };
      }

      sequence += 1;
      const patient: PatientRow = {
        id: `patient-${sequence}`,
        tenantId: input.tenantId,
        documentType: input.documentType,
        documentNumber: input.documentNumber,
        // Como en la base: un paciente pendiente no tiene nombre.
        fullName: null,
        status: "PENDING",
      };
      patients.push(patient);
      codes.push({
        patientId: patient.id,
        tenantId: input.tenantId,
        codeHash: input.codeHash,
        status: "ACTIVE",
        expiresAt: input.expiresAt,
        createdAt: input.now,
      });

      return { kind: "created", patientId: patient.id };
    },

    async list(tenantId) {
      const members = await clinic.staff.listMembers(tenantId);
      const rows: ClinicPatient[] = patients
        .filter((patient) => patient.tenantId === tenantId)
        .map((patient) => {
          const latest = codes
            .filter((code) => code.patientId === patient.id)
            .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())[0];

          return {
            id: patient.id,
            fullName: patient.fullName,
            documentType: patient.documentType,
            documentNumber: patient.documentNumber,
            status: patient.status,
            latestCode: latest ? { status: latest.status, expiresAt: latest.expiresAt } : null,
            assignments: assignments
              .filter((assignment) => assignment.patientId === patient.id && assignment.endedAt === null)
              .flatMap((assignment) => {
                const doctor = members.find((member) => member.membershipId === assignment.membershipId);

                return doctor
                  ? [
                      {
                        assignmentId: assignment.id,
                        membershipId: assignment.membershipId,
                        doctorName: doctor.fullName,
                        doctorStatus: doctor.status,
                      },
                    ]
                  : [];
              }),
          };
        });

      return rows.sort((first, second) => (first.fullName ?? "").localeCompare(second.fullName ?? "", "es"));
    },

    async replaceLinkCode(input) {
      const patient = patients.find((row) => row.id === input.patientId && row.tenantId === input.tenantId);

      if (!patient || patient.status === "REVOKED") {
        return { kind: "not-found" };
      }

      if (patient.status === "LINKED") {
        return { kind: "already-linked" };
      }

      for (const code of codes) {
        if (code.patientId === patient.id && code.status === "ACTIVE") {
          code.status = "REPLACED";
        }
      }

      codes.push({
        patientId: patient.id,
        tenantId: input.tenantId,
        codeHash: input.codeHash,
        status: "ACTIVE",
        expiresAt: input.expiresAt,
        createdAt: input.now,
      });

      return { kind: "replaced" };
    },
  };

  return { repository, patients, codes, assignments };
}

export type InMemoryPatientRegistry = ReturnType<typeof createInMemoryPatientRegistry>;
