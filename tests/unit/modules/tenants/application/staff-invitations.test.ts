import { beforeEach, describe, expect, it } from "vitest";

import type { InvitationMailer, InvitationMessage } from "@/modules/tenants/application/ports/out/invitation-mailer";
import { createAcceptStaffInvitation } from "@/modules/tenants/application/use-cases/accept-staff-invitation";
import { createInviteStaff } from "@/modules/tenants/application/use-cases/invite-staff";
import { createListStaff } from "@/modules/tenants/application/use-cases/list-staff";
import { createResendInvitation } from "@/modules/tenants/application/use-cases/resend-invitation";
import { createRevokeInvitation } from "@/modules/tenants/application/use-cases/revoke-invitation";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { MailDeliveryError } from "@/modules/tenants/domain/mail-errors";

import { createDeterministicSecretGenerator } from "../../../../support/in-memory/deterministic-secret-generator";
import { createInMemoryClinicStore } from "../../../../support/in-memory/in-memory-clinic-store";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const DOCTOR = { isClinicAdmin: false, isDoctor: true };
const ADMIN = { isClinicAdmin: true, isDoctor: false };
const PROFILE = { specialty: "Cardiología", licenseNumber: "MP-123" };
const BASE_URL = "https://app.example.com";

const ACTOR_A: ClinicAdminActor = { tenantId: "tenant-a", userId: "admin-a", membershipId: "membership-admin-a" };
const ACTOR_B: ClinicAdminActor = { tenantId: "tenant-b", userId: "admin-b", membershipId: "membership-admin-b" };

function setup() {
  const store = createInMemoryClinicStore();
  store.addTenant({ id: "tenant-a", name: "Clínica A" });
  store.addTenant({ id: "tenant-b", name: "Clínica B" });
  store.addUser({ id: "admin-a", email: "admin-a@example.com", fullName: "Admin A" });
  store.addUser({ id: "admin-b", email: "admin-b@example.com", fullName: "Admin B" });
  store.addMembership({ tenantId: "tenant-a", userId: "admin-a", roles: ADMIN });
  store.addMembership({ tenantId: "tenant-b", userId: "admin-b", roles: ADMIN });

  const secrets = createDeterministicSecretGenerator();
  const sent: InvitationMessage[] = [];
  let failMail = false;
  const mailer: InvitationMailer = {
    async send(message) {
      if (failMail) {
        throw new MailDeliveryError();
      }

      sent.push(message);
    },
  };
  const now = () => NOW;
  const inviteStaff = createInviteStaff({
    staff: store.staff,
    invitations: store.invitations,
    mailer,
    secrets,
    now,
    appBaseUrl: BASE_URL,
  });

  return {
    store,
    secrets,
    sent,
    failMail: () => {
      failMail = true;
    },
    inviteStaff,
    listStaff: createListStaff({ staff: store.staff, invitations: store.invitations, now }),
    revokeInvitation: createRevokeInvitation({ invitations: store.invitations, now }),
    resendInvitation: createResendInvitation({ invitations: store.invitations, inviteStaff }),
    acceptStaffInvitation: createAcceptStaffInvitation({ invitations: store.invitations, secrets, now }),
  };
}

let world: ReturnType<typeof setup>;

beforeEach(() => {
  world = setup();
});

describe("invitar al personal", () => {
  it("crea la invitación y envía el correo con el enlace de un solo uso", async () => {
    const result = await world.inviteStaff({ actor: ACTOR_A, email: "Nuevo@Example.com ", roles: DOCTOR, doctor: PROFILE });

    expect(result).toMatchObject({ ok: true });
    expect(world.sent).toHaveLength(1);
    expect(world.sent[0]?.to).toBe("nuevo@example.com");
    expect(world.sent[0]?.text).toContain(`${BASE_URL}/invitation/token-1`);
    expect(world.sent[0]?.subject).toContain("Clínica A");
  });

  it("no guarda el token en claro: la invitación solo conserva su hash", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    const row = world.store.invitationRows[0];

    expect(row?.tokenHash).toBe("hash:token-1");
    expect(JSON.stringify(row)).not.toContain('"token-1"');
  });

  it.each(["no-es-un-correo", "", "a@b"])("rechaza el correo inválido %j", async (email) => {
    expect(await world.inviteStaff({ actor: ACTOR_A, email, roles: DOCTOR, doctor: PROFILE })).toEqual({ ok: false, code: "INVALID_INPUT" });
  });

  it("rechaza una invitación sin ningún rol", async () => {
    expect(
      await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: { isClinicAdmin: false, isDoctor: false } }),
    ).toEqual({ ok: false, code: "INVALID_INPUT" });
  });

  it("informa que ya pertenece a la clínica cuando ya tiene todos esos roles", async () => {
    world.store.addUser({ id: "doctor-1", email: "medico@example.com" });
    world.store.addMembership({ tenantId: "tenant-a", userId: "doctor-1", roles: DOCTOR });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "medico@example.com", roles: DOCTOR, doctor: PROFILE })).toEqual({
      ok: false,
      code: "ALREADY_MEMBER",
    });
    expect(world.sent).toHaveLength(0);
  });

  it("permite invitar a un miembro para sumarle un rol que no tiene", async () => {
    world.store.addUser({ id: "doctor-1", email: "medico@example.com" });
    world.store.addMembership({ tenantId: "tenant-a", userId: "doctor-1", roles: DOCTOR });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "medico@example.com", roles: ADMIN })).toMatchObject({ ok: true });
  });

  it("no invita a un miembro desactivado: hay que reactivarlo", async () => {
    world.store.addUser({ id: "doctor-1", email: "medico@example.com" });
    world.store.addMembership({ tenantId: "tenant-a", userId: "doctor-1", roles: DOCTOR, status: "DEACTIVATED" });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "medico@example.com", roles: DOCTOR, doctor: PROFILE })).toEqual({
      ok: false,
      code: "MEMBER_DEACTIVATED",
    });
  });

  it("una persona que es miembro de otra clínica puede ser invitada a esta", async () => {
    world.store.addUser({ id: "doctor-1", email: "medico@example.com" });
    world.store.addMembership({ tenantId: "tenant-b", userId: "doctor-1", roles: DOCTOR });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "medico@example.com", roles: DOCTOR, doctor: PROFILE })).toMatchObject({ ok: true });
  });

  it("una clínica suspendida no puede invitar", async () => {
    world.store.addTenant({ id: "tenant-a", name: "Clínica A", status: "SUSPENDED" });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(world.sent).toHaveLength(0);
  });

  it("si el correo falla, la invitación igual queda creada y se informa su identificador", async () => {
    world.failMail();

    const result = await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    expect(result).toMatchObject({ ok: false, code: "MAIL_UNAVAILABLE" });
    expect(world.store.invitationRows).toHaveLength(1);
    expect(result.ok === false && "invitationId" in result ? result.invitationId : null).toBe(world.store.invitationRows[0]?.id);
  });

  it("invitar de nuevo al mismo correo revoca la pendiente anterior", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    expect(world.store.invitationRows.map((row) => row.status)).toEqual(["REVOKED", "PENDING"]);
  });
});

describe("especialidad y matrícula del médico", () => {
  it.each([
    { name: "sin datos", doctor: undefined },
    { name: "con la matrícula vacía", doctor: { specialty: "Cardiología", licenseNumber: "  " } },
    { name: "con la especialidad vacía", doctor: { specialty: "", licenseNumber: "MP-1" } },
  ])("una invitación de médico $name se rechaza, porque la base exige las dos", async ({ doctor }) => {
    expect(await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(world.sent).toHaveLength(0);
    expect(world.store.invitationRows).toHaveLength(0);
  });

  it("guarda los datos normalizados en la invitación", async () => {
    await world.inviteStaff({
      actor: ACTOR_A,
      email: "nuevo@example.com",
      roles: DOCTOR,
      doctor: { specialty: " Cardiología ", licenseNumber: " MP-9 " },
    });

    expect(world.store.invitationRows[0]?.doctor).toEqual({ specialty: "Cardiología", licenseNumber: "MP-9" });
  });

  it("una invitación de administrador no guarda datos de médico aunque se los pasen", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: ADMIN, doctor: PROFILE });

    expect(world.store.invitationRows[0]?.doctor).toBeNull();
  });

  it("rechaza una matrícula que ya tiene un miembro de la clínica, antes de crear nada ni enviar el correo", async () => {
    world.store.addUser({ id: "doctor-1", email: "medico@example.com" });
    world.store.addMembership({ tenantId: "tenant-a", userId: "doctor-1", roles: DOCTOR, doctor: PROFILE });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE })).toEqual({
      ok: false,
      code: "LICENSE_IN_USE",
    });
    expect(world.sent).toHaveLength(0);
    expect(world.store.invitationRows).toHaveLength(0);
  });

  it("rechaza una matrícula que ya está en una invitación pendiente de otra persona", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "uno@example.com", roles: DOCTOR, doctor: PROFILE });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "otro@example.com", roles: DOCTOR, doctor: PROFILE })).toEqual({
      ok: false,
      code: "LICENSE_IN_USE",
    });
  });

  it("reenviar la propia invitación no choca con su misma matrícula", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "uno@example.com", roles: DOCTOR, doctor: PROFILE });
    const id = world.store.invitationRows[0]!.id;

    expect(await world.resendInvitation({ actor: ACTOR_A, invitationId: id })).toMatchObject({ ok: true });
    expect(world.store.invitationRows[1]?.doctor).toEqual(PROFILE);
  });

  it("la misma matrícula puede existir en otra clínica", async () => {
    world.store.addUser({ id: "doctor-b", email: "medico-b@example.com" });
    world.store.addMembership({ tenantId: "tenant-b", userId: "doctor-b", roles: DOCTOR, doctor: PROFILE });

    expect(await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE })).toMatchObject({
      ok: true,
    });
  });

  it("al aceptar, la membresía nace con la especialidad y la matrícula de la invitación", async () => {
    world.store.addUser({ id: "nuevo", email: "nuevo@example.com" });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } });

    expect(world.store.memberships.find((row) => row.userId === "nuevo")?.doctor).toEqual(PROFILE);
  });

  it("un administrador al que se le suma el rol de médico recibe sus datos; uno que ya es médico conserva los suyos", async () => {
    world.store.addUser({ id: "nuevo", email: "nuevo@example.com" });
    world.store.addMembership({ tenantId: "tenant-a", userId: "nuevo", roles: ADMIN });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } });

    const member = world.store.memberships.find((row) => row.userId === "nuevo");

    expect(member?.roles).toEqual({ isClinicAdmin: true, isDoctor: true });
    expect(member?.doctor).toEqual(PROFILE);
  });
});

describe("listar, revocar y reenviar", () => {
  it("lista el personal y las invitaciones pendientes de la clínica del actor, sin las de otra", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "a1@example.com", roles: DOCTOR, doctor: PROFILE });
    await world.inviteStaff({ actor: ACTOR_B, email: "b1@example.com", roles: DOCTOR, doctor: PROFILE });

    const list = await world.listStaff({ actor: ACTOR_A });

    expect(list.members.map((member) => member.email)).toEqual(["admin-a@example.com"]);
    expect(list.invitations.map((invitation) => invitation.email)).toEqual(["a1@example.com"]);
    expect(list.invitations[0]?.state).toBe("pending");
  });

  it("revocar una invitación de la propia clínica la anula", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    const id = world.store.invitationRows[0]!.id;

    expect(await world.revokeInvitation({ actor: ACTOR_A, invitationId: id })).toEqual({ ok: true });
    expect(world.store.invitationRows[0]?.status).toBe("REVOKED");
    expect(await world.revokeInvitation({ actor: ACTOR_A, invitationId: id })).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("revocar o reenviar una invitación de otra clínica se trata como inexistente", async () => {
    await world.inviteStaff({ actor: ACTOR_B, email: "b1@example.com", roles: DOCTOR, doctor: PROFILE });
    const id = world.store.invitationRows[0]!.id;

    expect(await world.revokeInvitation({ actor: ACTOR_A, invitationId: id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await world.resendInvitation({ actor: ACTOR_A, invitationId: id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(world.store.invitationRows[0]?.status).toBe("PENDING");
  });

  it("reenviar revoca la pendiente y crea otra con el mismo correo y los mismos roles", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    const id = world.store.invitationRows[0]!.id;

    expect(await world.resendInvitation({ actor: ACTOR_A, invitationId: id })).toMatchObject({ ok: true });

    expect(world.store.invitationRows.map((row) => row.status)).toEqual(["REVOKED", "PENDING"]);
    expect(world.sent).toHaveLength(2);
    expect(world.sent[1]?.text).toContain("/invitation/token-2");
  });

  it("no se puede reenviar una invitación que ya se aceptó", async () => {
    world.store.addUser({ id: "nuevo", email: "nuevo@example.com" });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } });
    const id = world.store.invitationRows[0]!.id;

    expect(await world.resendInvitation({ actor: ACTOR_A, invitationId: id })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("aceptar una invitación", () => {
  beforeEach(() => {
    world.store.addUser({ id: "nuevo", email: "nuevo@example.com", fullName: "Nuevo" });
  });

  it("crea la membresía con los roles de la invitación", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    const result = await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "Nuevo@Example.com" } });

    expect(result).toMatchObject({ ok: true, tenantId: "tenant-a" });
    expect(world.store.memberships.find((row) => row.userId === "nuevo")).toMatchObject({
      tenantId: "tenant-a",
      roles: DOCTOR,
      status: "ACTIVE",
    });
  });

  it("un miembro existente suma el rol a la misma membresía, sin duplicarla", async () => {
    world.store.addMembership({ tenantId: "tenant-a", userId: "nuevo", roles: DOCTOR });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: ADMIN });

    await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } });

    const rows = world.store.memberships.filter((row) => row.userId === "nuevo");

    expect(rows).toHaveLength(1);
    expect(rows[0]?.roles).toEqual({ isClinicAdmin: true, isDoctor: true });
  });

  it("una invitación solo se usa una vez", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    const user = { id: "nuevo", email: "nuevo@example.com" };

    expect(await world.acceptStaffInvitation({ token: "token-1", user })).toMatchObject({ ok: true });
    expect(await world.acceptStaffInvitation({ token: "token-1", user })).toEqual({ ok: false, code: "INVALID_INVITATION" });
  });

  it.each([
    { name: "un token inexistente", token: "no-existe" },
    { name: "un token vacío", token: "  " },
  ])("rechaza $name con el mismo resultado", async ({ token }) => {
    expect(await world.acceptStaffInvitation({ token, user: { id: "nuevo", email: "nuevo@example.com" } })).toEqual({
      ok: false,
      code: "INVALID_INVITATION",
    });
  });

  it("rechaza a quien ingresó con otro correo, con el mismo resultado", async () => {
    world.store.addUser({ id: "otro", email: "otro@example.com" });
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });

    expect(
      await world.acceptStaffInvitation({ token: "token-1", user: { id: "otro", email: "otro@example.com" } }),
    ).toEqual({ ok: false, code: "INVALID_INVITATION" });
    expect(world.store.memberships.some((row) => row.userId === "otro")).toBe(false);
  });

  it("rechaza una invitación revocada", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    await world.revokeInvitation({ actor: ACTOR_A, invitationId: world.store.invitationRows[0]!.id });

    expect(
      await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } }),
    ).toEqual({ ok: false, code: "INVALID_INVITATION" });
  });

  it("rechaza una invitación vencida", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    const later = createAcceptStaffInvitation({
      invitations: world.store.invitations,
      secrets: world.secrets,
      now: () => new Date(NOW.getTime() + 8 * 24 * 60 * 60 * 1000),
    });

    expect(await later({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } })).toEqual({
      ok: false,
      code: "INVALID_INVITATION",
    });
  });

  it("rechaza a un miembro desactivado: reactivar es una decisión del administrador", async () => {
    world.store.addMembership({ tenantId: "tenant-a", userId: "nuevo", roles: DOCTOR, status: "DEACTIVATED" });
    world.store.invitationRows.push({
      id: "invitation-x",
      tenantId: "tenant-a",
      email: "nuevo@example.com" as never,
      roles: ADMIN,
      doctor: null,
      status: "PENDING",
      expiresAt: new Date(NOW.getTime() + 1000),
      createdAt: NOW,
      tokenHash: "hash:token-x",
      createdByUserId: "admin-a",
    });

    expect(
      await world.acceptStaffInvitation({ token: "token-x", user: { id: "nuevo", email: "nuevo@example.com" } }),
    ).toEqual({ ok: false, code: "INVALID_INVITATION" });
  });

  it("una clínica suspendida no acepta invitaciones", async () => {
    await world.inviteStaff({ actor: ACTOR_A, email: "nuevo@example.com", roles: DOCTOR, doctor: PROFILE });
    world.store.addTenant({ id: "tenant-a", name: "Clínica A", status: "SUSPENDED" });

    expect(
      await world.acceptStaffInvitation({ token: "token-1", user: { id: "nuevo", email: "nuevo@example.com" } }),
    ).toEqual({ ok: false, code: "INVALID_INVITATION" });
  });
});
