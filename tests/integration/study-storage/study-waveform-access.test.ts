import { beforeEach, describe, expect, it } from "vitest";

import { createGetStudyWaveform } from "@/modules/studies/application/use-cases/get-study-waveform";
import { createUploadStudy } from "@/modules/studies/application/use-cases/upload-study";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError, StudyNotFoundError } from "@/modules/studies/domain/study-errors";
import { createInMemoryStudyFileStorage } from "@/modules/studies/infrastructure/adapters/in-memory-study-file-storage";
import { createNpzStudyFileReader } from "@/modules/studies/infrastructure/adapters/npz-reader";
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
import { buildNpz } from "../../support/npz-builder";

beforeEach(resetDatabase);

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
  const getStudyWaveform = createGetStudyWaveform({
    studies: prismaStudyRepository,
    storage,
    directory: prismaPatientDirectory,
  });

  const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
  const [adminUser, doctor1User, doctor2User, p1User, p2User, doctorBUser] = await Promise.all(
    Array.from({ length: 6 }, () => createUser()),
  );
  const doctor1 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor1User!.id });
  const doctor2 = await createDoctorMembership({ tenantId: tenantA.id, userId: doctor2User!.id });
  const doctorB = await createDoctorMembership({ tenantId: tenantB.id, userId: doctorBUser!.id });
  const p1 = await createLinkedPatient({ tenantId: tenantA.id, userId: p1User!.id });
  const p2 = await createLinkedPatient({ tenantId: tenantA.id, userId: p2User!.id });

  await createAssignment({
    tenantId: tenantA.id,
    membershipId: doctor1.id,
    patientId: p1.id,
    createdByUserId: adminUser!.id,
  });

  const actors = {
    p1: { kind: "PATIENT", tenantId: tenantA.id, userId: p1User!.id, patientId: p1.id } as StudyActor,
    p2: { kind: "PATIENT", tenantId: tenantA.id, userId: p2User!.id, patientId: p2.id } as StudyActor,
    doctor1: { kind: "DOCTOR", tenantId: tenantA.id, userId: doctor1User!.id, membershipId: doctor1.id } as StudyActor,
    doctor2: { kind: "DOCTOR", tenantId: tenantA.id, userId: doctor2User!.id, membershipId: doctor2.id } as StudyActor,
    doctorB: { kind: "DOCTOR", tenantId: tenantB.id, userId: doctorBUser!.id, membershipId: doctorB.id } as StudyActor,
  };

  await uploadStudy({ actor: actors.p1, patientId: p1.id, type: "ECG", bytes: new Uint8Array(buildNpz()) });
  const study = await prismaClient.study.findFirstOrThrow();

  return { getStudyWaveform, actors, study, tenantA, tenantB, doctor1, p1, adminUser: adminUser! };
}

describe("acceso a la onda de un estudio", () => {
  it("findDetailById respeta la clínica: con la correcta devuelve el detalle y con otra, null", async () => {
    const w = await world();

    const detail = await prismaStudyRepository.findDetailById({ tenantId: w.tenantA.id, studyId: w.study.id });

    expect(detail).toMatchObject({ id: w.study.id, patientId: w.p1.id, number: 1, uploadedByPatient: true });
    expect(
      await prismaStudyRepository.findDetailById({ tenantId: w.tenantB.id, studyId: w.study.id }),
    ).toBeNull();
  });

  it("el paciente dueño y el médico con asignación vigente ven la onda", async () => {
    const w = await world();

    const own = await w.getStudyWaveform({ actor: w.actors.p1, studyId: w.study.id });
    const assigned = await w.getStudyWaveform({ actor: w.actors.doctor1, studyId: w.study.id });

    expect(own.status).toBe("READY");
    expect(assigned.status).toBe("READY");
    expect(own.study.patientName).toBeNull();
    expect(assigned.study.uploadedBy).toEqual({ kind: "PATIENT" });
  });

  it("un paciente ajeno y un médico sin asignación no acceden", async () => {
    const w = await world();

    await expect(w.getStudyWaveform({ actor: w.actors.p2, studyId: w.study.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
    await expect(w.getStudyWaveform({ actor: w.actors.doctor2, studyId: w.study.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );
  });

  it("un médico de otra clínica ve el estudio como inexistente", async () => {
    const w = await world();

    await expect(w.getStudyWaveform({ actor: w.actors.doctorB, studyId: w.study.id })).rejects.toBeInstanceOf(
      StudyNotFoundError,
    );
  });

  it("un identificador inexistente da NOT_FOUND", async () => {
    const w = await world();

    await expect(
      w.getStudyWaveform({ actor: w.actors.p1, studyId: "00000000-0000-4000-8000-ffffffffffff" }),
    ).rejects.toBeInstanceOf(StudyNotFoundError);
  });

  it("una asignación terminada quita el acceso y una reiniciada lo devuelve", async () => {
    const w = await world();
    await prismaClient.doctorPatientAssignment.updateMany({
      where: { membershipId: w.doctor1.id, patientId: w.p1.id },
      data: { endedAt: new Date(), endedByUserId: w.adminUser.id },
    });

    await expect(w.getStudyWaveform({ actor: w.actors.doctor1, studyId: w.study.id })).rejects.toBeInstanceOf(
      StudyForbiddenError,
    );

    await createAssignment({
      tenantId: w.tenantA.id,
      membershipId: w.doctor1.id,
      patientId: w.p1.id,
      createdByUserId: w.adminUser.id,
    });

    expect((await w.getStudyWaveform({ actor: w.actors.doctor1, studyId: w.study.id })).status).toBe("READY");
  });
});
