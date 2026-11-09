import { describe, expect, it } from "vitest";

import { IdentityError } from "@/modules/users/domain/identity-errors";
import {
  FAKE_VERIFICATION_CODE,
  createInMemoryIdentityProvider,
  fakeSubjectForEmail,
} from "@/modules/users/infrastructure/adapters/in-memory-identity-provider";

const EMAIL = "persona@example.com";
const PASSWORD = "contraseña-larga-123";

async function codeOf(operation: Promise<unknown>): Promise<string | undefined> {
  try {
    await operation;
  } catch (error) {
    return error instanceof IdentityError ? error.code : "OTRO_ERROR";
  }

  return undefined;
}

function newProvider() {
  return createInMemoryIdentityProvider({});
}

describe("createInMemoryIdentityProvider", () => {
  it("registra, verifica con el código fijo e ingresa", async () => {
    const provider = newProvider();

    await provider.signUp({ email: EMAIL, password: PASSWORD, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });

    expect(await provider.signIn({ email: EMAIL, password: PASSWORD })).toEqual({
      subject: fakeSubjectForEmail(EMAIL),
      email: EMAIL,
      fullName: "Persona Uno",
    });
  });

  it("rechaza una contraseña fuera de 12 a 128 caracteres", async () => {
    const provider = newProvider();

    expect(await codeOf(provider.signUp({ email: EMAIL, password: "a".repeat(11), fullName: "P" }))).toBe(
      "INVALID_PASSWORD",
    );
    expect(await codeOf(provider.signUp({ email: EMAIL, password: "a".repeat(129), fullName: "P" }))).toBe(
      "INVALID_PASSWORD",
    );
    expect(await codeOf(provider.signUp({ email: EMAIL, password: "a".repeat(12), fullName: "P" }))).toBe(
      undefined,
    );
    expect(await codeOf(provider.signUp({ email: "otra@example.com", password: "a".repeat(128), fullName: "P" }))).toBe(
      undefined,
    );
  });

  it("responde igual al registrar un correo que ya existe y no pisa la cuenta", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, password: PASSWORD, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });

    await expect(
      provider.signUp({ email: EMAIL, password: "otra-contraseña-123", fullName: "Intruso" }),
    ).resolves.toBeUndefined();

    expect((await provider.signIn({ email: EMAIL, password: PASSWORD })).fullName).toBe("Persona Uno");
  });

  it("rechaza el ingreso sin verificar, con contraseña incorrecta o con un correo inexistente", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, password: PASSWORD, fullName: "Persona Uno" });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");

    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: "equivocada-123456" }))).toBe(
      "INVALID_CREDENTIALS",
    );
    expect(await codeOf(provider.signIn({ email: "nadie@example.com", password: PASSWORD }))).toBe(
      "INVALID_CREDENTIALS",
    );
  });

  it("rechaza un código de verificación incorrecto o de un correo inexistente", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, password: PASSWORD, fullName: "Persona Uno" });

    expect(await codeOf(provider.confirmSignUp({ email: EMAIL, code: "123456" }))).toBe("INVALID_CODE");
    expect(await codeOf(provider.confirmSignUp({ email: "nadie@example.com", code: FAKE_VERIFICATION_CODE }))).toBe(
      "INVALID_CODE",
    );
  });

  it("responde igual al reenviar el código o pedir la recuperación exista o no la cuenta", async () => {
    const provider = newProvider();

    await expect(provider.resendConfirmationCode({ email: "nadie@example.com" })).resolves.toBeUndefined();
    await expect(provider.requestPasswordReset({ email: "nadie@example.com" })).resolves.toBeUndefined();
  });

  it("cambia la contraseña con el código y la anterior deja de servir", async () => {
    const provider = newProvider();
    await provider.signUp({ email: EMAIL, password: PASSWORD, fullName: "Persona Uno" });
    await provider.confirmSignUp({ email: EMAIL, code: FAKE_VERIFICATION_CODE });

    expect(
      await codeOf(provider.confirmPasswordReset({ email: EMAIL, code: "123456", newPassword: "nueva-contraseña-1" })),
    ).toBe("INVALID_CODE");
    expect(
      await codeOf(
        provider.confirmPasswordReset({ email: EMAIL, code: FAKE_VERIFICATION_CODE, newPassword: "corta" }),
      ),
    ).toBe("INVALID_PASSWORD");

    await provider.confirmPasswordReset({
      email: EMAIL,
      code: FAKE_VERIFICATION_CODE,
      newPassword: "nueva-contraseña-1",
    });

    expect(await codeOf(provider.signIn({ email: EMAIL, password: PASSWORD }))).toBe("INVALID_CREDENTIALS");
    expect(await codeOf(provider.signIn({ email: EMAIL, password: "nueva-contraseña-1" }))).toBeUndefined();
  });

  it("rechaza la recuperación de un correo inexistente como código incorrecto", async () => {
    const provider = newProvider();

    expect(
      await codeOf(
        provider.confirmPasswordReset({
          email: "nadie@example.com",
          code: FAKE_VERIFICATION_CODE,
          newPassword: "nueva-contraseña-1",
        }),
      ),
    ).toBe("INVALID_CODE");
  });

  it("no inicia si hay variables de Cognito definidas", () => {
    expect(() => createInMemoryIdentityProvider({ COGNITO_CLIENT_SECRET: "secreto-de-prueba" })).toThrow(
      "variables de Cognito",
    );
    expect(() => createInMemoryIdentityProvider({ COGNITO_REGION: "" })).toThrow("variables de Cognito");
    expect(() => createInMemoryIdentityProvider({ OTRA_VARIABLE: "x" })).not.toThrow();
  });

  it("no incluye el valor de las variables en el error de arranque", () => {
    expect(() => createInMemoryIdentityProvider({ COGNITO_CLIENT_SECRET: "secreto-de-prueba" })).not.toThrow(
      /secreto-de-prueba/,
    );
  });
});

describe("fakeSubjectForEmail", () => {
  it("es estable por correo, distinto entre correos y con forma de UUID", () => {
    expect(fakeSubjectForEmail(EMAIL)).toBe(fakeSubjectForEmail(EMAIL));
    expect(fakeSubjectForEmail(EMAIL)).not.toBe(fakeSubjectForEmail("otra@example.com"));
    expect(fakeSubjectForEmail(EMAIL)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});
