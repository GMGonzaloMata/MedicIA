import { beforeEach, describe, expect, it } from "vitest";

import { INVITATION_LIST_LIMIT } from "@/modules/users/domain/invitation";
import { prismaInvitationRepository } from "@/modules/users/infrastructure/repositories/prisma-invitation-repository";

import { createListInvitations } from "@/modules/users/application/use-cases/list-invitations";
import { createRevokeInvitation } from "@/modules/users/application/use-cases/revoke-invitation";

import {
  createDoctorMembership,
  createStaffMembership,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

async function invitedDoctor() {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const invitee = await createUser({ email: "dra@example.com", fullName: "Dra. Invitada" });
  const created = await useCases.createInvitation({
    actor: adminActorOf(world),
    kind: "DOCTOR",
    email: invitee.email,
    licenseNumber: "MN-1",
  });

  expect(created.status).toBe("SENT");

  return {
    world,
    useCases,
    token: useCases.lastToken(),
    account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
    proof: { licenseNumber: "MN-1", specialty: "Cardiología" },
  };
}

describe("aislamiento entre clínicas", () => {
  it("quien administra otra clínica genera la invitación en la suya y nunca en la ajena", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();
    const adminOfB = await createUser({ fullName: "Admin de B" });
    const membershipB = await createStaffMembership({ tenantId: world.tenantB.id, userId: adminOfB.id });

    await useCases.createInvitation({
      actor: {
        tenantId: world.tenantB.id,
        userId: adminOfB.id,
        membershipId: membershipB.id,
        isClinicAdmin: true,
        isDoctor: false,
      },
      kind: "DOCTOR",
      email: "nuevo@example.com",
      licenseNumber: "MN-77",
    });

    const stored = await prismaClient.invitation.findMany();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ tenantId: world.tenantB.id, createdByMembershipId: membershipB.id });
    expect(useCases.mailer.sent[0]?.clinicName).toBe(world.tenantB.name);
  });

  it("el médico de otra clínica no puede invitar médicos", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();

    await expect(
      useCases.createInvitation({
        actor: {
          tenantId: world.tenantB.id,
          userId: world.outsiderUser.id,
          membershipId: world.outsider.id,
          isClinicAdmin: false,
          isDoctor: true,
        },
        kind: "DOCTOR",
        email: "nuevo@example.com",
        licenseNumber: "MN-77",
      }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
    expect(await prismaClient.invitation.count()).toBe(0);
  });

  it("el link de la clínica A vincula solo a la clínica A", async () => {
    const { world, useCases, token, account, proof } = await invitedDoctor();

    const result = await useCases.acceptInvitation({ token, account, proof });

    expect(result).toMatchObject({ status: "ACCEPTED", tenantName: world.tenantA.name });
    expect(await prismaClient.staffMembership.count({ where: { userId: account.id, tenantId: world.tenantA.id } })).toBe(1);
    expect(await prismaClient.staffMembership.count({ where: { userId: account.id, tenantId: world.tenantB.id } })).toBe(0);
  });

  it("consultar, listar y revocar desde otra clínica no ve ni toca la invitación", async () => {
    const { world } = await invitedDoctor();
    const invitation = await prismaClient.invitation.findFirstOrThrow();
    const now = new Date();

    expect(await prismaInvitationRepository.findById({ tenantId: world.tenantB.id, invitationId: invitation.id })).toBeNull();
    expect(
      await prismaInvitationRepository.listPending({ tenantId: world.tenantB.id, now, limit: INVITATION_LIST_LIMIT }),
    ).toEqual([]);
    expect(await prismaInvitationRepository.revoke({ tenantId: world.tenantB.id, invitationId: invitation.id, now })).toBe(false);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
  });

  it("una cuenta con otro correo no puede aceptar ni gastar los intentos de un link ajeno", async () => {
    const { useCases, token, proof } = await invitedDoctor();
    const stranger = await createUser({ email: "otra@example.com" });
    const account = { id: stranger.id, email: stranger.email, fullName: stranger.fullName };

    expect(await useCases.acceptInvitation({ token, account, proof })).toEqual({ status: "INVALID" });
    expect(await useCases.acceptInvitation({ token, account, proof: { ...proof, licenseNumber: "NO" } })).toEqual({
      status: "INVALID",
    });
    expect(await useCases.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ failedAttempts: 0, status: "PENDING" });
    expect(await prismaClient.staffMembership.count({ where: { userId: stranger.id } })).toBe(0);
  });
});

describe("el link deja de servir cuando cambia el contexto", () => {
  it("una clínica suspendida invalida el link", async () => {
    const { world, useCases, token, account, proof } = await invitedDoctor();
    await prismaClient.tenant.update({ where: { id: world.tenantA.id }, data: { status: "SUSPENDED" } });

    expect(await useCases.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(await useCases.acceptInvitation({ token, account, proof })).toEqual({ status: "INVALID" });
    expect(await prismaClient.staffMembership.count({ where: { userId: account.id } })).toBe(0);
  });

  it("un emisor desactivado invalida el link", async () => {
    const { world, useCases, token, account, proof } = await invitedDoctor();
    await prismaClient.staffMembership.update({ where: { id: world.admin.id }, data: { status: "DEACTIVATED" } });

    expect(await useCases.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(await useCases.acceptInvitation({ token, account, proof })).toEqual({ status: "INVALID" });
  });

  it("un link vencido no sirve", async () => {
    const { useCases, token, account, proof } = await invitedDoctor();
    // Vencida hace un segundo, pero creada antes: respeta la regla de que no vence antes de crearse.
    await prismaClient.invitation.updateMany({
      data: { createdAt: new Date(Date.now() - 60_000), sentAt: null, expiresAt: new Date(Date.now() - 1000) },
    });

    expect(await useCases.previewInvitation({ token, account })).toEqual({ status: "INVALID" });
    expect(await useCases.acceptInvitation({ token, account, proof })).toEqual({ status: "INVALID" });
  });
});

describe("listar y revocar desde otra clínica o sin permiso", () => {
  it("quien administra otra clínica no ve ni revoca las invitaciones ajenas", async () => {
    const { world } = await invitedDoctor();
    const adminOfB = await createUser({ fullName: "Admin de B" });
    const membershipB = await createStaffMembership({ tenantId: world.tenantB.id, userId: adminOfB.id });
    const actorB = {
      tenantId: world.tenantB.id,
      userId: adminOfB.id,
      membershipId: membershipB.id,
      isClinicAdmin: true,
      isDoctor: false,
    };
    const now = () => new Date();
    const invitationId = (await prismaClient.invitation.findFirstOrThrow()).id;

    expect(await createListInvitations({ invitations: prismaInvitationRepository, now })({ actor: actorB })).toEqual([]);
    await expect(
      createRevokeInvitation({ invitations: prismaInvitationRepository, now })({ actor: actorB, invitationId }),
    ).rejects.toMatchObject({ name: "InvitationNotFoundError" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
  });

  it("un médico no revoca las de otro médico, pero el administrador sí", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();
    const otherDoctorUser = await createUser();
    const otherDoctor = await createDoctorMembership({ tenantId: world.tenantA.id, userId: otherDoctorUser.id });
    const actorOf = (membership: { id: string }, user: { id: string }) => ({
      tenantId: world.tenantA.id,
      userId: user.id,
      membershipId: membership.id,
      isClinicAdmin: false,
      isDoctor: true,
    });
    await useCases.createInvitation({
      actor: actorOf(world.doctor, world.doctorUser),
      kind: "PATIENT",
      email: "p@example.com",
      documentType: "DNI",
      documentNumber: "30111222",
    });
    const invitationId = (await prismaClient.invitation.findFirstOrThrow()).id;
    const now = () => new Date();
    const revoke = createRevokeInvitation({ invitations: prismaInvitationRepository, now });

    await expect(
      revoke({ actor: actorOf(otherDoctor, otherDoctorUser), invitationId }),
    ).rejects.toMatchObject({ name: "InvitationNotFoundError" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });

    await revoke({ actor: adminActorOf(world), invitationId });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "REVOKED", endReason: "BY_SENDER" });
  });
});
