import { describe, expect, it } from "vitest";

import {
  MAX_LICENSE_NUMBER_LENGTH,
  MAX_SPECIALTY_LENGTH,
  normalizeDoctorProfile,
} from "@/modules/tenants/domain/doctor-profile";

describe("datos de un médico", () => {
  it("quita los espacios de los bordes de los dos datos", () => {
    expect(normalizeDoctorProfile({ specialty: "  Cardiología ", licenseNumber: " MP-123  " })).toEqual({
      specialty: "Cardiología",
      licenseNumber: "MP-123",
    });
  });

  it.each([
    { name: "una especialidad vacía", profile: { specialty: "   ", licenseNumber: "MP-1" } },
    { name: "una matrícula vacía", profile: { specialty: "Cardiología", licenseNumber: "" } },
    {
      name: "una especialidad demasiado larga",
      profile: { specialty: "x".repeat(MAX_SPECIALTY_LENGTH + 1), licenseNumber: "MP-1" },
    },
    {
      name: "una matrícula demasiado larga",
      profile: { specialty: "Cardiología", licenseNumber: "9".repeat(MAX_LICENSE_NUMBER_LENGTH + 1) },
    },
  ])("rechaza $name", ({ profile }) => {
    expect(normalizeDoctorProfile(profile)).toBeNull();
  });

  it("acepta los largos máximos exactos", () => {
    expect(
      normalizeDoctorProfile({
        specialty: "x".repeat(MAX_SPECIALTY_LENGTH),
        licenseNumber: "9".repeat(MAX_LICENSE_NUMBER_LENGTH),
      }),
    ).not.toBeNull();
  });
});
