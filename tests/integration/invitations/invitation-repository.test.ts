import { beforeEach, describe, expect, it } from "vitest";

import {
  INVITATION_LIST_LIMIT,
  INVITATION_MAX_FAILED_ATTEMPTS,
  INVITATION_TTL_MS,
} from "@/modules/users/domain/invitation";
import { InvitationConflictError } from "@/modules/users/domain/invitation-errors";
import { hashInvitationToken } from "@/modules/users/domain/invitation-token";
import { prismaInvitationRepository } from "@/modules/users/infrastructure/repositories/prisma-invitation-repository";

import {
  createLinkedPatient,
  createPatient,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";
import { buildInvitation, buildPatientInvitation, createInvitationWorld } from "../../support/invitation-world";

const repository = prismaInvitationRepository;

beforeEach(resetDatabase);

function minutes(count: number): number {
  return count * 60 * 1000;
}

describe("repositorio de invitaciones: crear y reemplazar", () => {
  it("guarda una invitación pendiente con el hash y sin enviar", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const { input } = buildInvitation(world, {}, now);

    const record = await repository.createReplacing(input, now);

    expect(record).toMatchObject({
      tenantId: world.tenantA.id,
      kind: "DOCTOR",
      status: "PENDING",
      endReason: null,
      failedAttempts: 0,
      sentAt: null,
      tokenHash: input.tokenHash,
      createdAt: now,
    });
    expect(record.expiresAt.getTime() - now.getTime()).toBe(INVITATION_TTL_MS);
  });

  it("reemplaza al pendiente del mismo correo y clínica: el anterior queda revocado y solo uno vigente", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const first = buildInvitation(world, { email: "persona@example.com" }, now);
    const second = buildInvitation(world, { email: "persona@example.com" }, now);

    const firstRecord = await repository.createReplacing(first.input, now);
    const secondRecord = await repository.createReplacing(second.input, now);

    const stored = await prismaClient.invitation.findMany({ orderBy: { createdAt: "asc" } });

    expect(stored).toHaveLength(2);
    expect(stored.find((row) => row.id === firstRecord.id)).toMatchObject({
      status: "REVOKED",
      endReason: "REPLACED",
    });
    expect(stored.find((row) => row.id === secondRecord.id)?.status).toBe("PENDING");
    expect(stored.filter((row) => row.status === "PENDING")).toHaveLength(1);
  });

  it("marca como vencido (y no como reemplazado) al pendiente que ya había vencido", async () => {
    const world = await createInvitationWorld();
    const past = new Date(Date.now() - INVITATION_TTL_MS - minutes(5));
    const expired = buildInvitation(world, { email: "persona@example.com" }, past);
    const now = new Date();

    const expiredRecord = await repository.createReplacing(expired.input, past);
    await repository.createReplacing(buildInvitation(world, { email: "persona@example.com" }, now).input, now);

    expect(await prismaClient.invitation.findUnique({ where: { id: expiredRecord.id } })).toMatchObject({
      status: "EXPIRED",
      endReason: null,
      revokedAt: null,
    });
  });

  it("no mezcla correos ni clínicas: otro correo u otra clínica conservan su pendiente", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const mine = await repository.createReplacing(buildInvitation(world, { email: "uno@example.com" }, now).input, now);
    const otherEmail = await repository.createReplacing(
      buildInvitation(world, { email: "otro@example.com" }, now).input,
      now,
    );
    const otherTenant = await repository.createReplacing(
      buildInvitation(
        world,
        {
          email: "uno@example.com",
          tenantId: world.tenantB.id,
          createdByMembershipId: world.outsider.id,
          createdByUserId: world.outsiderUser.id,
        },
        now,
      ).input,
      now,
    );

    const stored = await prismaClient.invitation.findMany({ where: { id: { in: [mine.id, otherEmail.id, otherTenant.id] } } });

    expect(stored.every((row) => row.status === "PENDING")).toBe(true);
  });

  it("dos invitaciones simultáneas al mismo correo terminan con un solo pendiente", async () => {
    const world = await createInvitationWorld();
    const now = new Date();

    await Promise.all([
      repository.createReplacing(buildInvitation(world, { email: "persona@example.com" }, now).input, now),
      repository.createReplacing(buildInvitation(world, { email: "persona@example.com" }, now).input, now),
    ]);

    const pending = await prismaClient.invitation.count({ where: { email: "persona@example.com", status: "PENDING" } });

    expect(pending).toBe(1);
  });
});

describe("repositorio de invitaciones: reglas de la base", () => {
  async function insertRaw(world: Awaited<ReturnType<typeof createInvitationWorld>>, overrides: object) {
    const now = new Date();
    const { input } = buildInvitation(world, {}, now);

    return prismaClient.invitation.create({ data: { ...input, createdAt: now, ...overrides } });
  }

  it("el correo debe estar en minúsculas", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(insertRaw(world, { email: "Persona@Example.com" }), "invitations_email_lowercase");
  });

  it("un link de médico exige matrícula y no admite documento", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(insertRaw(world, { licenseNumber: null }), "invitations_kind_fields");
    await expectRejectedBy(
      insertRaw(world, { documentType: "DNI", documentNumber: "1" }),
      "invitations_kind_fields",
    );
  });

  it("un link de paciente exige documento y no admite matrícula", async () => {
    const world = await createInvitationWorld();
    const patient = { kind: "PATIENT", documentType: "DNI", documentNumber: "30111222" };

    await expectRejectedBy(insertRaw(world, { ...patient, licenseNumber: "MN-1" }), "invitations_kind_fields");
    await expectRejectedBy(
      insertRaw(world, { kind: "PATIENT", licenseNumber: null, documentType: null, documentNumber: null }),
      "invitations_kind_fields",
    );
  });

  it("solo un link de paciente puede asignar a quien lo generó", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(insertRaw(world, { assignToCreator: true }), "invitations_assign_only_patient");
  });

  it("los campos de aceptación y revocación dependen del estado", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(insertRaw(world, { status: "ACCEPTED" }), "invitations_status_fields");
    await expectRejectedBy(insertRaw(world, { status: "REVOKED" }), "invitations_status_fields");
    await expectRejectedBy(insertRaw(world, { revokedAt: new Date() }), "invitations_status_fields");
  });

  it("los intentos incorrectos van de 0 a 5", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(insertRaw(world, { failedAttempts: 6 }), "invitations_attempts_range");
    await expectRejectedBy(insertRaw(world, { failedAttempts: -1 }), "invitations_attempts_range");
  });

  it("el vencimiento es posterior a la creación y el envío no es anterior", async () => {
    const world = await createInvitationWorld();
    const now = new Date();

    await expectRejectedBy(insertRaw(world, { createdAt: now, expiresAt: now }), "invitations_expiry_after_creation");
    await expectRejectedBy(
      insertRaw(world, { createdAt: now, sentAt: new Date(now.getTime() - 1000) }),
      "invitations_sent_after_creation",
    );
  });

  it("no admite dos pendientes del mismo correo en la misma clínica", async () => {
    const world = await createInvitationWorld();

    await insertRaw(world, { email: "persona@example.com" });
    await expectRejectedBy(insertRaw(world, { email: "persona@example.com" }), "Unique constraint failed");
  });

  it("el hash del token es único", async () => {
    const world = await createInvitationWorld();
    const first = await insertRaw(world, {});

    await expectRejectedBy(insertRaw(world, { tokenHash: first.tokenHash }), "Unique constraint failed");
  });

  it("la membresía de quien invita debe ser de la misma clínica", async () => {
    const world = await createInvitationWorld();

    await expectRejectedBy(
      insertRaw(world, { createdByMembershipId: world.outsider.id }),
      "invitations_tenant_id_created_by_membership_id_fkey",
    );
  });
});

describe("repositorio de invitaciones: consultas", () => {
  it("busca por el hash y devuelve la clínica y el estado de quien invitó", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const { input, token } = buildInvitation(world, {}, now);
    await repository.createReplacing(input, now);

    expect(await repository.findByTokenHash(hashInvitationToken(token))).toMatchObject({
      invitation: { email: input.email, tokenHash: input.tokenHash },
      tenantName: "Clínica A",
      isTenantActive: true,
      creator: { isMembershipActive: true, isDoctor: false },
    });
    expect(await repository.findByTokenHash(hashInvitationToken("inexistente"))).toBeNull();
  });

  it("informa una clínica suspendida y un emisor desactivado", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const { input, token } = buildInvitation(world, {}, now);
    await repository.createReplacing(input, now);
    await prismaClient.tenant.update({ where: { id: world.tenantA.id }, data: { status: "SUSPENDED" } });
    await prismaClient.staffMembership.update({ where: { id: world.admin.id }, data: { status: "DEACTIVATED" } });

    expect(await repository.findByTokenHash(hashInvitationToken(token))).toMatchObject({
      isTenantActive: false,
      creator: { isMembershipActive: false },
    });
  });

  it("marca el envío una sola vez y solo dentro de la clínica", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);
    const scope = { tenantId: world.tenantA.id, invitationId: record.id };

    expect(await repository.markSent({ tenantId: world.tenantB.id, invitationId: record.id, now })).toBe(false);
    expect(await repository.markSent({ ...scope, now })).toBe(true);
    expect(await repository.markSent({ ...scope, now })).toBe(false);
    expect((await repository.findById(scope))?.sentAt).toEqual(now);
  });

  it("lista los pendientes vigentes de la clínica, del más nuevo al más viejo, con quién los generó", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const older = await repository.createReplacing(
      buildInvitation(world, { email: "viejo@example.com" }, new Date(now.getTime() - minutes(10))).input,
      new Date(now.getTime() - minutes(10)),
    );
    const newer = await repository.createReplacing(buildInvitation(world, { email: "nuevo@example.com" }, now).input, now);
    await repository.createReplacing(
      buildInvitation(world, { email: "ajeno@example.com", tenantId: world.tenantB.id, createdByMembershipId: world.outsider.id, createdByUserId: world.outsiderUser.id }, now).input,
      now,
    );

    const listed = await repository.listPending({ tenantId: world.tenantA.id, now, limit: INVITATION_LIST_LIMIT });

    expect(listed.map((entry) => entry.id)).toEqual([newer.id, older.id]);
    expect(listed[0]).toMatchObject({ createdByName: "Admin de A" });
  });

  it("no lista las revocadas, las vencidas, las de una clínica suspendida ni las de un emisor desactivado", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const revoked = await repository.createReplacing(buildInvitation(world, { email: "revocada@example.com" }, now).input, now);
    await repository.revoke({ tenantId: world.tenantA.id, invitationId: revoked.id, now });
    const past = new Date(now.getTime() - INVITATION_TTL_MS - minutes(5));
    await repository.createReplacing(buildInvitation(world, { email: "vencida@example.com" }, past).input, past);
    await repository.createReplacing(
      buildInvitation(world, { email: "de-medico@example.com", createdByMembershipId: world.doctor.id, createdByUserId: world.doctorUser.id }, now).input,
      now,
    );
    const listBase = { tenantId: world.tenantA.id, now, limit: INVITATION_LIST_LIMIT };

    expect(await repository.listPending(listBase)).toHaveLength(1);

    await prismaClient.staffMembership.update({ where: { id: world.doctor.id }, data: { status: "DEACTIVATED" } });
    expect(await repository.listPending(listBase)).toHaveLength(0);

    await prismaClient.staffMembership.update({ where: { id: world.doctor.id }, data: { status: "ACTIVE" } });
    await prismaClient.tenant.update({ where: { id: world.tenantA.id }, data: { status: "SUSPENDED" } });
    expect(await repository.listPending(listBase)).toHaveLength(0);
  });

  it("filtra por quien invitó y respeta el límite", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    await repository.createReplacing(buildInvitation(world, { email: "a@example.com" }, now).input, now);
    await repository.createReplacing(
      buildInvitation(world, { email: "b@example.com", createdByMembershipId: world.doctor.id, createdByUserId: world.doctorUser.id }, now).input,
      now,
    );
    const base = { tenantId: world.tenantA.id, now };

    expect(await repository.listPending({ ...base, limit: 10, createdByMembershipId: world.doctor.id })).toHaveLength(1);
    expect(await repository.listPending({ ...base, limit: 1 })).toHaveLength(1);
  });

  it("busca y revoca solo dentro de la clínica indicada", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);
    const own = { tenantId: world.tenantA.id, invitationId: record.id };
    const foreign = { tenantId: world.tenantB.id, invitationId: record.id };

    expect(await repository.findById(foreign)).toBeNull();
    expect(await repository.revoke({ ...foreign, now })).toBe(false);
    expect((await repository.findById(own))?.status).toBe("PENDING");

    expect(await repository.revoke({ ...own, now })).toBe(true);
    expect(await repository.findById(own)).toMatchObject({ status: "REVOKED", endReason: "BY_SENDER" });
    expect(await repository.revoke({ ...own, now })).toBe(false);
  });

  it("no revoca una invitación que ya venció", async () => {
    const world = await createInvitationWorld();
    const past = new Date(Date.now() - INVITATION_TTL_MS - minutes(5));
    const record = await repository.createReplacing(buildInvitation(world, {}, past).input, past);

    expect(await repository.revoke({ tenantId: world.tenantA.id, invitationId: record.id, now: new Date() })).toBe(false);
  });
});

describe("repositorio de invitaciones: intentos incorrectos", () => {
  it("cuenta los intentos que quedan y al quinto revoca la invitación", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);

    for (let attempt = 1; attempt < INVITATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
      expect(await repository.registerFailedAttempt({ invitationId: record.id, now })).toEqual({
        attemptsLeft: INVITATION_MAX_FAILED_ATTEMPTS - attempt,
      });
    }

    expect((await prismaClient.invitation.findUnique({ where: { id: record.id } }))?.status).toBe("PENDING");
    expect(await repository.registerFailedAttempt({ invitationId: record.id, now })).toEqual({ attemptsLeft: 0 });
    expect(await prismaClient.invitation.findUnique({ where: { id: record.id } })).toMatchObject({
      status: "REVOKED",
      endReason: "ATTEMPTS_EXCEEDED",
      failedAttempts: INVITATION_MAX_FAILED_ATTEMPTS,
      revokedAt: now,
    });
  });

  it("una invitación que ya no está pendiente no suma intentos", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);
    await repository.revoke({ tenantId: world.tenantA.id, invitationId: record.id, now });

    expect(await repository.registerFailedAttempt({ invitationId: record.id, now })).toEqual({ attemptsLeft: 0 });
    expect((await prismaClient.invitation.findUnique({ where: { id: record.id } }))?.failedAttempts).toBe(0);
  });

  it("intentos simultáneos nunca pasan del máximo", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);

    await Promise.all(
      Array.from({ length: 8 }, () => repository.registerFailedAttempt({ invitationId: record.id, now })),
    );

    expect((await prismaClient.invitation.findUnique({ where: { id: record.id } }))?.failedAttempts).toBe(
      INVITATION_MAX_FAILED_ATTEMPTS,
    );
  });
});

describe("repositorio de invitaciones: transacción de aceptación", () => {
  it("reclama la invitación una sola vez", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);
    const account = await createUser();

    const claims = await repository.runAcceptance(account.id, async (transaction) => [
      await transaction.claim({ invitationId: record.id, accountId: account.id, now }),
      await transaction.claim({ invitationId: record.id, accountId: account.id, now }),
    ]);

    expect(claims).toEqual([true, false]);
    expect(await prismaClient.invitation.findUnique({ where: { id: record.id } })).toMatchObject({
      status: "ACCEPTED",
      acceptedByUserId: account.id,
      acceptedAt: now,
    });
  });

  it("no reclama una invitación vencida ni sin intentos", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const past = new Date(Date.now() - INVITATION_TTL_MS - minutes(5));
    const expired = await repository.createReplacing(buildInvitation(world, { email: "vencida@example.com" }, past).input, past);
    const now = new Date();
    const exhausted = await repository.createReplacing(buildInvitation(world, { email: "agotada@example.com" }, now).input, now);
    await prismaClient.invitation.update({ where: { id: exhausted.id }, data: { failedAttempts: INVITATION_MAX_FAILED_ATTEMPTS } });

    const claims = await repository.runAcceptance(account.id, async (transaction) => [
      await transaction.claim({ invitationId: expired.id, accountId: account.id, now }),
      await transaction.claim({ invitationId: exhausted.id, accountId: account.id, now }),
    ]);

    expect(claims).toEqual([false, false]);
  });

  it("un error dentro del trabajo revierte todo, incluida la marca de aceptada", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const record = await repository.createReplacing(buildInvitation(world, {}, now).input, now);
    const account = await createUser();

    await expect(
      repository.runAcceptance(account.id, async (transaction) => {
        await transaction.claim({ invitationId: record.id, accountId: account.id, now });

        throw new Error("falla");
      }),
    ).rejects.toThrow("falla");

    expect((await prismaClient.invitation.findUnique({ where: { id: record.id } }))?.status).toBe("PENDING");
  });

  it("crea la membresía de médico y rechaza una matrícula en uso", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const other = await createUser();

    const created = await repository.runAcceptance(account.id, (transaction) =>
      transaction.createDoctorMembership({
        tenantId: world.tenantA.id,
        userId: account.id,
        licenseNumber: "MN999",
        specialty: "Cardiología",
      }),
    );

    expect(await prismaClient.staffMembership.findUnique({ where: { id: created.membershipId } })).toMatchObject({
      isDoctor: true,
      isClinicAdmin: false,
      status: "ACTIVE",
      licenseNumber: "MN999",
      specialty: "Cardiología",
    });

    await expect(
      repository.runAcceptance(other.id, (transaction) =>
        transaction.createDoctorMembership({
          tenantId: world.tenantA.id,
          userId: other.id,
          licenseNumber: "MN999",
          specialty: "Pediatría",
        }),
      ),
    ).rejects.toBeInstanceOf(InvitationConflictError);
  });

  it("lee lo que la cuenta ya tiene en la clínica", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const patient = await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: account.id,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    const pending = await createPatient({ tenantId: world.tenantA.id, documentType: "DNI", documentNumber: "30999888" });

    const facts = await repository.runAcceptance(account.id, (transaction) =>
      transaction.findRelationshipFacts({
        tenantId: world.tenantA.id,
        userId: account.id,
        documentType: "DNI",
        documentNumber: "30999888",
        licenseNumber: null,
      }),
    );

    expect(facts.staff).toBeNull();
    expect(facts.patient).toMatchObject({ patientId: patient.id, status: "LINKED", documentNumber: "30111222" });
    expect(facts.patientByDocument).toMatchObject({ patientId: pending.id, userId: null, status: "PENDING" });
    expect(facts.licenseOwnerUserId).toBeNull();

    const doctorFacts = await repository.runAcceptance(world.doctorUser.id, (transaction) =>
      transaction.findRelationshipFacts({
        tenantId: world.tenantA.id,
        userId: world.doctorUser.id,
        documentType: null,
        documentNumber: null,
        licenseNumber: world.doctor.licenseNumber,
      }),
    );

    expect(doctorFacts.staff).toMatchObject({ membershipId: world.doctor.id, status: "ACTIVE", isDoctor: true });
    expect(doctorFacts.licenseOwnerUserId).toBe(world.doctorUser.id);
  });

  it("vincula a un paciente nuevo, reutiliza un registro revocado y rechaza un documento en uso", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const account = await createUser({ fullName: "Paciente Nuevo" });

    const created = await repository.runAcceptance(account.id, (transaction) =>
      transaction.linkPatient({
        tenantId: world.tenantA.id,
        userId: account.id,
        fullName: "Paciente Nuevo",
        documentType: "DNI",
        documentNumber: "30111222",
        reusePatientId: null,
        now,
      }),
    );

    expect(await prismaClient.patient.findUnique({ where: { id: created.patientId } })).toMatchObject({
      status: "LINKED",
      userId: account.id,
      fullName: "Paciente Nuevo",
      linkedAt: now,
      revokedAt: null,
    });

    const revokedAccount = await createUser({ fullName: "Antes Revocada" });
    const revoked = await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: revokedAccount.id,
      documentType: "DNI",
      documentNumber: "30333444",
    });
    await prismaClient.patient.update({ where: { id: revoked.id }, data: { status: "REVOKED", revokedAt: new Date() } });

    const reused = await repository.runAcceptance(revokedAccount.id, (transaction) =>
      transaction.linkPatient({
        tenantId: world.tenantA.id,
        userId: revokedAccount.id,
        fullName: "Antes Revocada",
        documentType: "DNI",
        documentNumber: "30333444",
        reusePatientId: revoked.id,
        now,
      }),
    );

    expect(reused.patientId).toBe(revoked.id);
    expect(await prismaClient.patient.findUnique({ where: { id: revoked.id } })).toMatchObject({
      status: "LINKED",
      revokedAt: null,
      linkedAt: now,
    });

    const intruder = await createUser();

    await expect(
      repository.runAcceptance(intruder.id, (transaction) =>
        transaction.linkPatient({
          tenantId: world.tenantA.id,
          userId: intruder.id,
          fullName: "Intruso",
          documentType: "DNI",
          documentNumber: "30111222",
          reusePatientId: null,
          now,
        }),
      ),
    ).rejects.toBeInstanceOf(InvitationConflictError);
  });

  it("no reutiliza un registro de paciente de otra clínica", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const foreign = await createPatient({ tenantId: world.tenantB.id });

    await expect(
      repository.runAcceptance(account.id, (transaction) =>
        transaction.linkPatient({
          tenantId: world.tenantA.id,
          userId: account.id,
          fullName: "Alguien",
          documentType: "DNI",
          documentNumber: foreign.documentNumber,
          reusePatientId: foreign.id,
          now: new Date(),
        }),
      ),
    ).rejects.toThrow("no existe en la clínica");
  });

  it("asigna al médico una sola vez y sin tocar las asignaciones de otros", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const patient = await createLinkedPatient({ tenantId: world.tenantA.id, userId: account.id });
    const otherDoctorUser = await createUser();
    const otherDoctor = await prismaClient.staffMembership.create({
      data: {
        tenantId: world.tenantA.id,
        userId: otherDoctorUser.id,
        isDoctor: true,
        isClinicAdmin: false,
        specialty: "Clínica",
        licenseNumber: "MN-OTRO",
      },
    });
    const now = new Date();
    const assign = (membershipId: string, createdByUserId: string) =>
      repository.runAcceptance(account.id, (transaction) =>
        transaction.assignDoctorIfAbsent({
          tenantId: world.tenantA.id,
          membershipId,
          patientId: patient.id,
          createdByUserId,
          now,
        }),
      );

    await assign(otherDoctor.id, otherDoctorUser.id);
    await assign(world.doctor.id, world.doctorUser.id);
    await assign(world.doctor.id, world.doctorUser.id);

    const assignments = await prismaClient.doctorPatientAssignment.findMany({
      where: { patientId: patient.id, endedAt: null },
    });

    expect(assignments).toHaveLength(2);
    expect(assignments.map((assignment) => assignment.membershipId).sort()).toEqual(
      [otherDoctor.id, world.doctor.id].sort(),
    );
  });

  it("sabe si una membresía es de un médico activo, dentro de la clínica", async () => {
    const world = await createInvitationWorld();
    const account = await createUser();
    const check = (tenantId: string, membershipId: string) =>
      repository.runAcceptance(account.id, (transaction) =>
        transaction.isMembershipActiveDoctor({ tenantId, membershipId }),
      );

    expect(await check(world.tenantA.id, world.doctor.id)).toBe(true);
    expect(await check(world.tenantA.id, world.admin.id)).toBe(false);
    expect(await check(world.tenantB.id, world.doctor.id)).toBe(false);

    await prismaClient.staffMembership.update({ where: { id: world.doctor.id }, data: { status: "DEACTIVATED" } });
    expect(await check(world.tenantA.id, world.doctor.id)).toBe(false);
  });
});

describe("repositorio de invitaciones: lo que ya tiene una cuenta en la clínica", () => {
  it("devuelve el vínculo de personal o de paciente de la cuenta con ese correo, solo en esa clínica", async () => {
    const world = await createInvitationWorld();
    const patientUser = await createUser({ email: "paciente@example.com" });
    await createLinkedPatient({ tenantId: world.tenantA.id, userId: patientUser.id });

    expect(await repository.findClinicFacts({ tenantId: world.tenantA.id, email: world.doctorUser.email })).toEqual({
      staff: { status: "ACTIVE", isClinicAdmin: false, isDoctor: true },
      patient: null,
    });
    expect(await repository.findClinicFacts({ tenantId: world.tenantA.id, email: "paciente@example.com" })).toEqual({
      staff: null,
      patient: { status: "LINKED" },
    });
    expect(await repository.findClinicFacts({ tenantId: world.tenantB.id, email: world.doctorUser.email })).toEqual({
      staff: null,
      patient: null,
    });
    expect(await repository.findClinicFacts({ tenantId: world.tenantA.id, email: "sin-cuenta@example.com" })).toEqual({
      staff: null,
      patient: null,
    });
  });

  it("dice a quién pertenece un documento o una matrícula en la clínica", async () => {
    const world = await createInvitationWorld();
    const patientUser = await createUser({ email: "paciente@example.com" });
    await createLinkedPatient({
      tenantId: world.tenantA.id,
      userId: patientUser.id,
      documentType: "DNI",
      documentNumber: "30111222",
    });
    await createPatient({ tenantId: world.tenantA.id, documentType: "PASSPORT", documentNumber: "AB123456" });

    expect(
      await repository.findDocumentOwner({ tenantId: world.tenantA.id, documentType: "DNI", documentNumber: "30111222" }),
    ).toEqual({ email: "paciente@example.com" });
    expect(
      await repository.findDocumentOwner({ tenantId: world.tenantA.id, documentType: "PASSPORT", documentNumber: "AB123456" }),
    ).toEqual({ email: null });
    expect(
      await repository.findDocumentOwner({ tenantId: world.tenantB.id, documentType: "DNI", documentNumber: "30111222" }),
    ).toBeNull();

    expect(
      await repository.findLicenseOwner({ tenantId: world.tenantA.id, licenseNumber: world.doctor.licenseNumber ?? "" }),
    ).toEqual({ email: world.doctorUser.email });
    expect(await repository.findLicenseOwner({ tenantId: world.tenantB.id, licenseNumber: world.doctor.licenseNumber ?? "" })).toBeNull();
  });

  it("una invitación de paciente generada por un médico guarda el documento y asigna al emisor", async () => {
    const world = await createInvitationWorld();
    const now = new Date();
    const { input } = buildPatientInvitation(world, {}, now);

    const record = await repository.createReplacing(input, now);

    expect(record).toMatchObject({
      kind: "PATIENT",
      documentType: "DNI",
      licenseNumber: null,
      assignToCreator: true,
      createdByMembershipId: world.doctor.id,
    });
  });
});

describe("repositorio de invitaciones: nombre de la clínica", () => {
  it("devuelve el nombre de la clínica y null si no existe", async () => {
    const world = await createInvitationWorld();

    expect(await repository.findTenantName({ tenantId: world.tenantA.id })).toBe(world.tenantA.name);
    expect(await repository.findTenantName({ tenantId: "0198d6c4-2f3a-7c11-8d2e-5a1b2c3d4e5f" })).toBeNull();
  });
});
