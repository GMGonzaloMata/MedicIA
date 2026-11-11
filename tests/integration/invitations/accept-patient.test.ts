import { beforeEach, describe, expect, it } from "vitest";

import { createLinkedPatient, createUser, prismaClient, resetDatabase } from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

const PROOF = { documentType: "DNI", documentNumber: "30111222" } as const;

async function invitePatient(documentNumber = "30.111.222") {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const user = await createUser({ email: "paciente@example.com", fullName: "Paula Paciente" });
  const created = await useCases.createInvitation({
    actor: adminActorOf(world),
    kind: "PATIENT",
    email: user.email,
    documentType: "DNI",
    documentNumber,
  });

  expect(created.status).toBe("SENT");

  return {
    world,
    useCases,
    user,
    token: useCases.lastToken(),
    account: { id: user.id, email: user.email, fullName: user.fullName },
  };
}

describe("aceptar la invitación de un paciente contra la base", () => {
  it("crea el paciente vinculado con el nombre de la cuenta y el documento normalizado, sin asignaciones", async () => {
    const { world, useCases, token, account } = await invitePatient();

    const result = await useCases.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipKind: "PATIENT", assignedToDoctor: false });
    const patient = await prismaClient.patient.findFirstOrThrow({ where: { tenantId: world.tenantA.id, userId: account.id } });
    expect(patient).toMatchObject({
      status: "LINKED",
      fullName: "Paula Paciente",
      documentType: "DNI",
      documentNumber: "30111222",
      revokedAt: null,
    });
    expect(patient.linkedAt).not.toBeNull();
    expect(result.status === "ACCEPTED" && result.relationshipId).toBe(patient.id);
    expect(await prismaClient.doctorPatientAssignment.count()).toBe(0);
    expect(await prismaClient.patient.count({ where: { status: "PENDING" } })).toBe(0);
  });

  it("reutiliza el registro revocado de la persona, con su identidad y su historia intactas", async () => {
    const { world, useCases, user, token, account } = await invitePatient();
    const revoked = await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: user.id,
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Nombre anterior",
    });
    await prismaClient.patient.update({ where: { id: revoked.id }, data: { status: "REVOKED", revokedAt: new Date() } });
    const before = await prismaClient.patient.findUniqueOrThrow({ where: { id: revoked.id } });

    const result = await useCases.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipId: revoked.id });
    expect(await prismaClient.patient.count({ where: { tenantId: world.tenantA.id } })).toBe(1);
    const after = await prismaClient.patient.findUniqueOrThrow({ where: { id: revoked.id } });
    expect(after).toMatchObject({ status: "LINKED", revokedAt: null, fullName: "Paula Paciente" });
    expect(after.createdAt).toEqual(before.createdAt);
    expect(after.linkedAt?.getTime()).toBeGreaterThanOrEqual(before.linkedAt?.getTime() ?? 0);
  });

  it("vincula el registro pendiente, sin cuenta, que ya tenía ese documento", async () => {
    const { world, useCases, token, account } = await invitePatient();
    const pending = await prismaClient.patient.create({
      data: { tenantId: world.tenantA.id, documentType: "DNI", documentNumber: "30111222" },
    });

    const result = await useCases.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipId: pending.id });
    expect(await prismaClient.patient.findUniqueOrThrow({ where: { id: pending.id } })).toMatchObject({
      status: "LINKED",
      userId: account.id,
    });
  });

  it("un documento ya vinculado a otra cuenta se rechaza sin cambios y el link sigue sirviendo", async () => {
    const { world, useCases, token, account } = await invitePatient();
    const other = await createUser();
    await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: other.id,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    const before = await prismaClient.patient.findMany({ orderBy: { id: "asc" } });

    const result = await useCases.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toEqual({ status: "CONFLICT", reason: "DOCUMENT_IN_USE" });
    expect(await prismaClient.patient.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING", acceptedAt: null });
  });

  it("una cuenta que ya es paciente con otro documento no puede vincular este", async () => {
    const { world, useCases, user, token, account } = await invitePatient();
    await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: user.id,
      documentType: "DNI",
      documentNumber: "55555555",
    });

    expect(await useCases.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "CONFLICT",
      reason: "DOCUMENT_IN_USE",
    });
    expect(await prismaClient.patient.count({ where: { userId: user.id } })).toBe(1);
  });

  it("un documento incorrecto no vincula y gasta un intento", async () => {
    const { world, useCases, token, account } = await invitePatient();

    const result = await useCases.acceptInvitation({
      token,
      account,
      proof: { documentType: "DNI", documentNumber: "99999999" },
    });

    expect(result).toEqual({ status: "PROOF_MISMATCH", attemptsLeft: 4 });
    expect(await prismaClient.patient.count({ where: { tenantId: world.tenantA.id } })).toBe(0);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ failedAttempts: 1 });
  });
});
