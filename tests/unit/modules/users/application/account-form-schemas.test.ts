import { describe, expect, it } from "vitest";

import {
  PASSWORD_POLICY_HINT,
  PASSWORDS_MISMATCH_MESSAGE,
  confirmAccountSchema,
  requestPasswordResetSchema,
  resendConfirmationCodeSchema,
  resetPasswordSchema,
  signInSchema,
  signUpSchema,
} from "@/modules/users/application/validation/account-form-schemas";

const VALID_PASSWORD = `A${"a".repeat(11)}`;

// Contraseña de una longitud exacta que cumple la política (empieza con una mayúscula).
const passwordOfLength = (length: number) => `A${"a".repeat(length - 1)}`;

describe("signUpSchema", () => {
  it("recorta y pasa a minúsculas el correo, y recorta el nombre", () => {
    const parsed = signUpSchema.parse({ fullName: "  Persona Uno  ", email: "  Persona@Example.COM " });

    expect(parsed).toEqual({ fullName: "Persona Uno", email: "persona@example.com" });
  });

  it("no recorta la contraseña pero rechaza espacios al inicio o al final", () => {
    const inner = `${VALID_PASSWORD} con espacios`;

    expect(confirmAccountSchema.parse({ email: "a@example.com", code: "123456", password: inner, passwordConfirmation: inner }).password).toBe(
      inner,
    );
    for (const password of [` ${VALID_PASSWORD}`, `${VALID_PASSWORD} `]) {
      expect(confirmAccountSchema.safeParse({ email: "a@example.com", code: "123456", password, passwordConfirmation: password }).success).toBe(
        false,
      );
      expect(
        resetPasswordSchema.safeParse({ email: "a@example.com", code: "123456", newPassword: password, newPasswordConfirmation: password }).success,
      ).toBe(false);
    }
  });

  it.each([
    { length: 7, isValid: false },
    { length: 8, isValid: true },
    { length: 128, isValid: true },
    { length: 129, isValid: false },
  ])("la contraseña de $length caracteres es válida: $isValid", ({ length, isValid }) => {
    const result = confirmAccountSchema.safeParse({
      email: "a@example.com",
      code: "123456",
      password: passwordOfLength(length),
      passwordConfirmation: passwordOfLength(length),
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
    const result = signUpSchema.safeParse({ fullName, email: "a@example.com" });

    expect(result.success).toBe(isValid);
  });

  it("rechaza un correo inválido", () => {
    const result = signUpSchema.safeParse({ fullName: "Persona", email: "no-es-un-correo" });

    expect(result.success).toBe(false);
  });

  it("incluye la política de contraseña en el mensaje de error", () => {
    const result = confirmAccountSchema.safeParse({ email: "a@example.com", code: "123456", password: "corta", passwordConfirmation: "corta" });

    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toContain("12");
    expect(PASSWORD_POLICY_HINT).toBe("Entre 8 y 128 caracteres, con al menos una mayúscula.");
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
    expect(confirmAccountSchema.safeParse({ email: "a@example.com", code, password: VALID_PASSWORD, passwordConfirmation: VALID_PASSWORD }).success).toBe(isValid);
    expect(
      resetPasswordSchema.safeParse({ email: "a@example.com", code, newPassword: VALID_PASSWORD, newPasswordConfirmation: VALID_PASSWORD }).success,
    ).toBe(isValid);
  });

  it.each([
    { password: "sinmayuscula1", isAllowed: false },
    { password: "ñandú-minúscula-1", isAllowed: false },
    { password: "ConMayuscula1", isAllowed: true },
    { password: "mayusculaAlFinal-B", isAllowed: true },
  ])("la contraseña '$password' cumple la política: $isAllowed", ({ password, isAllowed }) => {
    const result = confirmAccountSchema.safeParse({
      email: "a@example.com",
      code: "123456",
      password,
      passwordConfirmation: password,
    });

    expect(result.success).toBe(isAllowed);
  });

  it("muestra una sola vez el mensaje de la política aunque se incumplan varias partes", () => {
    const result = confirmAccountSchema.safeParse({
      email: "a@example.com",
      code: "123456",
      password: "corta",
      passwordConfirmation: "corta",
    });
    const messages = result.error?.issues.map((issue) => issue.message) ?? [];

    expect(messages).toHaveLength(1);
  });

  it("rechaza una contraseña repetida que no coincide, y marca el campo de la repetición", () => {
    const confirm = confirmAccountSchema.safeParse({
      email: "a@example.com",
      code: "123456",
      password: VALID_PASSWORD,
      passwordConfirmation: `${VALID_PASSWORD}x`,
    });
    const reset = resetPasswordSchema.safeParse({
      email: "a@example.com",
      code: "123456",
      newPassword: VALID_PASSWORD,
      newPasswordConfirmation: "",
    });

    expect(confirm.success).toBe(false);
    expect(confirm.error?.issues[0]).toMatchObject({
      path: ["passwordConfirmation"],
      message: PASSWORDS_MISMATCH_MESSAGE,
    });
    expect(reset.success).toBe(false);
    expect(reset.error?.issues[0]).toMatchObject({
      path: ["newPasswordConfirmation"],
      message: PASSWORDS_MISMATCH_MESSAGE,
    });
  });

  it("aplica la política a la contraseña nueva", () => {
    expect(
      resetPasswordSchema.safeParse({ email: "a@example.com", code: "123456", newPassword: "corta", newPasswordConfirmation: "corta" }).success,
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
