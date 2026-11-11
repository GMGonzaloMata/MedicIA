import { beforeEach, describe, expect, it, vi } from "vitest";

import { createListClinicPatients } from "@/modules/users/application/use-cases/list-clinic-patients";
import { CLINIC_USERS_PAGE_SIZE } from "@/modules/users/domain/clinic-user-rules";

import { InMemoryClinicMemberRepository } from "../../../../support/in-memory/in-memory-clinic-member-repository";
import { createInvitationScenario } from "../../../../support/invitation-scenario";

let scenario: ReturnType<typeof createInvitationScenario>;
let members: InMemoryClinicMemberRepository;
let list: ReturnType<typeof createListClinicPatients>;

beforeEach(() => {
  scenario = createInvitationScenario();
  members = new InMemoryClinicMemberRepository(scenario.repo);
  list = createListClinicPatients({ members });
});

function addPatient(id: string, fullName: string | null, status: "PENDING" | "LINKED" | "REVOKED") {
  if (status !== "PENDING") scenario.addAccount(id, `${id}@example.com`, fullName ?? "Paciente");
  scenario.repo.patients.push({
    patientId: id,
    tenantId: scenario.adminActor.tenantId,
    userId: status === "PENDING" ? null : id,
    status,
    documentType: "DNI",
    documentNumber: id,
    fullName,
  });
}

describe("listar los pacientes de la clínica", () => {
  it("el administrador recibe pacientes ordenados y solo asignaciones vigentes", async () => {
    addPatient("zeta", "Zeta", "LINKED");
    addPatient("alba", "Alba", "REVOKED");
    addPatient("pendiente", null, "PENDING");
    const doctor = scenario.addDoctor();
    scenario.repo.assignments.push({
      tenantId: scenario.adminActor.tenantId,
      membershipId: doctor.membershipId,
      patientId: "zeta",
      createdByUserId: scenario.admin.id,
      endedAt: null,
    });
    scenario.repo.assignments.push({
      tenantId: scenario.adminActor.tenantId,
      membershipId: doctor.membershipId,
      patientId: "alba",
      createdByUserId: scenario.admin.id,
      endedAt: new Date(),
    });
    members.signedInUserIds.add("zeta");

    const result = await list({ actor: scenario.adminActor, page: 1 });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result).toMatchObject({ total: 3, page: 1, pageSize: CLINIC_USERS_PAGE_SIZE });
    expect(result.items.map((item) => item.fullName)).toEqual(["Alba", "Zeta", null]);
    expect(result.items.map((item) => item.canResendAccess)).toEqual([true, false, false]);
    expect(result.items.find((item) => item.patientId === "zeta")?.doctors).toEqual([
      expect.objectContaining({ membershipId: doctor.membershipId, isActive: true }),
    ]);
    expect(result.items.find((item) => item.patientId === "alba")?.doctors).toEqual([]);
    expect(result.items.every((item) => !Object.hasOwn(item, "hasSignedIn") && !Object.hasOwn(item, "hasAccount"))).toBe(true);
  });

  it.each([0, -1, 2.3, Number.NaN, 10_001, Number.MAX_SAFE_INTEGER])("normaliza una página inválida (%s) a la primera", async (page) => {
    expect(await list({ actor: scenario.adminActor, page })).toMatchObject({ status: "OK", page: 1 });
  });

  it("un médico, un paciente y personal sin roles reciben FORBIDDEN sin consultar", async () => {
    const read = vi.spyOn(members, "listPatients");
    const denied = [
      scenario.addDoctor().actor,
      { ...scenario.adminActor, isClinicAdmin: false, isDoctor: false },
      { ...scenario.adminActor, isClinicAdmin: false, isDoctor: false, membershipId: "patient" },
    ];

    for (const actor of denied) {
      expect(await list({ actor, page: 1 })).toEqual({ status: "FORBIDDEN" });
    }
    expect(read).not.toHaveBeenCalled();
  });
});
