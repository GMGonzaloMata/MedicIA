import { describe, expect, it } from "vitest";

import {
  canActOnPatient,
  canDeleteStudy,
  canListDoctorPatients,
  resolveStudyActor,
  type StudyActor,
} from "@/modules/studies/domain/study-access";

const TENANT = "tenant-a";

const patientActor: StudyActor = { kind: "PATIENT", tenantId: TENANT, userId: "user-patient", patientId: "patient-1" };
const doctorActor: StudyActor = { kind: "DOCTOR", tenantId: TENANT, userId: "user-doctor", membershipId: "membership-1" };

describe("resolveStudyActor", () => {
  it("un vínculo de paciente actúa como paciente", () => {
    const actor = resolveStudyActor({
      tenantId: TENANT,
      userId: "user-patient",
      relationship: { kind: "PATIENT", patientId: "patient-1" },
    });

    expect(actor).toEqual(patientActor);
  });

  it("un integrante del personal con rol de médico actúa como médico", () => {
    const actor = resolveStudyActor({
      tenantId: TENANT,
      userId: "user-doctor",
      relationship: { kind: "STAFF", membershipId: "membership-1", isDoctor: true },
    });

    expect(actor).toEqual(doctorActor);
  });

  it("una persona que es administradora y médica actúa como médica", () => {
    const actor = resolveStudyActor({
      tenantId: TENANT,
      userId: "user-doctor",
      relationship: { kind: "STAFF", membershipId: "membership-1", isDoctor: true, isClinicAdmin: true },
    });

    expect(actor?.kind).toBe("DOCTOR");
  });

  it("un administrador sin rol de médico no tiene acceso a estudios", () => {
    const actor = resolveStudyActor({
      tenantId: TENANT,
      userId: "user-admin",
      relationship: { kind: "STAFF", membershipId: "membership-2", isDoctor: false, isClinicAdmin: true },
    });

    expect(actor).toBeNull();
  });
});

describe("canActOnPatient", () => {
  it("el paciente solo actúa sobre sí mismo", () => {
    expect(canActOnPatient(patientActor, { patientId: "patient-1", hasActiveAssignment: false })).toBe(true);
    expect(canActOnPatient(patientActor, { patientId: "patient-2", hasActiveAssignment: false })).toBe(false);
  });

  it("el paciente no gana acceso a otro paciente por una asignación", () => {
    expect(canActOnPatient(patientActor, { patientId: "patient-2", hasActiveAssignment: true })).toBe(false);
  });

  it("el médico actúa sobre un paciente con asignación vigente", () => {
    expect(canActOnPatient(doctorActor, { patientId: "patient-1", hasActiveAssignment: true })).toBe(true);
  });

  it("el médico no actúa sobre un paciente sin asignación vigente (sin asignación o terminada)", () => {
    expect(canActOnPatient(doctorActor, { patientId: "patient-1", hasActiveAssignment: false })).toBe(false);
  });
});

describe("canDeleteStudy", () => {
  it("elimina quien cargó el estudio y conserva el acceso al paciente", () => {
    expect(canDeleteStudy(patientActor, { uploadedByUserId: "user-patient", hasAccessToPatient: true })).toBe(true);
    expect(canDeleteStudy(doctorActor, { uploadedByUserId: "user-doctor", hasAccessToPatient: true })).toBe(true);
  });

  it("nadie elimina un estudio que cargó otra persona", () => {
    expect(canDeleteStudy(patientActor, { uploadedByUserId: "user-doctor", hasAccessToPatient: true })).toBe(false);
    expect(canDeleteStudy(doctorActor, { uploadedByUserId: "user-patient", hasAccessToPatient: true })).toBe(false);
    expect(canDeleteStudy(doctorActor, { uploadedByUserId: "user-other-doctor", hasAccessToPatient: true })).toBe(false);
  });

  it("un médico que perdió la asignación no elimina ni lo que cargó", () => {
    expect(canDeleteStudy(doctorActor, { uploadedByUserId: "user-doctor", hasAccessToPatient: false })).toBe(false);
  });
});

describe("canListDoctorPatients", () => {
  it("solo un médico ve la lista de pacientes", () => {
    expect(canListDoctorPatients(doctorActor)).toBe(true);
    expect(canListDoctorPatients(patientActor)).toBe(false);
  });
});
