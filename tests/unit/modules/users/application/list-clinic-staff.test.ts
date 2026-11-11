import { beforeEach, describe, expect, it, vi } from "vitest";

import { createListClinicStaff } from "@/modules/users/application/use-cases/list-clinic-staff";
import { CLINIC_USERS_PAGE_SIZE } from "@/modules/users/domain/clinic-user-rules";

import { InMemoryClinicMemberRepository } from "../../../../support/in-memory/in-memory-clinic-member-repository";
import { createInvitationScenario, TENANT_ID } from "../../../../support/invitation-scenario";

let scenario: ReturnType<typeof createInvitationScenario>;
let members: InMemoryClinicMemberRepository;
let list: ReturnType<typeof createListClinicStaff>;

beforeEach(() => {
  scenario = createInvitationScenario();
  members = new InMemoryClinicMemberRepository(scenario.repo);
  list = createListClinicStaff({ members });
});

describe("listar el personal de la clínica", () => {
  it("el administrador recibe su página ordenada por nombre y sin el estado interno de sesión", async () => {
    const zeta = scenario.addAccount("zeta", "zeta@example.com", "Zeta");
    scenario.addStaff(zeta.id, { isDoctor: true });
    const alba = scenario.addAccount("alba", "alba@example.com", "Alba");
    scenario.addStaff(alba.id, { isDoctor: true });
    const external = scenario.addAccount("externo", "externo@example.com", "Externo");
    scenario.addStaff(external.id, { tenantId: "tenant-2", isDoctor: true });
    members.signedInUserIds.add(zeta.id);

    const result = await list({ actor: scenario.adminActor, page: 1 });

    expect(result.status).toBe("OK");
    if (result.status !== "OK") return;
    expect(result).toMatchObject({ total: 3, page: 1, pageSize: CLINIC_USERS_PAGE_SIZE });
    expect(result.items.map((item) => item.fullName)).toEqual(["Alba", "Ana Admin", "Zeta"]);
    expect(result.items.map((item) => item.canResendAccess)).toEqual([true, false, false]);
    expect(result.items.every((item) => !Object.hasOwn(item, "hasSignedIn"))).toBe(true);
    expect(result.items.every((item) => item.email !== external.email)).toBe(true);
  });

  it.each([0, -2, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 10_001, Number.MAX_SAFE_INTEGER])("normaliza una página inválida (%s) a la primera", async (page) => {
    const result = await list({ actor: scenario.adminActor, page });

    expect(result).toMatchObject({ status: "OK", page: 1, pageSize: CLINIC_USERS_PAGE_SIZE });
  });

  it("un médico, un paciente y personal sin roles reciben FORBIDDEN sin consultar", async () => {
    const read = vi.spyOn(members, "listStaff");
    const doctor = scenario.addDoctor();
    const denied = [
      doctor.actor,
      { ...scenario.adminActor, isClinicAdmin: false, isDoctor: false },
      { ...scenario.adminActor, isClinicAdmin: false, isDoctor: false, membershipId: "patient" },
    ];

    for (const actor of denied) {
      expect(await list({ actor, page: 1 })).toEqual({ status: "FORBIDDEN" });
    }
    expect(read).not.toHaveBeenCalled();
  });

  it("si tiene ambos roles, el administrador conserva el acceso", async () => {
    const result = await list({ actor: { ...scenario.adminActor, isDoctor: true, tenantId: TENANT_ID }, page: 2 });

    expect(result).toMatchObject({ status: "OK", page: 2, total: 1, items: [] });
  });
});
