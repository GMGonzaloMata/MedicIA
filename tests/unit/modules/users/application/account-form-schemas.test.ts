import { describe, expect, it } from "vitest";

import {
  PASSWORD_POLICY_HINT,
  confirmAccountSchema,
  requestPasswordResetSchema,
  resendConfirmationCodeSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/modules/users/application/validation/account-form-schemas";

const VALID_PASSWORD = "a".repeat(12);

describe("signUpSchema", () => {
  it("recorta y pasa a minúsculas el correo, y recorta el nombre", () => {
    const parsed = signUpSchema.parse({
      fullName: "  Persona Uno  ",
      email: "  Persona@Example.COM ",
      password: VALID_PASSWORD,
    });

    expect(parsed).toEqual({ fullName: "Persona Uno", email: "persona@example.com", password: VALID_PASSWORD });
  });

  it("no recorta la contraseña", () => {
    const password = ` ${VALID_PASSWORD} `;

    expect(signUpSchema.parse({ fullName: "Persona", email: "a@example.com", password }).password).toBe(password);
  });

  it.each([
    { length: 11, isValid: false },
    { length: 12, isValid: true },
    { length: 128, isValid: true },
    { length: 129, isValid: false },
  ])("la contraseña de $length caracteres es válida: $isValid", ({ length, isValid }) => {
    const result = signUpSchema.safeParse({
      fullName: "Persona",
      email: "a@example.com",
      password: "a".repeat(length),
    });

    expect(result.success).toBe(isValid);
  });

  it.each([
    { fullName: "A", isValid: false },
    { fullName: "Al", isValid: true },
    { fullName: "a".repeat(120), isValid: true },
    { fullName: "a".repeat(121), isValid: false },
    { fullName: "   ", isValid: false },
  ])("el nombre de $fullName.length caracteres es válido: $isValid", ({ fullName, isValid }) => {
    const result = signUpSchema.safeParse({ fullName, email: "a@example.com", password: VALID_PASSWORD });

    expect(result.success).toBe(isValid);
  });

  it("rechaza un correo inválido", () => {
    const result = signUpSchema.safeParse({ fullName: "Persona", email: "no-es-un-correo", password: VALID_PASSWORD });

    expect(result.success).toBe(false);
  });

  it("incluye la política de contraseña en el mensaje de error", () => {
    const result = signUpSchema.safeParse({ fullName: "Persona", email: "a@example.com", password: "corta" });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("12");
    expect(PASSWORD_POLICY_HINT).toBe("Entre 12 y 128 caracteres.");
  });
});

describe("confirmAccountSchema y resetPasswordSchema", () => {
  it.each([
    { code: "123456", isValid: true },
    { code: " 123456 ", isValid: true },
    { code: "12345", isValid: false },
    { code: "1234567", isValid: false },
    { code: "12345a", isValid: false },
    { code: "", isValid: false },
  ])("el código '$code' es válido: $isValid", ({ code, isValid }) => {
    expect(confirmAccountSchema.safeParse({ email: "a@example.com", code }).success).toBe(isValid);
    expect(
      resetPasswordSchema.safeParse({ email: "a@example.com", code, newPassword: VALID_PASSWORD }).success,
    ).toBe(isValid);
  });

  it("aplica la política a la contraseña nueva", () => {
    expect(
      resetPasswordSchema.safeParse({ email: "a@example.com", code: "123456", newPassword: "corta" }).success,
    ).toBe(false);
  });
});

describe("signInSchema", () => {
  it("no aplica la política de contraseña a una contraseña existente", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "corta" }).success).toBe(true);
  });

  it("rechaza una contraseña vacía o excesiva", () => {
    expect(signInSchema.safeParse({ email: "a@example.com", password: "" }).success).toBe(false);
    expect(signInSchema.safeParse({ email: "a@example.com", password: "a".repeat(129) }).success).toBe(false);
  });
});

describe("esquemas de solo correo", () => {
  it("normalizan el correo", () => {
    expect(resendConfirmationCodeSchema.parse({ email: " A@Example.com " }).email).toBe("a@example.com");
    expect(requestPasswordResetSchema.parse({ email: " A@Example.com " }).email).toBe("a@example.com");
  });
});
