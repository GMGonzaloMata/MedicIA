import { beforeEach, describe, expect, it } from "vitest";

import {
  createDoctorMembership,
  createLinkedPatient,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

// En una clínica una persona es personal o paciente, nunca las dos cosas. Como hay un solo link pendiente por correo y
// clínica, dos links de distinto tipo para la misma persona no pueden convivir: el segundo reemplaza al primero. La regla
// protege entonces el caso en que el otro vínculo aparece mientras el link está pendiente (por ejemplo, otra vía de alta).

async function setup() {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const user = await createUser({ email: "persona@example.com", fullName: "Persona Doble" });

  return {
    world,
    useCases,
    user,
    account: { id: user.id, email: user.email, fullName: user.fullName },
    actor: adminActorOf(world),
  };
}

describe("un solo tipo de vínculo por clínica", () => {
  it("el segundo link para el mismo correo reemplaza al primero: no quedan dos pendientes", async () => {
    const { useCases, user, actor } = await setup();

    await useCases.createInvitation({ actor, kind: "DOCTOR", email: user.email, licenseNumber: "MN1" });
    const doctorToken = useCases.lastToken();
    await useCases.createInvitation({
      actor,
      kind: "PATIENT",
      email: user.email,
      documentType: "DNI",
      documentNumber: "30111222",
    });

    expect(await prismaClient.invitation.count({ where: { status: "PENDING" } })).toBe(1);
    expect(
      await useCases.previewInvitation({ token: doctorToken, account: { id: user.id, email: user.email } }),
    ).toEqual({ status: "INVALID" });
  });

  it("con un link de médico pendiente, quien pasó a ser paciente de la clínica no se vuelve médico", async () => {
    const { world, useCases, user, account, actor } = await setup();
    await useCases.createInvitation({ actor, kind: "DOCTOR", email: user.email, licenseNumber: "MN1" });
    const token = useCases.lastToken();
    await createLinkedPatient({ tenantId: world.tenantA.id, userId: user.id });

    const result = await useCases.acceptInvitation({
      token,
      account,
      proof: { licenseNumber: "MN1", specialty: "Cardiología" },
    });

    expect(result).toEqual({ status: "CONFLICT", reason: "OTHER_RELATIONSHIP" });
    expect(await prismaClient.staffMembership.count({ where: { userId: user.id } })).toBe(0);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
  });

  it("con un link de paciente pendiente, quien pasó a ser médico de la clínica no se vuelve paciente", async () => {
    const { world, useCases, user, account, actor } = await setup();
    await useCases.createInvitation({
      actor,
      kind: "PATIENT",
      email: user.email,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    const token = useCases.lastToken();
    await createDoctorMembership({ tenantId: world.tenantA.id, userId: user.id });

    const result = await useCases.acceptInvitation({
      token,
      account,
      proof: { documentType: "DNI", documentNumber: "30111222" },
    });

    expect(result).toEqual({ status: "CONFLICT", reason: "OTHER_RELATIONSHIP" });
    expect(await prismaClient.patient.count({ where: { userId: user.id } })).toBe(0);
    expect(await prismaClient.invitation.findFirstOrThrow()).toMatchObject({ status: "PENDING" });
  });

  it("quien ya es personal o paciente de la clínica no recibe una invitación del otro tipo", async () => {
    const { world, useCases, user, actor } = await setup();
    await createDoctorMembership({ tenantId: world.tenantA.id, userId: user.id });

    expect(
      await useCases.createInvitation({
        actor,
        kind: "PATIENT",
        email: user.email,
        documentType: "DNI",
        documentNumber: "30111222",
      }),
    ).toEqual({ status: "CONFLICT", reason: "ALREADY_STAFF" });

    const patientUser = await createUser({ email: "paciente@example.com" });
    await createLinkedPatient({ tenantId: world.tenantA.id, userId: patientUser.id });

    expect(
      await useCases.createInvitation({ actor, kind: "DOCTOR", email: patientUser.email, licenseNumber: "MN2" }),
    ).toEqual({ status: "CONFLICT", reason: "ALREADY_PATIENT" });
  });

  it("ser paciente en una clínica no impide ser médico en otra", async () => {
    const { world, useCases, user, account } = await setup();
    await createLinkedPatient({ tenantId: world.tenantB.id, userId: user.id });
    await useCases.createInvitation({
      actor: adminActorOf(world),
      kind: "DOCTOR",
      email: user.email,
      licenseNumber: "MN1",
    });

    const result = await useCases.acceptInvitation({
      token: useCases.lastToken(),
      account,
      proof: { licenseNumber: "MN1", specialty: "Cardiología" },
    });

    expect(result.status).toBe("ACCEPTED");
    expect(await prismaClient.patient.count({ where: { userId: user.id, tenantId: world.tenantB.id } })).toBe(1);
  });
});
