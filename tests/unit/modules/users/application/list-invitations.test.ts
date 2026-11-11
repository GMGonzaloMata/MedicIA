import { beforeEach, describe, expect, it } from "vitest";

import { INVITATION_TTL_MS } from "@/modules/users/domain/invitation";
import { createListInvitations } from "@/modules/users/application/use-cases/list-invitations";

import { TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

let scenario: ReturnType<typeof createInvitationScenario>;
let list: ReturnType<typeof createListInvitations>;

const PATIENT = { kind: "PATIENT", documentType: "DNI", documentNumber: "30111222" } as const;

beforeEach(() => {
  scenario = createInvitationScenario();
  list = createListInvitations({ invitations: scenario.repo, now: scenario.now });
});

describe("listar las invitaciones pendientes", () => {
  it("el administrador ve las de toda la clínica, de la más nueva a la más vieja", async () => {
    const doctor = scenario.addDoctor();
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN1" });
    scenario.advance(60_000);
    await scenario.createInvitation({ actor: doctor.actor, email: "b@example.com", ...PATIENT });

    const result = await list({ actor: scenario.adminActor });

    expect(result.map((invitation) => invitation.email)).toEqual(["b@example.com", "a@example.com"]);
    expect(result[0]).toMatchObject({ kind: "PATIENT", createdByName: "Dr. Médico", sentAt: expect.any(Date) });
  });

  it("quien solo es médico ve únicamente las que generó", async () => {
    const doctor = scenario.addDoctor();
    const other = scenario.addDoctor("doctor-2", "otro@clinica.example");
    await scenario.createInvitation({ actor: doctor.actor, email: "mia@example.com", ...PATIENT });
    await scenario.createInvitation({ actor: other.actor, email: "ajena@example.com", ...PATIENT, documentNumber: "30222333" });
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "admin@example.com", licenseNumber: "MN1" });

    const result = await list({ actor: doctor.actor });

    expect(result.map((invitation) => invitation.email)).toEqual(["mia@example.com"]);
  });

  it("no incluye las vencidas, las revocadas ni las usadas", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "vencida@example.com", licenseNumber: "MN1" });
    scenario.advance(INVITATION_TTL_MS + 1000);
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "vigente@example.com", licenseNumber: "MN2" });
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "revocada@example.com", licenseNumber: "MN3" });
    const revoked = scenario.repo.invitations.find((invitation) => invitation.email === "revocada@example.com");
    await scenario.repo.revoke({ tenantId: TENANT_ID, invitationId: revoked?.id ?? "", now: scenario.now() });

    const result = await list({ actor: scenario.adminActor });

    expect(result.map((invitation) => invitation.email)).toEqual(["vigente@example.com"]);
  });

  it("no incluye las de otra clínica ni las de una clínica suspendida", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN1" });

    expect(await list({ actor: { ...scenario.adminActor, tenantId: "tenant-2" } })).toEqual([]);

    scenario.repo.tenants.set(TENANT_ID, { name: "Clínica del Sol", isActive: false });
    expect(await list({ actor: scenario.adminActor })).toEqual([]);
  });

  it("no incluye las de quien perdió la vigencia", async () => {
    const doctor = scenario.addDoctor();
    await scenario.createInvitation({ actor: doctor.actor, email: "a@example.com", ...PATIENT });
    const membership = scenario.repo.staff.find((member) => member.membershipId === doctor.membershipId);
    if (membership) {
      membership.status = "DEACTIVATED";
    }

    expect(await list({ actor: scenario.adminActor })).toEqual([]);
  });

  it("nunca devuelve el token, su hash, el documento ni la matrícula", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN-SECRETA" });
    const token = scenario.lastToken();

    const text = JSON.stringify(await list({ actor: scenario.adminActor }));

    expect(text).not.toContain(token);
    expect(text).not.toContain("MN-SECRETA");
    expect(text).not.toContain(scenario.repo.invitations[0]?.tokenHash ?? "no");
    expect(Object.keys((await list({ actor: scenario.adminActor }))[0] ?? {}).sort()).toEqual(
      ["createdAt", "createdByName", "email", "expiresAt", "id", "kind", "sentAt"],
    );
  });

  it("rechaza a quien no puede invitar", async () => {
    await expect(
      list({ actor: { ...scenario.adminActor, isClinicAdmin: false, isDoctor: false } }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
  });
});
