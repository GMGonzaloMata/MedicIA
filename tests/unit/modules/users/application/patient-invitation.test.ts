import { beforeEach, describe, expect, it, vi } from "vitest";

import { INVITATION_MAX_FAILED_ATTEMPTS } from "@/modules/users/domain/invitation";

import { TENANT_ID, createInvitationScenario } from "../../../../support/invitation-scenario";

const PATIENT_EMAIL = "paciente@example.com";
const PATIENT = { kind: "PATIENT", email: PATIENT_EMAIL, documentType: "DNI", documentNumber: "30.111.222" } as const;
const PROOF = { documentType: "DNI", documentNumber: "30111222" } as const;

let scenario: ReturnType<typeof createInvitationScenario>;

beforeEach(() => {
  scenario = createInvitationScenario();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("invitar a un paciente", () => {
  it("el administrador invita con el documento normalizado y sin asignar médico", async () => {
    const result = await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT });

    expect(result.status).toBe("SENT");
    expect(scenario.mailer.sent[0]).toMatchObject({ to: PATIENT_EMAIL, kind: "PATIENT" });
    expect(scenario.repo.invitations[0]).toMatchObject({
      kind: "PATIENT",
      documentType: "DNI",
      documentNumber: "30111222",
      licenseNumber: null,
      assignToCreator: false,
    });
  });

  it("el médico invita y el link queda para asignarlo a ese médico", async () => {
    const doctor = scenario.addDoctor();

    const result = await scenario.createInvitation({ actor: doctor.actor, ...PATIENT });

    expect(result.status).toBe("SENT");
    expect(scenario.repo.invitations[0]).toMatchObject({
      assignToCreator: true,
      createdByMembershipId: doctor.membershipId,
      createdByUserId: doctor.account.id,
    });
  });

  it("quien es administrador y médico a la vez también asigna", async () => {
    const both = scenario.addDoctor("both-1", "ambos@clinica.example");

    await scenario.createInvitation({ actor: { ...both.actor, isClinicAdmin: true }, ...PATIENT });

    expect(scenario.repo.invitations[0]?.assignToCreator).toBe(true);
  });

  it("un médico que no es administrador no invita médicos", async () => {
    const doctor = scenario.addDoctor();

    await expect(
      scenario.createInvitation({ actor: doctor.actor, kind: "DOCTOR", email: "otro@example.com", licenseNumber: "MN9" }),
    ).rejects.toMatchObject({ name: "InvitationForbiddenError" });
    expect(scenario.repo.invitations).toHaveLength(0);
  });

  it.each([
    ["sin documento", { kind: "PATIENT", email: PATIENT_EMAIL } as const],
    ["con la matrícula de un médico", { ...PATIENT, licenseNumber: "MN1" }],
    ["con un documento vacío", { ...PATIENT, documentNumber: " - " }],
  ])("rechaza %s", async (description, input) => {
    await expect(scenario.createInvitation({ actor: scenario.adminActor, ...input })).rejects.toMatchObject({
      name: "InvitationInputError",
    });
  });

  it("rechaza al correo que ya es personal de la clínica", async () => {
    const staff = scenario.addAccount("staff-1", PATIENT_EMAIL);
    scenario.addStaff(staff.id, { isDoctor: true, licenseNumber: "MN1" });

    expect(await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT })).toEqual({
      status: "CONFLICT",
      reason: "ALREADY_STAFF",
    });
    expect(scenario.mailer.sent).toHaveLength(0);
  });

  it("rechaza un documento que ya es de otra cuenta de la clínica", async () => {
    const other = scenario.addAccount("other-1", "otra@example.com");
    scenario.repo.patients.push({
      patientId: "p-other",
      tenantId: TENANT_ID,
      userId: other.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Otra",
    });

    expect(await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT })).toEqual({
      status: "CONFLICT",
      reason: "DOCUMENT_IN_USE",
    });
  });

  it("acepta el documento de un paciente pendiente, sin cuenta, o de la propia persona", async () => {
    scenario.repo.patients.push({
      patientId: "p-pending",
      tenantId: TENANT_ID,
      userId: null,
      status: "PENDING",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: null,
    });
    expect((await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT })).status).toBe("SENT");

    const own = scenario.addAccount("own-1", PATIENT_EMAIL);
    scenario.repo.patients[0]!.userId = own.id;
    scenario.repo.patients[0]!.status = "REVOKED";

    expect((await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT })).status).toBe("SENT");
  });
});

describe("aceptar la invitación de un paciente", () => {
  async function invite(actor = scenario.adminActor) {
    const account = scenario.addAccount("patient-user", PATIENT_EMAIL, "Paula Paciente");
    await scenario.createInvitation({ actor, ...PATIENT });

    return { account, token: scenario.lastToken() };
  }

  it("crea el paciente vinculado con el nombre de la cuenta y el documento del link, sin asignar médico", async () => {
    const { account, token } = await invite();

    const result = await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({
      status: "ACCEPTED",
      kind: "PATIENT",
      relationshipKind: "PATIENT",
      assignedToDoctor: false,
    });
    expect(scenario.repo.patients).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: account.id,
        status: "LINKED",
        documentType: "DNI",
        documentNumber: "30111222",
        fullName: "Paula Paciente",
      }),
    ]);
    expect(scenario.repo.assignments).toHaveLength(0);
    expect(scenario.repo.patients.some((patient) => patient.status === "PENDING")).toBe(false);
  });

  it("acepta el documento con otro formato", async () => {
    const { account, token } = await invite();

    expect(
      (await scenario.acceptInvitation({ token, account, proof: { documentType: "DNI", documentNumber: " 30 111-222 " } }))
        .status,
    ).toBe("ACCEPTED");
  });

  it("un documento incorrecto o de otro tipo cuenta un intento", async () => {
    const { account, token } = await invite();

    expect(
      await scenario.acceptInvitation({ token, account, proof: { documentType: "DNI", documentNumber: "99999999" } }),
    ).toEqual({ status: "PROOF_MISMATCH", attemptsLeft: INVITATION_MAX_FAILED_ATTEMPTS - 1 });
    expect(
      await scenario.acceptInvitation({ token, account, proof: { documentType: "PASSPORT", documentNumber: "30111222" } }),
    ).toEqual({ status: "PROOF_MISMATCH", attemptsLeft: INVITATION_MAX_FAILED_ATTEMPTS - 2 });
    expect(scenario.repo.patients).toHaveLength(0);
  });

  it("responde inválido si faltan el tipo o el número de documento", async () => {
    const { account, token } = await invite();

    expect(await scenario.acceptInvitation({ token, account, proof: { documentNumber: "30111222" } })).toEqual({
      status: "INVALID",
    });
    expect(await scenario.acceptInvitation({ token, account, proof: { licenseNumber: "MN1", specialty: "Cardiología" } })).toEqual({
      status: "INVALID",
    });
  });

  it("reutiliza el registro revocado de la persona, conservando su identidad", async () => {
    const { account, token } = await invite();
    scenario.repo.patients.push({
      patientId: "p-revoked",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "REVOKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Nombre viejo",
    });

    const result = await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipId: "p-revoked" });
    expect(scenario.repo.patients).toEqual([
      expect.objectContaining({ patientId: "p-revoked", status: "LINKED", fullName: "Paula Paciente" }),
    ]);
  });

  it("reutiliza el registro pendiente sin cuenta que ya tenía ese documento", async () => {
    const { account, token } = await invite();
    scenario.repo.patients.push({
      patientId: "p-pending",
      tenantId: TENANT_ID,
      userId: null,
      status: "PENDING",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: null,
    });

    const result = await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", relationshipId: "p-pending" });
    expect(scenario.repo.patients).toHaveLength(1);
    expect(scenario.repo.patients[0]).toMatchObject({ userId: account.id, status: "LINKED" });
  });

  it("si ya es paciente con ese documento no se duplica y el link se consume", async () => {
    const { account, token } = await invite();
    scenario.repo.patients.push({
      patientId: "p-linked",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Paula",
    });

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "ALREADY_MEMBER",
      tenantName: "Clínica del Sol",
    });
    expect(scenario.repo.patients).toHaveLength(1);
    expect(scenario.repo.invitations[0]?.status).toBe("ACCEPTED");
  });

  it("rechaza el documento de otra cuenta y el de quien ya tiene un registro con otro documento", async () => {
    const { account, token } = await invite();
    const other = scenario.addAccount("other-2", "otra@example.com");
    scenario.repo.patients.push({
      patientId: "p-other",
      tenantId: TENANT_ID,
      userId: other.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Otra",
    });

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "CONFLICT",
      reason: "DOCUMENT_IN_USE",
    });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");

    scenario.repo.patients.splice(0, 1, {
      patientId: "p-mine",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "55555555",
      fullName: "Paula",
    });

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "CONFLICT",
      reason: "DOCUMENT_IN_USE",
    });
  });

  it("con una membresía de personal en la clínica no se vuelve paciente", async () => {
    const { account, token } = await invite();
    scenario.addStaff(account.id, { isDoctor: true, licenseNumber: "MN5" });

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "CONFLICT",
      reason: "OTHER_RELATIONSHIP",
    });
    expect(scenario.repo.patients).toHaveLength(0);
  });

  it("una membresía de personal desactivada tampoco permite ser paciente", async () => {
    const { account, token } = await invite();
    scenario.addStaff(account.id, { isDoctor: true, status: "DEACTIVATED", licenseNumber: "MN5" });

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({
      status: "CONFLICT",
      reason: "OTHER_RELATIONSHIP",
    });
  });
});

describe("la asignación al médico que invita", () => {
  async function invitedByDoctor() {
    const doctor = scenario.addDoctor();
    const account = scenario.addAccount("patient-user", PATIENT_EMAIL, "Paula Paciente");
    await scenario.createInvitation({ actor: doctor.actor, ...PATIENT });

    return { doctor, account, token: scenario.lastToken() };
  }

  it("al aceptar crea la asignación con el médico que invitó", async () => {
    const { doctor, account, token } = await invitedByDoctor();

    const result = await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", assignedToDoctor: true });
    expect(scenario.repo.assignments).toEqual([
      expect.objectContaining({
        tenantId: TENANT_ID,
        membershipId: doctor.membershipId,
        createdByUserId: doctor.account.id,
        endedAt: null,
      }),
    ]);
  });

  it("no duplica una asignación activa y conserva las de otros médicos", async () => {
    const { doctor, account, token } = await invitedByDoctor();
    scenario.repo.patients.push({
      patientId: "p-linked",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Paula",
    });
    scenario.repo.assignments.push(
      { tenantId: TENANT_ID, membershipId: "otro-medico", patientId: "p-linked", createdByUserId: "x", endedAt: null },
      { tenantId: TENANT_ID, membershipId: doctor.membershipId, patientId: "p-linked", createdByUserId: "x", endedAt: null },
    );

    const result = await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(result.status).toBe("ALREADY_MEMBER");
    expect(scenario.repo.assignments).toHaveLength(2);
  });

  it("si el paciente ya pertenecía sin asignación, igualmente se la agrega y conserva las de otros médicos", async () => {
    const { doctor, account, token } = await invitedByDoctor();
    scenario.repo.patients.push({
      patientId: "p-linked",
      tenantId: TENANT_ID,
      userId: account.id,
      status: "LINKED",
      documentType: "DNI",
      documentNumber: "30111222",
      fullName: "Paula",
    });
    scenario.repo.assignments.push({
      tenantId: TENANT_ID,
      membershipId: "otro-medico",
      patientId: "p-linked",
      createdByUserId: "x",
      endedAt: null,
    });

    await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(scenario.repo.assignments.map((assignment) => assignment.membershipId).sort()).toEqual(
      ["otro-medico", doctor.membershipId].sort(),
    );
  });

  it("si quien invitó dejó de ser médico activo, el link no sirve y no se consume", async () => {
    const { doctor, account, token } = await invitedByDoctor();
    const membership = scenario.repo.staff.find((member) => member.membershipId === doctor.membershipId);
    if (membership) {
      membership.isDoctor = false;
      membership.isClinicAdmin = true;
    }

    expect(await scenario.acceptInvitation({ token, account, proof: PROOF })).toEqual({ status: "INVALID" });
    expect(scenario.repo.invitations[0]?.status).toBe("PENDING");
    expect(scenario.repo.patients).toHaveLength(0);
    expect(scenario.repo.assignments).toHaveLength(0);
  });

  it("un conflicto no deja la asignación a medias", async () => {
    const { account, token } = await invitedByDoctor();
    scenario.addStaff(account.id, { isDoctor: true, licenseNumber: "MN5" });

    await scenario.acceptInvitation({ token, account, proof: PROOF });

    expect(scenario.repo.assignments).toHaveLength(0);
  });

  it("un paciente invitado por un administrador que no es médico queda sin asignaciones", async () => {
    const account = scenario.addAccount("patient-user", PATIENT_EMAIL, "Paula");
    await scenario.createInvitation({ actor: scenario.adminActor, ...PATIENT });

    const result = await scenario.acceptInvitation({ token: scenario.lastToken(), account, proof: PROOF });

    expect(result).toMatchObject({ status: "ACCEPTED", assignedToDoctor: false });
    expect(scenario.repo.assignments).toHaveLength(0);
  });
});
