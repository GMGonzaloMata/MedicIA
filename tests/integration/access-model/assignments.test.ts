import { beforeEach, describe, expect, it } from "vitest";

import {
  createAssignment,
  createDoctorMembership,
  createLinkedPatient,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

beforeEach(resetDatabase);

async function createScenario() {
  const tenant = await createTenant();
  const admin = await createUser();
  const doctorUser = await createUser();
  const patientUser = await createUser();
  const doctor = await createDoctorMembership({ tenantId: tenant.id, userId: doctorUser.id });
  const patient = await createLinkedPatient({ tenantId: tenant.id, userId: patientUser.id });

  return { tenant, admin, doctor, patient };
}

type Scenario = Awaited<ReturnType<typeof createScenario>>;

function assignmentFor(scenario: Scenario) {
  return {
    tenantId: scenario.tenant.id,
    membershipId: scenario.doctor.id,
    patientId: scenario.patient.id,
    createdByUserId: scenario.admin.id,
  };
}

async function endAssignment(assignmentId: string, endedByUserId: string) {
  return prismaClient.doctorPatientAssignment.update({
    where: { id: assignmentId },
    data: { endedAt: new Date(), endedByUserId },
  });
}

describe("Asignaciones entre médicos y pacientes (historia 4)", () => {
  it("crea una asignación activa que registra quién la creó y cuándo", async () => {
    const scenario = await createScenario();

    const assignment = await createAssignment(assignmentFor(scenario));

    expect(assignment.endedAt).toBeNull();
    expect(assignment.endedByUserId).toBeNull();
    expect(assignment.createdByUserId).toBe(scenario.admin.id);
    expect(assignment.createdAt).toBeInstanceOf(Date);
  });

  it("rechaza una segunda asignación activa de la misma pareja", async () => {
    const scenario = await createScenario();
    await createAssignment(assignmentFor(scenario));

    await expectRejectedBy(
      createAssignment(assignmentFor(scenario)),
      "doctor_patient_assignments_one_active_per_pair",
    );
  });

  it("crea una asignación nueva al volver a asignar y conserva la terminada", async () => {
    const scenario = await createScenario();
    const first = await createAssignment(assignmentFor(scenario));
    await endAssignment(first.id, scenario.admin.id);

    const second = await createAssignment(assignmentFor(scenario));

    const all = await prismaClient.doctorPatientAssignment.findMany({
      where: { membershipId: scenario.doctor.id, patientId: scenario.patient.id },
    });
    expect(second.id).not.toBe(first.id);
    expect(all).toHaveLength(2);
    expect(all.find((assignment) => assignment.id === first.id)?.endedAt).not.toBeNull();
  });

  it("consulta los pacientes de un médico y devuelve solo las asignaciones activas", async () => {
    const scenario = await createScenario();
    const otherPatient = await createLinkedPatient({
      tenantId: scenario.tenant.id,
      userId: (await createUser()).id,
    });
    await createAssignment(assignmentFor(scenario));
    const ended = await createAssignment({
      ...assignmentFor(scenario),
      patientId: otherPatient.id,
    });
    await endAssignment(ended.id, scenario.admin.id);

    const active = await prismaClient.doctorPatientAssignment.findMany({
      where: { tenantId: scenario.tenant.id, membershipId: scenario.doctor.id, endedAt: null },
    });

    expect(active.map((assignment) => assignment.patientId)).toEqual([scenario.patient.id]);
  });

  it("devuelve todos los períodos de una pareja con quién creó y quién terminó cada uno", async () => {
    const scenario = await createScenario();
    const closer = await createUser();
    const first = await createAssignment(assignmentFor(scenario));
    await endAssignment(first.id, closer.id);
    await createAssignment(assignmentFor(scenario));

    const history = await prismaClient.doctorPatientAssignment.findMany({
      where: { membershipId: scenario.doctor.id, patientId: scenario.patient.id },
      orderBy: { createdAt: "asc" },
    });

    expect(history).toHaveLength(2);
    expect(history[0]?.createdByUserId).toBe(scenario.admin.id);
    expect(history[0]?.endedByUserId).toBe(closer.id);
    expect(history[1]?.endedAt).toBeNull();
  });

  it("rechaza terminar una asignación sin indicar quién la terminó, o al revés", async () => {
    const scenario = await createScenario();
    const endedByRule = "doctor_patient_assignments_end_fields_together";
    // Fechas explícitas y ordenadas, para que solo esta regla pueda ser la que rechaza.
    const period = {
      createdAt: new Date("2026-01-01T00:00:00Z"),
      endedAt: new Date("2026-01-02T00:00:00Z"),
    };

    await expectRejectedBy(
      createAssignment({ ...assignmentFor(scenario), ...period }),
      endedByRule,
    );
    await expectRejectedBy(
      createAssignment({
        ...assignmentFor(scenario),
        createdAt: period.createdAt,
        endedByUserId: scenario.admin.id,
      }),
      endedByRule,
    );
  });

  it("rechaza una fecha de fin anterior a la de inicio", async () => {
    const scenario = await createScenario();

    await expectRejectedBy(
      createAssignment({
        ...assignmentFor(scenario),
        createdAt: new Date("2026-01-10T00:00:00Z"),
        endedAt: new Date("2026-01-09T00:00:00Z"),
        endedByUserId: scenario.admin.id,
      }),
      "doctor_patient_assignments_end_after_start",
    );
  });

  it("acepta que un médico tenga muchos pacientes y un paciente muchos médicos", async () => {
    const scenario = await createScenario();
    const secondPatient = await createLinkedPatient({
      tenantId: scenario.tenant.id,
      userId: (await createUser()).id,
    });
    const secondDoctor = await createDoctorMembership({
      tenantId: scenario.tenant.id,
      userId: (await createUser()).id,
    });

    await createAssignment(assignmentFor(scenario));
    await createAssignment({ ...assignmentFor(scenario), patientId: secondPatient.id });
    await createAssignment({ ...assignmentFor(scenario), membershipId: secondDoctor.id });

    expect(
      await prismaClient.doctorPatientAssignment.count({
        where: { membershipId: scenario.doctor.id, endedAt: null },
      }),
    ).toBe(2);
    expect(
      await prismaClient.doctorPatientAssignment.count({
        where: { patientId: scenario.patient.id, endedAt: null },
      }),
    ).toBe(2);
  });
});
