import { beforeEach, describe, expect, it } from "vitest";

import { INVITATION_MAX_FAILED_ATTEMPTS } from "@/modules/users/domain/invitation";

import { TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

const INVITED_EMAIL = "dra.perez@example.com";
const PROOF = { licenseNumber: "MN-123", specialty: "Cardiología" };

let scenario: ReturnType<typeof createInvitationScenario>;
let token: string;
let account: { id: string; email: string; fullName: string };

beforeEach(async () => {
  scenario = createInvitationScenario();
  account = scenario.addAccount("doctor-1", INVITED_EMAIL, "Dra. Pérez");
  await scenario.createInvitation({
    actor: scenario.adminActor,
    kind: "DOCTOR",
    email: INVITED_EMAIL,
    licenseNumber: "MN123",
  });
  token = scenario.lastToken();
});

function accept(proof: Record<string, string> = PROOF, overrides: Partial<{ token: string; account: typeof account }> = {}) {
  return scenario.acceptInvitation({ token, account, proof, ...overrides });
}

describe("aceptar la invitación de un médico", () => {
  it("vincula a la persona como médico activo y consume el link", async () => {
    const result = await accept();

    expect(result).toMatchObject({
      status: "ACCEPTED",
      kind: "DOCTOR",
      tenantName: "Clínica del Sol",
      relationshipKind: "STAFF",
      assignedToDoctor: false,
    });
    expect(scenario.repo.staff.find((member) => member.userId === account.id)).toMatchObject({
      tenantId: TENANT_ID,
      status: "ACTIVE",
      isDoctor: true,
      isClinicAdmin: false,
      specialty: "Cardiología",
    });
    expect(scenario.repo.invitations[0]).toMatchObject({ status: "ACCEPTED", acceptedByUserId: account.id });
  });

  it("guarda la matrícula normalizada que cargó quien invitó", async () => {
    await accept({ licenseNumber: "m n.1-23", specialty: "Cardiología" });

    expect(scenario.repo.staff.find((member) => member.userId === account.id)?.licenseNumber).toBe("MN123");
  });

  it("acepta la matrícula con otro formato, espacios y minúsculas", async () => {
    expect((await accept({ licenseNumber: " mn 123 ", specialty: "Cardiología" })).status).toBe("ACCEPTED");
  });

  it("el mismo link no sirve una segunda vez", async () => {
    await accept();

    expect(await accept()).toEqual({ status: "INVALID" });
    expect(scenario.repo.staff.filter((member) => member.userId === account.id)).toHaveLength(1);
  });

  it("no modifica los datos de la cuenta", async () => {
    const before = structuredClone(scenario.repo.accounts.get(account.id));

    await accept();

    expect(scenario.repo.accounts.get(account.id)).toEqual(before);
  });

  it("rechaza el link de otra cuenta sin gastar sus intentos", async () => {
    const other = scenario.addAccount("other", "otra@example.com", "Otra");

    expect(await accept({ licenseNumber: "equivocada", specialty: "Cardiología" }, { account: other })).toEqual({
      status: "INVALID",
    });
    expect(scenario.repo.invitations[0]?.failedAttempts).toBe(0);
  });

  it.each([
    ["un token mal formado", "abc"],
    ["un token inexistente", "a".repeat(43)],
  ])("responde inválido con %s", async (description, badToken) => {
    expect(await accept(PROOF, { token: badToken })).toEqual({ status: "INVALID" });
  });

  it.each([
    ["sin matrícula", { specialty: "Cardiología" }],
    ["sin especialidad", { licenseNumber: "MN123" }],
    ["con una especialidad demasiado corta", { licenseNumber: "MN123", specialty: "C" }],
  ])("responde inválido %s", async (description, proof) => {
    expect(await accept(proof)).toEqual({ status: "INVALID" });
    expect(scenario.repo.invitations[0]?.failedAttempts).toBe(0);
  });
});

describe("el dato que se compara", () => {
  it("una matrícula incorrecta cuenta un intento y avisa cuántos quedan", async () => {
    const result = await accept({ licenseNumber: "OTRA", specialty: "Cardiología" });

    expect(result).toEqual({ status: "PROOF_MISMATCH", attemptsLeft: INVITATION_MAX_FAILED_ATTEMPTS - 1 });
    expect(scenario.repo.invitations[0]).toMatchObject({ status: "PENDING", failedAttempts: 1 });
    expect(scenario.repo.staff.some((member) => member.userId === account.id)).toBe(false);
  });

  it("con el quinto intento incorrecto el link queda invalidado", async () => {
    for (let attempt = 1; attempt < INVITATION_MAX_FAILED_ATTEMPTS; attempt += 1) {
      await accept({ licenseNumber: "OTRA", specialty: "Cardiología" });
    }

    expect(await accept({ licenseNumber: "OTRA", specialty: "Cardiología" })).toEqual({
      status: "PROOF_MISMATCH",
      attemptsLeft: 0,
    });
    expect(scenario.repo.invitations[0]).toMatchObject({ status: "REVOKED", endReason: "ATTEMPTS_EXCEEDED" });
    // Ni siquiera la matrícula correcta lo recupera.
    expect(await accept()).toEqual({ status: "INVALID" });
  });
});

describe("reglas del vínculo con la clínica", () => {
  it("si ya es médico de la clínica no duplica el vínculo y consume el link", async () => {
    scenario.addStaff(account.id, { isDoctor: true, licenseNumber: "MN123" });

    const result = await accept();

    expect(result).toEqual({ status: "ALREADY_MEMBER", tenantName: "Clínica del Sol" });
    expect(scenario.repo.staff.filter((member) => member.userId === account.id)).toHaveLength(1);
    expect(scenario.repo.invitations[0]?.status).toBe("ACCEPTED");
  });

  it("si su membresía está desactivada, no se reactiva y el link sigue sirviendo", async () => {
    scenario.addStaff(account.id, { isDoctor: true, status: "DEACTIVATED", licenseNumber: "MN123" });

    expect(await accept()).toEqual({ status: "CONFLICT", reason: "MEMBERSHIP_DEACTIVATED" });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");
    expect(scenario.repo.staff.find((member) => member.userId === account.id)?.status).toBe("DEACTIVATED");
  });

  it("un administrador sin rol de médico no cambia su membresía", async () => {
    const adminAccount = scenario.addAccount("admin-2", INVITED_EMAIL, "Admin y médica");
    scenario.repo.accounts.delete(account.id);
    scenario.addStaff(adminAccount.id, { isClinicAdmin: true });

    const result = await accept(PROOF, { account: adminAccount });

    expect(result).toEqual({ status: "CONFLICT", reason: "ROLE_CHANGE_NOT_SUPPORTED" });
    expect(scenario.repo.staff.find((member) => member.userId === adminAccount.id)).toMatchObject({
      isClinicAdmin: true,
      isDoctor: false,
    });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");
  });

  it("si ya es paciente de la clínica no puede ser médico en ella", async () => {
    scenario.repo.patients.push({
      patientId: "patient-record-1",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Dra. Pérez",
    });

    expect(await accept()).toEqual({ status: "CONFLICT", reason: "OTHER_RELATIONSHIP" });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");
    expect(scenario.repo.staff.some((member) => member.userId === account.id)).toBe(false);
  });

  it("si la matrícula pasó a ser de otro integrante, rechaza y deja el link sin consumir", async () => {
    const other = scenario.addAccount("doctor-2", "otro@example.com");
    scenario.addStaff(other.id, { isDoctor: true, licenseNumber: "MN123" });

    expect(await accept()).toEqual({ status: "CONFLICT", reason: "LICENSE_IN_USE" });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");
  });

  it("deja intacto el vínculo con otras clínicas", async () => {
    scenario.addStaff(account.id, { tenantId: "tenant-2", isDoctor: true, licenseNumber: "X1" });

    const result = await accept();

    expect(result.status).toBe("ACCEPTED");
    expect(scenario.repo.staff.filter((member) => member.userId === account.id)).toHaveLength(2);
    expect(scenario.repo.staff.find((member) => member.tenantId === "tenant-2")?.licenseNumber).toBe("X1");
  });
});

describe("aceptaciones simultáneas", () => {
  it("de dos aceptaciones a la vez del mismo link, solo una vincula", async () => {
    const results = await Promise.all([accept(), accept()]);

    expect(results.map((result) => result.status).sort()).toEqual(["ACCEPTED", "INVALID"]);
    expect(scenario.repo.staff.filter((member) => member.userId === account.id)).toHaveLength(1);
  });
});
