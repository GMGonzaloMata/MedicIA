import { beforeEach, describe, expect, it } from "vitest";

import { prismaPatientDirectory } from "@/modules/studies/infrastructure/repositories/prisma-patient-directory";

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

describe("directorio de pacientes del médico", () => {
  it("solo muestra pacientes vinculados con una asignación vigente de ese médico y esa clínica", async () => {
    const [tenantA, tenantB] = await Promise.all([createTenant(), createTenant()]);
    const doctorUser = await createUser();
    const [doctorA, doctorB] = await Promise.all([
      createDoctorMembership({ tenantId: tenantA.id, userId: doctorUser.id }),
      createDoctorMembership({ tenantId: tenantB.id, userId: doctorUser.id }),
    ]);
    const otherDoctor = await createDoctorMembership({ tenantId: tenantA.id, userId: (await createUser()).id });
    const visible = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    const otherDoctorPatient = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    const revoked = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    const endedPatient = await createLinkedPatient({ tenantId: tenantA.id, userId: (await createUser()).id });
    const otherClinicPatient = await createLinkedPatient({ tenantId: tenantB.id, userId: (await createUser()).id });
    for (const [membershipId, patientId, tenantId] of [
      [doctorA.id, visible.id, tenantA.id],
      [otherDoctor.id, otherDoctorPatient.id, tenantA.id],
      [doctorA.id, revoked.id, tenantA.id],
      [doctorA.id, endedPatient.id, tenantA.id],
      [doctorB.id, otherClinicPatient.id, tenantB.id],
    ]) {
      await createAssignment({ tenantId, membershipId, patientId, createdByUserId: doctorUser.id });
    }
    await prismaClient.patient.update({ where: { id: revoked.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    const ended = await prismaClient.doctorPatientAssignment.findFirstOrThrow({
      where: { tenantId: tenantA.id, membershipId: doctorA.id, patientId: endedPatient.id },
    });
    await prismaClient.doctorPatientAssignment.update({
      where: { id: ended.id },
      data: { endedAt: new Date(Date.now() + 1000), endedByUserId: doctorUser.id },
    });

    const a = await prismaPatientDirectory.listAssignedPatients({
      tenantId: tenantA.id, membershipId: doctorA.id, page: 1, pageSize: 25,
    });
    const b = await prismaPatientDirectory.listAssignedPatients({
      tenantId: tenantB.id, membershipId: doctorB.id, page: 1, pageSize: 25,
    });

    expect(a.items.map((patient) => patient.id)).toEqual([visible.id]);
    expect(a.totalItems).toBe(1);
    expect(b.items.map((patient) => patient.id)).toEqual([otherClinicPatient.id]);
  });
});
