import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { createDeleteStudy } from "@/modules/studies/application/use-cases/delete-study";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError, StudyNotFoundError } from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";
import { prismaStudyRepository } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";

beforeEach(resetDatabase);

async function world() {
  const storage = createInMemoryStudyFileStorage(new Map());
  const remove = createDeleteStudy({ studies: prismaStudyRepository, storage, directory: prismaPatientDirectory });
  const tenant = await createTenant();
  const otherTenant = await createTenant();
  const [patientUser, otherPatientUser, doctorUser, otherDoctorUser] = await Promise.all([
    createUser(),
    createUser(),
    createUser(),
    createUser(),
  ]);
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });
  const otherPatient = await createLinkedPatient({ tenantId: tenant.id, userId: otherPatientUser.id });
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const otherDoctor = await createDoctorMembership({ tenantId: tenant.id, userId: otherDoctorUser.id });

  const assign = (membershipId: string) =>
    createAssignment({ tenantId: tenant.id, membershipId, patientId: patient.id, createdByUserId: doctorUser.id });
  await assign(doctor.id);
  await assign(otherDoctor.id);

  const upload = async (tenantId: string, patientId: string, uploadedByUserId: string) => {
    const id = randomUUID();
    const storageKey = `studies/${tenantId}/${id}.ecg1`;
    await storage.put(storageKey, Uint8Array.from([1]));

    return prismaStudyRepository.insertWithNextNumber({ id, tenantId, patientId, uploadedByUserId, type: "ECG", storageKey });
  };

  const actors = {
    patient: { kind: "PATIENT", tenantId: tenant.id, userId: patientUser.id, patientId: patient.id } as StudyActor,
    doctor: { kind: "DOCTOR", tenantId: tenant.id, userId: doctorUser.id, membershipId: doctor.id } as StudyActor,
    otherDoctor: {
      kind: "DOCTOR",
      tenantId: tenant.id,
      userId: otherDoctorUser.id,
      membershipId: otherDoctor.id,
    } as StudyActor,
  };

  return { storage, remove, upload, actors, tenant, otherTenant, patient, otherPatient, patientUser, doctorUser, doctor, assign };
}

describe("eliminar un estudio (integración)", () => {
  it("borra la fila y el archivo sin modificar el contador, y el número no se reutiliza", async () => {
    const w = await world();
    const first = await w.upload(w.tenant.id, w.patient.id, w.patientUser.id);

    await w.remove({ actor: w.actors.patient, studyId: first.id });

    expect(await prismaClient.study.count()).toBe(0);
    expect(w.storage.has(first.storageKey)).toBe(false);
    expect((await prismaClient.studyCounter.findUniqueOrThrow({ where: { patientId: w.patient.id } })).lastNumber).toBe(1);
    expect((await w.upload(w.tenant.id, w.patient.id, w.patientUser.id)).number).toBe(2);
  });

  it("solo elimina quien cargó el estudio", async () => {
    const w = await world();
    const byDoctor = await w.upload(w.tenant.id, w.patient.id, w.doctorUser.id);

    await expect(w.remove({ actor: w.actors.patient, studyId: byDoctor.id })).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(w.remove({ actor: w.actors.otherDoctor, studyId: byDoctor.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
    expect(await prismaClient.study.count()).toBe(1);

    await w.remove({ actor: w.actors.doctor, studyId: byDoctor.id });
    expect(await prismaClient.study.count()).toBe(0);
  });

  it("quien cargó pero perdió la asignación no elimina, y al reiniciarla sí", async () => {
    const w = await world();
    const study = await w.upload(w.tenant.id, w.patient.id, w.doctorUser.id);
    await prismaClient.doctorPatientAssignment.updateMany({
      where: { membershipId: w.doctor.id, patientId: w.patient.id },
      data: { endedAt: new Date(), endedByUserId: w.doctorUser.id },
    });

    await expect(w.remove({ actor: w.actors.doctor, studyId: study.id })).rejects.toBeInstanceOf(StudyForbiddenError);
    expect(await prismaClient.study.count()).toBe(1);

    await w.assign(w.doctor.id);
    await w.remove({ actor: w.actors.doctor, studyId: study.id });
    expect(await prismaClient.study.count()).toBe(0);
  });

  it("no cambia los estudios de otros pacientes ni de otras clínicas", async () => {
    const w = await world();
    const target = await w.upload(w.tenant.id, w.patient.id, w.patientUser.id);
    const sibling = await w.upload(w.tenant.id, w.patient.id, w.patientUser.id);
    const otherPatientStudy = await w.upload(w.tenant.id, w.otherPatient.id, w.doctorUser.id);

    await w.remove({ actor: w.actors.patient, studyId: target.id });

    const remaining = (await prismaClient.study.findMany()).map((study) => study.id).sort();
    expect(remaining).toEqual([sibling.id, otherPatientStudy.id].sort());
    await expect(
      w.remove({ actor: { ...w.actors.patient, tenantId: w.otherTenant.id }, studyId: sibling.id }),
    ).rejects.toBeInstanceOf(StudyNotFoundError);
    expect(await prismaClient.study.count()).toBe(2);
  });
});
