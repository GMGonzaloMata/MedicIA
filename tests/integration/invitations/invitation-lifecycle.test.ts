import { beforeEach, describe, expect, it } from "vitest";

import { createListInvitations } from "@/modules/users/application/use-cases/list-invitations";
import { createRevokeInvitation } from "@/modules/users/application/use-cases/revoke-invitation";
import { INVITATION_MAX_FAILED_ATTEMPTS } from "@/modules/users/domain/invitation";
import { prismaInvitationRepository } from "@/modules/users/infrastructure/repositories/prisma-invitation-repository";

import { createUser, prismaClient, resetDatabase } from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

const now = () => new Date();
const listInvitations = createListInvitations({ invitations: prismaInvitationRepository, now });
const revokeInvitation = createRevokeInvitation({ invitations: prismaInvitationRepository, now });
const PROOF = { licenseNumber: "MN-1", specialty: "Cardiología" };

async function setup() {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const invitee = await createUser({ email: "dra@example.com", fullName: "Dra. Invitada" });
  const actor = adminActorOf(world);

  async function invite() {
    const created = await useCases.createInvitation({ actor, kind: "DOCTOR", email: invitee.email, licenseNumber: "MN-1" });
    expect(created.status).toBe("SENT");

    return useCases.lastToken();
  }

  return {
    world,
    useCases,
    actor,
    invite,
    account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
  };
}

describe("ciclo de vida de una invitación", () => {
  it("un link vencido no se acepta, no se lista y la lectura lo marca como vencido", async () => {
    const { useCases, invite, account, actor } = await setup();
    const token = await invite();
    await prismaClient.invitation.updateMany({
      data: { createdAt: new Date(Date.now() - 60_000), sentAt: null, expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await useCases.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await listInvitations({ actor })).toEqual([]);

    // Generar de nuevo para ese correo marca el vencido como vencido, no como reemplazado.
    await invite();
    const stored = await prismaClient.invitation.findMany({ orderBy: { createdAt: "asc" } });
    expect(stored.map((invitation) => invitation.status)).toEqual(["EXPIRED", "PENDING"]);
  });

  it("un link revocado no se acepta", async () => {
    const { useCases, invite, account, actor } = await setup();
    const token = await invite();
    const [pending] = await listInvitations({ actor });

    await revokeInvitation({ actor, invitationId: pending?.id ?? "" });

    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "REVOKED", endReason: "BY_SENDER" });
  });

  it("un link ya aceptado no se acepta de nuevo", async () => {
    const { useCases, invite, account } = await setup();
    const token = await invite();

    await useCases.acceptInvitation({ token, account, proof: PROOF });

    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "ACCEPTED" });
  });

  it("generar de nuevo para el mismo correo revoca el anterior, que deja de servir", async () => {
    const { useCases, invite, account, actor } = await setup();
    const first = await invite();
    const second = await invite();

    expect(await useCases.acceptInvitation({ token: first, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await prismaClient.invitation.findMany({ orderBy: { createdAt: "asc" } })).toMatchObject([
      { status: "REVOKED", endReason: "REPLACED" },
      { status: "PENDING" },
    ]);
    expect(await listInvitations({ actor })).toHaveLength(1);
    expect((await useCases.acceptInvitation({ token: second, account, proof: PROOF })).status).toBe("ACCEPTED");
  });

  it("cinco datos incorrectos lo invalidan y quien invitó puede generar uno nuevo", async () => {
    const { useCases, invite, account, actor } = await setup();
    const token = await invite();

    for (let attempt = 0; attempt < INVITATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
      await useCases.acceptInvitation({ token, account, proof: { ...PROOF, licenseNumber: "NO" } });
    }

    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({
      status: "REVOKED",
      endReason: "ATTEMPTS_EXCEEDED",
    });
    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await listInvitations({ actor })).toEqual([]);

    const fresh = await invite();
    expect((await useCases.acceptInvitation({ token: fresh, account, proof: PROOF })).status).toBe("ACCEPTED");
  });

  it("un link de una clínica suspendida deja de servir y de listarse", async () => {
    const { world, useCases, invite, account, actor } = await setup();
    const token = await invite();
    await prismaClient.tenant.update({ where: { id: world.tenantA.id }, data: { status: "SUSPENDED" } });

    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(await listInvitations({ actor })).toEqual([]);
  });
});

describe("listar y revocar", () => {
  it("el administrador ve las de su clínica con quién las generó y el médico solo las suyas", async () => {
    const { world, useCases, actor } = await setup();
    const doctorActor = {
      tenantId: world.tenantA.id,
      userId: world.doctorUser.id,
      membershipId: world.doctor.id,
      isClinicAdmin: false,
      isDoctor: true,
    };
    await useCases.createInvitation({ actor, kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN-9" });
    await useCases.createInvitation({
      actor: doctorActor,
      kind: "PATIENT",
      email: "b@example.com",
      documentType: "DNI",
      documentNumber: "30111222",
    });

    const asAdmin = await listInvitations({ actor });
    const asDoctor = await listInvitations({ actor: doctorActor });

    expect(asAdmin.map((invitation) => invitation.email).sort()).toEqual(["a@example.com", "b@example.com"]);
    expect(asAdmin.find((invitation) => invitation.email === "b@example.com")?.createdByName).toBe("Doctora de A");
    expect(asDoctor.map((invitation) => invitation.email)).toEqual(["b@example.com"]);
  });
});
