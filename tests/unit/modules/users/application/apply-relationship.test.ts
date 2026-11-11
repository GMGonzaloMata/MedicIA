import { beforeEach, describe, expect, it } from "vitest";

import {
  applyDoctorRelationship,
  applyPatientRelationship,
} from "@/modules/users/application/use-cases/apply-relationship";

import {
  InMemoryInvitationRepository,
  type StoredPatient,
  type StoredStaff,
} from "../../../../support/in-memory/in-memory-invitation-repository";

const TENANT = "clinic-a";
const NOW = new Date("2026-11-11T12:00:00Z");
const ACCOUNT = { id: "user-1", fullName: "Persona Uno" };

let repo: InMemoryInvitationRepository;

beforeEach(() => {
  repo = new InMemoryInvitationRepository();
});

function addStaff(overrides: Partial<StoredStaff> = {}): StoredStaff {
  const staff: StoredStaff = {
    membershipId: `membership-${repo.staff.length + 1}`,
    tenantId: TENANT,
    userId: "someone",
    status: "ACTIVE",
    isClinicAdmin: false,
    isDoctor: true,
    licenseNumber: null,
    specialty: null,
    ...overrides,
  };

  repo.staff.push(staff);

  return staff;
}

function addPatient(overrides: Partial<StoredPatient> = {}): StoredPatient {
  const patient: StoredPatient = {
    patientId: `patient-${repo.patients.length + 1}`,
    tenantId: TENANT,
    userId: null,
    status: "LINKED",
    documentType: "DNI",
    documentNumber: "30111222",
    fullName: null,
    ...overrides,
  };

  repo.patients.push(patient);

  return patient;
}

function doctor(input: { licenseNumber?: string; specialty?: string } = {}) {
  return repo.runAcceptance(ACCOUNT.id, (tx) =>
    applyDoctorRelationship(tx, {
      tenantId: TENANT,
      account: ACCOUNT,
      licenseNumber: input.licenseNumber ?? "mn 123",
      specialty: input.specialty ?? "Cardiología",
    }),
  );
}

function patient(input: { documentNumber?: string; assignTo?: { membershipId: string; createdByUserId: string } | null } = {}) {
  return repo.runAcceptance(ACCOUNT.id, (tx) =>
    applyPatientRelationship(tx, {
      tenantId: TENANT,
      account: ACCOUNT,
      documentType: "DNI",
      documentNumber: input.documentNumber ?? "30.111.222",
      assignTo: input.assignTo ?? null,
      now: NOW,
    }),
  );
}

describe("vínculo de médico", () => {
  it("crea la membresía con la matrícula normalizada", async () => {
    const result = await doctor();

    expect(result).toMatchObject({ status: "LINKED", kind: "DOCTOR", assignmentCreated: false });
    expect(repo.staff[0]).toMatchObject({ userId: ACCOUNT.id, licenseNumber: "MN123", specialty: "Cardiología" });
  });

  it("no cambia un médico que ya pertenece", async () => {
    const existing = addStaff({ userId: ACCOUNT.id, licenseNumber: "MN123" });

    const result = await doctor();

    expect(result).toEqual({
      status: "ALREADY_MEMBER",
      kind: "DOCTOR",
      relationshipId: existing.membershipId,
      assignmentCreated: false,
    });
    expect(repo.staff).toHaveLength(1);
  });

  it("no le suma el rol de médico a un administrador", async () => {
    addStaff({ userId: ACCOUNT.id, isClinicAdmin: true, isDoctor: false });

    await expect(doctor()).rejects.toMatchObject({ reason: "ROLE_CHANGE_NOT_SUPPORTED" });
  });

  it("rechaza una membresía desactivada", async () => {
    addStaff({ userId: ACCOUNT.id, status: "DEACTIVATED" });

    await expect(doctor()).rejects.toMatchObject({ reason: "MEMBERSHIP_DEACTIVATED" });
  });

  it("rechaza a quien ya es paciente de la clínica", async () => {
    addPatient({ userId: ACCOUNT.id });

    await expect(doctor()).rejects.toMatchObject({ reason: "OTHER_RELATIONSHIP" });
  });

  it("rechaza una matrícula que ya usa otra cuenta", async () => {
    addStaff({ userId: "other", licenseNumber: "MN123" });

    await expect(doctor()).rejects.toMatchObject({ reason: "LICENSE_IN_USE" });
    expect(repo.staff).toHaveLength(1);
  });
});

describe("vínculo de paciente", () => {
  it("crea el registro vinculado con el documento normalizado y sin asignación", async () => {
    const result = await patient();

    expect(result).toMatchObject({ status: "LINKED", kind: "PATIENT", assignmentCreated: false });
    expect(repo.patients[0]).toMatchObject({ userId: ACCOUNT.id, status: "LINKED", documentNumber: "30111222" });
    expect(repo.assignments).toHaveLength(0);
  });

  it("reutiliza el registro de un paciente revocado", async () => {
    const revoked = addPatient({ userId: ACCOUNT.id, status: "REVOKED" });

    const result = await patient();

    expect(result).toMatchObject({ status: "LINKED", relationshipId: revoked.patientId });
    expect(repo.patients).toHaveLength(1);
    expect(repo.patients[0]?.status).toBe("LINKED");
  });

  it("vincula el registro pendiente que ya tenía ese documento", async () => {
    const pending = addPatient({ userId: null, status: "PENDING" });

    const result = await patient();

    expect(result).toMatchObject({ status: "LINKED", relationshipId: pending.patientId });
    expect(repo.patients[0]).toMatchObject({ userId: ACCOUNT.id, status: "LINKED" });
  });

  it("rechaza un documento que ya usa otra cuenta", async () => {
    addPatient({ userId: "other" });

    await expect(patient()).rejects.toMatchObject({ reason: "DOCUMENT_IN_USE" });
  });

  it("rechaza a quien ya es personal de la clínica", async () => {
    addStaff({ userId: ACCOUNT.id });

    await expect(patient()).rejects.toMatchObject({ reason: "OTHER_RELATIONSHIP" });
  });

  it("asigna al médico y informa que la asignación se creó", async () => {
    const result = await patient({ assignTo: { membershipId: "membership-9", createdByUserId: "doctor-user" } });

    expect(result).toMatchObject({ status: "LINKED", assignmentCreated: true });
    expect(repo.assignments).toHaveLength(1);
  });

  it("a un paciente que ya pertenecía solo le agrega la asignación que faltaba, sin duplicarla", async () => {
    const existing = addPatient({ userId: ACCOUNT.id });
    const assignTo = { membershipId: "membership-9", createdByUserId: "doctor-user" };

    const first = await patient({ assignTo });
    const second = await patient({ assignTo });

    expect(first).toMatchObject({ status: "ALREADY_MEMBER", relationshipId: existing.patientId, assignmentCreated: true });
    expect(second).toMatchObject({ status: "ALREADY_MEMBER", assignmentCreated: false });
    expect(repo.assignments).toHaveLength(1);
  });
});
