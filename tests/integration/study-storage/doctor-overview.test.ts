import { beforeEach, describe, expect, it } from "vitest";

import { createGetDoctorOverview } from "@/modules/studies/application/use-cases/get-doctor-overview";
import { resolveStudyActor } from "@/modules/studies/domain/study-access";
import { prismaDoctorOverview } from "@/modules/studies/infrastructure/repositories/prisma-doctor-overview";
import { prismaStudyRepository } from "@/modules/studies/infrastructure/repositories/prisma-study-repository";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";

beforeEach(resetDatabase);

const getOverview = createGetDoctorOverview({ overview: prismaDoctorOverview });

async function registerDoctor(tenantId: string, isClinicAdmin = false) {
  const user = await createUser();
  const membership = await createDoctorMembership({ tenantId, userId: user.id, isClinicAdmin });
  const actor = resolveStudyActor({
    tenantId,
    userId: user.id,
    relationship: { kind: "STAFF", membershipId: membership.id, isDoctor: membership.isDoctor, isClinicAdmin },
  });
  if (actor?.kind !== "DOCTOR") throw new Error("La prueba requiere una membresía médica.");
  return actor;
}

async function linkedPatient(tenantId: string, fullName: string) {
  const user = await createUser();
  return createLinkedPatient({ tenantId, userId: user.id, fullName });
}

async function assign(doctor: Awaited<ReturnType<typeof registerDoctor>>, patientId: string) {
  return createAssignment({
    tenantId: doctor.tenantId,
    membershipId: doctor.membershipId,
    patientId,
    createdByUserId: doctor.userId,
  });
}

async function endAssignment(assignment: Awaited<ReturnType<typeof assign>>) {
  await prismaClient.doctorPatientAssignment.update({
    where: { id: assignment.id },
    data: { endedAt: new Date(), endedByUserId: assignment.createdByUserId },
  });
}

async function seedStudy(patient: Awaited<ReturnType<typeof linkedPatient>>, uploaderId: string, fixture: {
  sequence: number;
  day: number;
}) {
  const { sequence, day } = fixture;
  const id = `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
  const { tenantId } = patient;
  const { number } = await prismaStudyRepository.insertWithNextNumber({
    id, tenantId, patientId: patient.id, uploadedByUserId: uploaderId, type: "ECG",
    storageKey: `studies/${tenantId}/${id}.ecg1`,
  });
  const uploadedAt = new Date(Date.UTC(2026, 10, day, 15, 30));
  await prismaClient.study.update({ where: { id, tenantId }, data: { uploadedAt } });
  return { id, number, uploadedAt, patientName: patient.fullName };
}

async function counts() {
  const [patients, studies, counters, assignments] = await Promise.all([
    prismaClient.patient.count(), prismaClient.study.count(),
    prismaClient.studyCounter.count(), prismaClient.doctorPatientAssignment.count(),
  ]);
  return { patients, studies, counters, assignments };
}

describe("resumen clínico (S4) con datos PostgreSQL", () => {
  it("cuenta todos los estudios asignados, ordena solo cinco y excluye datos de otros ámbitos", async () => {
    const [tenant, otherTenant] = await Promise.all([createTenant(), createTenant()]);
    const [doctor, colleague, external] = await Promise.all([
      registerDoctor(tenant.id, true), registerDoctor(tenant.id), registerDoctor(otherTenant.id),
    ]);
    const [first, second, withoutStudies, colleaguePatient, externalPatient, endedPatient, revokedPatient, pendingPatient] =
      await Promise.all([
        linkedPatient(tenant.id, "Paciente asignado A"), linkedPatient(tenant.id, "Paciente asignado B"),
        linkedPatient(tenant.id, "Asignado sin estudios"), linkedPatient(tenant.id, "Paciente de otro médico"),
        linkedPatient(otherTenant.id, "Paciente de otra clínica"), linkedPatient(tenant.id, "Asignación terminada"),
        linkedPatient(tenant.id, "Paciente revocado"), createPatient({ tenantId: tenant.id }),
      ]);
    await endAssignment(await assign(doctor, endedPatient.id));
    await Promise.all([
      assign(doctor, first.id), assign(doctor, second.id), assign(doctor, withoutStudies.id),
      assign(colleague, colleaguePatient.id), assign(external, externalPatient.id),
      assign(doctor, revokedPatient.id), assign(doctor, pendingPatient.id),
    ]);
    await prismaClient.patient.update({ where: { id: revokedPatient.id }, data: { status: "REVOKED", revokedAt: new Date() } });

    await seedStudy(first, doctor.userId, { sequence: 1, day: 12 });
    const middle = await seedStudy(first, colleague.userId, { sequence: 2, day: 18 });
    const tiedLowerId = await seedStudy(first, doctor.userId, { sequence: 3, day: 20 });
    await seedStudy(first, doctor.userId, { sequence: 4, day: 15 });
    const fifth = await seedStudy(second, doctor.userId, { sequence: 5, day: 16 });
    const tiedHigherId = await seedStudy(second, doctor.userId, { sequence: 6, day: 20 });
    const fourth = await seedStudy(second, doctor.userId, { sequence: 7, day: 17 });
    const [colleagueStudy, externalStudy] = await Promise.all([
      seedStudy(colleaguePatient, colleague.userId, { sequence: 8, day: 25 }),
      seedStudy(externalPatient, external.userId, { sequence: 9, day: 26 }),
      seedStudy(endedPatient, doctor.userId, { sequence: 10, day: 27 }),
      seedStudy(revokedPatient, doctor.userId, { sequence: 11, day: 28 }),
    ]);
    const before = await counts();

    await expect(getOverview({ actor: doctor })).resolves.toEqual({
      assignedPatientCount: 3,
      studyCount: 7,
      recentStudies: [tiedHigherId, tiedLowerId, middle, fourth, fifth],
    });
    await expect(getOverview({ actor: colleague })).resolves.toEqual({
      assignedPatientCount: 1, studyCount: 1, recentStudies: [colleagueStudy],
    });
    await expect(getOverview({ actor: external })).resolves.toEqual({
      assignedPatientCount: 1, studyCount: 1, recentStudies: [externalStudy],
    });
    await expect(getOverview({ actor: { ...doctor, tenantId: otherTenant.id } })).resolves.toEqual({
      assignedPatientCount: 0, studyCount: 0, recentStudies: [],
    });
    expect(await counts()).toEqual(before);
  });

  it("distingue los ceros y recalcula el resumen al terminar la asignación sin borrar los estudios", async () => {
    const tenant = await createTenant();
    const doctor = await registerDoctor(tenant.id);
    const patient = await linkedPatient(tenant.id, "Paciente con asignación temporal");
    const empty = { assignedPatientCount: 0, studyCount: 0, recentStudies: [] };

    await expect(getOverview({ actor: doctor })).resolves.toEqual(empty);
    const assignment = await assign(doctor, patient.id);
    await expect(getOverview({ actor: doctor })).resolves.toEqual({ ...empty, assignedPatientCount: 1 });
    const study = await seedStudy(patient, doctor.userId, { sequence: 1, day: 18 });
    await expect(getOverview({ actor: doctor })).resolves.toEqual({
      assignedPatientCount: 1, studyCount: 1, recentStudies: [study],
    });

    await endAssignment(assignment);
    const before = await counts();
    await expect(getOverview({ actor: doctor })).resolves.toEqual(empty);
    expect(await counts()).toEqual(before);
    expect(await prismaStudyRepository.findById({ tenantId: tenant.id, studyId: study.id })).not.toBeNull();
  });
});
