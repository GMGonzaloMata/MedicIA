import type {
  ActiveDoctor,
  AssignDoctorResult,
  ClinicMemberRepository,
  DeactivateStaffResult,
  EndAssignmentResult,
  EnrollmentTransaction,
  ManagementActor,
  Page,
  PatientListItem,
  ResendTarget,
  ResendTargetRef,
  StaffListItem,
  StatusChangeResult,
} from "@/modules/users/application/ports/out/clinic-member-repository";
import type { NewClinicUserEvent } from "@/modules/users/domain/clinic-user-events";
import { canAssignTo } from "@/modules/users/domain/clinic-user-rules";
import { EnrollmentTenantInactiveError } from "@/modules/users/domain/enrollment-errors";

import type { InMemoryInvitationRepository } from "./in-memory-invitation-repository";

// Cumple el puerto en memoria para las pruebas unitarias. Comparte con el repositorio de invitaciones las cuentas,
// el personal, los pacientes y las asignaciones, para que el alta y aceptar un link vean lo mismo, y guarda además
// los eventos de gestión y qué cuentas ya iniciaron sesión. La identidad de una asignación es su posición en la lista
// (nunca se borran), y quién terminó cada una se guarda aparte para no cambiar la forma que usan las pruebas de la 009.
export class InMemoryClinicMemberRepository implements ClinicMemberRepository {
  readonly events: NewClinicUserEvent[] = [];
  readonly signedInUserIds = new Set<string>();
  private readonly endedBy = new Map<number, string>();

  constructor(private readonly shared: InMemoryInvitationRepository) {}

  private nameOf(userId: string | null): string {
    return (userId && this.shared.accounts.get(userId)?.fullName) || "";
  }

  private page<T>(items: T[], page: number, pageSize: number): Page<T> {
    return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length };
  }

  async listStaff({ tenantId, page, pageSize }: { tenantId: string; page: number; pageSize: number }) {
    const items: StaffListItem[] = this.shared.staff
      .filter((member) => member.tenantId === tenantId)
      .map((member) => ({
        membershipId: member.membershipId,
        fullName: this.nameOf(member.userId),
        email: this.shared.accounts.get(member.userId)?.email ?? "",
        isClinicAdmin: member.isClinicAdmin,
        isDoctor: member.isDoctor,
        specialty: member.specialty,
        licenseNumber: member.licenseNumber,
        status: member.status,
        hasSignedIn: this.signedInUserIds.has(member.userId),
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName) || a.membershipId.localeCompare(b.membershipId));

    return this.page(items, page, pageSize);
  }

  async listPatients({ tenantId, page, pageSize }: { tenantId: string; page: number; pageSize: number }) {
    const items: PatientListItem[] = this.shared.patients
      .filter((patient) => patient.tenantId === tenantId)
      .map((patient) => ({
        patientId: patient.patientId,
        fullName: patient.fullName,
        documentType: patient.documentType,
        documentNumber: patient.documentNumber,
        status: patient.status,
        doctors: this.shared.assignments.flatMap((assignment, index) => {
          if (assignment.tenantId !== tenantId || assignment.patientId !== patient.patientId || assignment.endedAt) {
            return [];
          }

          const member = this.shared.staff.find((staff) => staff.membershipId === assignment.membershipId);

          return [
            {
              assignmentId: `assignment-${index}`,
              membershipId: assignment.membershipId,
              fullName: this.nameOf(member?.userId ?? null),
              isActive: member?.status === "ACTIVE",
            },
          ];
        }),
        hasAccount: patient.userId !== null,
        hasSignedIn: patient.userId !== null && this.signedInUserIds.has(patient.userId),
      }))
      .sort((a, b) => {
        if ((a.fullName === null) !== (b.fullName === null)) {
          return a.fullName === null ? 1 : -1;
        }

        return (a.fullName ?? "").localeCompare(b.fullName ?? "") || a.patientId.localeCompare(b.patientId);
      });

    return this.page(items, page, pageSize);
  }

  async listActiveDoctors({ tenantId }: { tenantId: string }): Promise<ActiveDoctor[]> {
    return this.shared.staff
      .filter((member) => member.tenantId === tenantId && member.status === "ACTIVE" && member.isDoctor)
      .map((member) => ({
        membershipId: member.membershipId,
        fullName: this.nameOf(member.userId),
        specialty: member.specialty,
      }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }

  async findTenantName({ tenantId }: { tenantId: string }): Promise<string | null> {
    return this.shared.tenants.get(tenantId)?.name ?? null;
  }

  async findResendTarget({
    tenantId,
    target,
  }: {
    tenantId: string;
    target: ResendTargetRef;
  }): Promise<ResendTarget | null> {
    const tenantName = this.shared.tenants.get(tenantId)?.name;

    if (!tenantName) {
      return null;
    }

    if (target.kind === "STAFF") {
      const member = this.shared.staff.find(
        (staff) => staff.tenantId === tenantId && staff.membershipId === target.membershipId,
      );
      const email = member && this.shared.accounts.get(member.userId)?.email;

      if (!member || !member.isDoctor || !email) {
        return null;
      }

      return {
        tenantName,
        userId: member.userId,
        email,
        kind: "DOCTOR",
        hasSignedIn: this.signedInUserIds.has(member.userId),
        assignedMembershipIds: [],
        membershipId: member.membershipId,
        patientId: null,
      };
    }

    const patient = this.shared.patients.find(
      (record) => record.tenantId === tenantId && record.patientId === target.patientId,
    );
    const email = patient?.userId ? this.shared.accounts.get(patient.userId)?.email : undefined;

    if (!patient || !patient.userId || !email) {
      return null;
    }

    return {
      tenantName,
      userId: patient.userId,
      email,
      kind: "PATIENT",
      hasSignedIn: this.signedInUserIds.has(patient.userId),
      assignedMembershipIds: this.shared.assignments
        .filter(
          (assignment) =>
            assignment.tenantId === tenantId && assignment.patientId === patient.patientId && !assignment.endedAt,
        )
        .map((assignment) => assignment.membershipId),
      membershipId: null,
      patientId: patient.patientId,
    };
  }

  async runEnrollment<T>(
    input: { tenantId: string; account: { userId: string } | { subject: string; email: string; fullName: string }; now: Date },
    work: (transaction: EnrollmentTransaction, account: { id: string; email: string; fullName: string; isPlatformAdmin: boolean }) => Promise<T>,
  ): Promise<T> {
    const eventsBefore = this.events.length;
    const userId = "userId" in input.account ? input.account.userId : input.account.subject;
    const existed = this.shared.accounts.has(userId);

    try {
      return await this.shared.runAcceptance(userId, async (transaction) => {
        if (this.shared.tenants.get(input.tenantId)?.isActive !== true) throw new EnrollmentTenantInactiveError();
        if (!existed && "subject" in input.account) {
          this.shared.accounts.set(userId, { email: input.account.email, fullName: input.account.fullName });
        }
        const saved = this.shared.accounts.get(userId);
        if (!saved) throw new Error("Cuenta inexistente.");
        return work({
          ...transaction,
          recordEvent: async (event) => { this.events.push(event); },
        }, { id: userId, email: saved.email, fullName: saved.fullName, isPlatformAdmin: false });
      });
    } catch (error) {
      // Si el alta falla se revierte todo, también los eventos.
      this.events.splice(eventsBefore);
      if (!existed) this.shared.accounts.delete(userId);

      throw error;
    }
  }

  async recordEvent(event: NewClinicUserEvent): Promise<void> {
    this.events.push(event);
  }

  private record(
    action: NewClinicUserEvent["action"],
    tenantId: string,
    actor: ManagementActor,
    now: Date,
    targets: { targetMembershipId?: string; targetPatientId?: string },
  ) {
    this.events.push({
      tenantId,
      action,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      now,
      ...targets,
    });
  }

  async deactivateStaff({
    tenantId,
    membershipId,
    actor,
    now,
    check,
  }: {
    tenantId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
    check: (facts: { targetIsClinicAdmin: boolean; otherActiveAdmins: number }) => "OK" | "CANNOT_DEACTIVATE_SELF" | "LAST_ADMIN";
  }): Promise<DeactivateStaffResult> {
    const target = this.shared.staff.find(
      (member) => member.tenantId === tenantId && member.membershipId === membershipId,
    );

    if (!target) {
      return { status: "NOT_FOUND" };
    }

    if (target.status === "DEACTIVATED") {
      return { status: "ALREADY_IN_STATE" };
    }

    const otherActiveAdmins = this.shared.staff.filter(
      (member) =>
        member.tenantId === tenantId &&
        member.status === "ACTIVE" &&
        member.isClinicAdmin &&
        member.membershipId !== membershipId,
    ).length;
    const verdict = check({ targetIsClinicAdmin: target.isClinicAdmin, otherActiveAdmins });

    if (verdict !== "OK") {
      return { status: "REJECTED", reason: verdict };
    }

    target.status = "DEACTIVATED";
    this.record("STAFF_DEACTIVATED", tenantId, actor, now, { targetMembershipId: membershipId });

    return { status: "CHANGED" };
  }

  async reactivateStaff({
    tenantId,
    membershipId,
    actor,
    now,
  }: {
    tenantId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult> {
    const target = this.shared.staff.find(
      (member) => member.tenantId === tenantId && member.membershipId === membershipId,
    );

    if (!target) {
      return { status: "NOT_FOUND" };
    }

    if (target.status === "ACTIVE") {
      return { status: "ALREADY_IN_STATE" };
    }

    target.status = "ACTIVE";
    this.record("STAFF_REACTIVATED", tenantId, actor, now, { targetMembershipId: membershipId });

    return { status: "CHANGED" };
  }

  async revokePatient({
    tenantId,
    patientId,
    actor,
    now,
  }: {
    tenantId: string;
    patientId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult> {
    const target = this.shared.patients.find(
      (patient) => patient.tenantId === tenantId && patient.patientId === patientId,
    );

    if (!target) {
      return { status: "NOT_FOUND" };
    }

    if (target.status !== "LINKED") {
      return { status: "ALREADY_IN_STATE" };
    }

    target.status = "REVOKED";
    this.record("PATIENT_REVOKED", tenantId, actor, now, { targetPatientId: patientId });

    return { status: "CHANGED" };
  }

  async reactivatePatient({
    tenantId,
    patientId,
    actor,
    now,
  }: {
    tenantId: string;
    patientId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<StatusChangeResult> {
    const target = this.shared.patients.find(
      (patient) => patient.tenantId === tenantId && patient.patientId === patientId,
    );

    if (!target || target.status === "PENDING") {
      return { status: "NOT_FOUND" };
    }

    if (target.status === "LINKED") {
      return { status: "ALREADY_IN_STATE" };
    }

    target.status = "LINKED";
    this.record("PATIENT_REACTIVATED", tenantId, actor, now, { targetPatientId: patientId });

    return { status: "CHANGED" };
  }

  async assignDoctor({
    tenantId,
    patientId,
    membershipId,
    actor,
    now,
  }: {
    tenantId: string;
    patientId: string;
    membershipId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<AssignDoctorResult> {
    const patient = this.shared.patients.find(
      (record) => record.tenantId === tenantId && record.patientId === patientId,
    );
    const member = this.shared.staff.find(
      (staff) => staff.tenantId === tenantId && staff.membershipId === membershipId,
    );

    if (!patient || !member) {
      return { status: "NOT_FOUND" };
    }

    if (patient.status !== "LINKED") {
      return { status: "PATIENT_NOT_LINKED" };
    }

    if (!canAssignTo({ patientStatus: patient.status, membershipStatus: member.status, isDoctor: member.isDoctor })) {
      return { status: "NOT_AN_ACTIVE_DOCTOR" };
    }

    const active = this.shared.assignments.some(
      (assignment) =>
        assignment.tenantId === tenantId &&
        assignment.membershipId === membershipId &&
        assignment.patientId === patientId &&
        !assignment.endedAt,
    );

    if (active) {
      return { status: "ALREADY_ASSIGNED" };
    }

    this.shared.assignments.push({ tenantId, membershipId, patientId, createdByUserId: actor.userId, endedAt: null });
    this.record("ASSIGNMENT_CREATED", tenantId, actor, now, {
      targetMembershipId: membershipId,
      targetPatientId: patientId,
    });

    return { status: "ASSIGNED" };
  }

  async endAssignment({
    tenantId,
    assignmentId,
    actor,
    now,
  }: {
    tenantId: string;
    assignmentId: string;
    actor: ManagementActor;
    now: Date;
  }): Promise<EndAssignmentResult> {
    const index = Number(assignmentId.replace("assignment-", ""));
    const assignment = this.shared.assignments[index];

    if (!assignment || assignment.tenantId !== tenantId || assignment.endedAt) {
      return { status: "NOT_FOUND" };
    }

    assignment.endedAt = now;
    this.endedBy.set(index, actor.userId);
    this.record("ASSIGNMENT_ENDED", tenantId, actor, now, {
      targetMembershipId: assignment.membershipId,
      targetPatientId: assignment.patientId,
    });

    return { status: "UNASSIGNED" };
  }

  // Para las pruebas: quién terminó la asignación en esa posición.
  endedByOf(index: number): string | undefined {
    return this.endedBy.get(index);
  }
}
