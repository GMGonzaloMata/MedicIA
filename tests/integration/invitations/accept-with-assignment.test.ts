import { beforeEach, describe, expect, it } from "vitest";

import { createListDoctorPatients } from "@/modules/studies/application/use-cases/list-doctor-patients";
import { resolveStudyActor } from "@/modules/studies/domain/study-access";
import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

const PROOF = { documentType: "DNI", documentNumber: "30111222" } as const;
const listDoctorPatients = createListDoctorPatients({ directory: prismaPatientDirectory });

async function setup() {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const otherDoctorUser = await createUser({ fullName: "Otro médico" });
  const otherDoctor = await createDoctorMembership({ tenantId: world.tenantA.id, userId: otherDoctorUser.id });
  const patientUser = await createUser({ email: "paciente@example.com", fullName: "Paula Paciente" });

  const actorOf = (membership: { id: string }, user: { id: string }, isDoctor = true) => ({
    tenantId: world.tenantA.id,
    userId: user.id,
    membershipId: membership.id,
    isClinicAdmin: !isDoctor,
    isDoctor,
  });
  const studyActorOf = (membership: { id: string }, user: { id: string }) =>
    resolveStudyActor({
      tenantId: world.tenantA.id,
      userId: user.id,
      relationship: { kind: "STAFF", membershipId: membership.id, isDoctor: true, isClinicAdmin: false },
    });

  return {
    world,
    useCases,
    otherDoctor,
    otherDoctorUser,
    patientUser,
    account: { id: patientUser.id, email: patientUser.email, fullName: patientUser.fullName },
    doctorActor: actorOf(world.doctor, world.doctorUser),
    adminActor: actorOf(world.admin, world.adminUser, false),
    doctorStudyActor: studyActorOf(world.doctor, world.doctorUser)!,
    otherDoctorStudyActor: studyActorOf(otherDoctor, otherDoctorUser)!,
  };
}

async function invitePatient(
  s: Awaited<ReturnType<typeof setup>>,
  actor: Awaited<ReturnType<typeof setup>>["doctorActor"],
) {
  const created = await s.useCases.createInvitation({
    actor,
    kind: "PATIENT",
    email: s.patientUser.email,
    documentType: "DNI",
    documentNumber: "30111222",
  });

  expect(created.status).toBe("SENT");

  return s.useCases.lastToken();
}

describe("aceptar la invitación de un médico a un paciente", () => {
  it("el paciente aparece en la lista de ese médico y no en la de otro médico de la clínica", async () => {
    const s = await setup();
    const token = await invitePatient(s, s.doctorActor);

    const result = await s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", assignedToDoctor: true });
    const mine = await listDoctorPatients({ actor: s.doctorStudyActor });
    const theirs = await listDoctorPatients({ actor: s.otherDoctorStudyActor });
    expect(mine.items.map((patient) => patient.fullName)).toEqual(["Paula Paciente"]);
    expect(theirs.items).toEqual([]);
    expect(await prismaClient.doctorPatientAssignment.findFirstOrThrow()).toMatchObject({
      tenantId: s.world.tenantA.id,
      membershipId: s.world.doctor.id,
      createdByUserId: s.world.doctorUser.id,
      endedAt: null,
    });
  });

  it("dos aceptaciones simultáneas no dejan una asignación activa duplicada", async () => {
    const s = await setup();
    const token = await invitePatient(s, s.doctorActor);

    const results = await Promise.all([
      s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF }),
      s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["ACCEPTED", "INVALID"]);
    expect(await prismaClient.doctorPatientAssignment.count({ where: { endedAt: null } })).toBe(1);
    expect(await prismaClient.patient.count({ where: { userId: s.patientUser.id } })).toBe(1);
  });

  it("un paciente ya vinculado con otro médico queda asignado además al nuevo, sin perder el anterior", async () => {
    const s = await setup();
    const patient = await createLinkedPatient({
      tenantId: s.world.tenantA.id,
      userId: s.patientUser.id,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    await createAssignment({
      tenantId: s.world.tenantA.id,
      membershipId: s.otherDoctor.id,
      patientId: patient.id,
      createdByUserId: s.otherDoctorUser.id,
    });
    const token = await invitePatient(s, s.doctorActor);

    const result = await s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF });

    expect(result).toMatchObject({ status: "ALREADY_MEMBER" });
    const active = await prismaClient.doctorPatientAssignment.findMany({
      where: { patientId: patient.id, endedAt: null },
      orderBy: { createdAt: "asc" },
    });
    expect(active.map((assignment) => assignment.membershipId).sort()).toEqual(
      [s.otherDoctor.id, s.world.doctor.id].sort(),
    );
    expect(await prismaClient.patient.count({ where: { userId: s.patientUser.id } })).toBe(1);
  });

  it("si el paciente ya estaba asignado a ese médico no se duplica la asignación", async () => {
    const s = await setup();
    const patient = await createLinkedPatient({
      tenantId: s.world.tenantA.id,
      userId: s.patientUser.id,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    await createAssignment({
      tenantId: s.world.tenantA.id,
      membershipId: s.world.doctor.id,
      patientId: patient.id,
      createdByUserId: s.world.doctorUser.id,
    });
    const token = await invitePatient(s, s.doctorActor);

    await s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF });

    expect(await prismaClient.doctorPatientAssignment.count({ where: { patientId: patient.id, endedAt: null } })).toBe(1);
  });

  it("un paciente invitado por un administrador que no es médico queda sin asignaciones", async () => {
    const s = await setup();
    const token = await invitePatient(s, s.adminActor);

    const result = await s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", assignedToDoctor: false });
    expect(await prismaClient.doctorPatientAssignment.count()).toBe(0);
    expect((await listDoctorPatients({ actor: s.doctorStudyActor })).items).toEqual([]);
  });

  it("si quien invitó dejó de ser médico activo, el link no sirve y no se vincula a nadie", async () => {
    const s = await setup();
    const token = await invitePatient(s, s.doctorActor);
    await prismaClient.staffMembership.update({ where: { id: s.world.doctor.id }, data: { isDoctor: false, isClinicAdmin: true, specialty: null, licenseNumber: null } });

    const result = await s.useCases.acceptInvitation({ token, account: s.account, proof: PROOF });

    expect(result).toEqual({ status: "INVALID" });
    expect(await prismaClient.patient.count({ where: { userId: s.patientUser.id } })).toBe(0);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
  });
});
