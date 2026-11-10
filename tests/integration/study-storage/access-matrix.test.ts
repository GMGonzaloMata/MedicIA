import { beforeEach, describe, expect, it } from "vitest";

import { createDeleteStudy } from "@/modules/studies/application/use-cases/delete-study";
import { createGetAssignedPatient } from "@/modules/studies/application/use-cases/get-assigned-patient";
import { createListDoctorPatients } from "@/modules/studies/application/use-cases/list-doctor-patients";
import { createListStudies } from "@/modules/studies/application/use-cases/list-studies";
import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import { resolveStudyActor, type StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";
import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";
import { toActiveClinic } from "@/modules/users/domain/active-relationship";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";

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
import { buildNpz } from "../../support/npz-builder";

beforeEach(resetDatabase);

// Resuelve el actor como lo hace la aplicación: sesión → vínculo vigente de la clínica activa → actor de estudios.
async function actorFromSession(tokenHash: string, userId: string): Promise<StudyActor | null> {
  const resolved = await prismaSessionRepository.findByTokenHash(tokenHash);
  const clinic = toActiveClinic(resolved?.activeRelationship ?? null);

  return clinic ? resolveStudyActor({ tenantId: clinic.tenantId, userId, relationship: clinic.relationship }) : null;
}

async function world() {
  const storage = createInMemoryStudyFileStorage(new Map());
  let counter = 0;
  const uploadStudy = createUploadStudy({
    studies: prismaStudyRepository,
    storage,
    reader: createNpzStudyFileReader(),
    directory: prismaPatientDirectory,
    generateId: () => `00000000-0000-4000-8000-${String((counter += 1)).padStart(12, "0")}`,
  });
  const listStudies = createListStudies({ studies: prismaStudyRepository, directory: prismaPatientDirectory });
  const listDoctorPatients = createListDoctorPatients({ directory: prismaPatientDirectory });
  const getAssignedPatient = createGetAssignedPatient({ directory: prismaPatientDirectory });

  const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
  const users = await Promise.all(Array.from({ length: 9 }, () => createUser()));
  const [adminUser, doctor1User, doctor2User, adminDoctorUser, p1User, p2User, doctorBUser, patientBUser] = users;

  const admin = await createStaffMembership({ tenantId: tenantA.id, userId: adminUser!.id });
  const doctor1 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor1User!.id });
  const doctor2 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor2User!.id });
  const adminDoctor = await createDoctorMembership({
    tenantId: tenantA.id,
    userId: adminDoctorUser!.id,
    isClinicAdmin: true,
  });
  const doctorB = await createDoctorMembership({ tenantId: tenantB.id, userId: doctorBUser!.id });

  const p1 = await createLinkedPatient({ tenantId: tenantA.id, userId: p1User!.id });
  const p2 = await createLinkedPatient({ tenantId: tenantA.id, userId: p2User!.id });
  const pending = await createPatient({ tenantId: tenantA.id });
  const revokedUser = await createUser();
  const revoked = await createLinkedPatient({ tenantId: tenantA.id, userId: revokedUser.id });
  await prismaClient.patient.update({ where: { id: revoked.id }, data: { status: "REVOKED", revokedAt: new Date() } });
  const patientB = await createLinkedPatient({ tenantId: tenantB.id, userId: patientBUser!.id });

  const assign = (tenantId: string, membershipId: string, patientId: string) =>
    createAssignment({ tenantId, membershipId, patientId, createdByUserId: adminUser!.id });

  await assign(tenantA.id, doctor1.id, p1.id);
  await assign(tenantA.id, doctor1.id, pending.id);
  await assign(tenantA.id, doctor1.id, revoked.id);
  await assign(tenantA.id, doctor2.id, p2.id);
  await assign(tenantA.id, adminDoctor.id, p2.id);
  await assign(tenantB.id, doctorB.id, patientB.id);

  const actors = {
    p1: { kind: "PATIENT", tenantId: tenantA.id, userId: p1User!.id, patientId: p1.id } as StudyActor,
    p2: { kind: "PATIENT", tenantId: tenantA.id, userId: p2User!.id, patientId: p2.id } as StudyActor,
    patientB: { kind: "PATIENT", tenantId: tenantB.id, userId: patientBUser!.id, patientId: patientB.id } as StudyActor,
    doctor1: { kind: "DOCTOR", tenantId: tenantA.id, userId: doctor1User!.id, membershipId: doctor1.id } as StudyActor,
    doctor2: { kind: "DOCTOR", tenantId: tenantA.id, userId: doctor2User!.id, membershipId: doctor2.id } as StudyActor,
    adminDoctor: {
      kind: "DOCTOR",
      tenantId: tenantA.id,
      userId: adminDoctorUser!.id,
      membershipId: adminDoctor.id,
    } as StudyActor,
    doctorB: { kind: "DOCTOR", tenantId: tenantB.id, userId: doctorBUser!.id, membershipId: doctorB.id } as StudyActor,
  };

  const upload = (actor: StudyActor, patientId: string) =>
    uploadStudy({ actor, patientId, type: "ECG", bytes: new Uint8Array(buildNpz()) });

  return {
    storage,
    upload,
    listStudies,
    listDoctorPatients,
    getAssignedPatient,
    actors,
    ids: { tenantA, tenantB, p1, p2, pending, revoked, patientB, doctor1, admin, adminUser: adminUser! },
    sessions: { adminUser: adminUser!, doctor1: doctor1User! },
  };
}

type World = Awaited<ReturnType<typeof world>>;

async function expectNothingChanged(w: World, before: { studies: number; objects: number }) {
  expect(await prismaClient.study.count()).toBe(before.studies);
  expect((await w.storage.list("studies/")).length).toBe(before.objects);
}

async function snapshot(w: World) {
  return { studies: await prismaClient.study.count(), objects: (await w.storage.list("studies/")).length };
}

describe("matriz de acceso a estudios (US4)", () => {
  it("el paciente carga y lista lo suyo, y no toca el paciente de otro ni de otra clínica", async () => {
    const w = await world();

    await expect(w.upload(w.actors.p1, w.ids.p1.id)).resolves.toMatchObject({ number: 1 });
    expect((await w.listStudies({ actor: w.actors.p1, patientId: w.ids.p1.id })).items).toHaveLength(1);

    const before = await snapshot(w);
    for (const patientId of [w.ids.p2.id, w.ids.patientB.id, w.ids.pending.id]) {
      await expect(w.upload(w.actors.p1, patientId)).rejects.toBeInstanceOf(StudyForbiddenError);
      await expect(w.listStudies({ actor: w.actors.p1, patientId })).rejects.toBeInstanceOf(StudyForbiddenError);
    }
    await expect(w.listDoctorPatients({ actor: w.actors.p1 })).rejects.toBeInstanceOf(StudyForbiddenError);
    await expectNothingChanged(w, before);
  });

  it("el médico con asignación vigente carga, lista y ve solo a sus pacientes vinculados", async () => {
    const w = await world();

    await expect(w.upload(w.actors.doctor1, w.ids.p1.id)).resolves.toMatchObject({ number: 1 });
    const listed = await w.listStudies({ actor: w.actors.doctor1, patientId: w.ids.p1.id });
    expect(listed.items[0]).toMatchObject({ uploadedBy: { kind: "DOCTOR" }, canDelete: true });
    expect((await w.getAssignedPatient({ actor: w.actors.doctor1, patientId: w.ids.p1.id })).id).toBe(w.ids.p1.id);

    // Tiene asignados a P1, a un pendiente y a un revocado: solo P1 está vinculado.
    expect((await w.listDoctorPatients({ actor: w.actors.doctor1 })).items.map((patient) => patient.id)).toEqual([
      w.ids.p1.id,
    ]);
  });

  it("el médico sin asignación, con un paciente pendiente o revocado, o de otra clínica no accede", async () => {
    const w = await world();
    await w.upload(w.actors.p2, w.ids.p2.id);
    const before = await snapshot(w);

    for (const patientId of [w.ids.p2.id, w.ids.pending.id, w.ids.revoked.id, w.ids.patientB.id]) {
      await expect(w.upload(w.actors.doctor1, patientId)).rejects.toBeInstanceOf(StudyForbiddenError);
      await expect(w.listStudies({ actor: w.actors.doctor1, patientId })).rejects.toBeInstanceOf(StudyForbiddenError);
      await expect(w.getAssignedPatient({ actor: w.actors.doctor1, patientId })).rejects.toBeInstanceOf(
        StudyForbiddenError,
      );
    }
    await expectNothingChanged(w, before);
  });

  it("el médico de otra clínica no accede con el id exacto del paciente ni ve sus estudios", async () => {
    const w = await world();
    await w.upload(w.actors.p1, w.ids.p1.id);
    const before = await snapshot(w);

    await expect(w.upload(w.actors.doctorB, w.ids.p1.id)).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(w.listStudies({ actor: w.actors.doctorB, patientId: w.ids.p1.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
    const study = await prismaClient.study.findFirstOrThrow();
    expect(await prismaStudyRepository.findById({ tenantId: w.ids.tenantB.id, studyId: study.id })).toBeNull();
    expect(await prismaStudyRepository.deleteById({ tenantId: w.ids.tenantB.id, studyId: study.id })).toBe(false);
    await expectNothingChanged(w, before);
  });

  it("una asignación terminada quita el acceso y una reiniciada lo devuelve", async () => {
    const w = await world();
    await w.upload(w.actors.doctor1, w.ids.p1.id);
    await prismaClient.doctorPatientAssignment.updateMany({
      where: { membershipId: w.ids.doctor1.id, patientId: w.ids.p1.id },
      data: { endedAt: new Date(), endedByUserId: w.ids.adminUser.id },
    });
    const before = await snapshot(w);

    await expect(w.upload(w.actors.doctor1, w.ids.p1.id)).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(w.listStudies({ actor: w.actors.doctor1, patientId: w.ids.p1.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
    await expectNothingChanged(w, before);

    await createAssignment({
      tenantId: w.ids.tenantA.id,
      membershipId: w.ids.doctor1.id,
      patientId: w.ids.p1.id,
      createdByUserId: w.ids.adminUser.id,
    });
    await expect(w.upload(w.actors.doctor1, w.ids.p1.id)).resolves.toMatchObject({ number: 2 });
  });

  it("el administrador que también es médico actúa como médico y solo con sus asignaciones", async () => {
    const w = await world();

    await expect(w.upload(w.actors.adminDoctor, w.ids.p2.id)).resolves.toMatchObject({ number: 1 });
    await expect(w.upload(w.actors.adminDoctor, w.ids.p1.id)).rejects.toBeInstanceOf(StudyForbiddenError);
  });

  it("el administrador que no es médico no tiene actor de estudios", async () => {
    const w = await world();
    const session = await createSession({
      userId: w.sessions.adminUser.id,
      activeStaffMembershipId: w.ids.admin.id,
    });

    expect(await actorFromSession(session.tokenHash, w.sessions.adminUser.id)).toBeNull();
  });

  it("una membresía desactivada o una clínica suspendida dejan sin actor", async () => {
    const w = await world();
    const session = await createSession({
      userId: w.sessions.doctor1.id,
      activeStaffMembershipId: w.ids.doctor1.id,
    });

    expect(await actorFromSession(session.tokenHash, w.sessions.doctor1.id)).toMatchObject({ kind: "DOCTOR" });

    await prismaClient.staffMembership.update({ where: { id: w.ids.doctor1.id }, data: { status: "DEACTIVATED" } });
    expect(await actorFromSession(session.tokenHash, w.sessions.doctor1.id)).toBeNull();

    await prismaClient.staffMembership.update({ where: { id: w.ids.doctor1.id }, data: { status: "ACTIVE" } });
    await prismaClient.tenant.update({ where: { id: w.ids.tenantA.id }, data: { status: "SUSPENDED" } });
    expect(await actorFromSession(session.tokenHash, w.sessions.doctor1.id)).toBeNull();
  });

  it("eliminar: solo quien cargó el estudio y conserva el acceso; nadie de otra clínica ni de otro paciente", async () => {
    const w = await world();
    const deleteStudy = createDeleteStudy({
      studies: prismaStudyRepository,
      storage: w.storage,
      directory: prismaPatientDirectory,
    });
    const byDoctor = await w.upload(w.actors.doctor1, w.ids.p1.id);
    const byPatient = await w.upload(w.actors.p1, w.ids.p1.id);
    const before = await snapshot(w);

    // El paciente no elimina lo del médico, el médico no elimina lo del paciente, y los demás tampoco.
    for (const actor of [w.actors.p1, w.actors.p2, w.actors.doctor2, w.actors.doctorB, w.actors.adminDoctor]) {
      await expect(deleteStudy({ actor, studyId: byDoctor.studyId })).rejects.toBeDefined();
    }
    await expect(deleteStudy({ actor: w.actors.doctor1, studyId: byPatient.studyId })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
    await expectNothingChanged(w, before);

    await deleteStudy({ actor: w.actors.doctor1, studyId: byDoctor.studyId });
    await deleteStudy({ actor: w.actors.p1, studyId: byPatient.studyId });
    expect(await prismaClient.study.count()).toBe(0);
  });

  it("un tenantId forzado en la entrada se ignora: el estudio queda en la clínica del actor", async () => {
    const w = await world();
    const forced = { actor: w.actors.p1, patientId: w.ids.p1.id, type: "ECG", bytes: new Uint8Array(buildNpz()) };

    // El caso de uso no tiene un campo de clínica: una propiedad de más no cambia nada.
    await createUploadStudy({
      studies: prismaStudyRepository,
      storage: w.storage,
      reader: createNpzStudyFileReader(),
      directory: prismaPatientDirectory,
      generateId: () => "00000000-0000-4000-8000-0000000000aa",
    })({ ...forced, tenantId: w.ids.tenantB.id } as typeof forced);

    expect((await prismaClient.study.findFirstOrThrow()).tenantId).toBe(w.ids.tenantA.id);
  });
});
