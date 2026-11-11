import { beforeEach, describe, expect, it } from "vitest";

import { createDoctorMembership, createLinkedPatient, createUser, prismaClient, resetDatabase } from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

async function invite(email: string, licenseNumber = "MN 9.8-7") {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const result = await useCases.createInvitation({
    actor: adminActorOf(world),
    kind: "DOCTOR",
    email,
    licenseNumber,
  });

  expect(result.status).toBe("SENT");

  return { world, useCases, token: useCases.lastToken() };
}

describe("aceptar la invitación de un médico contra la base", () => {
  it("crea una membresía solo de médico, activa, con la matrícula normalizada y la especialidad", async () => {
    const invitee = await createUser({ email: "dra@example.com", fullName: "Dra. Real" });
    const { world, useCases, token } = await invite("dra@example.com");

    const result = await useCases.acceptInvitation({
      token,
      account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
      proof: { licenseNumber: "mn987", specialty: "Neurología" },
    });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipKind: "STAFF", assignedToDoctor: false });
    const membership = await prismaClient.staffMembership.findFirstOrThrow({
      where: { tenantId: world.tenantA.id, userId: invitee.id },
    });
    expect(membership).toMatchObject({
      status: "ACTIVE",
      isDoctor: true,
      isClinicAdmin: false,
      licenseNumber: "MN987",
      specialty: "Neurología",
    });
    expect(result.status === "ACCEPTED" && result.relationshipId).toBe(membership.id);
  });

  it("no modifica la cuenta ni crea otra", async () => {
    const invitee = await createUser({ email: "dra@example.com", fullName: "Dra. Real" });
    const { useCases, token } = await invite("dra@example.com");
    const before = await prismaClient.user.findUniqueOrThrow({ where: { id: invitee.id } });

    await useCases.acceptInvitation({
      token,
      account: { id: invitee.id, email: invitee.email, fullName: "Otro nombre" },
      proof: { licenseNumber: "MN987", specialty: "Neurología" },
    });

    expect(await prismaClient.user.findUniqueOrThrow({ where: { id: invitee.id } })).toEqual(before);
    expect(await prismaClient.user.count({ where: { email: "dra@example.com" } })).toBe(1);
  });

  it("deja el link consumido: el mismo no vincula una segunda vez", async () => {
    const invitee = await createUser({ email: "dra@example.com" });
    const { useCases, token } = await invite("dra@example.com");
    const account = { id: invitee.id, email: invitee.email, fullName: invitee.fullName };
    const proof = { licenseNumber: "MN987", specialty: "Neurología" };

    await useCases.acceptInvitation({ token, account, proof });

    expect(await useCases.acceptInvitation({ token, account, proof })).toEqual({ status: "INVALID" });
  });

  it("una matrícula ya usada por otro integrante revierte todo y deja el link sin consumir", async () => {
    const invitee = await createUser({ email: "dra@example.com" });
    const { world, useCases, token } = await invite("dra@example.com");
    const other = await createUser();
    await createDoctorMembership({ tenantId: world.tenantA.id, userId: other.id, licenseNumber: "MN987" });

    const result = await useCases.acceptInvitation({
      token,
      account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
      proof: { licenseNumber: "MN987", specialty: "Neurología" },
    });

    expect(result).toEqual({ status: "CONFLICT", reason: "LICENSE_IN_USE" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING", acceptedAt: null });
    expect(await prismaClient.staffMembership.count({ where: { userId: invitee.id } })).toBe(0);
  });

  it("quien ya es paciente de la clínica no puede ser médico: sin cambios y el link sigue sirviendo", async () => {
    const invitee = await createUser({ email: "dra@example.com" });
    const { world, useCases, token } = await invite("dra@example.com");
    await createLinkedPatient({ tenantId: world.tenantA.id, userId: invitee.id });

    const result = await useCases.acceptInvitation({
      token,
      account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
      proof: { licenseNumber: "MN987", specialty: "Neurología" },
    });

    expect(result).toEqual({ status: "CONFLICT", reason: "OTHER_RELATIONSHIP" });
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
    expect(await prismaClient.staffMembership.count({ where: { userId: invitee.id } })).toBe(0);
  });

  it("quien ya es médico activo de la clínica no se duplica y el link se consume", async () => {
    const invitee = await createUser({ email: "dra@example.com" });
    const { world, useCases, token } = await invite("dra@example.com");
    await createDoctorMembership({ tenantId: world.tenantA.id, userId: invitee.id, licenseNumber: "MN987" });

    const result = await useCases.acceptInvitation({
      token,
      account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
      proof: { licenseNumber: "MN987", specialty: "Neurología" },
    });

    expect(result).toMatchObject({ status: "ALREADY_MEMBER" });
    expect(await prismaClient.staffMembership.count({ where: { userId: invitee.id } })).toBe(1);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "ACCEPTED" });
  });

  it("el administrador sin rol de médico no cambia su membresía", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();
    const created = await useCases.createInvitation({
      actor: adminActorOf(world),
      kind: "DOCTOR",
      email: world.adminUser.email,
      licenseNumber: "MN987",
    });
    expect(created.status).toBe("SENT");

    const result = await useCases.acceptInvitation({
      token: useCases.lastToken(),
      account: { id: world.adminUser.id, email: world.adminUser.email, fullName: world.adminUser.fullName },
      proof: { licenseNumber: "MN987", specialty: "Cardiología" },
    });

    expect(result).toEqual({ status: "CONFLICT", reason: "ROLE_CHANGE_NOT_SUPPORTED" });
    expect(await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: world.admin.id } })).toMatchObject({
      isClinicAdmin: true,
      isDoctor: false,
    });
  });
});
