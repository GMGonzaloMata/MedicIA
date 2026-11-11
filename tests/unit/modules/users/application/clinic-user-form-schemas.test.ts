import { describe, expect, it } from "vitest";

import { enrollMemberSchema } from "@/modules/users/application/validation/clinic-user-form-schemas";

describe("validación del alta", () => {
  it("normaliza el correo y comunica los errores en español", () => {
    const normalized = enrollMemberSchema.parse({ kind: "PATIENT", email: "  PERSONA@EXAMPLE.COM  ",
      fullName: "  Persona Nueva  ", documentType: "DNI", documentNumber: "123" });
    expect(normalized.email).toBe("persona@example.com");
    expect(normalized.fullName).toBe("Persona Nueva");

    const patient = enrollMemberSchema.safeParse({ kind: "PATIENT", email: "mal", fullName: "",
      documentType: "inventado", documentNumber: "---" });
    expect(patient.success).toBe(false);
    if (patient.success) return;
    const errors = JSON.stringify(patient.error.issues);
    expect(errors).toContain("correo válido");
    expect(errors).toContain("nombre");
    expect(errors).toContain("documento");

    const doctor = enrollMemberSchema.safeParse({ kind: "DOCTOR", email: "medico@example.com",
      fullName: "Dra. Nueva", licenseNumber: "---", specialty: "a" });
    expect(doctor.success).toBe(false);
    if (doctor.success) return;
    const doctorErrors = JSON.stringify(doctor.error.issues);
    expect(doctorErrors).toContain("matrícula");
    expect(doctorErrors).toContain("especialidad");
  });
});
