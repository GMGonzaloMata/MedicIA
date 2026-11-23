import { beforeEach, describe, expect, it } from "vitest";

import { createAssignPatient } from "@/modules/tenants/application/use-cases/assign-patient";
import { createListClinicPatients } from "@/modules/tenants/application/use-cases/list-clinic-patients";
import { createRegeneratePatientLinkCode } from "@/modules/tenants/application/use-cases/regenerate-patient-link-code";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";

import { createDeterministicSecretGenerator } from "../../../../support/in-memory/deterministic-secret-generator";
import { createInMemoryAssignmentRepository } from "../../../../support/in-memory/in-memory-assignment-repository";
import { createInMemoryClinicStore } from "../../../../support/in-memory/in-memory-clinic-store";
import { createInMemoryPatientRegistry } from "../../../../support/in-memory/in-memory-patient-registry-repository";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;
const ADMIN = { isClinicAdmin: true, isDoctor: false };
const DOCTOR = { isClinicAdmin: false, isDoctor: true };

const ACTOR_A: ClinicAdminActor = { tenantId: "tenant-a", userId: "admin-a", membershipId: "membership-admin-a" };
const ACTOR_B: ClinicAdminActor = { tenantId: "tenant-b", userId: "admin-b", membershipId: "membership-admin-b" };

function setup() {
  const clinic = createInMemoryClinicStore();
  clinic.addTenant({ id: "tenant-a", name: "Clínica A" });
  clinic.addTenant({ id: "tenant-b", name: "Clínica B" });
  clinic.addTenant({ id: "tenant-s", name: "Clínica suspendida", status: "SUSPENDED" });
  for (const id of ["admin-a", "admin-b", "doctor-a", "doctor-b", "admin-s"]) {
    clinic.addUser({ id, email: `${id}@example.com`, fullName: `Persona ${id}` });
  }
  const doctorA = clinic.addMembership({ tenantId: "tenant-a", userId: "doctor-a", roles: DOCTOR });
  const doctorB = clinic.addMembership({ tenantId: "tenant-b", userId: "doctor-b", roles: DOCTOR });
  const adminA = clinic.addMembership({ tenantId: "tenant-a", userId: "admin-a", roles: ADMIN });

  const registry = createInMemoryPatientRegistry(clinic);
  const assignments = createInMemoryAssignmentRepository(clinic, registry);
  const secrets = createDeterministicSecretGenerator();
  const now = () => NOW;

  return {
    clinic,
    registry,
    secrets,
    doctorA,
    doctorB,
    adminA,
    registerPatient: createRegisterPatient({ patients: registry.repository, staff: clinic.staff, secrets, now }),
    listClinicPatients: createListClinicPatients({ patients: registry.repository, now }),
    regeneratePatientLinkCode: createRegeneratePatientLinkCode({ patients: registry.repository, secrets, now }),
    assignPatient: createAssignPatient({ assignments }),
  };
}

let world: ReturnType<typeof setup>;

beforeEach(() => {
  world = setup();
});

const valid = { documentType: "DNI", documentNumber: "12.345.678" };

async function registerAna(actor = ACTOR_A) {
  const result = await world.registerPatient({ actor, ...valid });

  if (!result.ok) {
    throw new Error("No se pudo registrar al paciente de prueba.");
  }

  return result;
}

describe("registrar un paciente", () => {
  it("guarda el documento normalizado y devuelve el código en el formato de pantalla", async () => {
    const result = await registerAna();

    expect(result.linkCode).toMatch(/^[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    expect(world.registry.patients[0]).toMatchObject({
      tenantId: "tenant-a",
      documentNumber: "12345678",
      // La base no permite un nombre en un paciente pendiente: se completa al vincular la cuenta.
      fullName: null,
      status: "PENDING",
    });
  });

  it("guarda solo el resumen del código y vence a los 7 días", async () => {
    const result = await registerAna();
    const stored = world.registry.codes[0];

    expect(stored?.codeHash).toBe(`hash:${result.linkCode.replace("-", "")}`);
    expect(JSON.stringify(world.registry.codes)).not.toContain(result.linkCode);
    expect(stored?.expiresAt.getTime()).toBe(NOW.getTime() + 7 * DAY_MS);
    expect(stored?.status).toBe("ACTIVE");
  });

  it("rechaza un documento repetido en la clínica, aunque se escriba distinto", async () => {
    await registerAna();

    expect(await world.registerPatient({ actor: ACTOR_A, ...valid, documentNumber: "12345678" })).toEqual({
      ok: false,
      code: "DUPLICATE_PATIENT",
    });
    expect(world.registry.patients).toHaveLength(1);
  });

  it("permite el mismo documento en otra clínica", async () => {
    await registerAna();

    expect((await world.registerPatient({ actor: ACTOR_B, ...valid })).ok).toBe(true);
  });

  it.each([
    { $name: "tipo de documento inválido", input: { documentType: "CUIT" } },
    { $name: "documento vacío", input: { documentNumber: " . - " } },
    { $name: "documento demasiado corto", input: { documentNumber: "123" } },
  ])("rechaza $name", async ({ input }) => {
    expect(await world.registerPatient({ actor: ACTOR_A, ...valid, ...input })).toEqual({
      ok: false,
      code: "INVALID_INPUT",
    });
    expect(world.registry.patients).toHaveLength(0);
  });

  it("no registra pacientes en una clínica suspendida", async () => {
    const actor = { tenantId: "tenant-s", userId: "admin-s", membershipId: "membership-admin-s" };

    expect(await world.registerPatient({ actor, ...valid })).toEqual({ ok: false, code: "NOT_FOUND" });
  });
});

describe("generar un código nuevo", () => {
  it("reemplaza al activo y devuelve el nuevo", async () => {
    const first = await registerAna();
    const patientId = first.patientId;

    const result = await world.regeneratePatientLinkCode({ actor: ACTOR_A, patientId });

    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.linkCode).not.toBe(first.linkCode);
    expect(world.registry.codes.map((code) => code.status)).toEqual(["REPLACED", "ACTIVE"]);
  });

  it("rechaza a un paciente que ya vinculó su cuenta", async () => {
    const { patientId } = await registerAna();
    const patient = world.registry.patients.find((row) => row.id === patientId);
    if (patient) patient.status = "LINKED";

    expect(await world.regeneratePatientLinkCode({ actor: ACTOR_A, patientId })).toEqual({
      ok: false,
      code: "ALREADY_LINKED",
    });
  });

  it("trata a un paciente de otra clínica o inexistente como inexistente", async () => {
    const { patientId } = await registerAna();

    expect(await world.regeneratePatientLinkCode({ actor: ACTOR_B, patientId })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(await world.regeneratePatientLinkCode({ actor: ACTOR_A, patientId: "no-existe" })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(world.registry.codes.map((code) => code.status)).toEqual(["ACTIVE"]);
  });
});

describe("asignar un paciente a un médico", () => {
  it("crea la asignación con el actor como autor", async () => {
    const { patientId } = await registerAna();

    const result = await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id });

    expect(result).toMatchObject({ ok: true });
    expect(world.registry.assignments).toEqual([
      expect.objectContaining({ tenantId: "tenant-a", patientId, membershipId: world.doctorA.id, createdByUserId: "admin-a", endedAt: null }),
    ]);
  });

  it("rechaza una segunda asignación vigente al mismo médico", async () => {
    const { patientId } = await registerAna();
    await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id });

    expect(await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id })).toEqual({
      ok: false,
      code: "ALREADY_ASSIGNED",
    });
    expect(world.registry.assignments).toHaveLength(1);
  });

  it("rechaza a quien no es médico", async () => {
    const { patientId } = await registerAna();

    expect(await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.adminA.id })).toEqual({
      ok: false,
      code: "NOT_A_DOCTOR",
    });
  });

  it("rechaza a un médico desactivado", async () => {
    const { patientId } = await registerAna();
    world.doctorA.status = "DEACTIVATED";

    expect(await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id })).toEqual({
      ok: false,
      code: "DOCTOR_DEACTIVATED",
    });
  });

  it("trata a un médico o paciente de otra clínica como inexistente", async () => {
    const { patientId } = await registerAna();
    const otherClinicPatient = await registerAna(ACTOR_B);

    expect(await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorB.id })).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });
    expect(
      await world.assignPatient({ actor: ACTOR_A, patientId: otherClinicPatient.patientId, membershipId: world.doctorA.id }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(world.registry.assignments).toHaveLength(0);
  });
});

describe("listar los pacientes de la clínica", () => {
  it("devuelve solo los de la clínica del actor, con el médico asignado y el estado del código", async () => {
    const { patientId } = await registerAna();
    await registerAna(ACTOR_B);
    await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id });

    const patients = await world.listClinicPatients({ actor: ACTOR_A });

    expect(patients).toHaveLength(1);
    expect(patients[0]).toMatchObject({
      id: patientId,
      fullName: null,
      documentNumber: "12345678",
      status: "PENDING",
      linkCodeState: "active",
      assignments: [{ doctorName: "Persona doctor-a", doctorStatus: "ACTIVE" }],
    });
  });

  it("muestra la asignación de un médico desactivado y un código vencido", async () => {
    const { patientId } = await registerAna();
    await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA.id });
    world.doctorA.status = "DEACTIVATED";
    const code = world.registry.codes[0];
    if (code) code.expiresAt = new Date(NOW.getTime() - DAY_MS);

    const [patient] = await world.listClinicPatients({ actor: ACTOR_A });

    expect(patient?.assignments[0]?.doctorStatus).toBe("DEACTIVATED");
    expect(patient?.linkCodeState).toBe("expired");
  });

  it("no devuelve el código ni su resumen", async () => {
    await registerAna();

    expect(JSON.stringify(await world.listClinicPatients({ actor: ACTOR_A }))).not.toMatch(/hash|latestCode/);
  });
});
