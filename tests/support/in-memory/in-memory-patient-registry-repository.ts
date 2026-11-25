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
  userId: string | null;
  status: PatientStatus;
}

export interface LinkCodeRow {
  id: string;
  failedAttempts: number;
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
  endedByUserId?: string;
}

type ClinicStore = ReturnType<typeof createInMemoryClinicStore>;

// Padrón de pacientes en memoria. Comparte las asignaciones con `createInMemoryAssignmentRepository`, porque la
// lista de pacientes muestra al médico asignado. Aplica las mismas reglas que el repositorio real: unicidad del
// documento por clínica, un solo código activo por paciente y nada de otra clínica.
export function createInMemoryPatientRegistry(clinic: ClinicStore, linkAttempts: Date[] = []) {
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
        userId: null,
        status: "PENDING",
      };
      patients.push(patient);
      codes.push({
        id: `code-${(sequence += 1)}`,
        failedAttempts: 0,
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
        id: `code-${(sequence += 1)}`,
        failedAttempts: 0,
        patientId: patient.id,
        tenantId: input.tenantId,
        codeHash: input.codeHash,
        status: "ACTIVE",
        expiresAt: input.expiresAt,
        createdAt: input.now,
      });

      return { kind: "replaced" };
    },

    async reserveCodeAttempts({ documentType, documentNumber, now, maxAttempts }) {
      const reserved = [];

      for (const code of codes) {
        if (code.status !== "ACTIVE" || code.expiresAt.getTime() <= now.getTime() || code.failedAttempts >= maxAttempts) {
          continue;
        }

        const patient = patients.find((row) => row.id === code.patientId);
        const tenant = patient ? await clinic.staff.findTenant(patient.tenantId) : null;

        if (
          !patient ||
          patient.status !== "PENDING" ||
          patient.userId !== null ||
          patient.documentType !== documentType ||
          patient.documentNumber !== documentNumber ||
          tenant?.status !== "ACTIVE"
        ) {
          continue;
        }

        // Como en la base: el intento se reserva al elegir el código, antes de evaluarlo.
        code.failedAttempts += 1;
        reserved.push({ patientId: patient.id, tenantId: patient.tenantId, codeId: code.id, codeHash: code.codeHash });
      }

      return reserved;
    },

    async linkAccount({ candidate, user, now }) {
      const code = codes.find((row) => row.id === candidate.codeId);
      const patient = patients.find((row) => row.id === candidate.patientId && row.tenantId === candidate.tenantId);
      const alreadyPatientHere = patients.some((row) => row.tenantId === candidate.tenantId && row.userId === user.id);

      if (
        !code ||
        code.status !== "ACTIVE" ||
        code.expiresAt.getTime() <= now.getTime() ||
        !patient ||
        patient.status !== "PENDING" ||
        alreadyPatientHere
      ) {
        return { kind: "rejected" };
      }

      code.status = "USED";
      patient.status = "LINKED";
      patient.userId = user.id;
      patient.fullName = user.fullName;
      // Como en la base: la vinculación borra los intentos fallidos de la cuenta.
      linkAttempts.length = 0;

      return { kind: "linked" };
    },

    async lockExhaustedCodes({ codeIds, maxAttempts }) {
      for (const code of codes) {
        if (codeIds.includes(code.id) && code.status === "ACTIVE" && code.failedAttempts >= maxAttempts) {
          code.status = "LOCKED";
        }
      }
    },

    async releaseCodeAttempts({ codeIds }) {
      for (const code of codes) {
        if (codeIds.includes(code.id) && code.status === "ACTIVE" && code.failedAttempts > 0) {
          code.failedAttempts -= 1;
        }
      }
    },
  };

  return { repository, patients, codes, assignments };
}

export type InMemoryPatientRegistry = ReturnType<typeof createInMemoryPatientRegistry>;
