import { beforeEach, describe, expect, it } from "vitest";

import { createAssignPatient } from "@/modules/tenants/application/use-cases/assign-patient";
import { createDeactivateMember } from "@/modules/tenants/application/use-cases/deactivate-member";
import { createEndAssignment } from "@/modules/tenants/application/use-cases/end-assignment";
import { createGetAttendingDoctorAvailability } from "@/modules/tenants/application/use-cases/get-attending-doctor-availability";
import { createReactivateMember } from "@/modules/tenants/application/use-cases/reactivate-member";
import { createRegisterPatient } from "@/modules/tenants/application/use-cases/register-patient";
import type { ClinicAdminActor } from "@/modules/tenants/domain/clinic-admin-actor";
import { decideDeactivation, deriveDoctorAvailability } from "@/modules/tenants/domain/member-lifecycle";

import { createDeterministicSecretGenerator } from "../../../../support/in-memory/deterministic-secret-generator";
import { createInMemoryAssignmentRepository } from "../../../../support/in-memory/in-memory-assignment-repository";
import { createInMemoryClinicStore } from "../../../../support/in-memory/in-memory-clinic-store";
import { createInMemoryPatientRegistry } from "../../../../support/in-memory/in-memory-patient-registry-repository";

const NOW = new Date("2026-11-23T12:00:00.000Z");
const ADMIN = { isClinicAdmin: true, isDoctor: false };
const DOCTOR = { isClinicAdmin: false, isDoctor: true };

const ACTOR_A: ClinicAdminActor = { tenantId: "tenant-a", userId: "admin-a", membershipId: "membership-1" };
const ACTOR_B: ClinicAdminActor = { tenantId: "tenant-b", userId: "admin-b", membershipId: "membership-2" };

function setup() {
  const clinic = createInMemoryClinicStore();
  clinic.addTenant({ id: "tenant-a", name: "Clínica A" });
  clinic.addTenant({ id: "tenant-b", name: "Clínica B" });
  for (const id of ["admin-a", "admin-a2", "admin-b", "doctor-a", "doctor-a2", "doctor-b"]) {
    clinic.addUser({ id, email: `${id}@example.com`, fullName: `Persona ${id}` });
  }
  const adminA = clinic.addMembership({ tenantId: "tenant-a", userId: "admin-a", roles: ADMIN });
  const adminA2 = clinic.addMembership({ tenantId: "tenant-a", userId: "admin-a2", roles: ADMIN });
  const adminB = clinic.addMembership({ tenantId: "tenant-b", userId: "admin-b", roles: ADMIN });
  const doctorA = clinic.addMembership({ tenantId: "tenant-a", userId: "doctor-a", roles: DOCTOR });
  const doctorA2 = clinic.addMembership({ tenantId: "tenant-a", userId: "doctor-a2", roles: DOCTOR });
  const doctorB = clinic.addMembership({ tenantId: "tenant-b", userId: "doctor-b", roles: DOCTOR });

  const registry = createInMemoryPatientRegistry(clinic);
  const assignments = createInMemoryAssignmentRepository(clinic, registry);
  const secrets = createDeterministicSecretGenerator();
  const now = () => NOW;

  return {
    clinic,
    registry,
    adminA,
    adminA2,
    adminB,
    doctorA,
    doctorA2,
    doctorB,
    registerPatient: createRegisterPatient({ patients: registry.repository, staff: clinic.staff, secrets, now }),
    assignPatient: createAssignPatient({ assignments }),
    deactivateMember: createDeactivateMember({ staff: clinic.staff, now }),
    reactivateMember: createReactivateMember({ staff: clinic.staff }),
    endAssignment: createEndAssignment({ assignments, now }),
    availability: createGetAttendingDoctorAvailability({ assignments }),
  };
}

let world: ReturnType<typeof setup>;

beforeEach(() => {
  world = setup();
});

async function assignedPatient(doctorMembershipId = world.doctorA.id) {
  const patient = await world.registerPatient({ actor: ACTOR_A, documentType: "DNI", documentNumber: "12345678" });

  if (!patient.ok) {
    throw new Error("No se pudo registrar al paciente de prueba.");
  }

  const assignment = await world.assignPatient({ actor: ACTOR_A, patientId: patient.patientId, membershipId: doctorMembershipId });

  if (!assignment.ok) {
    throw new Error("No se pudo asignar al paciente de prueba.");
  }

  return { patientId: patient.patientId, assignmentId: assignment.assignmentId };
}

describe("reglas de dominio", () => {
  it.each([
    { $name: "un médico activo", roles: DOCTOR, status: "ACTIVE", admins: 1, expected: "ok" },
    { $name: "un administrador con otro administrador activo", roles: ADMIN, status: "ACTIVE", admins: 2, expected: "ok" },
    { $name: "el único administrador activo", roles: ADMIN, status: "ACTIVE", admins: 1, expected: "last-admin" },
    { $name: "un miembro ya desactivado", roles: DOCTOR, status: "DEACTIVATED", admins: 1, expected: "already-deactivated" },
  ] as const)("desactivar $name es $expected", ({ roles, status, admins, expected }) => {
    expect(decideDeactivation({ member: { roles, status }, activeAdminCount: admins })).toBe(expected);
  });

  it.each([
    { $name: "sin asignaciones", statuses: [], expected: "NO_ASSIGNMENT" },
    { $name: "con un médico activo", statuses: ["ACTIVE"], expected: "AVAILABLE" },
    { $name: "con todos los médicos desactivados", statuses: ["DEACTIVATED", "DEACTIVATED"], expected: "UNAVAILABLE" },
    { $name: "con uno activo y otro desactivado", statuses: ["DEACTIVATED", "ACTIVE"], expected: "AVAILABLE" },
  ] as const)("disponibilidad $name es $expected", ({ statuses, expected }) => {
    expect(deriveDoctorAvailability(statuses)).toBe(expected);
  });
});

describe("desactivar un miembro", () => {
  it("lo desactiva, guarda quién y cuándo, y no toca las asignaciones", async () => {
    await assignedPatient();

    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id })).toEqual({ ok: true });

    expect(world.doctorA).toMatchObject({ status: "DEACTIVATED", deactivatedAt: NOW, deactivatedByUserId: "admin-a" });
    expect(world.registry.assignments).toHaveLength(1);
    expect(world.registry.assignments[0]?.endedAt).toBeNull();
  });

  it("rechaza al único administrador activo", async () => {
    await world.deactivateMember({ actor: ACTOR_A, membershipId: world.adminA2.id });

    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: world.adminA.id })).toEqual({
      ok: false,
      code: "LAST_ADMIN",
    });
    expect(world.adminA.status).toBe("ACTIVE");
  });

  it("permite desactivar a un administrador si queda otro activo", async () => {
    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: world.adminA2.id })).toEqual({ ok: true });
  });

  it("rechaza desactivar dos veces", async () => {
    await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id });

    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id })).toEqual({
      ok: false,
      code: "ALREADY_DEACTIVATED",
    });
  });

  it("trata a un miembro de otra clínica o inexistente como inexistente", async () => {
    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorB.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await world.deactivateMember({ actor: ACTOR_A, membershipId: "no-existe" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(world.doctorB.status).toBe("ACTIVE");
  });
});

describe("reactivar un miembro", () => {
  it("lo reactiva y limpia quién y cuándo lo desactivó", async () => {
    await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id });

    expect(await world.reactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id })).toEqual({ ok: true });

    expect(world.doctorA).toMatchObject({ status: "ACTIVE", deactivatedAt: null, deactivatedByUserId: null });
  });

  it("rechaza reactivar a quien ya está activo", async () => {
    expect(await world.reactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id })).toEqual({
      ok: false,
      code: "ALREADY_ACTIVE",
    });
  });

  it("trata a un miembro de otra clínica como inexistente", async () => {
    await world.deactivateMember({ actor: ACTOR_B, membershipId: world.doctorB.id });

    expect(await world.reactivateMember({ actor: ACTOR_A, membershipId: world.doctorB.id })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(world.doctorB.status).toBe("DEACTIVATED");
  });
});

describe("terminar una asignación", () => {
  it("guarda la fecha y quien la terminó, y conserva la fila", async () => {
    const { assignmentId } = await assignedPatient();

    expect(await world.endAssignment({ actor: ACTOR_A, assignmentId })).toEqual({ ok: true });

    expect(world.registry.assignments).toEqual([expect.objectContaining({ id: assignmentId, endedAt: NOW, endedByUserId: "admin-a" })]);
  });

  it("rechaza terminar dos veces", async () => {
    const { assignmentId } = await assignedPatient();
    await world.endAssignment({ actor: ACTOR_A, assignmentId });

    expect(await world.endAssignment({ actor: ACTOR_A, assignmentId })).toEqual({ ok: false, code: "ALREADY_ENDED" });
  });

  it("trata una asignación de otra clínica o inexistente como inexistente", async () => {
    const { assignmentId } = await assignedPatient();

    expect(await world.endAssignment({ actor: ACTOR_B, assignmentId })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await world.endAssignment({ actor: ACTOR_A, assignmentId: "no-existe" })).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(world.registry.assignments[0]?.endedAt).toBeNull();
  });

  it("reasignar: terminar la vigente y asignar a otro médico conserva el historial", async () => {
    const { patientId, assignmentId } = await assignedPatient();

    await world.endAssignment({ actor: ACTOR_A, assignmentId });
    const reassigned = await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA2.id });

    expect(reassigned.ok).toBe(true);
    expect(world.registry.assignments.map((row) => [row.membershipId, row.endedAt !== null])).toEqual([
      [world.doctorA.id, true],
      [world.doctorA2.id, false],
    ]);
  });
});

describe("disponibilidad del médico del paciente", () => {
  it("sin asignaciones vigentes: NO_ASSIGNMENT", async () => {
    const patient = await world.registerPatient({ actor: ACTOR_A, documentType: "DNI", documentNumber: "12345678" });

    expect(patient.ok && (await world.availability({ tenantId: "tenant-a", patientId: patient.patientId }))).toBe("NO_ASSIGNMENT");
  });

  it("con el médico activo: AVAILABLE; desactivado: UNAVAILABLE; reactivado: AVAILABLE", async () => {
    const { patientId } = await assignedPatient();
    const ask = () => world.availability({ tenantId: "tenant-a", patientId });

    expect(await ask()).toBe("AVAILABLE");
    await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id });
    expect(await ask()).toBe("UNAVAILABLE");
    await world.reactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id });
    expect(await ask()).toBe("AVAILABLE");
  });

  it("si hay otro médico activo asignado, sigue AVAILABLE", async () => {
    const { patientId } = await assignedPatient();
    await world.assignPatient({ actor: ACTOR_A, patientId, membershipId: world.doctorA2.id });
    await world.deactivateMember({ actor: ACTOR_A, membershipId: world.doctorA.id });

    expect(await world.availability({ tenantId: "tenant-a", patientId })).toBe("AVAILABLE");
  });

  it("una asignación terminada ya no cuenta", async () => {
    const { patientId, assignmentId } = await assignedPatient();
    await world.endAssignment({ actor: ACTOR_A, assignmentId });

    expect(await world.availability({ tenantId: "tenant-a", patientId })).toBe("NO_ASSIGNMENT");
  });

  it("no revela nada de una clínica ajena: con otro tenantId no hay asignaciones", async () => {
    const { patientId } = await assignedPatient();

    expect(await world.availability({ tenantId: "tenant-b", patientId })).toBe("NO_ASSIGNMENT");
  });

  it("devuelve solo el estado, sin nombres ni datos del médico", async () => {
    const { patientId } = await assignedPatient();

    expect(typeof (await world.availability({ tenantId: "tenant-a", patientId }))).toBe("string");
  });
});
