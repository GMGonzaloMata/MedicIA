import { beforeEach, describe, expect, it } from "vitest";

import { createStaffMembership, createSession, createUser, prismaClient, resetDatabase } from "../../support/database";
import { prismaClinicAccessRepository } from "@/modules/users/infrastructure/repositories/prisma-clinic-access-repository";
import { prismaSessionRepository } from "@/modules/users/infrastructure/repositories/prisma-session-repository";

import { createInvitationUseCases } from "../../support/invitation-integration";
import { createInvitationWorld } from "../../support/invitation-world";

beforeEach(resetDatabase);

describe("pertenecer a más de una clínica", () => {
  it("un médico de la clínica A que acepta un link de paciente de la B ve las dos y solo es paciente en la B", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();
    // La persona ya es médico de la A (con la sesión activa ahí).
    const person = await createUser({ email: "persona@example.com", fullName: "Persona Doble" });
    const staffInA = await createStaffMembership({
      tenantId: world.tenantA.id,
      userId: person.id,
      isClinicAdmin: false,
      isDoctor: true,
      specialty: "Cardiología",
      licenseNumber: "MN-A",
    });
    const session = await createSession({ userId: person.id, activeStaffMembershipId: staffInA.id });
    // Una administradora de la B invita a la persona como paciente.
    const adminOfB = await createUser({ fullName: "Admin de B" });
    const membershipB = await createStaffMembership({ tenantId: world.tenantB.id, userId: adminOfB.id });
    const created = await useCases.createInvitation({
      actor: {
        tenantId: world.tenantB.id,
        userId: adminOfB.id,
        membershipId: membershipB.id,
        isClinicAdmin: true,
        isDoctor: false,
      },
      kind: "PATIENT",
      email: person.email,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    expect(created.status).toBe("SENT");

    const result = await useCases.acceptInvitation({
      token: useCases.lastToken(),
      account: { id: person.id, email: person.email, fullName: person.fullName },
      proof: { documentType: "DNI", documentNumber: "30111222" },
    });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipKind: "PATIENT", tenantName: world.tenantB.name });

    // El vínculo con la clínica A queda intacto.
    expect(await prismaClient.staffMembership.findUniqueOrThrow({ where: { id: staffInA.id } })).toMatchObject({
      status: "ACTIVE",
      isDoctor: true,
      licenseNumber: "MN-A",
    });

    // La selección de clínica de la 002 ofrece las dos, con su tipo de vínculo.
    const available = await prismaClinicAccessRepository.listAvailableClinics(person.id);
    expect(available.map((clinic) => [clinic.tenantName, clinic.kind]).sort()).toEqual(
      [
        [world.tenantA.name, "STAFF"],
        [world.tenantB.name, "PATIENT"],
      ].sort(),
    );

    // Sus permisos en la B son solo los de paciente: no tiene ninguna membresía de personal allí.
    expect(await prismaClient.staffMembership.count({ where: { userId: person.id, tenantId: world.tenantB.id } })).toBe(0);
    expect(await prismaClient.patient.count({ where: { userId: person.id, tenantId: world.tenantA.id } })).toBe(0);

    // Activar el vínculo nuevo con una sesión que ya tiene la clínica A activa funciona y reemplaza a la anterior.
    const patientInB = await prismaClient.patient.findFirstOrThrow({
      where: { userId: person.id, tenantId: world.tenantB.id },
    });
    expect(
      await prismaClinicAccessRepository.findAvailableClinic({
        userId: person.id,
        kind: "PATIENT",
        relationshipId: patientInB.id,
      }),
    ).not.toBeNull();
    await prismaSessionRepository.setActiveRelationship({
      sessionId: session.id,
      userId: person.id,
      kind: "PATIENT",
      relationshipId: patientInB.id,
    });
    expect(await prismaClient.session.findUniqueOrThrow({ where: { id: session.id } })).toMatchObject({
      activePatientId: patientInB.id,
      activeStaffMembershipId: null,
    });
  });

  it("los datos de una clínica no aparecen en la otra", async () => {
    const world = await createInvitationWorld();
    const useCases = createInvitationUseCases();
    const person = await createUser({ email: "persona@example.com" });
    await useCases.createInvitation({
      actor: {
        tenantId: world.tenantA.id,
        userId: world.adminUser.id,
        membershipId: world.admin.id,
        isClinicAdmin: true,
        isDoctor: false,
      },
      kind: "PATIENT",
      email: person.email,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    await useCases.acceptInvitation({
      token: useCases.lastToken(),
      account: { id: person.id, email: person.email, fullName: person.fullName },
      proof: { documentType: "DNI", documentNumber: "30111222" },
    });

    const available = await prismaClinicAccessRepository.listAvailableClinics(person.id);

    expect(available).toHaveLength(1);
    expect(available[0]).toMatchObject({ tenantName: world.tenantA.name, kind: "PATIENT" });
    expect(await prismaClient.patient.count({ where: { tenantId: world.tenantB.id } })).toBe(0);
  });
});
