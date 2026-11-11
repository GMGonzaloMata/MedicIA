import { describe, expect, it } from "vitest";

import {
  acceptInvitationSchema,
  createInvitationSchema,
  invitationIdSchema,
} from "@/modules/users/application/validation/invitation-form-schemas";

describe("formulario de invitar", () => {
  it("acepta un médico con correo y matrícula, y normaliza el correo", () => {
    const parsed = createInvitationSchema.safeParse({
      kind: "DOCTOR",
      email: "  Dra.Perez@Example.COM ",
      licenseNumber: "MN 123",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ kind: "DOCTOR", email: "dra.perez@example.com", licenseNumber: "MN 123" });
  });

  it("acepta un paciente con correo, tipo de documento y número", () => {
    expect(
      createInvitationSchema.safeParse({
        kind: "PATIENT",
        email: "paciente@example.com",
        documentType: "DNI",
        documentNumber: "12.345.678",
      }).success,
    ).toBe(true);
  });

  it.each([
    ["un correo inválido", { kind: "DOCTOR", email: "no-es-un-correo", licenseNumber: "MN123" }],
    ["un médico sin matrícula", { kind: "DOCTOR", email: "a@example.com" }],
    ["una matrícula que queda vacía al normalizar", { kind: "DOCTOR", email: "a@example.com", licenseNumber: " . - " }],
    ["un paciente sin documento", { kind: "PATIENT", email: "a@example.com", documentType: "DNI" }],
    [
      "un tipo de documento desconocido",
      { kind: "PATIENT", email: "a@example.com", documentType: "CUIT", documentNumber: "1" },
    ],
    [
      "un documento desmesurado",
      { kind: "PATIENT", email: "a@example.com", documentType: "DNI", documentNumber: "1".repeat(41) },
    ],
    ["un tipo de vínculo desconocido", { kind: "ADMIN", email: "a@example.com" }],
    [
      "un médico con campos de paciente",
      { kind: "DOCTOR", email: "a@example.com", licenseNumber: "MN123", documentNumber: "1" },
    ],
    [
      "un paciente con la matrícula de un médico",
      { kind: "PATIENT", email: "a@example.com", documentType: "DNI", documentNumber: "1", licenseNumber: "MN" },
    ],
    ["un correo demasiado largo", { kind: "DOCTOR", email: `${"a".repeat(250)}@example.com`, licenseNumber: "MN1" }],
  ])("rechaza %s", (description, input) => {
    expect(createInvitationSchema.safeParse(input).success).toBe(false);
  });
});

describe("formulario de aceptar", () => {
  it("acepta el documento de un paciente o la matrícula y la especialidad de un médico", () => {
    expect(acceptInvitationSchema.safeParse({ documentType: "DNI", documentNumber: "12345678" }).success).toBe(true);
    expect(acceptInvitationSchema.safeParse({ licenseNumber: "MN123", specialty: "Cardiología" }).success).toBe(true);
  });

  it.each([
    ["una especialidad demasiado corta", { licenseNumber: "MN123", specialty: "C" }],
    ["una especialidad desmesurada", { licenseNumber: "MN123", specialty: "C".repeat(101) }],
    ["un tipo de documento desconocido", { documentType: "CUIT", documentNumber: "1" }],
    ["un documento vacío", { documentType: "DNI", documentNumber: " " }],
  ])("rechaza %s", (description, input) => {
    expect(acceptInvitationSchema.safeParse(input).success).toBe(false);
  });
});

describe("identificador de invitación", () => {
  it("solo acepta un UUID", () => {
    expect(invitationIdSchema.safeParse("0197f1c8-5b1a-7c3e-8a52-9f3d2b6c1a40").success).toBe(true);
    expect(invitationIdSchema.safeParse("no-es-un-uuid").success).toBe(false);
  });
});
