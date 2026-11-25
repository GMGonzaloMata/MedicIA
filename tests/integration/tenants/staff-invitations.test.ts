import { beforeEach, describe, expect, it } from "vitest";

import { createInviteStaff } from "@/modules/tenants/application/use-cases/invite-staff";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { normalizeEmail, type NormalizedEmail } from "@/modules/tenants/domain/normalized-values";
import { nodeSecretGenerator } from "@/modules/tenants/infrastructure/adapters/node-secret-generator";
import { prismaInvitationRepository } from "@/modules/tenants/infrastructure/repositories/prisma-invitation-repository";
import { prismaStaffRepository } from "@/modules/tenants/infrastructure/repositories/prisma-staff-repository";

import {
  createDoctorMembership,
  createStaffMembership,
  createTenant,
  createUser,
  prismaClient,
  resetDatabase,
} from "../../support/database";
import { expectRejectedBy } from "../../support/expectations";

const DOCTOR = { isClinicAdmin: false, isDoctor: true };
const ADMIN = { isClinicAdmin: true, isDoctor: false };

beforeEach(resetDatabase);

function email(value: string): NormalizedEmail {
  const normalized = normalizeEmail(value);

  if (normalized === null) {
    throw new Error("Correo de prueba inválido.");
  }

  return normalized;
}

async function createClinicWithAdmin() {
  const tenant = await createTenant();
  const user = await createUser();
  const membership = await createStaffMembership({ tenantId: tenant.id, userId: user.id });
  const actor: ClinicAdminActor = { tenantId: tenant.id, userId: user.id, membershipId: membership.id };

  return { tenant, user, actor };
}

let licenseSequence = 0;

// La base exige especialidad y matrícula a todo médico: cada llamada usa una matrícula distinta.
function doctorProfile() {
  licenseSequence += 1;

  return { specialty: "Cardiología", licenseNumber: `MP-INV-${licenseSequence}` };
}

// Crea una invitación pendiente con el repositorio real y devuelve el token en claro, como lo recibiría la persona.
async function createInvitation(input: {
  tenantId: string;
  createdByUserId: string;
  email: string;
  roles?: { isClinicAdmin: boolean; isDoctor: boolean };
  expiresAt?: Date;
}) {
  const token = nodeSecretGenerator.generateToken();
  const now = new Date();
  const roles = input.roles ?? DOCTOR;
  const invitation = await prismaInvitationRepository.createReplacingPending({
    tenantId: input.tenantId,
    email: email(input.email),
    roles,
    doctor: roles.isDoctor ? doctorProfile() : null,
    tokenHash: nodeSecretGenerator.hash(token),
    expiresAt: input.expiresAt ?? new Date(now.getTime() + 60_000),
    createdByUserId: input.createdByUserId,
    now,
  });

  return { invitation, token };
}

describe("restricciones de la base para las invitaciones", () => {
  it("rechaza dos invitaciones pendientes para el mismo correo en la misma clínica", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const data = {
      tenantId: tenant.id,
      email: "nuevo@example.com",
      isDoctor: true,
      ...doctorProfile(),
      createdByUserId: user.id,
      expiresAt: new Date(Date.now() + 60_000),
    };

    await prismaClient.staffInvitation.create({ data: { ...data, tokenHash: "hash-1" } });

    await expectRejectedBy(
      prismaClient.staffInvitation.create({ data: { ...data, tokenHash: "hash-2" } }),
      "staff_invitations_one_pending_per_email",
    );
  });

  it("permite el mismo correo pendiente en dos clínicas distintas", async () => {
    const first = await createClinicWithAdmin();
    const second = await createClinicWithAdmin();

    await createInvitation({ tenantId: first.tenant.id, createdByUserId: first.user.id, email: "nuevo@example.com" });

    await expect(
      createInvitation({ tenantId: second.tenant.id, createdByUserId: second.user.id, email: "nuevo@example.com" }),
    ).resolves.toBeDefined();
  });

  it("rechaza una invitación sin ningún rol y un correo con mayúsculas", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const base = { tenantId: tenant.id, createdByUserId: user.id, expiresAt: new Date(Date.now() + 60_000) };

    await expectRejectedBy(
      prismaClient.staffInvitation.create({ data: { ...base, email: "a@example.com", tokenHash: "h1" } }),
      "staff_invitations_has_role",
    );
    await expectRejectedBy(
      prismaClient.staffInvitation.create({
        data: { ...base, email: "A@Example.com", isDoctor: true, ...doctorProfile(), tokenHash: "h2" },
      }),
      "staff_invitations_email_lowercase",
    );
  });

  it("rechaza un médico sin especialidad o matrícula, y a quien no es médico con esos datos", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const base = { tenantId: tenant.id, createdByUserId: user.id, expiresAt: new Date(Date.now() + 60_000) };

    await expectRejectedBy(
      prismaClient.staffInvitation.create({ data: { ...base, email: "a@example.com", isDoctor: true, tokenHash: "h1" } }),
      "staff_invitations_doctor_fields",
    );
    await expectRejectedBy(
      prismaClient.staffInvitation.create({
        data: { ...base, email: "b@example.com", isDoctor: true, specialty: "Cardiología", licenseNumber: "  ", tokenHash: "h2" },
      }),
      "staff_invitations_doctor_fields",
    );
    await expectRejectedBy(
      prismaClient.staffInvitation.create({
        data: { ...base, email: "c@example.com", isClinicAdmin: true, ...doctorProfile(), tokenHash: "h3" },
      }),
      "staff_invitations_doctor_fields",
    );
  });

  it("rechaza una invitación aceptada sin quién la aceptó, y el mismo hash de token dos veces", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const base = {
      tenantId: tenant.id,
      createdByUserId: user.id,
      isDoctor: true,
      ...doctorProfile(),
      expiresAt: new Date(Date.now() + 60_000),
    };

    await expectRejectedBy(
      prismaClient.staffInvitation.create({
        data: { ...base, email: "a@example.com", tokenHash: "h1", status: "ACCEPTED" },
      }),
      "staff_invitations_status_fields",
    );

    await prismaClient.staffInvitation.create({ data: { ...base, email: "b@example.com", tokenHash: "mismo" } });
    await expectRejectedBy(
      prismaClient.staffInvitation.create({ data: { ...base, email: "c@example.com", tokenHash: "mismo" } }),
      "token_hash",
    );
  });
});

describe("crear, revocar y reenviar", () => {
  it("una invitación nueva para el mismo correo revoca la pendiente anterior", async () => {
    const { tenant, user } = await createClinicWithAdmin();

    const first = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: "nuevo@example.com" });
    const second = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: "nuevo@example.com" });

    const rows = await prismaClient.staffInvitation.findMany({ orderBy: { createdAt: "asc" } });

    expect(rows.map((row) => row.status)).toEqual(["REVOKED", "PENDING"]);
    expect(rows[0]?.id).toBe(first.invitation.id);
    expect(rows[0]?.revokedByUserId).toBe(user.id);
    expect(rows[1]?.id).toBe(second.invitation.id);
  });

  it("no guarda el token en claro", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const { token } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: "nuevo@example.com" });

    const row = await prismaClient.staffInvitation.findFirstOrThrow();

    expect(row.tokenHash).toBe(nodeSecretGenerator.hash(token));
    expect(JSON.stringify(row)).not.toContain(token);
  });

  it("revoca una invitación pendiente de la propia clínica una sola vez", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const { invitation } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: "a@example.com" });
    const input = { tenantId: tenant.id, invitationId: invitation.id, revokedByUserId: user.id, now: new Date() };

    expect(await prismaInvitationRepository.revoke(input)).toBe(true);
    expect(await prismaInvitationRepository.revoke(input)).toBe(false);
  });
});

describe("aceptar una invitación", () => {
  it("crea la membresía, marca la invitación y deja quién la aceptó", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const person = await createUser();
    const { token } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: person.email });

    const result = await prismaInvitationRepository.accept({
      tokenHash: nodeSecretGenerator.hash(token),
      user: { id: person.id, email: email(person.email) },
      now: new Date(),
    });

    expect(result).toMatchObject({ kind: "accepted", tenantId: tenant.id });
    expect(await prismaClient.staffMembership.findFirst({ where: { tenantId: tenant.id, userId: person.id } })).toMatchObject({
      isDoctor: true,
      isClinicAdmin: false,
      specialty: "Cardiología",
      licenseNumber: expect.stringMatching(/^MP-INV-/),
      status: "ACTIVE",
    });
    expect(await prismaClient.staffInvitation.findFirstOrThrow()).toMatchObject({
      status: "ACCEPTED",
      acceptedByUserId: person.id,
    });
  });

  it("suma el rol de administrador a un médico sin duplicar la membresía ni tocar sus datos", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const person = await createUser();
    await createDoctorMembership({ tenantId: tenant.id, userId: person.id, specialty: "Pediatría", licenseNumber: "MP-PROPIA" });
    const { token } = await createInvitation({
      tenantId: tenant.id,
      createdByUserId: user.id,
      email: person.email,
      roles: ADMIN,
    });

    await prismaInvitationRepository.accept({
      tokenHash: nodeSecretGenerator.hash(token),
      user: { id: person.id, email: email(person.email) },
      now: new Date(),
    });

    const rows = await prismaClient.staffMembership.findMany({ where: { tenantId: tenant.id, userId: person.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isClinicAdmin: true, isDoctor: true, specialty: "Pediatría", licenseNumber: "MP-PROPIA" });
  });

  it("suma el rol de médico a un administrador y le carga la especialidad y la matrícula de la invitación", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const person = await createUser();
    await createStaffMembership({ tenantId: tenant.id, userId: person.id });
    const { token } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: person.email, roles: DOCTOR });

    await prismaInvitationRepository.accept({
      tokenHash: nodeSecretGenerator.hash(token),
      user: { id: person.id, email: email(person.email) },
      now: new Date(),
    });

    const rows = await prismaClient.staffMembership.findMany({ where: { tenantId: tenant.id, userId: person.id } });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ isClinicAdmin: true, isDoctor: true, specialty: "Cardiología" });
    expect(rows[0]?.licenseNumber).toMatch(/^MP-INV-/);
  });

  it("dos aceptaciones simultáneas del mismo enlace dejan una sola membresía", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const person = await createUser();
    const { token } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: person.email });
    const input = {
      tokenHash: nodeSecretGenerator.hash(token),
      user: { id: person.id, email: email(person.email) },
      now: new Date(),
    };

    const results = await Promise.all([prismaInvitationRepository.accept(input), prismaInvitationRepository.accept(input)]);

    expect(results.filter((result) => result.kind === "accepted")).toHaveLength(1);
    expect(await prismaClient.staffMembership.count({ where: { tenantId: tenant.id, userId: person.id } })).toBe(1);
  });

  it.each([
    { name: "una invitación vencida", expiresAt: new Date(Date.now() - 1000) },
    { name: "un correo distinto", otherEmail: true },
  ])("rechaza $name sin crear la membresía", async ({ expiresAt, otherEmail }) => {
    const { tenant, user } = await createClinicWithAdmin();
    const invited = await createUser();
    const person = otherEmail ? await createUser() : invited;
    const { token } = await createInvitation({
      tenantId: tenant.id,
      createdByUserId: user.id,
      email: invited.email,
      expiresAt,
    });

    const result = await prismaInvitationRepository.accept({
      tokenHash: nodeSecretGenerator.hash(token),
      user: { id: person.id, email: email(person.email) },
      now: new Date(),
    });

    expect(result).toEqual({ kind: "rejected" });
    expect(await prismaClient.staffMembership.count({ where: { userId: person.id } })).toBe(0);
    expect((await prismaClient.staffInvitation.findFirstOrThrow()).status).toBe("PENDING");
  });

  it("rechaza si la clínica está suspendida", async () => {
    const { tenant, user } = await createClinicWithAdmin();
    const person = await createUser();
    const { token } = await createInvitation({ tenantId: tenant.id, createdByUserId: user.id, email: person.email });
    await prismaClient.tenant.update({ where: { id: tenant.id }, data: { status: "SUSPENDED" } });

    expect(
      await prismaInvitationRepository.accept({
        tokenHash: nodeSecretGenerator.hash(token),
        user: { id: person.id, email: email(person.email) },
        now: new Date(),
      }),
    ).toEqual({ kind: "rejected" });
  });
});

describe("rechazo del acceso desde otra clínica", () => {
  it("listar, buscar, revocar y reenviar una invitación ajena la tratan como inexistente", async () => {
    const own = await createClinicWithAdmin();
    const foreign = await createClinicWithAdmin();
    const { invitation } = await createInvitation({
      tenantId: foreign.tenant.id,
      createdByUserId: foreign.user.id,
      email: "ajena@example.com",
    });

    expect(await prismaInvitationRepository.listPending(own.tenant.id)).toEqual([]);
    expect(await prismaInvitationRepository.findById({ tenantId: own.tenant.id, invitationId: invitation.id })).toBeNull();
    expect(
      await prismaInvitationRepository.revoke({
        tenantId: own.tenant.id,
        invitationId: invitation.id,
        revokedByUserId: own.user.id,
        now: new Date(),
      }),
    ).toBe(false);
    expect((await prismaClient.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).status).toBe("PENDING");
  });

  it("el personal de otra clínica no figura en el listado", async () => {
    const own = await createClinicWithAdmin();
    await createClinicWithAdmin();

    const members = await prismaStaffRepository.listMembers(own.tenant.id);

    expect(members.map((member) => member.userId)).toEqual([own.user.id]);
  });

  it("invitar crea la invitación solo en la clínica del actor", async () => {
    const own = await createClinicWithAdmin();
    const other = await createClinicWithAdmin();
    const sent: string[] = [];
    const inviteStaff = createInviteStaff({
      staff: prismaStaffRepository,
      invitations: prismaInvitationRepository,
      mailer: { async send(message) { sent.push(message.to); } },
      secrets: nodeSecretGenerator,
      now: () => new Date(),
      appBaseUrl: "http://localhost:3000",
    });

    const result = await inviteStaff({ actor: own.actor, email: "nuevo@example.com", roles: DOCTOR, doctor: doctorProfile() });

    expect(result).toMatchObject({ ok: true });
    expect(await prismaClient.staffInvitation.count({ where: { tenantId: own.tenant.id } })).toBe(1);
    expect(await prismaClient.staffInvitation.count({ where: { tenantId: other.tenant.id } })).toBe(0);
    expect(sent).toEqual(["nuevo@example.com"]);
  });

  it("una clínica suspendida no puede invitar", async () => {
    const own = await createClinicWithAdmin();
    await prismaClient.tenant.update({ where: { id: own.tenant.id }, data: { status: "SUSPENDED" } });
    const inviteStaff = createInviteStaff({
      staff: prismaStaffRepository,
      invitations: prismaInvitationRepository,
      mailer: { async send() {} },
      secrets: nodeSecretGenerator,
      now: () => new Date(),
      appBaseUrl: "http://localhost:3000",
    });

    expect(await inviteStaff({ actor: own.actor, email: "nuevo@example.com", roles: DOCTOR, doctor: doctorProfile() })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await prismaClient.staffInvitation.count()).toBe(0);
  });
});

describe("matrícula repetida", () => {
  it("detecta la matrícula de un miembro y la de una invitación pendiente de otra persona, solo dentro de la clínica", async () => {
    const own = await createClinicWithAdmin();
    const other = await createClinicWithAdmin();
    const doctor = await createUser();
    await createDoctorMembership({ tenantId: own.tenant.id, userId: doctor.id, licenseNumber: "MP-EN-USO" });
    const pending = await createInvitation({ tenantId: own.tenant.id, createdByUserId: own.user.id, email: "uno@example.com" });
    const pendingLicense = (await prismaClient.staffInvitation.findUniqueOrThrow({ where: { id: pending.invitation.id } })).licenseNumber!;

    const isTaken = (tenantId: string, licenseNumber: string, exceptEmail?: string) =>
      prismaStaffRepository.isLicenseTaken({ tenantId, licenseNumber, exceptEmail: exceptEmail ? email(exceptEmail) : undefined });

    expect(await isTaken(own.tenant.id, "MP-EN-USO")).toBe(true);
    expect(await isTaken(own.tenant.id, pendingLicense)).toBe(true);
    // La invitación pendiente del mismo correo no cuenta: la nueva la va a reemplazar.
    expect(await isTaken(own.tenant.id, pendingLicense, "uno@example.com")).toBe(false);
    // Otra clínica puede repetir la misma matrícula.
    expect(await isTaken(other.tenant.id, "MP-EN-USO")).toBe(false);
    expect(await isTaken(own.tenant.id, "MP-LIBRE")).toBe(false);
  });

  it("una invitación revocada ya no reserva su matrícula", async () => {
    const own = await createClinicWithAdmin();
    const { invitation } = await createInvitation({ tenantId: own.tenant.id, createdByUserId: own.user.id, email: "uno@example.com" });
    const licenseNumber = (await prismaClient.staffInvitation.findUniqueOrThrow({ where: { id: invitation.id } })).licenseNumber!;

    await prismaInvitationRepository.revoke({
      tenantId: own.tenant.id,
      invitationId: invitation.id,
      revokedByUserId: own.user.id,
      now: new Date(),
    });

    expect(await prismaStaffRepository.isLicenseTaken({ tenantId: own.tenant.id, licenseNumber })).toBe(false);
  });
});
