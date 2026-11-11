import { describe, expect, it } from "vitest";

import {
  checkRelationshipCompatibility,
  type PatientFact,
  type StaffFact,
} from "@/modules/users/domain/relationship-compatibility";

const activeDoctor: StaffFact = { status: "ACTIVE", isClinicAdmin: false, isDoctor: true };
const activeAdminOnly: StaffFact = { status: "ACTIVE", isClinicAdmin: true, isDoctor: false };
const deactivatedDoctor: StaffFact = { status: "DEACTIVATED", isClinicAdmin: false, isDoctor: true };
const patient = (status: PatientFact["status"]): PatientFact => ({ status });

describe("vínculo único por clínica, link de médico", () => {
  it("sin ningún vínculo se puede crear", () => {
    expect(checkRelationshipCompatibility({ kind: "DOCTOR", staff: null, patient: null })).toEqual({
      result: "CAN_CREATE",
    });
  });

  it("si ya es médico activo de la clínica, ya pertenece", () => {
    expect(checkRelationshipCompatibility({ kind: "DOCTOR", staff: activeDoctor, patient: null })).toEqual({
      result: "ALREADY_MEMBER",
    });
  });

  it("con la membresía desactivada es un conflicto y no se reactiva", () => {
    expect(checkRelationshipCompatibility({ kind: "DOCTOR", staff: deactivatedDoctor, patient: null })).toEqual({
      result: "CONFLICT",
      reason: "MEMBERSHIP_DEACTIVATED",
    });
  });

  it("un administrador sin rol de médico es un conflicto: no se le suma el rol", () => {
    expect(checkRelationshipCompatibility({ kind: "DOCTOR", staff: activeAdminOnly, patient: null })).toEqual({
      result: "CONFLICT",
      reason: "ROLE_CHANGE_NOT_SUPPORTED",
    });
  });

  it.each(["LINKED", "REVOKED"] as const)("con un registro de paciente %s es un conflicto", (status) => {
    expect(checkRelationshipCompatibility({ kind: "DOCTOR", staff: null, patient: patient(status) })).toEqual({
      result: "CONFLICT",
      reason: "OTHER_RELATIONSHIP",
    });
  });
});

describe("vínculo único por clínica, link de paciente", () => {
  it("sin ningún vínculo se puede crear", () => {
    expect(checkRelationshipCompatibility({ kind: "PATIENT", staff: null, patient: null })).toEqual({
      result: "CAN_CREATE",
    });
  });

  it("si ya es paciente vinculado, ya pertenece", () => {
    expect(checkRelationshipCompatibility({ kind: "PATIENT", staff: null, patient: patient("LINKED") })).toEqual({
      result: "ALREADY_MEMBER",
    });
  });

  it("un paciente revocado se puede volver a vincular reutilizando su registro", () => {
    expect(checkRelationshipCompatibility({ kind: "PATIENT", staff: null, patient: patient("REVOKED") })).toEqual({
      result: "CAN_CREATE",
    });
  });

  it("un registro pendiente se puede vincular", () => {
    expect(checkRelationshipCompatibility({ kind: "PATIENT", staff: null, patient: patient("PENDING") })).toEqual({
      result: "CAN_CREATE",
    });
  });

  it.each([activeDoctor, activeAdminOnly, deactivatedDoctor])(
    "con una membresía de personal en la clínica es un conflicto",
    (staff) => {
      expect(checkRelationshipCompatibility({ kind: "PATIENT", staff, patient: null })).toEqual({
        result: "CONFLICT",
        reason: "OTHER_RELATIONSHIP",
      });
    },
  );
});
