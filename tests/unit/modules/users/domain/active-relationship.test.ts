import { describe, expect, it } from "vitest";

import { toActiveClinic, type StoredRelationship } from "@/modules/users/domain/active-relationship";

function staff(overrides: Partial<Extract<StoredRelationship, { kind: "STAFF" }>> = {}): StoredRelationship {
  return {
    kind: "STAFF",
    membershipId: "membership-1",
    isClinicAdmin: true,
    isDoctor: false,
    membershipStatus: "ACTIVE",
    tenantId: "tenant-1",
    tenantName: "Clínica Norte",
    tenantStatus: "ACTIVE",
    ...overrides,
  };
}

function patient(overrides: Partial<Extract<StoredRelationship, { kind: "PATIENT" }>> = {}): StoredRelationship {
  return {
    kind: "PATIENT",
    patientId: "patient-1",
    patientStatus: "LINKED",
    tenantId: "tenant-1",
    tenantName: "Clínica Norte",
    tenantStatus: "ACTIVE",
    ...overrides,
  };
}

describe("toActiveClinic", () => {
  it("devuelve la clínica de una membresía activa en una clínica activa", () => {
    expect(toActiveClinic(staff({ isDoctor: true }))).toEqual({
      tenantId: "tenant-1",
      tenantName: "Clínica Norte",
      relationship: { kind: "STAFF", membershipId: "membership-1", isClinicAdmin: true, isDoctor: true },
    });
  });

  it("devuelve la clínica de un paciente vinculado en una clínica activa", () => {
    expect(toActiveClinic(patient())).toEqual({
      tenantId: "tenant-1",
      tenantName: "Clínica Norte",
      relationship: { kind: "PATIENT", patientId: "patient-1" },
    });
  });

  it("no devuelve nada si no hay vínculo activo", () => {
    expect(toActiveClinic(null)).toBeNull();
  });

  it("no devuelve nada si la clínica está suspendida", () => {
    expect(toActiveClinic(staff({ tenantStatus: "SUSPENDED" }))).toBeNull();
    expect(toActiveClinic(patient({ tenantStatus: "SUSPENDED" }))).toBeNull();
  });

  it("no devuelve nada si la membresía está desactivada", () => {
    expect(toActiveClinic(staff({ membershipStatus: "DEACTIVATED" }))).toBeNull();
  });

  it.each(["PENDING", "REVOKED"] as const)("no devuelve nada si el paciente está %s", (patientStatus) => {
    expect(toActiveClinic(patient({ patientStatus }))).toBeNull();
  });
});
