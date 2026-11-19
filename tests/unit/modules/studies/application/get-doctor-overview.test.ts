import { describe, expect, it, vi } from "vitest";

import type { DoctorOverviewReader } from "@/modules/studies/application/ports/out/doctor-overview";
import { createGetDoctorOverview } from "@/modules/studies/application/use-cases/get-doctor-overview";
import type { StudyActor } from "@/modules/studies/domain/study-access";
import { StudyForbiddenError } from "@/modules/studies/domain/study-errors";

function setup() {
  const read = vi.fn<DoctorOverviewReader["read"]>();
  return { read, getOverview: createGetDoctorOverview({ overview: { read } }) };
}

const doctor: StudyActor = { kind: "DOCTOR", tenantId: "clinica", userId: "cuenta", membershipId: "membresia" };
const patient: StudyActor = { kind: "PATIENT", tenantId: "clinica", userId: "otra-cuenta", patientId: "paciente" };

describe("consulta del resumen clínico", () => {
  it("pide una única lectura del ámbito del actor y no confunde el total de estudios con el límite de filas", async () => {
    const { read, getOverview } = setup();
    const result = {
      assignedPatientCount: 2,
      studyCount: 7,
      recentStudies: Array.from({ length: 5 }, (value, index) => ({
        id: `estudio-${index}`,
        number: 7 - index,
        uploadedAt: new Date("2026-11-18T15:30:00Z"),
        patientName: "Paciente de prueba",
      })),
    };
    read.mockResolvedValue(result);

    await expect(getOverview({ actor: doctor })).resolves.toEqual(result);
    expect(read).toHaveBeenCalledExactlyOnceWith({ tenantId: "clinica", membershipId: "membresia", recentLimit: 5 });
  });

  it.each([patient, null])("rechaza al actor sin rol médico sin consultar datos: %j", async (actor) => {
    const { read, getOverview } = setup();

    await expect(getOverview({ actor })).rejects.toBeInstanceOf(StudyForbiddenError);
    expect(read).not.toHaveBeenCalled();
  });
});
