import { describe, expect, it } from "vitest";

import { createListStudies } from "@/modules/studies/application/use-cases/list-studies";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";
import { InMemoryStudyRepository } from "../../../../support/in-memory/in-memory-study-repository";

const TENANT = "tenant-a";
const patient: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p1", patientId: "patient-1" };
const doctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m1", membershipId: "membership-1" };

async function setup(count: number) {
  const studies = new InMemoryStudyRepository();
  const directory = new InMemoryPatientDirectory();
  studies.registerUploader("user-p1", { fullName: "Paciente Uno", isPatient: true });
  studies.registerUploader("user-m1", { fullName: "Médico Uno", isPatient: false });

  for (let index = 0; index < count; index += 1) {
    await studies.insertWithNextNumber({
      id: `study-${index + 1}`,
      tenantId: TENANT,
      patientId: "patient-1",
      uploadedByUserId: index % 2 === 0 ? "user-p1" : "user-m1",
      type: "ECG",
      storageKey: `studies/${TENANT}/study-${index + 1}.ecg1`,
    });
  }

  return { directory, list: createListStudies({ studies, directory }) };
}

describe("listar estudios de un paciente", () => {
  it("ordena del más reciente al más antiguo y pagina de a 20", async () => {
    const { list } = await setup(25);

    const first = await list({ actor: patient, patientId: "patient-1" });
    const second = await list({ actor: patient, patientId: "patient-1", page: "2" });

    expect(first.items).toHaveLength(20);
    expect(first.items[0]?.number).toBe(25);
    expect(first).toMatchObject({ page: 1, pageSize: 20, totalItems: 25, totalPages: 2 });
    expect(second.items.map((item) => item.number)).toEqual([5, 4, 3, 2, 1]);
  });

  it("una página fuera de rango devuelve la última y una inválida se trata como 1", async () => {
    const { list } = await setup(25);

    expect((await list({ actor: patient, patientId: "patient-1", page: 99 })).page).toBe(2);
    expect((await list({ actor: patient, patientId: "patient-1", page: "abc" })).page).toBe(1);
    expect((await list({ actor: patient, patientId: "patient-1", page: -3 })).page).toBe(1);
  });

  it("devuelve una página vacía cuando no hay estudios", async () => {
    const { list } = await setup(0);

    expect(await list({ actor: patient, patientId: "patient-1" })).toMatchObject({
      items: [],
      page: 1,
      totalItems: 0,
      totalPages: 1,
    });
  });

  it("indica quién cargó cada estudio y si quien mira puede eliminarlo", async () => {
    const { list } = await setup(2);

    const result = await list({ actor: patient, patientId: "patient-1" });
    const byPatient = result.items.find((item) => item.number === 1);
    const byDoctor = result.items.find((item) => item.number === 2);

    expect(byPatient).toMatchObject({ uploadedBy: { kind: "PATIENT" }, canDelete: true });
    expect(byDoctor).toMatchObject({ uploadedBy: { kind: "DOCTOR", fullName: "Médico Uno" }, canDelete: false });
  });

  it("el paciente no lista estudios de otro paciente", async () => {
    const { list } = await setup(1);

    await expect(list({ actor: patient, patientId: "patient-2" })).rejects.toBeInstanceOf(StudyForbiddenError);
  });

  it("el médico lista solo con asignación vigente", async () => {
    const { directory, list } = await setup(1);

    await expect(list({ actor: doctor, patientId: "patient-1" })).rejects.toBeInstanceOf(StudyForbiddenError);

    const summary = { id: "patient-1", fullName: "Paciente Uno", documentType: "DNI" as const, documentNumber: "1", studyCount: 1 };
    directory.assign({ tenantId: TENANT, membershipId: "membership-1", patient: summary });
    expect((await list({ actor: doctor, patientId: "patient-1" })).items).toHaveLength(1);

    directory.end({ tenantId: TENANT, membershipId: "membership-1", patientId: "patient-1" });
    await expect(list({ actor: doctor, patientId: "patient-1" })).rejects.toBeInstanceOf(StudyForbiddenError);
  });
});
