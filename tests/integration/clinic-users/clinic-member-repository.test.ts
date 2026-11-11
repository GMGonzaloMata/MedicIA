import { beforeEach, describe, expect, it } from "vitest";

import { prismaClinicMemberRepository as repository } from "@/modules/users/infrastructure/repositories/prisma-clinic-member-repository";
import { CLINIC_USER_ACTIONS, type ClinicUserAction } from "@/modules/users/domain/clinic-user-events";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createSession,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

async function createScenario() {
  const tenant = await createTenant();
  const actorUser = await createUser();
  const actorMembership = await createStaffMembership({ tenantId: tenant.id, userId: actorUser.id });
  const doctorUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const patientUser = await createUser();
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });
  const actor = { userId: actorUser.id, membershipId: actorMembership.id };

  return { tenant, actor, doctor, patient };
}

describe("repositorio de gestión de usuarios: integridad y aislamiento", () => {
  it("registra cada acción con los destinos y el actor correctos", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const now = new Date();
    const events: Array<{ action: ClinicUserAction; membershipId?: string; patientId?: string }> = [
      { action: "STAFF_ENROLLED", membershipId: doctor.id },
      { action: "STAFF_DEACTIVATED", membershipId: doctor.id },
      { action: "STAFF_REACTIVATED", membershipId: doctor.id },
      { action: "PATIENT_ENROLLED", patientId: patient.id },
      { action: "PATIENT_REVOKED", patientId: patient.id },
      { action: "PATIENT_REACTIVATED", patientId: patient.id },
      { action: "ASSIGNMENT_CREATED", membershipId: doctor.id, patientId: patient.id },
      { action: "ASSIGNMENT_ENDED", membershipId: doctor.id, patientId: patient.id },
      { action: "ACCESS_RESENT", membershipId: doctor.id },
      { action: "ACCESS_RESENT", patientId: patient.id },
    ];
    expect(new Set(events.map((event) => event.action))).toEqual(new Set(CLINIC_USER_ACTIONS));

    for (const event of events) {
      await repository.recordEvent({
        tenantId: tenant.id,
        action: event.action,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: event.membershipId,
        targetPatientId: event.patientId,
        now,
      });
    }

    const stored = await prismaClient.clinicUserEvent.findMany({ where: { tenantId: tenant.id } });
    expect(stored).toHaveLength(events.length);
    for (const event of events) {
      expect(stored).toContainEqual(expect.objectContaining({
        action: event.action,
        actorUserId: actor.userId,
        actorMembershipId: actor.membershipId,
        targetMembershipId: event.membershipId ?? null,
        targetPatientId: event.patientId ?? null,
        createdAt: now,
      }));
    }
  });

  it("rechaza eventos sin destino o con destinos incompatibles con la acción", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const base = {
      tenantId: tenant.id,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      createdAt: new Date(),
    };

    await expectRejectedBy(
      prismaClient.clinicUserEvent.create({ data: { ...base, action: "ACCESS_RESENT" } }),
      "clinic_user_events_action_targets",
    );
    await expectRejectedBy(
      prismaClient.clinicUserEvent.create({
        data: { ...base, action: "STAFF_ENROLLED", targetPatientId: patient.id },
      }),
      "clinic_user_events_action_targets",
    );
    await expectRejectedBy(
      prismaClient.clinicUserEvent.create({
        data: { ...base, action: "ASSIGNMENT_CREATED", targetMembershipId: doctor.id },
      }),
      "clinic_user_events_action_targets",
    );
    await expectRejectedBy(
      prismaClient.clinicUserEvent.create({
        data: { ...base, action: "ACCESS_RESENT", targetMembershipId: doctor.id, targetPatientId: patient.id },
      }),
      "clinic_user_events_action_targets",
    );
    expect(await prismaClient.clinicUserEvent.count()).toBe(0);
  });

  it("rechaza la membresía de actor de otra clínica mediante la clave foránea compuesta", async () => {
    const { tenant, actor, patient } = await createScenario();
    const otherTenant = await createTenant();
    const otherMembership = await createStaffMembership({ tenantId: otherTenant.id, userId: actor.userId });

    await expectRejectedBy(
      prismaClient.clinicUserEvent.create({
        data: {
          tenantId: tenant.id,
          action: "PATIENT_ENROLLED",
          actorUserId: actor.userId,
          actorMembershipId: otherMembership.id,
          targetPatientId: patient.id,
          createdAt: new Date(),
        },
      }),
      "clinic_user_events_tenant_id_actor_membership_id_fkey",
    );
  });

  it("solo cambia membresías y pacientes desde el estado de origen", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const pending = await createPatient({ tenantId: tenant.id });
    const now = new Date();
    const staffInput = { tenantId: tenant.id, membershipId: doctor.id, actor, now };
    const patientInput = { tenantId: tenant.id, patientId: patient.id, actor, now };

    expect(await repository.reactivateStaff(staffInput)).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.deactivateStaff({ ...staffInput, check: () => "OK" })).toEqual({ status: "CHANGED" });
    expect(await repository.deactivateStaff({ ...staffInput, check: () => "OK" })).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.reactivateStaff(staffInput)).toEqual({ status: "CHANGED" });
    expect(await repository.reactivateStaff(staffInput)).toEqual({ status: "ALREADY_IN_STATE" });

    expect(await repository.reactivatePatient(patientInput)).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.revokePatient(patientInput)).toEqual({ status: "CHANGED" });
    expect(await repository.revokePatient(patientInput)).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.reactivatePatient(patientInput)).toEqual({ status: "CHANGED" });
    expect(await repository.reactivatePatient(patientInput)).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.revokePatient({ ...patientInput, patientId: pending.id })).toEqual({ status: "ALREADY_IN_STATE" });
    expect(await repository.reactivatePatient({ ...patientInput, patientId: pending.id })).toEqual({ status: "NOT_FOUND" });

    expect(await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: doctor.id } })).toMatchObject({ status: "ACTIVE" });
    expect(await prismaClient.patient.findUniqueOrThrow({ where: { id: patient.id } })).toMatchObject({ status: "LINKED", revokedAt: null });
    expect(await prismaClient.clinicUserEvent.count()).toBe(4);
  });

  it("no termina una asignación ya finalizada ni una de otra clínica", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const assignment = await createAssignment({
      tenantId: tenant.id,
      membershipId: doctor.id,
      patientId: patient.id,
      createdByUserId: actor.userId,
    });
    const otherTenant = await createTenant();
    const otherActorUser = await createUser();
    const otherDoctor = await createDoctorMembership({ tenantId: otherTenant.id, userId: otherActorUser.id });
    const otherPatient = await createLinkedPatient({ tenantId: otherTenant.id, userId: (await createUser()).id });
    const otherAssignment = await createAssignment({
      tenantId: otherTenant.id,
      membershipId: otherDoctor.id,
      patientId: otherPatient.id,
      createdByUserId: otherActorUser.id,
    });
    const now = new Date(Date.now() + 1000);
    const input = { tenantId: tenant.id, actor, now };

    expect(await repository.endAssignment({ ...input, assignmentId: otherAssignment.id })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.endAssignment({ ...input, assignmentId: assignment.id })).toEqual({ status: "UNASSIGNED" });
    expect(await repository.endAssignment({ ...input, assignmentId: assignment.id })).toEqual({ status: "NOT_FOUND" });
    expect(await prismaClient.doctorPatientAssignment.findUniqueOrThrow({ where: { id: assignment.id } })).toMatchObject({
      endedAt: now,
      endedByUserId: actor.userId,
    });
    expect(await prismaClient.doctorPatientAssignment.findUniqueOrThrow({ where: { id: otherAssignment.id } })).toMatchObject({
      endedAt: null,
    });
    expect(await prismaClient.clinicUserEvent.count({ where: { action: "ASSIGNMENT_ENDED" } })).toBe(1);
  });

  it("lista solo la clínica solicitada, pagina y muestra sesiones y asignaciones vigentes", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const otherTenant = await createTenant();
    const otherUser = await createUser();
    await createDoctorMembership({ tenantId: otherTenant.id, userId: otherUser.id });
    await createLinkedPatient({ tenantId: otherTenant.id, userId: (await createUser()).id });
    await createSession({ userId: actor.userId });
    const activeAssignment = await createAssignment({
      tenantId: tenant.id,
      membershipId: doctor.id,
      patientId: patient.id,
      createdByUserId: actor.userId,
    });
    const pending = await createPatient({ tenantId: tenant.id });
    const ended = await createAssignment({
      tenantId: tenant.id,
      membershipId: doctor.id,
      patientId: (await createLinkedPatient({ tenantId: tenant.id, userId: (await createUser()).id })).id,
      createdByUserId: actor.userId,
    });
    await prismaClient.doctorPatientAssignment.update({
      where: { id: ended.id },
      data: { endedAt: new Date(Date.now() + 1000), endedByUserId: actor.userId },
    });

    const staff = await repository.listStaff({ tenantId: tenant.id, page: 1, pageSize: 25 });
    expect(staff.total).toBe(2);
    expect(staff.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ membershipId: actor.membershipId, hasSignedIn: true }),
      expect.objectContaining({ membershipId: doctor.id, hasSignedIn: false }),
    ]));
    expect((await repository.listStaff({ tenantId: tenant.id, page: 2, pageSize: 1 })).items).toHaveLength(1);
    expect(staff.items.some((member) => member.email === otherUser.email)).toBe(false);

    const patients = await repository.listPatients({ tenantId: tenant.id, page: 1, pageSize: 25 });
    expect(patients.total).toBe(3);
    expect(patients.items.find((item) => item.patientId === patient.id)).toMatchObject({
      hasAccount: true,
      hasSignedIn: false,
      doctors: [expect.objectContaining({ assignmentId: activeAssignment.id, membershipId: doctor.id, isActive: true })],
    });
    expect(patients.items.find((item) => item.patientId === pending.id)).toMatchObject({
      status: "PENDING",
      hasAccount: false,
      hasSignedIn: false,
      doctors: [],
    });
    expect(patients.items.filter((item) => item.doctors.length > 0)).toHaveLength(1);
    expect((await repository.listPatients({ tenantId: tenant.id, page: 2, pageSize: 2 })).items).toHaveLength(1);
    expect((await repository.listPatients({ tenantId: otherTenant.id, page: 1, pageSize: 25 })).total).toBe(1);
  });

  it("devuelve solo médicos activos y resuelve nombres y objetivos de reenvío dentro de la clínica", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const otherTenant = await createTenant();
    const otherDoctor = await createDoctorMembership({ tenantId: otherTenant.id, userId: (await createUser()).id });
    await createSession({ userId: actor.userId });
    await createAssignment({
      tenantId: tenant.id,
      membershipId: doctor.id,
      patientId: patient.id,
      createdByUserId: actor.userId,
    });

    expect(await repository.findTenantName({ tenantId: tenant.id })).toBe(tenant.name);
    expect(await repository.listActiveDoctors({ tenantId: tenant.id })).toEqual([
      expect.objectContaining({ membershipId: doctor.id }),
    ]);
    expect(await repository.findResendTarget({ tenantId: tenant.id, target: { kind: "STAFF", membershipId: doctor.id } })).toMatchObject({
      kind: "DOCTOR",
      tenantName: tenant.name,
      hasSignedIn: false,
      assignedMembershipIds: [],
    });
    expect(await repository.findResendTarget({ tenantId: tenant.id, target: { kind: "PATIENT", patientId: patient.id } })).toMatchObject({
      kind: "PATIENT",
      tenantName: tenant.name,
      assignedMembershipIds: [doctor.id],
    });
    expect(await repository.findResendTarget({ tenantId: tenant.id, target: { kind: "STAFF", membershipId: actor.membershipId } })).toBeNull();
    expect(await repository.findResendTarget({ tenantId: tenant.id, target: { kind: "STAFF", membershipId: otherDoctor.id } })).toBeNull();
    expect(await repository.findResendTarget({ tenantId: otherTenant.id, target: { kind: "PATIENT", patientId: patient.id } })).toBeNull();
    expect(await repository.findTenantName({ tenantId: "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f" })).toBeNull();

    await prismaClient.staffMembership.update({ where: { id: doctor.id }, data: { status: "DEACTIVATED" } });
    expect(await repository.listActiveDoctors({ tenantId: tenant.id })).toEqual([]);
    expect((await repository.listPatients({ tenantId: tenant.id, page: 1, pageSize: 25 })).items[0]?.doctors[0]?.isActive).toBe(false);
  });

  it("ejecuta el alta en una transacción y revierte el evento si el trabajo falla", async () => {
    const { tenant, actor, doctor } = await createScenario();
    const now = new Date();
    const event = {
      tenantId: tenant.id,
      action: "STAFF_ENROLLED" as const,
      actorUserId: actor.userId,
      actorMembershipId: actor.membershipId,
      targetMembershipId: doctor.id,
      now,
    };

    expect(await repository.runEnrollment(actor.userId, async (transaction) => {
      expect(await transaction.isTenantActive(tenant.id)).toBe(true);
      await transaction.recordEvent(event);
      return "OK";
    })).toBe("OK");
    await expect(repository.runEnrollment(actor.userId, async (transaction) => {
      await transaction.recordEvent(event);
      throw new Error("falló el alta");
    })).rejects.toThrow("falló el alta");
    expect(await prismaClient.clinicUserEvent.count()).toBe(1);

    await prismaClient.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });
    expect(await repository.runEnrollment(actor.userId, (transaction) => transaction.isTenantActive(tenant.id))).toBe(false);
  });

  it("rechaza estados, asignaciones y destinos ajenos sin modificar registros", async () => {
    const { tenant, actor, doctor, patient } = await createScenario();
    const otherTenant = await createTenant();
    const otherDoctor = await createDoctorMembership({ tenantId: otherTenant.id, userId: (await createUser()).id });
    const otherPatient = await createLinkedPatient({ tenantId: otherTenant.id, userId: (await createUser()).id });
    const pending = await createPatient({ tenantId: tenant.id });
    const now = new Date();

    expect(await repository.deactivateStaff({
      tenantId: tenant.id,
      membershipId: doctor.id,
      actor,
      now,
      check: () => "LAST_ADMIN",
    })).toEqual({ status: "REJECTED", reason: "LAST_ADMIN" });
    expect(await repository.deactivateStaff({
      tenantId: tenant.id,
      membershipId: otherDoctor.id,
      actor,
      now,
      check: () => "OK",
    })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.reactivateStaff({ tenantId: tenant.id, membershipId: otherDoctor.id, actor, now })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.revokePatient({ tenantId: tenant.id, patientId: otherPatient.id, actor, now })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.reactivatePatient({ tenantId: tenant.id, patientId: otherPatient.id, actor, now })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: otherPatient.id, membershipId: doctor.id, actor, now })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: patient.id, membershipId: otherDoctor.id, actor, now })).toEqual({ status: "NOT_FOUND" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: pending.id, membershipId: doctor.id, actor, now })).toEqual({ status: "PATIENT_NOT_LINKED" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: patient.id, membershipId: actor.membershipId, actor, now })).toEqual({ status: "NOT_AN_ACTIVE_DOCTOR" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: patient.id, membershipId: doctor.id, actor, now })).toEqual({ status: "ASSIGNED" });
    expect(await repository.assignDoctor({ tenantId: tenant.id, patientId: patient.id, membershipId: doctor.id, actor, now })).toEqual({ status: "ALREADY_ASSIGNED" });
    expect(await prismaClient.doctorPatientAssignment.count({ where: { tenantId: tenant.id } })).toBe(1);
    expect(await prismaClient.clinicUserEvent.count({ where: { tenantId: tenant.id } })).toBe(1);
  });
});
