import { beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_TTL_MS } from "@/modules/users/domain/invitation";
import { MailDeliveryError } from "@/modules/users/domain/invitation-errors";
import { hashInvitationToken } from "@/modules/users/domain/invitation-token";

import { APP_BASE_URL, TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

const DOCTOR = { kind: "DOCTOR", email: "dra.perez@example.com", licenseNumber: "MN 123" } as const;

let scenario: ReturnType<typeof createInvitationScenario>;

beforeEach(() => {
  scenario = createInvitationScenario();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("generar la invitación de un médico", () => {
  it("guarda la invitación, envía el correo con el link y la marca como enviada", async () => {
    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result.status).toBe("SENT");
    expect(scenario.mailer.sent).toHaveLength(1);
    const [email] = scenario.mailer.sent;
    expect(email).toMatchObject({ to: "dra.perez@example.com", clinicName: "Clínica del Sol", kind: "DOCTOR" });
    expect(email?.link.startsWith(`${APP_BASE_URL}/invite/`)).toBe(true);
    expect(scenario.repo.invitations[0]).toMatchObject({ status: "PENDING", sentAt: scenario.now() });
  });

  it("guarda solo el hash del token y la matrícula normalizada", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    const stored = scenario.repo.invitations[0];
    const token = scenario.lastToken();
    expect(stored?.tokenHash).toBe(hashInvitationToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored).toMatchObject({
      tenantId: TENANT_ID,
      kind: "DOCTOR",
      licenseNumber: "MN123",
      documentNumber: null,
      assignToCreator: false,
      createdByMembershipId: scenario.adminMembershipId,
    });
  });

  it("vence a los 7 días de generarla", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(scenario.repo.invitations[0]?.expiresAt.getTime()).toBe(scenario.now().getTime() + INVITATION_TTL_MS);
  });

  it("normaliza el correo", async () => {
    await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR, email: "  Dra.Perez@Example.COM " });

    expect(scenario.mailer.sent[0]?.to).toBe("dra.perez@example.com");
  });

  it("si el correo falla deja la invitación guardada, sin marcar como enviada", async () => {
    scenario.mailer.failWith = new MailDeliveryError("UNAVAILABLE");

    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result).toMatchObject({ status: "SEND_FAILED", invitation: { email: "dra.perez@example.com", sentAt: null } });
    expect(scenario.repo.invitations).toHaveLength(1);
    expect(scenario.repo.invitations[0]?.sentAt).toBeNull();
  });

  it("reintentar tras un envío fallido reemplaza la invitación anterior", async () => {
    scenario.mailer.failWith = new MailDeliveryError("UNAVAILABLE");
    await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });
    scenario.mailer.failWith = null;

    const retry = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(retry.status).toBe("SENT");
    expect(scenario.repo.invitations.map((invitation) => invitation.status)).toEqual(["REVOKED", "PENDING"]);
  });

  it("no rechaza al médico que ya tiene una cuenta ni revela que la tiene", async () => {
    scenario.addAccount("doctor-1", "dra.perez@example.com");

    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result.status).toBe("SENT");
  });

  it("rechaza una matrícula que ya pertenece a otro integrante de la clínica", async () => {
    const other = scenario.addAccount("doctor-2", "otro@example.com");
    scenario.addStaff(other.id, { isDoctor: true, licenseNumber: "MN123" });

    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result).toEqual({ status: "CONFLICT", reason: "LICENSE_IN_USE" });
    expect(scenario.repo.invitations).toHaveLength(0);
    expect(scenario.mailer.sent).toHaveLength(0);
  });

  it("acepta una matrícula que ya es de la propia persona invitada", async () => {
    const same = scenario.addAccount("doctor-3", "dra.perez@example.com");
    scenario.addStaff(same.id, { isDoctor: true, licenseNumber: "MN123" });

    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result.status).toBe("SENT");
  });

  it("rechaza invitar como médico a quien ya es paciente de la clínica", async () => {
    const patient = scenario.addAccount("patient-1", "dra.perez@example.com");
    scenario.repo.patients.push({
      patientId: "patient-record-1",
      tenantId: TENANT_ID,
      userId: patient.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Paciente",
    });

    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    expect(result).toEqual({ status: "CONFLICT", reason: "ALREADY_PATIENT" });
  });
});

describe("permisos y datos de entrada", () => {
  it("rechaza al médico que intenta invitar a otro médico", async () => {
    const doctor = scenario.addAccount("doctor-9", "medico@example.com");
    const membershipId = scenario.addStaff(doctor.id, { isDoctor: true });

    await expect(
      scenario.createInvitation({
        actor: { tenantId: TENANT_ID, userId: doctor.id, membershipId, isClinicAdmin: false, isDoctor: true },
        ...DOCTOR,
      }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
    expect(scenario.repo.invitations).toHaveLength(0);
  });

  it.each([
    ["un correo inválido", { ...DOCTOR, email: "no-es-un-correo" }],
    ["una matrícula vacía", { ...DOCTOR, licenseNumber: " . " }],
    ["campos de paciente en una invitación de médico", { ...DOCTOR, documentNumber: "123" }],
    ["una matrícula ausente", { kind: "DOCTOR", email: "a@example.com" } as const],
  ])("rechaza %s", async (description, input) => {
    await expect(scenario.createInvitation({ actor: scenario.adminActor, ...input })).rejects.toMatchObject({
      name: "InvitationInputError",
    });
    expect(scenario.repo.invitations).toHaveLength(0);
  });

  it("todavía no atiende las invitaciones de pacientes", async () => {
    await expect(
      scenario.createInvitation({
        actor: scenario.adminActor,
        kind: "PATIENT",
        email: "a@example.com",
        documentType: "DNI",
        documentNumber: "30111222",
      }),
    ).rejects.toMatchObject({ name: "InvitationInputError" });
  });

  it("falla si la clínica del actor no existe", async () => {
    await expect(
      scenario.createInvitation({ actor: { ...scenario.adminActor, tenantId: "no-existe" }, ...DOCTOR }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
  });
});

describe("registros", () => {
  it("un envío fallido solo registra el nombre del error y su código", async () => {
    scenario.mailer.failWith = new MailDeliveryError("REJECTED");

    await scenario.createInvitation({ actor: scenario.adminActor, ...DOCTOR });

    const logged = vi
      .mocked(console.error)
      .mock.calls.map((call) => call.map(String).join(" "))
      .join("\n");
    expect(logged).toContain("MailDeliveryError");
    expect(logged).not.toContain("dra.perez@example.com");
    expect(logged).not.toContain("MN123");
    expect(logged).not.toContain("/invite/");
  });
});
