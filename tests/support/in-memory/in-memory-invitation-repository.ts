import type {
  AcceptanceFacts,
  AcceptanceTransaction,
  ClinicRelationshipFacts,
  InvitationContext,
  InvitationRepository,
  NewInvitation,
} from "@/modules/users/application/ports/out/invitation-repository";
import {
  INVITATION_MAX_FAILED_ATTEMPTS,
  type DocumentType,
  type InvitationEntry,
  type InvitationRecord,
} from "@/modules/users/domain/invitation";
import { InvitationConflictError } from "@/modules/users/domain/invitation-errors";

export interface StoredAccount {
  email: string;
  fullName: string;
}

export interface StoredStaff {
  membershipId: string;
  tenantId: string;
  userId: string;
  status: "ACTIVE" | "DEACTIVATED";
  isClinicAdmin: boolean;
  isDoctor: boolean;
  licenseNumber: string | null;
  specialty: string | null;
}

export interface StoredPatient {
  patientId: string;
  tenantId: string;
  userId: string | null;
  status: "PENDING" | "LINKED" | "REVOKED";
  documentType: DocumentType;
  documentNumber: string;
  fullName: string | null;
}

export interface StoredAssignment {
  tenantId: string;
  membershipId: string;
  patientId: string;
  createdByUserId: string;
  endedAt: Date | null;
}

// Cumple el puerto en memoria para las pruebas unitarias de los casos de uso. Guarda además las cuentas, los
// vínculos y las asignaciones mínimas que necesitan las reglas, y simula la transacción de aceptación: ejecuta el
// trabajo de a una cuenta por vez y, si falla, deja todo como estaba.
export class InMemoryInvitationRepository implements InvitationRepository {
  readonly invitations: InvitationRecord[] = [];
  readonly tenants = new Map<string, { name: string; isActive: boolean }>();
  readonly accounts = new Map<string, StoredAccount>();
  readonly staff: StoredStaff[] = [];
  readonly patients: StoredPatient[] = [];
  readonly assignments: StoredAssignment[] = [];

  private nextId = 1;
  // Una cola por cuenta, como el bloqueo de la fila de la cuenta en la base: las aceptaciones de una misma
  // persona se ejecutan una detrás de otra y las de cuentas distintas no se esperan.
  private readonly queues = new Map<string, Promise<unknown>>();

  private emailOf(userId: string | null): string | null {
    return userId ? (this.accounts.get(userId)?.email ?? null) : null;
  }

  private findInvitation(id: string): InvitationRecord | undefined {
    return this.invitations.find((invitation) => invitation.id === id);
  }

  async createReplacing(input: NewInvitation, now: Date): Promise<InvitationRecord> {
    for (const existing of this.invitations) {
      if (existing.tenantId !== input.tenantId || existing.email !== input.email || existing.status !== "PENDING") {
        continue;
      }

      if (existing.expiresAt.getTime() <= now.getTime()) {
        existing.status = "EXPIRED";
      } else {
        existing.status = "REVOKED";
        existing.endReason = "REPLACED";
        existing.revokedAt = now;
      }
    }

    const record: InvitationRecord = {
      ...input,
      id: `invitation-${this.nextId++}`,
      status: "PENDING",
      endReason: null,
      failedAttempts: 0,
      sentAt: null,
      createdAt: now,
      revokedAt: null,
      acceptedAt: null,
      acceptedByUserId: null,
    };
    this.invitations.push(record);

    return record;
  }

  async markSent({ tenantId, invitationId, now }: { tenantId: string; invitationId: string; now: Date }) {
    const invitation = this.findInvitation(invitationId);

    if (!invitation || invitation.tenantId !== tenantId || invitation.status !== "PENDING" || invitation.sentAt) {
      return false;
    }

    invitation.sentAt = now;

    return true;
  }

  async listPending({
    tenantId,
    createdByMembershipId,
    now,
    limit,
  }: {
    tenantId: string;
    createdByMembershipId?: string;
    now: Date;
    limit: number;
  }): Promise<InvitationEntry[]> {
    const tenantIsActive = this.tenants.get(tenantId)?.isActive ?? false;

    return this.invitations
      .filter((invitation) => {
        const creator = this.staff.find((member) => member.membershipId === invitation.createdByMembershipId);

        return (
          tenantIsActive &&
          invitation.tenantId === tenantId &&
          invitation.status === "PENDING" &&
          invitation.expiresAt.getTime() > now.getTime() &&
          creator?.status === "ACTIVE" &&
          (createdByMembershipId === undefined || invitation.createdByMembershipId === createdByMembershipId)
        );
      })
      .sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
      .slice(0, limit)
      .map((invitation) => ({
        ...invitation,
        createdByName: this.accounts.get(invitation.createdByUserId)?.fullName ?? "",
      }));
  }

  async findById({ tenantId, invitationId }: { tenantId: string; invitationId: string }) {
    const invitation = this.findInvitation(invitationId);

    return invitation && invitation.tenantId === tenantId ? invitation : null;
  }

  async revoke({ tenantId, invitationId, now }: { tenantId: string; invitationId: string; now: Date }) {
    const invitation = this.findInvitation(invitationId);

    if (
      !invitation ||
      invitation.tenantId !== tenantId ||
      invitation.status !== "PENDING" ||
      invitation.expiresAt.getTime() <= now.getTime()
    ) {
      return false;
    }

    invitation.status = "REVOKED";
    invitation.endReason = "BY_SENDER";
    invitation.revokedAt = now;

    return true;
  }

  async findByTokenHash(tokenHash: string): Promise<InvitationContext | null> {
    const invitation = this.invitations.find((candidate) => candidate.tokenHash === tokenHash);

    if (!invitation) {
      return null;
    }

    const creator = this.staff.find((member) => member.membershipId === invitation.createdByMembershipId);
    const tenant = this.tenants.get(invitation.tenantId);

    return {
      invitation,
      tenantName: tenant?.name ?? "",
      isTenantActive: tenant?.isActive ?? false,
      creator: { isMembershipActive: creator?.status === "ACTIVE", isDoctor: creator?.isDoctor ?? false },
    };
  }

  async registerFailedAttempt({ invitationId, now }: { invitationId: string; now: Date }) {
    const invitation = this.findInvitation(invitationId);

    if (!invitation || invitation.status !== "PENDING" || invitation.failedAttempts >= INVITATION_MAX_FAILED_ATTEMPTS) {
      return { attemptsLeft: 0 };
    }

    invitation.failedAttempts += 1;

    if (invitation.failedAttempts >= INVITATION_MAX_FAILED_ATTEMPTS) {
      invitation.status = "REVOKED";
      invitation.endReason = "ATTEMPTS_EXCEEDED";
      invitation.revokedAt = now;
    }

    return { attemptsLeft: INVITATION_MAX_FAILED_ATTEMPTS - invitation.failedAttempts };
  }

  runAcceptance<T>(userId: string, work: (transaction: AcceptanceTransaction) => Promise<T>): Promise<T> {
    const run = async (): Promise<T> => {
      const snapshot = structuredClone({
        invitations: this.invitations,
        staff: this.staff,
        patients: this.patients,
        assignments: this.assignments,
      });

      try {
        return await work(this.createTransaction());
      } catch (error) {
        this.invitations.splice(0, this.invitations.length, ...snapshot.invitations);
        this.staff.splice(0, this.staff.length, ...snapshot.staff);
        this.patients.splice(0, this.patients.length, ...snapshot.patients);
        this.assignments.splice(0, this.assignments.length, ...snapshot.assignments);

        throw error;
      }
    };
    const previous = this.queues.get(userId) ?? Promise.resolve();
    const result = previous.then(run, run);
    this.queues.set(
      userId,
      result.catch(() => undefined),
    );

    return result;
  }

  async findClinicFacts({ tenantId, email }: { tenantId: string; email: string }): Promise<ClinicRelationshipFacts> {
    const userId = [...this.accounts.entries()].find(([, account]) => account.email === email)?.[0];

    if (!userId) {
      return { staff: null, patient: null };
    }

    const staff = this.staff.find((member) => member.tenantId === tenantId && member.userId === userId);
    const patient = this.patients.find((record) => record.tenantId === tenantId && record.userId === userId);

    return {
      staff: staff ? { status: staff.status, isClinicAdmin: staff.isClinicAdmin, isDoctor: staff.isDoctor } : null,
      patient: patient ? { status: patient.status } : null,
    };
  }

  async findDocumentOwner({
    tenantId,
    documentType,
    documentNumber,
  }: {
    tenantId: string;
    documentType: DocumentType;
    documentNumber: string;
  }) {
    const patient = this.patients.find(
      (record) =>
        record.tenantId === tenantId && record.documentType === documentType && record.documentNumber === documentNumber,
    );

    return patient ? { email: this.emailOf(patient.userId) } : null;
  }

  async findLicenseOwner({ tenantId, licenseNumber }: { tenantId: string; licenseNumber: string }) {
    const member = this.staff.find((candidate) => candidate.tenantId === tenantId && candidate.licenseNumber === licenseNumber);
    const email = member ? this.emailOf(member.userId) : null;

    return member && email ? { email } : null;
  }

  private createTransaction(): AcceptanceTransaction {
    return {
      claim: async ({ invitationId, accountId: claimingAccountId, now }) => {
        const invitation = this.findInvitation(invitationId);

        if (
          !invitation ||
          invitation.status !== "PENDING" ||
          invitation.expiresAt.getTime() <= now.getTime() ||
          invitation.failedAttempts >= INVITATION_MAX_FAILED_ATTEMPTS
        ) {
          return false;
        }

        invitation.status = "ACCEPTED";
        invitation.acceptedAt = now;
        invitation.acceptedByUserId = claimingAccountId;

        return true;
      },

      findRelationshipFacts: async ({ tenantId, userId, documentType, documentNumber, licenseNumber }) => {
        const staff = this.staff.find((member) => member.tenantId === tenantId && member.userId === userId);
        const patient = this.patients.find((record) => record.tenantId === tenantId && record.userId === userId);
        const byDocument = this.patients.find(
          (record) =>
            record.tenantId === tenantId && record.documentType === documentType && record.documentNumber === documentNumber,
        );
        const licenseOwner = licenseNumber
          ? this.staff.find((member) => member.tenantId === tenantId && member.licenseNumber === licenseNumber)
          : undefined;

        const facts: AcceptanceFacts = {
          staff: staff
            ? {
                membershipId: staff.membershipId,
                status: staff.status,
                isClinicAdmin: staff.isClinicAdmin,
                isDoctor: staff.isDoctor,
              }
            : null,
          patient: patient
            ? {
                patientId: patient.patientId,
                status: patient.status,
                documentType: patient.documentType,
                documentNumber: patient.documentNumber,
              }
            : null,
          patientByDocument: byDocument
            ? { patientId: byDocument.patientId, userId: byDocument.userId, status: byDocument.status }
            : null,
          licenseOwnerUserId: licenseOwner?.userId ?? null,
        };

        return facts;
      },

      createDoctorMembership: async ({ tenantId, userId, licenseNumber, specialty }) => {
        if (this.staff.some((member) => member.tenantId === tenantId && member.licenseNumber === licenseNumber)) {
          throw new InvitationConflictError("LICENSE_IN_USE");
        }

        const membershipId = `membership-${this.nextId++}`;
        this.staff.push({
          membershipId,
          tenantId,
          userId,
          status: "ACTIVE",
          isClinicAdmin: false,
          isDoctor: true,
          licenseNumber,
          specialty,
        });

        return { membershipId };
      },

      linkPatient: async ({ tenantId, userId, fullName, documentType, documentNumber, reusePatientId }) => {
        if (reusePatientId) {
          const patient = this.patients.find((record) => record.patientId === reusePatientId && record.tenantId === tenantId);

          if (!patient) {
            throw new Error("El registro de paciente a reutilizar no existe en la clínica.");
          }

          patient.userId = userId;
          patient.fullName = fullName;
          patient.status = "LINKED";

          return { patientId: patient.patientId };
        }

        const used = this.patients.some(
          (record) =>
            record.tenantId === tenantId && record.documentType === documentType && record.documentNumber === documentNumber,
        );

        if (used) {
          throw new InvitationConflictError("DOCUMENT_IN_USE");
        }

        const patientId = `patient-${this.nextId++}`;
        this.patients.push({ patientId, tenantId, userId, status: "LINKED", documentType, documentNumber, fullName });

        return { patientId };
      },

      assignDoctorIfAbsent: async ({ tenantId, membershipId, patientId, createdByUserId }) => {
        const active = this.assignments.some(
          (assignment) =>
            assignment.tenantId === tenantId &&
            assignment.membershipId === membershipId &&
            assignment.patientId === patientId &&
            assignment.endedAt === null,
        );

        if (!active) {
          this.assignments.push({ tenantId, membershipId, patientId, createdByUserId, endedAt: null });
        }
      },

      isMembershipActiveDoctor: async ({ tenantId, membershipId }) =>
        this.staff.some(
          (member) =>
            member.tenantId === tenantId &&
            member.membershipId === membershipId &&
            member.status === "ACTIVE" &&
            member.isDoctor,
        ),
    };
  }
}
