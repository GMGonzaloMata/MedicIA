import { describe, expect, it } from "vitest";

import { createGetAssignedPatient } from "@/modules/studies/application/use-cases/get-assigned-patient";
import { createListDoctorPatients } from "@/modules/studies/application/use-cases/list-doctor-patients";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";

import { InMemoryPatientDirectory } from "../../../../support/in-memory/in-memory-patient-directory";

const TENANT = "tenant-a";
const doctor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-m1", membershipId: "membership-1" };
const patientActor: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-p1", patientId: "patient-1" };

function summary(index: number) {
  return {
    id: `patient-${index}`,
    fullName: `Paciente ${String(index).padStart(3, "0")}`,
    documentType: "DNI" as const,
    documentNumber: `${index}`,
    studyCount: index,
  };
}

function setup(count: number) {
  const directory = new InMemoryPatientDirectory();
  for (let index = 1; index <= count; index += 1) {
    directory.assign({ tenantId: TENANT, membershipId: "membership-1", patient: summary(index) });
  }
  directory.assign({ tenantId: TENANT, membershipId: "membership-2", patient: summary(999) });

  return { directory, list: createListDoctorPatients({ directory }) };
}

describe("listar los pacientes de un médico", () => {
  it("devuelve solo sus asignaciones vigentes, ordenadas por nombre, con la cantidad de estudios", async () => {
    const { list } = setup(3);

    const result = await list({ actor: doctor });

    expect(result.items.map((patient) => patient.fullName)).toEqual(["Paciente 001", "Paciente 002", "Paciente 003"]);
    expect(result.items[2]?.studyCount).toBe(3);
    expect(result).toMatchObject({ page: 1, pageSize: 20, totalItems: 3, totalPages: 1 });
  });

  it("pagina de a 20 y acota una página fuera de rango", async () => {
    const { list } = setup(45);

    expect((await list({ actor: doctor, page: "2" })).items).toHaveLength(20);
    expect((await list({ actor: doctor, page: 99 })).page).toBe(3);
    expect((await list({ actor: doctor, page: "x" })).page).toBe(1);
  });

  it("una asignación terminada quita al paciente de la lista", async () => {
    const { directory, list } = setup(2);

    directory.end({ tenantId: TENANT, membershipId: "membership-1", patientId: "patient-1" });

    expect((await list({ actor: doctor })).items.map((patient) => patient.id)).toEqual(["patient-2"]);
  });

  it("un paciente no tiene esta lista", async () => {
    const { list } = setup(1);

    await expect(list({ actor: patientActor })).rejects.toBeInstanceOf(StudyForbiddenError);
  });
});

describe("obtener un paciente asignado", () => {
  it("lo devuelve con asignación vigente y niega el resto sin distinguir los casos", async () => {
    const { directory } = setup(1);
    const get = createGetAssignedPatient({ directory });

    await expect(get({ actor: doctor, patientId: "patient-1" })).resolves.toMatchObject({ fullName: "Paciente 001" });
    await expect(get({ actor: doctor, patientId: "patient-999" })).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(get({ actor: doctor, patientId: "no-existe" })).rejects.toBeInstanceOf(StudyForbiddenError);
    await expect(get({ actor: patientActor, patientId: "patient-1" })).rejects.toBeInstanceOf(StudyForbiddenError);

    directory.end({ tenantId: TENANT, membershipId: "membership-1", patientId: "patient-1" });
    await expect(get({ actor: doctor, patientId: "patient-1" })).rejects.toBeInstanceOf(StudyForbiddenError);
  });
});
