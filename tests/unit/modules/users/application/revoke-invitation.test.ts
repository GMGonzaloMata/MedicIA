import { beforeEach, describe, expect, it } from "vitest";

import { createRevokeInvitation } from "@/modules/users/application/use-cases/revoke-invitation";
import { INVITATION_TTL_MS } from "@/modules/users/domain/invitation";

import { TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

let scenario: ReturnType<typeof createInvitationScenario>;
let revoke: ReturnType<typeof createRevokeInvitation>;

const PATIENT = { kind: "PATIENT", documentType: "DNI", documentNumber: "30111222" } as const;

beforeEach(() => {
  scenario = createInvitationScenario();
  revoke = createRevokeInvitation({ invitations: scenario.repo, now: scenario.now });
});

async function invitedByAdmin() {
  await scenario.createInvitation({ actor: scenario.adminActor, kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN1" });

  return { id: scenario.repo.invitations[0]?.id ?? "", token: scenario.lastToken() };
}

describe("revocar una invitación", () => {
  it("el administrador revoca la de su clínica y el link deja de servir de inmediato", async () => {
    const { id, token } = await invitedByAdmin();
    const account = scenario.addAccount("doctor-1", "a@example.com");

    await revoke({ actor: scenario.adminActor, invitationId: id });

    expect(scenario.repo.invitations[0]).toMatchObject({ status: "REVOKED", endReason: "BY_SENDER" });
    expect(await scenario.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(
      await scenario.acceptInvitation({ token, account, proof: { licenseNumber: "MN1", specialty: "Cardiología" } }),
    ).toEqual({ status: "INVALID" });
  });

  it("el médico revoca las que generó, pero no las de otro", async () => {
    const doctor = scenario.addDoctor();
    const other = scenario.addDoctor("doctor-2", "otro@clinica.example");
    await scenario.createInvitation({ actor: doctor.actor, email: "mia@example.com", ...PATIENT });
    await scenario.createInvitation({ actor: other.actor, email: "ajena@example.com", ...PATIENT, documentNumber: "30222333" });
    const [mine, theirs] = scenario.repo.invitations;

    await expect(revoke({ actor: doctor.actor, invitationId: theirs?.id ?? "" })).rejects.toMatchObject({
      name: "InvitationNotFoundError",
    });
    await revoke({ actor: doctor.actor, invitationId: mine?.id ?? "" });

    expect(mine?.status).toBe("REVOKED");
    expect(theirs?.status).toBe("PENDING");
  });

  it("el administrador revoca las de un médico de su clínica", async () => {
    const doctor = scenario.addDoctor();
    await scenario.createInvitation({ actor: doctor.actor, email: "mia@example.com", ...PATIENT });

    await revoke({ actor: scenario.adminActor, invitationId: scenario.repo.invitations[0]?.id ?? "" });

    expect(scenario.repo.invitations[0]?.status).toBe("REVOKED");
  });

  it("responde el mismo error para una inexistente, una de otra clínica y una que ya no está pendiente", async () => {
    const { id } = await invitedByAdmin();
    const errors = [];

    for (const attempt of [
      () => revoke({ actor: scenario.adminActor, invitationId: "inexistente" }),
      () => revoke({ actor: { ...scenario.adminActor, tenantId: "tenant-2" }, invitationId: id }),
      async () => {
        await revoke({ actor: scenario.adminActor, invitationId: id });
        await revoke({ actor: scenario.adminActor, invitationId: id });
      },
    ]) {
      errors.push(await attempt().catch((error: unknown) => error));
    }

    for (const error of errors) {
      expect(error).toMatchObject({ name: "InvitationNotFoundError", message: "No encontramos la invitación." });
    }
  });

  it("una invitación vencida ya no se puede revocar", async () => {
    const { id } = await invitedByAdmin();
    scenario.advance(INVITATION_TTL_MS + 1);

    await expect(revoke({ actor: scenario.adminActor, invitationId: id })).rejects.toMatchObject({
      name: "InvitationNotFoundError",
    });
  });

  it("una invitación ya aceptada no se puede revocar", async () => {
    const { id, token } = await invitedByAdmin();
    const account = scenario.addAccount("doctor-1", "a@example.com");
    await scenario.acceptInvitation({ token, account, proof: { licenseNumber: "MN1", specialty: "Cardiología" } });

    await expect(revoke({ actor: scenario.adminActor, invitationId: id })).rejects.toMatchObject({
      name: "InvitationNotFoundError",
    });
    expect(scenario.repo.invitations[0]?.status).toBe("ACCEPTED");
  });

  it("rechaza a quien no puede invitar", async () => {
    const { id } = await invitedByAdmin();

    await expect(
      revoke({ actor: { ...scenario.adminActor, tenantId: TENANT_ID, isClinicAdmin: false, isDoctor: false }, invitationId: id }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
  });
});
