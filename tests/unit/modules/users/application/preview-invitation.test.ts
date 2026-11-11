import { beforeEach, describe, expect, it } from "vitest";

import { INVITATION_MAX_FAILED_ATTEMPTS, INVITATION_TTL_MS } from "@/modules/users/domain/invitation";
import { generateInvitationToken } from "@/modules/users/domain/invitation-token";

import { TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

const INVITED_EMAIL = "dra.perez@example.com";

let scenario: ReturnType<typeof createInvitationScenario>;
let token: string;
let account: { id: string; email: string };

beforeEach(async () => {
  scenario = createInvitationScenario();
  account = scenario.addAccount("doctor-1", INVITED_EMAIL);
  await scenario.createInvitation({
    actor: scenario.adminActor,
    kind: "DOCTOR",
    email: INVITED_EMAIL,
    licenseNumber: "MN123",
  });
  token = scenario.lastToken();
});

const INVALID = { status: "INVALID" };

describe("vista previa de una invitación", () => {
  it("es válida para la cuenta con el correo de la invitación y muestra la clínica y el tipo", async () => {
    expect(await scenario.previewInvitation({ token, account })).toEqual({
      status: "VALID",
      kind: "DOCTOR",
      tenantName: "Clínica del Sol",
    });
  });

  it("no distingue mayúsculas en el correo de la cuenta", async () => {
    const result = await scenario.previewInvitation({ token, account: { ...account, email: "Dra.Perez@Example.com" } });

    expect(result.status).toBe("VALID");
  });

  it("no modifica nada", async () => {
    const before = structuredClone(scenario.repo.invitations);

    await scenario.previewInvitation({ token, account });

    expect(scenario.repo.invitations).toEqual(before);
  });

  it.each([
    ["un token mal formado", () => "abc"],
    ["un token que no existe", () => generateInvitationToken()],
  ])("es inválida con %s", async (description, makeToken) => {
    expect(await scenario.previewInvitation({ token: makeToken(), account })).toEqual(INVALID);
  });

  it("es inválida para una cuenta con otro correo, sin dar la causa", async () => {
    const other = scenario.addAccount("someone-else", "otra@example.com");

    expect(await scenario.previewInvitation({ token, account: other })).toEqual(INVALID);
  });

  it("es inválida cuando venció", async () => {
    scenario.advance(INVITATION_TTL_MS);

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });

  it("es inválida cuando se revocó", async () => {
    const [invitation] = scenario.repo.invitations;
    await scenario.repo.revoke({ tenantId: TENANT_ID, invitationId: invitation?.id ?? "", now: scenario.now() });

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });

  it("es inválida cuando ya se usó", async () => {
    await scenario.acceptInvitation({
      token,
      account: { ...account, fullName: "Dra. Pérez" },
      proof: { licenseNumber: "MN123", specialty: "Cardiología" },
    });

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });

  it("es inválida cuando agotó los intentos", async () => {
    const [invitation] = scenario.repo.invitations;
    if (invitation) {
      invitation.failedAttempts = INVITATION_MAX_FAILED_ATTEMPTS;
    }

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });

  it("es inválida con la clínica suspendida", async () => {
    scenario.repo.tenants.set(TENANT_ID, { name: "Clínica del Sol", isActive: false });

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });

  it("es inválida cuando quien invitó perdió la vigencia", async () => {
    const creator = scenario.repo.staff.find((member) => member.membershipId === scenario.adminMembershipId);
    if (creator) {
      creator.status = "DEACTIVATED";
    }

    expect(await scenario.previewInvitation({ token, account })).toEqual(INVALID);
  });
});
