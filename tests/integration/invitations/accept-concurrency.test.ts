import { beforeEach, describe, expect, it } from "vitest";

import { INVITATION_MAX_FAILED_ATTEMPTS } from "@/modules/users/domain/invitation";

import { createUser, prismaClient, resetDatabase } from "../../support/database";
import { adminActorOf, createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

async function invitedDoctor() {
  const world = await createInvitationWorld();
  const useCases = createInvitationUseCases();
  const invitee = await createUser({ email: "invitada@example.com", fullName: "Dra. Invitada" });
  const created = await useCases.createInvitation({
    actor: adminActorOf(world),
    kind: "DOCTOR",
    email: invitee.email,
    licenseNumber: "MN-4455",
  });

  expect(created.status).toBe("SENT");

  return {
    world,
    useCases,
    invitee,
    token: useCases.lastToken(),
    account: { id: invitee.id, email: invitee.email, fullName: invitee.fullName },
  };
}

describe("aceptar una invitación a la vez", () => {
  it("dos aceptaciones simultáneas del mismo link terminan con un solo éxito y un solo vínculo", async () => {
    const { world, useCases, invitee, token, account } = await invitedDoctor();
    const proof = { licenseNumber: "mn 4455", specialty: "Cardiología" };

    const results = await Promise.all([
      useCases.acceptInvitation({ token, account, proof }),
      useCases.acceptInvitation({ token, account, proof }),
    ]);

    expect(results.map((result) => result.status).sort()).toEqual(["ACCEPTED", "INVALID"]);
    const memberships = await prismaClient.staffMembership.findMany({
      where: { tenantId: world.tenantA.id, userId: invitee.id },
    });
    expect(memberships).toHaveLength(1);
    expect(await prismaClient.invitation.count({ where: { status: "ACCEPTED" } })).toBe(1);
  });

  it("muchas aceptaciones simultáneas no duplican ninguna fila", async () => {
    const { world, useCases, invitee, token, account } = await invitedDoctor();
    const proof = { licenseNumber: "MN-4455", specialty: "Cardiología" };

    const results = await Promise.all(
      Array.from({ length: 6 }, () => useCases.acceptInvitation({ token, account, proof })),
    );

    expect(results.filter((result) => result.status === "ACCEPTED")).toHaveLength(1);
    expect(await prismaClient.staffMembership.count({ where: { tenantId: world.tenantA.id, userId: invitee.id } })).toBe(1);
  });

  it("los intentos incorrectos simultáneos no pasan del máximo y dejan el link invalidado", async () => {
    const { useCases, token, account } = await invitedDoctor();
    const wrong = { licenseNumber: "INCORRECTA", specialty: "Cardiología" };

    const results = await Promise.all(
      Array.from({ length: INVITATION_MAX_FAILED_ATTEMPTS + 3 }, () =>
        useCases.acceptInvitation({ token, account, proof: wrong }),
      ),
    );

    const stored = await prismaClient.invitation.findFirstOrThrow();
    expect(stored).toMatchObject({
      failedAttempts: INVITATION_MAX_FAILED_ATTEMPTS,
      status: "REVOKED",
      endReason: "ATTEMPTS_EXCEEDED",
    });
    // Los intentos que llegaron cuando todavía quedaban muestran cuántos faltaban; ninguno recibe un número negativo.
    for (const result of results) {
      if (result.status === "PROOF_MISMATCH") {
        expect(result.attemptsLeft).toBeGreaterThanOrEqual(0);
      }
    }
    expect(results.filter((result) => result.status === "PROOF_MISMATCH" && result.attemptsLeft === 0).length).toBeGreaterThanOrEqual(1);
  });

  it("la matrícula correcta después de agotar los intentos ya no vincula a nadie", async () => {
    const { world, useCases, invitee, token, account } = await invitedDoctor();

    for (let attempt = 0; attempt < INVITATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
      await useCases.acceptInvitation({ token, account, proof: { licenseNumber: "NO", specialty: "Cardiología" } });
    }
    const result = await useCases.acceptInvitation({
      token,
      account,
      proof: { licenseNumber: "MN-4455", specialty: "Cardiología" },
    });

    expect(result).toEqual({ status: "INVALID" });
    expect(await prismaClient.staffMembership.count({ where: { tenantId: world.tenantA.id, userId: invitee.id } })).toBe(0);
  });
});
